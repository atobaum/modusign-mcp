#!/usr/bin/env node

import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { ModusignClient } from './client/modusign-client.js';
import { registerDocumentTools } from './tools/documents.js';
import { registerTemplateTools } from './tools/templates.js';
import { registerFileTools } from './tools/files.js';
import { registerUserTools } from './tools/user.js';
import { registerLabelTools } from './tools/labels.js';
import { registerWebhookTools } from './tools/webhooks.js';

const email = process.env.MODUSIGN_EMAIL;
const apiKey = process.env.MODUSIGN_API_KEY;

if (!email || !apiKey) {
  console.error(
    'Error: MODUSIGN_EMAIL and MODUSIGN_API_KEY environment variables are required.\n' +
    '\n' +
    'Set them in your MCP client configuration or export them:\n' +
    '  export MODUSIGN_EMAIL="your@email.com"\n' +
    '  export MODUSIGN_API_KEY="your-api-key"\n' +
    '\n' +
    'Get your API key from: https://app.modusign.co.kr/settings/api',
  );
  process.exit(1);
}

const client = new ModusignClient(email, apiKey, process.env.MODUSIGN_BASE_URL);

const server = new McpServer({
  name: 'modusign-mcp',
  version: '1.0.0',
});

registerDocumentTools(server, client);
registerTemplateTools(server, client);
registerFileTools(server, client);
registerUserTools(server, client);
registerLabelTools(server, client);
registerWebhookTools(server, client);

const transport = new StdioServerTransport();
await server.connect(transport);
