import { z } from "zod";

export const LocaleSchema = z
  .enum(["ko", "en", "zh-CN", "ja", "vi"])
  .describe("Signer UI language. Default: ko");

export const SigningMethodSchema = z.object({
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

export const ParticipantSchema = z.object({
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
  locale: LocaleSchema.optional(),
});

export const MetadataSchema = z.object({
  key: z.string().min(1).max(40).describe("Metadata key (1-40 chars)"),
  value: z.string().max(80).describe("Metadata value (max 80 chars)"),
});
