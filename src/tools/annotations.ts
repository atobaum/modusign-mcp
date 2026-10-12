import type { ToolAnnotations } from "@modelcontextprotocol/sdk/types.js";

export const READ_ONLY: ToolAnnotations = { readOnlyHint: true };

export const ADDITIVE: ToolAnnotations = { readOnlyHint: false, destructiveHint: false };

export const ADDITIVE_IDEMPOTENT: ToolAnnotations = {
  readOnlyHint: false,
  destructiveHint: false,
  idempotentHint: true,
};

export const DESTRUCTIVE: ToolAnnotations = { readOnlyHint: false, destructiveHint: true };

export const DESTRUCTIVE_IDEMPOTENT: ToolAnnotations = {
  readOnlyHint: false,
  destructiveHint: true,
  idempotentHint: true,
};
