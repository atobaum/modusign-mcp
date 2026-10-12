import { z } from 'zod';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { jsonContent } from '../utils/tool-result.js';
import { ModusignClient, apiPath } from '../client/modusign-client.js';
import { DESTRUCTIVE } from './annotations.js';

const WebhookEventSchema = z.enum([
  'document_started',
  'document_signed',
  'document_all_signed',
  'document_rejected',
  'document_request_canceled',
  'document_signing_canceled',
  'document_modification_started',
  'document_modification_completed',
  'document_modification_canceled',
  'document_modification_approval_requested',
]);

export function registerWebhookTools(server: McpServer, client: ModusignClient): void {
  server.registerTool(
    'webhook_manage',
    {
      description: 'Manage webhooks: list, get, create, update, or delete. 웹훅 CRUD 통합 툴. action 파라미터로 작업을 선택합니다.',
      annotations: DESTRUCTIVE,
      inputSchema: z.object({
        action: z.enum(['list', 'get', 'create', 'update', 'delete']).describe(
          'Action to perform: list=목록조회, get=상세조회, create=생성, update=수정, delete=삭제',
        ),
        webhookId: z.string().optional().describe('Webhook ID — required for get, update, delete'),
        name: z.string().min(1).max(100).optional().describe('Webhook name — required for create and update'),
        url: z.string().url().optional().describe('Endpoint that receives POST events — required for create and update'),
        headers: z.array(z.object({ key: z.string(), value: z.string() })).optional().describe(
          'Custom HTTP headers sent with each event — for create/update',
        ),
        events: z.array(WebhookEventSchema).optional().describe(
          'Events to subscribe to — for create/update. update replaces all fields, so omitting events unsubscribes from every event.',
        ),
        offset: z.number().min(0).optional().describe('Items to skip — for list'),
        limit: z.number().min(1).max(100).optional().describe('Items per page — for list'),
      }),
    },
    async ({ action, webhookId, name, url, headers, events, offset, limit }) => {
      if (action === 'list') {
        const result = await client.get('/webhooks', { offset, limit });
        return jsonContent(result);
      }
      if (action === 'get') {
        if (!webhookId) throw new Error('webhookId is required for action="get"');
        const result = await client.get(apiPath`/webhooks/${webhookId}`);
        return jsonContent(result);
      }
      if (action === 'create') {
        if (!name || !url) throw new Error('name and url are required for action="create"');
        const result = await client.post('/webhooks', { name, url, headers, events });
        return jsonContent(result);
      }
      if (action === 'update') {
        if (!webhookId) throw new Error('webhookId is required for action="update"');
        if (!name || !url) throw new Error('name and url are required for action="update"');
        const result = await client.put(apiPath`/webhooks/${webhookId}`, { name, url, headers, events });
        return jsonContent(result);
      }
      if (action === 'delete') {
        if (!webhookId) throw new Error('webhookId is required for action="delete"');
        const result = await client.delete(apiPath`/webhooks/${webhookId}`);
        return jsonContent(result);
      }
      throw new Error(`Unknown action: ${action}`);
    },
  );
}
