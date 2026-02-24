import { z } from "zod";
import { readFile } from "fs/promises";
import { basename } from "path";
import { ModusignClient } from "../client/modusign-client.js";

const FileRefSchema = z.object({
  fileId: z.string(),
  token: z.string(),
});

const Base64FileSchema = z
  .object({
    type: z.literal("BASE64").describe("File input mode: BASE64"),
    base64: z.string().describe("Base64-encoded file content"),
    fileName: z
      .string()
      .optional()
      .describe('File name with extension (e.g. "contract.pdf")'),
    extension: z
      .string()
      .optional()
      .describe('Extension fallback when fileName is omitted (e.g. "pdf")'),
  })
  .refine((value) => Boolean(value.fileName) || Boolean(value.extension), {
    message: "fileName 또는 extension 중 하나는 필수입니다.",
  });

const FileRefValueSchema = z.object({
  type: z.literal("FILE_REF").describe("File input mode: FILE_REF"),
  value: FileRefSchema,
});

const FilePathSchema = z.object({
  filePath: z
    .string()
    .describe(
      "Absolute local file path to upload (e.g. /Users/you/contract.pdf)",
    ),
});

export const FileInputSchema = z
  .union([FilePathSchema, FileRefValueSchema, Base64FileSchema])
  .describe("filePath(권장), FILE_REF, 또는 BASE64 형식 파일 입력");

export type FileInput = z.infer<typeof FileInputSchema>;

export const RequesterAttachmentInputSchema = z.union([
  FileInputSchema,
  z
    .object({
      file: FileInputSchema,
    })
    .passthrough(),
]);

export type RequesterAttachmentInput = z.infer<
  typeof RequesterAttachmentInputSchema
>;

type UploadType = "document" | "attachment";

export interface FileRef {
  fileId: string;
  token: string;
}

function isValueFileRef(
  input: FileInput,
): input is { type: "FILE_REF"; value: { fileId: string; token: string } } {
  return "type" in input && input.type === "FILE_REF" && "value" in input;
}

function resolveFileName(input: FileInput, fallbackBaseName: string): string {
  if ("fileName" in input && input.fileName) {
    return input.fileName;
  }

  const extension =
    "extension" in input && input.extension ? input.extension : "pdf";
  const normalized = extension.replace(/^\./, "");
  return `${fallbackBaseName}.${normalized}`;
}

function resolveBase64(input: FileInput): string {
  if ("base64" in input) {
    return input.base64;
  }

  throw new Error("BASE64 payload is required for upload mode.");
}

function parseUploadRef(result: unknown): FileRef {
  const direct = z
    .object({
      fileId: z.string(),
      token: z.string(),
    })
    .safeParse(result);
  if (direct.success) {
    return direct.data;
  }

  const nested = z
    .object({
      file: z.object({
        fileId: z.string(),
        token: z.string(),
      }),
    })
    .safeParse(result);
  if (nested.success) {
    return nested.data.file;
  }

  throw new Error(`Unexpected file upload response: ${JSON.stringify(result)}`);
}

async function uploadBuffer(
  client: ModusignClient,
  buffer: Buffer,
  fileName: string,
  uploadType: UploadType,
): Promise<FileRef> {
  const formData = new FormData();
  formData.append("file", new Blob([new Uint8Array(buffer)]), fileName);
  const uploadResult = await client.postFormData("/files", formData, { type: uploadType });
  return parseUploadRef(uploadResult);
}

export async function toFileRef(
  client: ModusignClient,
  input: FileInput,
  uploadType: UploadType,
  fallbackBaseName: string,
): Promise<FileRef> {
  // FILE_PATH: read from disk and upload (preferred)
  if ("filePath" in input) {
    const fileName = basename(input.filePath);
    const buffer = await readFile(input.filePath);
    return uploadBuffer(client, buffer, fileName, uploadType);
  }

  if (isValueFileRef(input)) {
    return { fileId: input.value.fileId, token: input.value.token };
  }

  // BASE64: upload then use FILE_REF
  const fileName = resolveFileName(input, fallbackBaseName);
  const buffer = Buffer.from(resolveBase64(input), "base64");
  return uploadBuffer(client, buffer, fileName, uploadType);
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
      if (
        typeof attachment === "object" &&
        attachment !== null &&
        "file" in attachment
      ) {
        const fileRef = await toFileRef(
          client,
          attachment.file,
          "attachment",
          fallbackBaseName,
        );
        return { ...attachment, file: fileRef };
      }

      return toFileRef(client, attachment, "attachment", fallbackBaseName);
    }),
  );

  return normalized;
}
