#!/usr/bin/env node
import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import {
  CallToolRequestSchema,
  ErrorCode,
  ListToolsRequestSchema,
  McpError,
} from '@modelcontextprotocol/sdk/types.js';
import axios from 'axios';
import dotenv from 'dotenv';

dotenv.config();

interface ODataResponse {
  value: any[];
  error?: string;
}

class ODataServer {
  private server: Server;
  private baseUrl: string;
  private authToken: string;

  constructor() {
    this.server = new Server(
      {
        name: 'odata-server',
        version: '0.1.0',
      },
      {
        capabilities: {
          tools: {},
        },
      }
    );

    this.baseUrl = process.env.ODATA_API_URL || 'https://gst-odata.api.qa.tr-atap-nonprod.aws.thomsonreuters.com';
    this.authToken = process.env.ODATA_API_TOKEN || '';

    if (!this.authToken) {
      console.error("Warning: No API token provided. Set ODATA_API_TOKEN in .env file");
    }

    this.setupToolHandlers();
    
    this.server.onerror = (error) => console.error('[MCP Error]', error);
    process.on('SIGINT', async () => {
      await this.server.close();
      process.exit(0);
    });
  }

  private getHeaders() {
    return {
      'accept': 'application/json;odata.metadata=minimal;odata.streaming=true',
      'Authorization': `Bearer ${this.authToken}`
    };
  }

  private setupToolHandlers() {
    this.server.setRequestHandler(ListToolsRequestSchema, async () => ({
      tools: [
        {
          name: 'get_tax_data',
          description: 'Get tax data for specific EORGs and year',
          inputSchema: {
            type: 'object',
            properties: {
              eorg: {
                type: 'string',
                description: 'The EORG identifiers (comma-separated for multiple)',
              },
              year: {
                type: 'number',
                description: 'The tax year',
              },
              taxType: {
                type: 'string',
                description: 'Tax type (e.g. 1040, 1065, 1120)',
                default: '1040'
              },
              form_name: {
                type: 'string',
                description: 'Name of the tax form',
              },
              field_name: {
                type: 'string',
                description: 'Name of the field',
              },
              locator: {
                type: 'string',
                description: 'Optional locator value. If not provided, defaults to year-specific value',
              },
              skip: {
                type: 'number',
                description: 'Number of records to skip (for pagination)',
                default: 0
              }
            },
            required: ['eorg', 'year'],
          },
        },
        {
          name: 'get_top_by_value',
          description: 'Get top N records ranked by value for a given EORG and year combination',
          inputSchema: {
            type: 'object',
            properties: {
              year: {
                type: 'number',
                description: 'The tax year',
              },
              top: {
                type: 'number',
                description: 'Number of top records to return (default: 10)',
                default: 10
              },
              taxType: {
                type: 'string',
                description: 'Tax type (e.g. 1040, 1065, 1120)',
                default: '1040'
              },
              eorgs: {
                type: 'string',
                description: 'The EORG identifier to filter by',
              },
              sort_order: {
                type: 'string',
                description: 'Sort order (asc or desc)',
                default: 'desc'
              },
              skip: {
                type: 'number',
                description: 'Number of records to skip (for pagination)',
                default: 0
              }
            },
            required: ['year', 'eorgs'],
          },
        },
      ],
    }));

    this.server.setRequestHandler(CallToolRequestSchema, async (request) => {
      switch (request.params.name) {
        case 'get_tax_data': {
          const args = request.params.arguments as {
            eorg: string;
            year: number;
            taxType?: string;
            form_name?: string;
            field_name?: string;
            locator?: string;
            skip?: number;
          };
          const { eorg, year, taxType = '1040', form_name, field_name, locator, skip = 0 } = args;

          try {
            // Build query parameters
            let default_locator;
            if (taxType === '1120') {
              default_locator = "1355JV";
            }else if (taxType === '1065') {
              default_locator = "4117JG"; 
            }else if (year === 2024 && taxType === '1040') {
              default_locator = "2517KC";
            } else if (year === 2023 && taxType === '1040') {
              default_locator = "9506JP";
            } else {
              default_locator = "9506JP"; // Default case for other years/tax types
            }
            const use_locator = locator || default_locator;
            
            const params: any = {
              year: year,
              '$top': 50,
              '$skip': skip
            };

            // Build filter parameters with support for multiple EORGs
            const eorgList = eorg.split(',').map(e => e.trim());
            const eorgFilter = eorgList.map(e => `eorgName eq '${e}'`).join(' or ');
            
            const filter_params = [
              `taxType eq '${taxType}'`,
              `locator eq '${use_locator}'`,
              `(${eorgFilter})`
            ];

            // Add form and field filters if provided
            if (form_name && field_name) {
              filter_params.push(
                `formName eq '${form_name}'`,
                `fieldName eq '${field_name}'`
              );
            }

            params['$filter'] = filter_params.join(' and ');

            const response = await axios.get(`${this.baseUrl}/odata/v1/tax-return-data`, {
              headers: this.getHeaders(),
              params: params,
              timeout: 30000
            });

            const result = this.transformMultiResponse(response.data, eorgList, year, form_name, field_name);

            return {
              content: [
                {
                  type: 'text',
                  text: JSON.stringify(result, null, 2),
                },
              ],
            };

          } catch (error) {
            if (axios.isAxiosError(error)) {
              return {
                content: [
                  {
                    type: 'text',
                    text: `OData API error: ${error.response?.data?.message || error.message}`,
                  },
                ],
                isError: true,
              };
            }
            throw error;
          }
          break;
        }
        
        case 'get_top_by_value': {
          const args = request.params.arguments as {
            year: number;
            top?: number;
            taxType?: string;
            eorgs: string;
            sort_order?: string;
            filter?: string;
            skip?: number;
          };
          
          const { year, top = 10, eorgs, taxType = '1040', sort_order = 'desc', skip = 0 } = args;

          try {
            // Build filter conditions

            // Build filter parameters with support for multiple EORGs
            const eorgList = eorgs.split(',').map(e => e.trim());
            const eorgFilter = eorgList.map(e => `eorgName eq '${e}'`).join(' or ');

            const filterConditions = [
              `value ne 'NONE'`,
              `taxType eq '${taxType}'`,
              `year eq ${year}`,
              `(${eorgFilter})`
            ];

            const params: any = {
              '$filter': filterConditions.join(' and '),
              '$top': top,
              '$skip': skip,
              '$orderby': `value ${sort_order}`
            };

            const response = await axios.get(`${this.baseUrl}/odata/v1/tax-return-data`, {
              headers: this.getHeaders(),
              params: params,
              timeout: 30000,
              paramsSerializer: {
                encode: (param) => encodeURIComponent(param)
              }
            });

            interface TopResult {
              year: number;
              query_info: {
                params: any;
                url: string;
              };
              top_records: any[];
              error?: string;
            }

            const result: TopResult = {
              year,
              query_info: {
                params: params,
                url: `${this.baseUrl}/odata/v1/tax-return-data`
              },
              top_records: response.data.value.map((record: any) => ({
                value: record.value,
                eorgName: record.eorgName,
                firm: record.firm,
                account: record.account,
                formName: record.formName,
                fieldName: record.fieldName,
                locator: record.locator,
                year: record.year,
                taxType: record.taxType
              }))
            };

            if (response.data.value.length === 0) {
              result.error = "No records found for the given criteria";
            }

            return {
              content: [
                {
                  type: 'text',
                  text: JSON.stringify(result, null, 2),
                },
              ],
            };

          } catch (error) {
            if (axios.isAxiosError(error)) {
              return {
                content: [
                  {
                    type: 'text',
                    text: `OData API error: ${error.response?.data?.message || error.message}`,
                  },
                ],
                isError: true,
              };
            }
            throw error;
          }
          break;
        }

        default:
          throw new McpError(
            ErrorCode.MethodNotFound,
            `Unknown tool: ${request.params.name}`
          );
      }
    });
  }

  private transformMultiResponse(apiResponse: ODataResponse, eorgList: string[], year: number, 
                               form_name?: string, field_name?: string) {
    try {
      if (!apiResponse.value) {
        return {
          eorgs: eorgList,
          year: year,
          data: null,
          error: 'No data found'
        };
      }

      // Group records by EORG
      const resultsByEorg: { [key: string]: any } = {};
      
      eorgList.forEach(eorg => {
        let matching_records = apiResponse.value.filter(record => record.eorgName === eorg);
        
        if (form_name && field_name) {
          matching_records = matching_records.filter(record => 
            record.formName === form_name && record.fieldName === field_name
          );
        }

        if (matching_records.length > 0) {
          resultsByEorg[eorg] = {
            raw_value: matching_records[0].value || '',
            description: field_name || 'Tax data'
          };
        }
      });

      return {
        eorgs: eorgList,
        year: year,
        data: resultsByEorg,
        error: Object.keys(resultsByEorg).length === 0 ? 'No matching records found' : undefined
      };

    } catch (error) {
      return {
        eorgs: eorgList,
        year: year,
        data: null,
        error: `Error transforming response: ${error}`
      };
    }
  }

  async run() {
    const transport = new StdioServerTransport();
    await this.server.connect(transport);
    console.error('OData MCP server running on stdio');
  }
}

const server = new ODataServer();
server.run().catch(console.error);
