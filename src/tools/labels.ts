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
    'label_list',
    {
      description: 'List labels with pagination. 라벨 목록을 조회합니다.',
      inputSchema: z.object({
        offset: z.number().min(0).optional().describe('Number of items to skip'),
        limit: z.number().min(1).max(100).optional().describe('Items per page'),
      }),
    },
    async ({ offset, limit }) => {
      const result = await client.get('/labels', { offset, limit });
      return jsonContent(result);
    },
  );

  server.registerTool(
    'label_create',
    {
      description: 'Create a label. 라벨을 생성합니다.',
      inputSchema: z.object({
        name: z.string().min(1).max(50).describe('Label name'),
        color: z.string().optional().describe('Optional label color (hex code, e.g. #FF6B6B)'),
      }).passthrough(),
    },
    async ({ name, color, ...rest }) => {
      const result = await client.post('/labels', { name, color, ...rest });
      return jsonContent(result);
    },
  );

  server.registerTool(
    'label_update',
    {
      description: 'Update a label. 라벨을 수정합니다.',
      inputSchema: z.object({
        labelId: z.string().describe('Label ID'),
        name: z.string().min(1).max(50).optional().describe('Label name'),
        color: z.string().optional().describe('Label color'),
      }).passthrough(),
    },
    async ({ labelId, name, color, ...rest }) => {
      const result = await client.put(`/labels/${labelId}`, { name, color, ...rest });
      return jsonContent(result);
    },
  );

  server.registerTool(
    'label_delete',
    {
      description: 'Delete a label. 라벨을 삭제합니다.',
      inputSchema: z.object({
        labelId: z.string().describe('Label ID'),
      }),
    },
    async ({ labelId }) => {
      const result = await client.delete(`/labels/${labelId}`);
      return jsonContent(result);
    },
  );
}
