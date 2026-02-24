import { z } from 'zod';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { ModusignClient } from '../client/modusign-client.js';

function jsonContent(data: unknown) {
  return {
    content: [{ type: 'text' as const, text: JSON.stringify(data, null, 2) }],
  };
}

export function registerFileTools(server: McpServer, client: ModusignClient): void {
  server.registerTool(
    'file_merge',
    {
      description: 'Merge multiple PDF FILE_REF objects into a single file. 여러 PDF FILE_REF(fileId+token)를 하나로 병합합니다.',
      inputSchema: z.object({
        files: z.array(z.object({
          fileId: z.string().describe('Uploaded file ID'),
          token: z.string().describe('Uploaded file token'),
        })).min(2).describe('Files to merge (at least 2). PDF only.'),
      }),
    },
    async ({ files }) => {
      const result = await client.post('/files/merge', { files });
      return jsonContent(result);
    },
  );
}
