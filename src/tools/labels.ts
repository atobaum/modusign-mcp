import { z } from 'zod';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { ModusignClient } from '../client/modusign-client.js';

function jsonContent(data: unknown) {
  return {
    content: [{ type: 'text' as const, text: JSON.stringify(data, null, 2) }],
  };
}

export function registerLabelTools(server: McpServer, client: ModusignClient): void {
  server.registerTool(
    'label_manage',
    {
      description: 'Manage labels: list, create, update, or delete. 라벨 CRUD 통합 툴. action 파라미터로 작업을 선택합니다.',
      inputSchema: z.object({
        action: z.enum(['list', 'create', 'update', 'delete']).describe(
          'Action to perform: list=목록조회, create=생성, update=수정, delete=삭제',
        ),
        labelId: z.string().optional().describe('Label ID — required for update and delete'),
        name: z.string().min(1).max(50).optional().describe('Label name — required for create, optional for update'),
        color: z.string().optional().describe('Label color (hex code, e.g. #FF6B6B) — optional for create/update'),
        offset: z.number().min(0).optional().describe('Items to skip — for list'),
        limit: z.number().min(1).max(100).optional().describe('Items per page — for list'),
      }),
    },
    async ({ action, labelId, name, color, offset, limit }) => {
      if (action === 'list') {
        const result = await client.get('/labels', { offset, limit });
        return jsonContent(result);
      }
      if (action === 'create') {
        if (!name) throw new Error('name is required for action="create"');
        const result = await client.post('/labels', { name, color });
        return jsonContent(result);
      }
      if (action === 'update') {
        if (!labelId) throw new Error('labelId is required for action="update"');
        const result = await client.put(`/labels/${labelId}`, { name, color });
        return jsonContent(result);
      }
      if (action === 'delete') {
        if (!labelId) throw new Error('labelId is required for action="delete"');
        const result = await client.delete(`/labels/${labelId}`);
        return jsonContent(result);
      }
      throw new Error(`Unknown action: ${action}`);
    },
  );
}
