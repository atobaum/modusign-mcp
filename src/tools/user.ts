import { z } from 'zod';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { ModusignClient } from '../client/modusign-client.js';

function jsonContent(data: unknown) {
  return {
    content: [{ type: 'text' as const, text: JSON.stringify(data, null, 2) }],
  };
}

export function registerUserTools(server: McpServer, client: ModusignClient): void {
  server.tool(
    'user_get_me',
    'Get information about the currently authenticated user (name, email, plan, etc). 현재 인증된 사용자의 정보(이름, 이메일, 요금제 등)를 조회합니다.',
    {},
    async () => {
      const result = await client.get('/user');
      return jsonContent(result);
    },
  );
}
