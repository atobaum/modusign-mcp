import { z } from "zod";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { ModusignClient } from "../client/modusign-client.js";
import {
  FileInputSchema,
  RequesterAttachmentInputSchema,
  toFileRef,
  toRequesterAttachments,
} from "../utils/file-ref.js";
import fs from "fs/promises";
import path from "path";

const DocumentStatusEnum = z.enum([
  "DRAFT",
  "SCHEDULED",
  "ON_GOING",
  "ON_PROCESSING",
  "PROCESSING_FAILED",
  "ABORTED",
  "COMPLETED",
]);

const SigningMethodSchema = z.object({
  type: z
    .enum(["EMAIL", "KAKAO", "SECURE_LINK"])
    .describe(
      "Notification/signing method. EMAIL: email notification, KAKAO: KakaoTalk via phone number (use when user provides a phone number), SECURE_LINK: direct secure URL",
    ),
  value: z
    .string()
    .describe(
      "Email address for EMAIL, phone number for KAKAO (e.g. 01012345678), or email/phone number for SECURE_LINK (cannot be empty)",
    ),
});

const ParticipantSchema = z.object({
  type: z
    .enum(["SIGNER", "VIEWER"])
    .describe("SIGNER: signs the document, VIEWER: view only"),
  role: z
    .string()
    .min(1)
    .max(36)
    .describe('Role name, unique per document (e.g. "근로자", "회사 대표")'),
  name: z.string().min(2).max(30).describe("Participant name (2-30 chars)"),
  signingOrder: z
    .number()
    .min(1)
    .max(30)
    .describe(
      "Signing order. Use 1 for all participants for simultaneous signing, or 1,2,3... for sequential",
    ),
  signingMethod: SigningMethodSchema,
  signingDuration: z
    .number()
    .min(60)
    .max(525600)
    .optional()
    .describe(
      "Signing validity in minutes. Default: 20160 (14 days). Max: 525600 (365 days)",
    ),
  requesterMessage: z
    .string()
    .max(1000)
    .optional()
    .describe("Message to the signer (max 1000 chars)"),
  locale: z
    .enum(["ko", "en", "zh-CN", "ja", "vi"])
    .optional()
    .describe("Signer UI language. Default: ko"),
});

const MetadataSchema = z.object({
  key: z.string().min(1).max(40).describe("Metadata key (1-40 chars)"),
  value: z.string().max(80).describe("Metadata value (max 80 chars)"),
});

const CarbonCopySchema = z.object({
  name: z.string().min(2).max(30).describe("CC recipient name"),
  email: z.string().email().describe("CC recipient email address"),
});

const TemplateParticipantMappingSchema = z.object({
  role: z.string().describe("Role name - must match template role exactly"),
  name: z.string().min(2).max(30).describe("Participant name"),
  signingMethod: SigningMethodSchema,
  signingDuration: z
    .number()
    .min(60)
    .max(525600)
    .optional()
    .describe("Signing validity in minutes"),
  requesterMessage: z.string().max(1000).optional(),
  locale: z.enum(["ko", "en", "zh-CN", "ja", "vi"]).optional(),
  excluded: z
    .boolean()
    .optional()
    .describe("Set true to exclude this participant from signing"),
});


function jsonContent(data: unknown) {
  return {
    content: [{ type: "text" as const, text: JSON.stringify(data, null, 2) }],
  };
}

export function registerDocumentTools(
  server: McpServer,
  client: ModusignClient,
): void {
  server.registerTool(
    "document_list",
    {
      description:
        "List signing documents with pagination, filtering, and sorting. 서명 문서 목록을 조회합니다. 상태/제목/날짜/라벨로 필터링하고 정렬할 수 있습니다.",
      inputSchema: z.object({
        offset: z
          .number()
          .min(0)
          .optional()
          .describe("Number of items to skip (default: 0)"),
        limit: z
          .number()
          .min(1)
          .max(100)
          .optional()
          .describe("Items per page (default: 10, max: 100)"),
        status: DocumentStatusEnum.optional().describe(
          "Filter by document status",
        ),
        titleContains: z
          .string()
          .optional()
          .describe("Filter by title keyword (partial match)"),
        createdAtFrom: z
          .string()
          .optional()
          .describe(
            "Filter: created after this ISO 8601 datetime (e.g. 2024-01-01T00:00:00+09:00)",
          ),
        createdAtTo: z
          .string()
          .optional()
          .describe("Filter: created before this ISO 8601 datetime"),
        labelIds: z
          .array(z.string())
          .optional()
          .describe("Filter by label IDs"),
        metadatas: z
          .record(z.string(), z.string())
          .optional()
          .describe(
            'Filter by metadata key-value pairs as JSON object (e.g. {"담당자":"김모두"})',
          ),
        orderBy: z
          .string()
          .optional()
          .describe(
            'Sort order. Fields: createdAt, updatedAt, title. Directions: asc, desc. Default: "updatedAt desc"',
          ),
      }),
    },
    async ({
      offset,
      limit,
      status,
      titleContains,
      createdAtFrom,
      createdAtTo,
      labelIds,
      metadatas,
      orderBy,
    }) => {
      const filter = ModusignClient.buildODataFilter({
        status,
        titleContains,
        createdAtFrom,
        createdAtTo,
        labelIds,
      });
      const params: Record<string, string | number | undefined> = {
        offset,
        limit,
        filter,
        orderBy,
      };
      if (metadatas && Object.keys(metadatas).length > 0) {
        params.metadatas = JSON.stringify(metadatas);
      }
      const result = await client.get("/documents", params);
      return jsonContent(result);
    },
  );

  server.registerTool(
    "document_get",
    {
      description:
        "Get detailed information of a specific document including status, participants, and file URLs. 문서 상세 정보를 조회합니다.",
      inputSchema: z.object({
        documentId: z.string().describe("Document ID"),
      }),
    },
    async ({ documentId }) => {
      const result = await client.get(`/documents/${documentId}`);
      return jsonContent(result);
    },
  );

  server.registerTool(
    "document_create",
    {
      description:
        "Create a new signing request from a file or a template. 파일 또는 템플릿으로 새 서명 요청을 생성합니다. templateId를 제공하면 템플릿 기반으로, file을 제공하면 파일 기반으로 생성됩니다.",
      inputSchema: z.object({
        title: z.string().min(1).max(100).describe("Document title (1-100 chars)"),
        // File-based (required when templateId is not provided)
        file: FileInputSchema.optional().describe(
          "Main document file (FILE_PATH recommended, or BASE64). Required when templateId is not provided.",
        ),
        participants: z
          .array(ParticipantSchema)
          .min(1)
          .optional()
          .describe("Signing participants — required when using file (not template)"),
        requesterAttachments: z
          .array(RequesterAttachmentInputSchema)
          .optional()
          .describe("Requester attachments (BASE64 or FILE_REF)"),
        // Template-based (required when file is not provided)
        templateId: z
          .string()
          .optional()
          .describe(
            "Template ID — provide this instead of file to create from a template (from template_list or template_get)",
          ),
        participantMappings: z
          .array(TemplateParticipantMappingSchema)
          .optional()
          .describe("Map template roles to actual signers — required when using templateId"),
        requesterInputMappings: z
          .array(
            z.object({
              dataLabel: z.string().describe("Template input field label"),
              value: z.string().describe("Value to fill in"),
            }),
          )
          .optional()
          .describe("Pre-fill requester input fields defined in the template"),
        // Common
        metadatas: z.array(MetadataSchema).max(10).optional(),
        labelIds: z.array(z.string()).max(5).optional().describe("Label IDs to attach (max 5)"),
        carbonCopies: z
          .array(CarbonCopySchema)
          .optional()
          .describe("Carbon copy recipients who receive a copy of the signed document"),
      }),
    },
    async ({
      title,
      file,
      participants,
      requesterAttachments,
      templateId,
      participantMappings,
      requesterInputMappings,
      metadatas,
      labelIds,
      carbonCopies,
    }) => {
      if (templateId) {
        const body = {
          templateId,
          document: { title, participantMappings, requesterInputMappings, metadatas, labelIds, carbonCopies },
        };
        const result = await client.post("/documents/request-with-template", body);
        return jsonContent(result);
      }
      if (!file) throw new Error("file is required when templateId is not provided");
      const [fileRef, attachmentRefs] = await Promise.all([
        toFileRef(client, file, "document", "document"),
        toRequesterAttachments(client, requesterAttachments),
      ]);
      const body = {
        title,
        file: fileRef,
        requesterAttachments: attachmentRefs,
        participants,
        metadatas,
        labelIds,
        carbonCopies,
      };
      const result = await client.post("/documents", body);
      return jsonContent({ ...(result as object), uploadedFileRef: fileRef });
    },
  );

  server.registerTool(
    "document_create_embedded_draft",
    {
      description:
        "Create an embedded draft URL for iframe-based editing, from a file or a template. 파일 또는 템플릿으로 임베디드 초안 URL을 생성합니다. templateId를 제공하면 템플릿 기반으로, file을 제공하면 파일 기반으로 생성됩니다.",
      inputSchema: z
        .object({
          title: z.string().min(1).max(100).describe("Draft title"),
          redirectUrl: z
            .string()
            .url()
            .optional()
            .describe("Optional redirect URL after embedded flow completes"),
          // File-based
          file: FileInputSchema.optional().describe(
            "Main draft file (FILE_PATH recommended, or BASE64). Required when templateId is not provided.",
          ),
          participants: z
            .array(ParticipantSchema)
            .min(1)
            .optional()
            .describe("Draft participants — required when using file (not template)"),
          requesterAttachments: z
            .array(RequesterAttachmentInputSchema)
            .optional()
            .describe("Requester attachments (BASE64 or FILE_REF)"),
          // Template-based
          templateId: z
            .string()
            .optional()
            .describe("Template ID — provide this instead of file to create from a template"),
          participantMappings: z
            .array(TemplateParticipantMappingSchema)
            .optional()
            .describe("Map template roles to actual signers — required when using templateId"),
          requesterInputMappings: z
            .array(
              z.object({
                dataLabel: z.string().describe("Template input field label"),
                value: z.string().describe("Value to fill in"),
              }),
            )
            .optional()
            .describe("Pre-fill requester input fields defined in the template"),
          // Common
          metadatas: z.array(MetadataSchema).max(10).optional(),
          labelIds: z.array(z.string()).max(5).optional(),
        })
        .passthrough(),
    },
    async ({
      title,
      redirectUrl,
      file,
      participants,
      requesterAttachments,
      templateId,
      participantMappings,
      requesterInputMappings,
      metadatas,
      labelIds,
      ...rest
    }) => {
      if (templateId) {
        const body = {
          templateId,
          document: { title, participantMappings, requesterInputMappings, metadatas, labelIds },
          redirectUrl,
          ...rest,
        };
        const result = await client.post("/embedded-drafts/create-with-template", body);
        return jsonContent(result);
      }
      if (!file) throw new Error("file is required when templateId is not provided");
      const [fileRef, attachmentRefs] = await Promise.all([
        toFileRef(client, file, "document", "embedded-draft"),
        toRequesterAttachments(client, requesterAttachments),
      ]);
      const body = {
        title,
        file: fileRef,
        requesterAttachments: attachmentRefs,
        participants,
        metadatas,
        labelIds,
        redirectUrl,
        ...rest,
      };
      const result = await client.post("/embedded-drafts", body);
      return jsonContent({ ...(result as object), uploadedFileRef: fileRef });
    },
  );

  server.registerTool(
    "document_cancel",
    {
      description:
        "Cancel a pending signing request. Only works for documents in ON_GOING or SCHEDULED status. 서명 요청을 취소합니다. ON_GOING 또는 SCHEDULED 상태의 문서만 취소 가능합니다.",
      inputSchema: z.object({
        documentId: z.string().describe("Document ID to cancel"),
        message: z.string().min(2).max(200).describe("Cancellation reason message (2-200 chars)"),
      }),
    },
    async ({ documentId, message }) => {
      const result = await client.post(`/documents/${documentId}/cancel`, { message });
      return jsonContent(result);
    },
  );

  server.registerTool(
    "document_request_correction",
    {
      description:
        "Request a participant to correct their signed content. 서명 참여자에게 서명 내용 수정을 요청합니다.",
      inputSchema: z.object({
        documentId: z.string().describe("Document ID"),
        participantId: z
          .string()
          .describe("Participant ID to request correction from"),
        message: z
          .string()
          .min(1)
          .max(1000)
          .describe("Correction request message (1-1000 chars)"),
      }),
    },
    async ({ documentId, participantId, message }) => {
      const result = await client.post(
        `/documents/${documentId}/request-correction`,
        { participantId, message },
      );
      return jsonContent(result);
    },
  );

  server.registerTool(
    "document_remind",
    {
      description:
        "Resend signing notification to all current-order participants. 현재 서명 순서의 참여자들에게 서명 알림을 재전송합니다.",
      inputSchema: z.object({
        documentId: z.string().describe("Document ID"),
      }),
    },
    async ({ documentId }) => {
      const result = await client.post(
        `/documents/${documentId}/remind-signing`,
      );
      return jsonContent(result);
    },
  );

  server.registerTool(
    "document_change_due_date",
    {
      description:
        "Change the signing deadline for current-order participants. 현재 서명 순서 참여자의 서명 유효기간을 변경합니다.",
      inputSchema: z.object({
        documentId: z.string().describe("Document ID"),
        datetime: z
          .string()
          .describe(
            'New deadline in ISO 8601 format (e.g. "2025-03-31T12:00:00+09:00")',
          ),
      }),
    },
    async ({ documentId, datetime }) => {
      const result = await client.put(
        `/documents/${documentId}/change-signing-due`,
        { datetime },
      );
      return jsonContent(result);
    },
  );

  server.registerTool(
    "document_update_metadata",
    {
      description:
        "Replace all metadata on a document. Pass an empty array to clear all metadata. 문서 메타데이터를 변경합니다. 기존 메타데이터를 모두 교체합니다. 빈 배열을 전달하면 모든 메타데이터가 삭제됩니다.",
      inputSchema: z.object({
        documentId: z.string().describe("Document ID"),
        metadatas: z
          .array(MetadataSchema)
          .max(10)
          .describe(
            "New metadata array (replaces all existing). Max 10 items.",
          ),
      }),
    },
    async ({ documentId, metadatas }) => {
      const result = await client.put(`/documents/${documentId}/metadatas`, {
        metadatas,
      });
      return jsonContent(result);
    },
  );

  server.registerTool(
    "document_manage_labels",
    {
      description:
        "Add or remove a label on a document. 문서에 라벨을 추가하거나 제거합니다.",
      inputSchema: z.object({
        documentId: z.string().describe("Document ID"),
        labelId: z.string().describe("Label ID"),
        action: z
          .enum(["add", "remove"])
          .describe("add=라벨 추가, remove=라벨 제거"),
      }),
    },
    async ({ documentId, labelId, action }) => {
      const path = `/documents/${documentId}/labels/${labelId}`;
      const result =
        action === "add"
          ? await client.post(path)
          : await client.delete(path);
      return jsonContent(result);
    },
  );

  server.registerTool(
    "document_get_history",
    {
      description:
        "Get the audit history of a document (status changes, signing events, etc). 문서의 이력(상태 변경, 서명 이벤트 등)을 조회합니다.",
      inputSchema: z.object({
        documentId: z.string().describe("Document ID"),
      }),
    },
    async ({ documentId }) => {
      const result = await client.get(`/documents/${documentId}/histories`);
      return jsonContent(result);
    },
  );

  server.registerTool(
    "document_get_requester_inputs",
    {
      description:
        "Get the requester's input field values for a document. 문서의 요청자 입력 정보를 조회합니다.",
      inputSchema: z.object({
        documentId: z.string().describe("Document ID"),
      }),
    },
    async ({ documentId }) => {
      const result = await client.get(
        `/documents/${documentId}/requester-inputs`,
      );
      return jsonContent(result);
    },
  );

  server.registerTool(
    "document_get_participant_fields",
    {
      description:
        "Get signer input field definitions for a document. 문서의 서명자 입력란 정의를 조회합니다.",
      inputSchema: z.object({
        documentId: z.string().describe("Document ID"),
      }),
    },
    async ({ documentId }) => {
      const result = await client.get(
        `/documents/${documentId}/participant-fields`,
      );
      return jsonContent(result);
    },
  );

  server.registerTool(
    "document_get_attachments",
    {
      description:
        "Get attachments associated with a document. 문서에 첨부된 파일 목록을 조회합니다.",
      inputSchema: z.object({
        documentId: z.string().describe("Document ID"),
      }),
    },
    async ({ documentId }) => {
      const result = await client.get(`/documents/${documentId}/attachments`);
      return jsonContent(result);
    },
  );

  server.registerTool(
    "document_forward",
    {
      description:
        "Forward a completed document to external recipients via email or phone. 완료된 문서를 이메일 또는 전화번호로 외부 수신자에게 전달합니다.",
      inputSchema: z.object({
        documentId: z
          .string()
          .describe("Document ID (must be COMPLETED status)"),
        contacts: z
          .array(
            z.object({
              type: z.enum(["EMAIL", "PHONE"]).describe("Contact type"),
              value: z.string().describe("Email address or phone number"),
            }),
          )
          .min(1)
          .describe("Recipients to forward the document to"),
        message: z.string().optional().describe("Optional message to include"),
      }),
    },
    async ({ documentId, contacts, message }) => {
      const result = await client.post(`/documents/${documentId}/forward`, {
        contacts,
        message,
      });
      return jsonContent(result);
    },
  );

  server.registerTool(
    "document_get_embedded_view",
    {
      description:
        "Get an embedded document viewer URL for iframe integration. 임베디드 문서보기 URL을 조회합니다. iframe에서 문서를 표시할 수 있습니다.",
      inputSchema: z.object({
        documentId: z.string().describe("Document ID"),
      }),
    },
    async ({ documentId }) => {
      const result = await client.get(`/documents/${documentId}/embedded-view`);
      return jsonContent(result);
    },
  );

  server.registerTool(
    "document_get_signing_url",
    {
      description:
        "Get a secure signing URL for a specific participant. ONLY works for participants with SECURE_LINK signing method. Returns 422 error for EMAIL or KAKAO participants. 특정 서명 참여자의 보안 서명 링크를 조회합니다. 반드시 SECURE_LINK 방식으로 등록된 참여자만 사용 가능하며, EMAIL/KAKAO 방식의 참여자에게는 422 오류가 반환됩니다.",
      inputSchema: z.object({
        documentId: z.string().describe("Document ID"),
        participantId: z.string().describe("Participant ID"),
      }),
    },
    async ({ documentId, participantId }) => {
      const result = await client.get(
        `/documents/${documentId}/participants/${participantId}/embedded-view`,
      );
      return jsonContent(result);
    },
  );

  server.registerTool(
    "document_download",
    {
      description:
        "Download a document's PDF file to the local filesystem. 문서의 PDF 파일을 로컬 파일시스템에 저장합니다. COMPLETED 상태 문서의 최종본을 다운로드할 때 유용합니다.",
      inputSchema: z.object({
        documentId: z.string().describe("Document ID"),
        outputPath: z
          .string()
          .describe(
            'Local file path to save the PDF (e.g. "/Users/you/Downloads/contract.pdf")',
          ),
      }),
    },
    async ({ documentId, outputPath }) => {
      const doc = await client.get<Record<string, unknown>>(
        `/documents/${documentId}`,
      );
      const file = doc.file as Record<string, unknown> | undefined;
      const downloadUrl =
        (file?.downloadUrl as string | undefined) ??
        (doc.downloadUrl as string | undefined);
      if (!downloadUrl) {
        throw new Error("문서에서 다운로드 URL을 찾을 수 없습니다.");
      }
      const response = await fetch(downloadUrl);
      if (!response.ok) {
        throw new Error(`파일 다운로드 실패: ${response.status} ${response.statusText}`);
      }
      const buffer = Buffer.from(await response.arrayBuffer());
      const dir = path.dirname(outputPath);
      await fs.mkdir(dir, { recursive: true });
      await fs.writeFile(outputPath, buffer);
      return jsonContent({
        success: true,
        outputPath,
        sizeBytes: buffer.length,
        documentId,
        title: doc.title,
        status: doc.status,
      });
    },
  );
}
