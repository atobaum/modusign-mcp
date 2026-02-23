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
    'file_upload',
    {
      description: 'Upload a file (base64 encoded) for use in document creation. Returns fileId + token valid for 2 hours. 파일을 업로드합니다. 반환된 fileId와 token은 2시간 유효하며, document_create에서 사용할 수 있습니다. Supported formats: pdf, hwp, hwpx, doc, docx, xls, xlsx, ppt, pptx, bmp, gif, jpg, jpeg, png, tiff.',
      inputSchema: z.object({
        fileBase64: z.string().describe('Base64-encoded file content'),
        fileName: z.string().describe('File name with extension (e.g. "contract.pdf")'),
        type: z.enum(['document', 'attachment']).describe('File type. "document": main signing document (PDF up to 10MB, others up to 5MB). "attachment": supplementary file (up to 10MB)'),
      }),
    },
    async ({ fileBase64, fileName, type }) => {
      const buffer = Buffer.from(fileBase64, 'base64');
      const blob = new Blob([buffer]);
      const formData = new FormData();
      formData.append('file', blob, fileName);
      formData.append('type', type);
      const result = await client.postFormData('/files', formData);
      return jsonContent(result);
    },
  );

  server.registerTool(
    'file_merge',
    {
      description: 'Merge multiple uploaded PDF files into a single file. Use file_upload first to get fileId+token for each file. 여러 PDF 파일을 하나로 병합합니다. 먼저 file_upload로 각 파일의 fileId+token을 얻어야 합니다.',
      inputSchema: z.object({
        files: z.array(z.object({
          fileId: z.string().describe('File ID from file_upload'),
          token: z.string().describe('File token from file_upload'),
        })).min(2).describe('Files to merge (at least 2). PDF only.'),
      }),
    },
    async ({ files }) => {
      const result = await client.post('/files/merge', { files });
      return jsonContent(result);
    },
  );
}
