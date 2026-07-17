import { z } from "zod/v4";
import { ALLOWED_IMAGE_TYPES } from "@/infra/storage/r2";

export const AvatarUploadUrlBody = z.object({
  contentType: z.enum(ALLOWED_IMAGE_TYPES as [string, ...string[]]),
});
export type AvatarUploadUrlBody = z.infer<typeof AvatarUploadUrlBody>;

export const AvatarUploadUrlResponse = z.object({
  /** PUT the raw bytes here (same Content-Type). Expires in ~5 min. */
  uploadUrl: z.string().url(),
  /** Persist this via `PATCH /players/me { avatarUrl }` after the PUT succeeds. */
  publicUrl: z.string().url(),
});
export type AvatarUploadUrlResponse = z.infer<typeof AvatarUploadUrlResponse>;
