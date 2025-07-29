# OData MCP Server Setup Guide

This MCP server provides access to tax data through an OData interface. Here's how to set it up on your system:

## Installation Steps

1. Clone or copy this repository to your MCP directory:
   ```
   C:\Users\[your-username]\Documents\Cline\MCP\odata-server
   ```

2. Install dependencies:
   ```bash
   npm install
   ```

3. Configure the MCP Server:
   - Open your VSCode settings file at:
     `c:\Users\[your-username]\AppData\Roaming\Code\User\globalStorage\saoudrizwan.claude-dev\settings\cline_mcp_settings.json`
   - Add the following configuration (adjust the path to match your username):
     ```json
     {
       "mcpServers": {
         "odata-server": {
           "command": "node",
           "args": ["C:/Users/[your-username]/Documents/Cline/MCP/odata-server/build/index.js"],
           "disabled": false,
           "autoApprove": []
         }
       }
     }
     ```

## Available Tools

The server provides the following tools:

1. `get_tax_data`: Retrieve specific tax data using EORG identifiers
2. `get_top_by_value`: Get top N records sorted by value for specific EORGs

## Usage Examples

```javascript
// Example tool use:
{
  "eorg": "FED.TTLINC",  // Total Income
  "year": 2024,
  "taxType": "1040"
}
```

## Environment Configuration

The server connects to the OData API endpoint automatically. No additional environment variables are required.

## Troubleshooting

1. If you see "not connected" errors:
   - Verify the path in your MCP settings matches your actual installation directory
   - Ensure the server is properly compiled in the build directory
   - Check that all dependencies are installed

2. If you encounter data access issues:
   - Verify the EORG identifiers being used
   - Confirm the tax year and type are valid

For additional support, contact the development team.
