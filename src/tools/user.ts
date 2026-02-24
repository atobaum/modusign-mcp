import { z } from 'zod';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { ModusignClient } from '../client/modusign-client.js';
import { ModusignApiError } from '../utils/errors.js';

function jsonContent(data: unknown) {
  return {
    content: [{ type: 'text' as const, text: JSON.stringify(data, null, 2) }],
  };
}

export function registerUserTools(server: McpServer, client: ModusignClient): void {

  server.registerTool(
    'user_get_me',
    {
      description: 'Get information about the currently authenticated user (name, email, plan, etc). 현재 인증된 사용자의 정보(이름, 이메일, 요금제 등)를 조회합니다.',
      inputSchema: z.object({}),
    },
    async () => {
      const result = await client.get('/user');
      return jsonContent(result);
    },
  );

  server.registerTool(
    'health_check',
    {
      description: 'Check MCP server health and verify API credentials. Returns server status and authenticated user info. API 키가 유효한지 확인하고 서버 상태를 반환합니다.',
      inputSchema: z.object({}),
    },
    async () => {
      try {
        const user = await client.get<{ name: string; email: string }>('/user');
        return jsonContent({
          status: 'ok',
          authenticated: true,
          user: { name: user.name, email: user.email },
        });
      } catch (err) {
        if (err instanceof ModusignApiError && (err.statusCode === 401 || err.statusCode === 403)) {
          return {
            content: [{
              type: 'text' as const,
              text: JSON.stringify({
                status: 'error',
                authenticated: false,
                message: 'API 인증 실패: MODUSIGN_EMAIL 또는 MODUSIGN_API_KEY가 올바르지 않습니다. 모두싸인 설정 → API → API KEY 메뉴에서 키를 확인하세요.',
              }, null, 2),
            }],
          };
        }
        throw err;
      }
    },
  );

  server.registerTool(
    'user_get_subscription',
    {
      description: 'Get current subscription/plan information. 현재 구독(요금제) 정보를 조회합니다.',
      inputSchema: z.object({}),
    },
    async () => {
      const result = await client.get('/subscription');
      return jsonContent(result);
    },
  );

  server.registerTool(
    'user_get_usage',
    {
      description: 'Get usage statistics. 사용량 정보를 조회합니다.',
      inputSchema: z.object({
        params: z.record(z.union([z.string(), z.number()])).optional().describe(
          'Optional query params for usage range/grouping. Example: {"from":"2026-02-01T00:00:00+09:00","to":"2026-02-24T23:59:59+09:00","timezoneOffset":"+09:00"}',
        ),
      }),
    },
    async ({ params }) => {
      const result = await client.get('/usages', params);
      return jsonContent(result);
    },
  );
}
