import { z } from 'zod';
import { ModusignClient } from '../client/modusign-client.js';

const FileRefSchema = z.object({
  fileId: z.string(),
  token: z.string(),
});

const Base64FileSchema = z.object({
  type: z.literal('BASE64').optional().describe('File input mode: BASE64'),
  value: z.string().describe('Base64-encoded file content'),
  fileName: z.string().optional().describe('File name with extension (e.g. "contract.pdf")'),
  extension: z.string().optional().describe('Extension fallback when fileName is omitted (e.g. "pdf")'),
}).refine(
  (value) => Boolean(value.fileName) || Boolean(value.extension),
  { message: 'fileName 또는 extension 중 하나는 필수입니다.' },
);

const Base64LegacySchema = z.object({
  base64: z.string().describe('Base64-encoded file content (legacy format)'),
  fileName: z.string().optional().describe('File name with extension (e.g. "contract.pdf")'),
  extension: z.string().optional().describe('Extension fallback when fileName is omitted (e.g. "pdf")'),
}).refine(
  (value) => Boolean(value.fileName) || Boolean(value.extension),
  { message: 'fileName 또는 extension 중 하나는 필수입니다.' },
);

const FileRefValueSchema = z.object({
  type: z.literal('FILE_REF').optional().describe('File input mode: FILE_REF'),
  value: FileRefSchema,
});

const FileRefLegacySchema = FileRefSchema;

export const FileInputSchema = z.union([
  Base64FileSchema,
  Base64LegacySchema,
  FileRefValueSchema,
  FileRefLegacySchema,
]).describe('BASE64 또는 FILE_REF 형식 파일 입력');

export type FileInput = z.infer<typeof FileInputSchema>;

export const RequesterAttachmentInputSchema = z.union([
  FileInputSchema,
  z.object({
    file: FileInputSchema,
  }).passthrough(),
]);

export type RequesterAttachmentInput = z.infer<typeof RequesterAttachmentInputSchema>;

type UploadType = 'document' | 'attachment';

interface FileRef {
  fileId: string;
  token: string;
}

function isDirectFileRef(input: FileInput): input is { fileId: string; token: string } {
  return 'fileId' in input && 'token' in input;
}

function isValueFileRef(input: FileInput): input is { type?: 'FILE_REF'; value: { fileId: string; token: string } } {
  return 'type' in input && input.type === 'FILE_REF' && 'value' in input;
}

function resolveFileName(input: FileInput, fallbackBaseName: string): string {
  if ('fileName' in input && input.fileName) {
    return input.fileName;
  }

  const extension = 'extension' in input && input.extension ? input.extension : 'pdf';
  const normalized = extension.replace(/^\./, '');
  return `${fallbackBaseName}.${normalized}`;
}

function resolveBase64(input: FileInput): string {
  if ('base64' in input) {
    return input.base64;
  }

  if ('type' in input && input.type === 'BASE64' && 'value' in input) {
    return input.value;
  }

  throw new Error('BASE64 payload is required for upload mode.');
}

function parseUploadRef(result: unknown): FileRef {
  const direct = z.object({
    fileId: z.string(),
    token: z.string(),
  }).safeParse(result);
  if (direct.success) {
    return direct.data;
  }

  const nested = z.object({
    file: z.object({
      fileId: z.string(),
      token: z.string(),
    }),
  }).safeParse(result);
  if (nested.success) {
    return nested.data.file;
  }

  throw new Error(`Unexpected file upload response: ${JSON.stringify(result)}`);
}

export async function toFileRef(
  client: ModusignClient,
  input: FileInput,
  uploadType: UploadType,
  fallbackBaseName: string,
): Promise<FileRef> {
  if (isDirectFileRef(input)) {
    return { fileId: input.fileId, token: input.token };
  }

  if (isValueFileRef(input)) {
    return { fileId: input.value.fileId, token: input.value.token };
  }

  const fileName = resolveFileName(input, fallbackBaseName);
  const buffer = Buffer.from(resolveBase64(input), 'base64');
  const formData = new FormData();
  formData.append('file', new Blob([buffer]), fileName);
  formData.append('type', uploadType);

  const uploadResult = await client.postFormData('/files', formData);
  return parseUploadRef(uploadResult);
}

export async function toRequesterAttachments(
  client: ModusignClient,
  attachments?: RequesterAttachmentInput[],
): Promise<unknown[] | undefined> {
  if (!attachments || attachments.length === 0) {
    return undefined;
  }

  const normalized = await Promise.all(
    attachments.map(async (attachment, index) => {
      const fallbackBaseName = `requester-attachment-${index + 1}`;
      if (typeof attachment === 'object' && attachment !== null && 'file' in attachment) {
        const fileRef = await toFileRef(client, attachment.file, 'attachment', fallbackBaseName);
        return { ...attachment, file: fileRef };
      }

      return toFileRef(client, attachment, 'attachment', fallbackBaseName);
    }),
  );

  return normalized;
}
