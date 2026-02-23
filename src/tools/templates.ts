import { z } from 'zod';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { ModusignClient } from '../client/modusign-client.js';

function jsonContent(data: unknown) {
  return {
    content: [{ type: 'text' as const, text: JSON.stringify(data, null, 2) }],
  };
}

export function registerTemplateTools(server: McpServer, client: ModusignClient): void {

  server.tool(
    'template_list',
    'List available document templates with pagination. 사용 가능한 문서 템플릿 목록을 조회합니다.',
    {
      offset: z.number().min(0).optional().describe('Number of items to skip (default: 0)'),
      limit: z.number().min(1).max(100).optional().describe('Items per page (default: 10, max: 100)'),
    },
    async ({ offset, limit }) => {
      const result = await client.get('/templates', { offset, limit });
      return jsonContent(result);
    },
  );

  server.tool(
    'template_get',
    'Get detailed information of a template including roles, input fields, and configuration. 템플릿의 상세 정보(역할, 입력 필드, 설정 등)를 조회합니다.',
    { templateId: z.string().describe('Template ID') },
    async ({ templateId }) => {
      const result = await client.get(`/templates/${templateId}`);
      return jsonContent(result);
    },
  );
}
