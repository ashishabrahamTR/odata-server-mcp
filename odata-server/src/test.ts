#!/usr/bin/env node
import axios from 'axios';
import dotenv from 'dotenv';

dotenv.config();

import * as fs from 'fs';

async function writeLog(message: string) {
    fs.appendFileSync('odata-test.log', message + '\n');
}

async function testODataAPI() {
    const baseUrl = process.env.ODATA_API_URL || 'https://gst-odata.api.qa.tr-atap-nonprod.aws.thomsonreuters.com';
    const authToken = process.env.ODATA_API_TOKEN || '';

    const headers = {
        'accept': 'application/json;odata.metadata=minimal;odata.streaming=true',
        'Authorization': `Bearer ${authToken}`
    };

    await writeLog('[Test] Starting OData API test');
    await writeLog('[Test] Headers: ' + JSON.stringify({
        ...headers,
        'Authorization': `Bearer ${authToken.substring(0, 20)}...`
    }, null, 2));

    try {
        const url = `${baseUrl}/odata/v1/tax-return-data?%24top=50&%24skip=0`;
        await writeLog('[Test] Making request to: ' + url);

        const response = await axios.get(url, {
            headers: headers,
            timeout: 30000
        });

        await writeLog('[Test] Response status: ' + response.status);
        await writeLog('[Test] Response data: ' + JSON.stringify(response.data, null, 2));

    } catch (error: any) {
        await writeLog('[Test] Error details: ' + JSON.stringify({
            message: error.message,
            response: {
                status: error.response?.status,
                statusText: error.response?.statusText,
                data: error.response?.data
            }
        }, null, 2));
    }
}

testODataAPI().catch(console.error);
