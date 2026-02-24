import { z } from 'zod';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { ModusignClient } from '../client/modusign-client.js';

function jsonContent(data: unknown) {
  return {
    content: [{ type: 'text' as const, text: JSON.stringify(data, null, 2) }],
  };
}

const QueryParamsSchema = z.record(z.union([z.string(), z.number()]));

export function registerWebhookTools(server: McpServer, client: ModusignClient): void {
  server.registerTool(
    'webhook_list',
    {
      description: 'List webhooks with pagination. 웹훅 목록을 조회합니다.',
      inputSchema: z.object({
        offset: z.number().min(0).optional().describe('Number of items to skip'),
        limit: z.number().min(1).max(100).optional().describe('Items per page'),
        params: QueryParamsSchema.optional().describe('Additional query params'),
      }),
    },
    async ({ offset, limit, params }) => {
      const result = await client.get('/webhooks', { offset, limit, ...(params ?? {}) });
      return jsonContent(result);
    },
  );

  server.registerTool(
    'webhook_create',
    {
      description: 'Create a webhook. 웹훅을 생성합니다.',
      inputSchema: z.object({
        payload: z.record(z.unknown()).describe('Webhook create payload. See Modusign API docs for required fields.'),
      }),
    },
    async ({ payload }) => {
      const result = await client.post('/webhooks', payload);
      return jsonContent(result);
    },
  );

  server.registerTool(
    'webhook_get',
    {
      description: 'Get webhook details. 웹훅 상세 정보를 조회합니다.',
      inputSchema: z.object({
        webhookId: z.string().describe('Webhook ID'),
      }),
    },
    async ({ webhookId }) => {
      const result = await client.get(`/webhooks/${webhookId}`);
      return jsonContent(result);
    },
  );

  server.registerTool(
    'webhook_update',
    {
      description: 'Update a webhook. 웹훅을 수정합니다.',
      inputSchema: z.object({
        webhookId: z.string().describe('Webhook ID'),
        payload: z.record(z.unknown()).describe('Webhook update payload. See Modusign API docs for updatable fields.'),
      }),
    },
    async ({ webhookId, payload }) => {
      const result = await client.put(`/webhooks/${webhookId}`, payload);
      return jsonContent(result);
    },
  );

  server.registerTool(
    'webhook_delete',
    {
      description: 'Delete a webhook. 웹훅을 삭제합니다.',
      inputSchema: z.object({
        webhookId: z.string().describe('Webhook ID'),
      }),
    },
    async ({ webhookId }) => {
      const result = await client.delete(`/webhooks/${webhookId}`);
      return jsonContent(result);
    },
  );
}
