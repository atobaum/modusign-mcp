import { z } from 'zod';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { ModusignClient } from '../client/modusign-client.js';
import {
  FileInputSchema,
  RequesterAttachmentInputSchema,
  toFileRef,
  toRequesterAttachments,
} from '../utils/file-ref.js';

const MetadataSchema = z.object({
  key: z.string().min(1).max(40).describe('Metadata key (1-40 chars)'),
  value: z.string().max(80).describe('Metadata value (max 80 chars)'),
});

const EmbeddedTemplateParticipantSchema = z.object({
  type: z.enum(['SIGNER', 'VIEWER']).describe('Participant type'),
  role: z.string().min(1).max(36).describe('Role name for template'),
  name: z.string().min(2).max(30).describe('Participant display name'),
  signingOrder: z.number().min(1).max(30).describe('Signing order'),
  signingMethod: z.object({
    type: z.enum(['EMAIL', 'KAKAO', 'SECURE_LINK']).describe('Notification/signing method'),
    value: z.string().describe('Method value'),
  }),
  signingDuration: z.number().min(60).max(525600).optional(),
  requesterMessage: z.string().max(1000).optional(),
  locale: z.enum(['ko', 'en', 'zh-CN', 'ja', 'vi']).optional(),
});

function jsonContent(data: unknown) {
  return {
    content: [{ type: 'text' as const, text: JSON.stringify(data, null, 2) }],
  };
}

function addCreateTemplateMode(url: string): string {
  try {
    const parsed = new URL(url);
    parsed.searchParams.set('mode', 'create-template');
    return parsed.toString();
  } catch {
    const separator = url.includes('?') ? '&' : '?';
    return `${url}${separator}mode=create-template`;
  }
}

export function registerTemplateTools(server: McpServer, client: ModusignClient): void {

  server.registerTool(
    'template_list',
    {
      description: 'List available document templates with pagination. 사용 가능한 문서 템플릿 목록을 조회합니다.',
      inputSchema: z.object({
        offset: z.number().min(0).optional().describe('Number of items to skip (default: 0)'),
        limit: z.number().min(1).max(100).optional().describe('Items per page (default: 10, max: 100)'),
      }),
    },
    async ({ offset, limit }) => {
      const result = await client.get('/templates', { offset, limit });
      return jsonContent(result);
    },
  );

  server.registerTool(
    'template_get',
    {
      description: 'Get detailed information of a template including roles, input fields, and configuration. 템플릿의 상세 정보(역할, 입력 필드, 설정 등)를 조회합니다.',
      inputSchema: z.object({
        templateId: z.string().describe('Template ID'),
      }),
    },
    async ({ templateId }) => {
      const result = await client.get(`/templates/${templateId}`);
      return jsonContent(result);
    },
  );

  server.registerTool(
    'template_create_embedded',
    {
      description: 'Create an embedded URL for template authoring. 임베디드 템플릿 생성용 URL을 반환합니다. 반환된 URL은 mode=create-template이 적용됩니다.',
      inputSchema: z.object({
        title: z.string().min(1).max(100).describe('Draft title'),
        file: FileInputSchema.describe('Template source file (BASE64 or FILE_REF)'),
        requesterAttachments: z.array(RequesterAttachmentInputSchema)
          .optional()
          .describe('Requester attachments. Each item supports BASE64 or FILE_REF and is normalized to FILE_REF.'),
        participants: z.array(EmbeddedTemplateParticipantSchema).min(1).describe('Participants for template draft'),
        metadatas: z.array(MetadataSchema).max(10).optional(),
        labelIds: z.array(z.string()).max(5).optional(),
        redirectUrl: z.string().url().optional().describe('Optional redirect URL after embedded flow completes'),
      }).passthrough(),
    },
    async ({ title, file, requesterAttachments, participants, metadatas, labelIds, redirectUrl, ...rest }) => {
      const [fileRef, attachmentRefs] = await Promise.all([
        toFileRef(client, file, 'document', 'template'),
        toRequesterAttachments(client, requesterAttachments),
      ]);

      const draft = await client.post<Record<string, unknown>>('/embedded-drafts', {
        title,
        file: fileRef,
        requesterAttachments: attachmentRefs,
        participants,
        metadatas,
        labelIds,
        redirectUrl,
        ...rest,
      });

      const urlKey = ['embeddedUrl', 'url', 'embeddedViewUrl'].find(
        (key) => typeof draft[key] === 'string',
      );

      if (!urlKey) {
        return jsonContent({ ...draft, uploadedFileRef: fileRef });
      }

      const originalUrl = draft[urlKey] as string;
      return jsonContent({
        ...draft,
        [urlKey]: addCreateTemplateMode(originalUrl),
        templateEmbeddedUrl: addCreateTemplateMode(originalUrl),
        uploadedFileRef: fileRef,
      });
    },
  );

  server.registerTool(
    'template_delete',
    {
      description: 'Delete templates. 템플릿을 삭제합니다.',
      inputSchema: z.object({
        templateIds: z.array(z.string()).min(1).optional().describe('Template IDs to delete'),
        templateId: z.string().optional().describe('Single template ID (alternative to templateIds)'),
      }).refine(
        (value) => Boolean(value.templateId) || Boolean(value.templateIds?.length),
        { message: 'templateId 또는 templateIds 중 하나는 필수입니다.' },
      ),
    },
    async ({ templateId, templateIds }) => {
      const ids = templateIds ?? [templateId as string];
      const result = await client.delete('/templates', { templateIds: ids });
      return jsonContent(result);
    },
  );

  server.registerTool(
    'template_update_metadata',
    {
      description: 'Replace all metadata on a template. 템플릿 메타데이터를 전체 교체합니다.',
      inputSchema: z.object({
        templateId: z.string().describe('Template ID'),
        metadatas: z.array(MetadataSchema).max(10).describe('New metadata array'),
      }),
    },
    async ({ templateId, metadatas }) => {
      const result = await client.put(`/templates/${templateId}/metadatas`, { metadatas });
      return jsonContent(result);
    },
  );

  server.registerTool(
    'template_get_embedded_view',
    {
      description: 'Get embedded template view URL. 임베디드 템플릿 보기 URL을 조회합니다.',
      inputSchema: z.object({
        templateId: z.string().describe('Template ID'),
        redirectUrl: z.string().url().optional().describe('Optional redirect URL after embedded flow completes'),
      }),
    },
    async ({ templateId, redirectUrl }) => {
      const result = await client.get(`/templates/${templateId}/embedded-view`, { redirectUrl });
      return jsonContent(result);
    },
  );
}
