import { z } from 'zod';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { ModusignClient } from '../client/modusign-client.js';

function jsonContent(data: unknown) {
  return {
    content: [{ type: 'text' as const, text: JSON.stringify(data, null, 2) }],
  };
}

export function registerWebhookTools(server: McpServer, client: ModusignClient): void {
  server.registerTool(
    'webhook_manage',
    {
      description: 'Manage webhooks: list, get, create, update, or delete. 웹훅 CRUD 통합 툴. action 파라미터로 작업을 선택합니다.',
      inputSchema: z.object({
        action: z.enum(['list', 'get', 'create', 'update', 'delete']).describe(
          'Action to perform: list=목록조회, get=상세조회, create=생성, update=수정, delete=삭제',
        ),
        webhookId: z.string().optional().describe('Webhook ID — required for get, update, delete'),
        payload: z.record(z.unknown()).optional().describe(
          'Webhook payload for create or update. See Modusign API docs for fields (url, events, secret, active, etc.)',
        ),
        offset: z.number().min(0).optional().describe('Items to skip — for list'),
        limit: z.number().min(1).max(100).optional().describe('Items per page — for list'),
      }),
    },
    async ({ action, webhookId, payload, offset, limit }) => {
      if (action === 'list') {
        const result = await client.get('/webhooks', { offset, limit });
        return jsonContent(result);
      }
      if (action === 'get') {
        if (!webhookId) throw new Error('webhookId is required for action="get"');
        const result = await client.get(`/webhooks/${webhookId}`);
        return jsonContent(result);
      }
      if (action === 'create') {
        const result = await client.post('/webhooks', payload ?? {});
        return jsonContent(result);
      }
      if (action === 'update') {
        if (!webhookId) throw new Error('webhookId is required for action="update"');
        const result = await client.put(`/webhooks/${webhookId}`, payload ?? {});
        return jsonContent(result);
      }
      if (action === 'delete') {
        if (!webhookId) throw new Error('webhookId is required for action="delete"');
        const result = await client.delete(`/webhooks/${webhookId}`);
        return jsonContent(result);
      }
      throw new Error(`Unknown action: ${action}`);
    },
  );
}
