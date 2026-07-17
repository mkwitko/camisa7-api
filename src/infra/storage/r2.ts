import { randomUUID } from "node:crypto";
import { PutObjectCommand, S3Client } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import { env } from "@/config/env";

/**
 * Cloudflare R2 (S3-compatible) object storage. Config-gated: when any R2 env
 * var is missing, `isStorageConfigured` is false and the upload endpoints
 * return 503 (feature off) — the rest of the app runs normally, same pattern
 * as push (FCM). Uploads use a presigned PUT so the file goes client → R2
 * directly, never through the API.
 */
export const isStorageConfigured = Boolean(
  env.R2_ENDPOINT &&
    env.R2_ACCESS_KEY_ID &&
    env.R2_SECRET_ACCESS_KEY &&
    env.R2_BUCKET &&
    env.R2_PUBLIC_URL,
);

let client: S3Client | undefined;
function s3(): S3Client {
  client ??= new S3Client({
    region: "auto",
    endpoint: env.R2_ENDPOINT as string,
    credentials: {
      accessKeyId: env.R2_ACCESS_KEY_ID as string,
      secretAccessKey: env.R2_SECRET_ACCESS_KEY as string,
    },
  });
  return client;
}

const EXT_BY_TYPE: Record<string, string> = {
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
};

export type PresignedUpload = {
  /** PUT here with the raw bytes + the same Content-Type. Expires shortly. */
  uploadUrl: string;
  /** Persist this as the stored URL (e.g. `Player.avatarUrl`). */
  publicUrl: string;
};

/**
 * Generates a presigned PUT URL under `prefix/<uuid>.<ext>` for a given content
 * type, plus the public URL the object will be served from. `contentType` must
 * be one of the allowed image types.
 */
export async function createPresignedUpload(
  prefix: string,
  contentType: string,
): Promise<PresignedUpload> {
  const ext = EXT_BY_TYPE[contentType];
  if (!ext) throw new Error("unsupported_content_type");

  const key = `${prefix}/${randomUUID()}.${ext}`;
  const command = new PutObjectCommand({
    Bucket: env.R2_BUCKET,
    Key: key,
    ContentType: contentType,
  });
  const uploadUrl = await getSignedUrl(s3(), command, { expiresIn: 300 });
  return { uploadUrl, publicUrl: `${env.R2_PUBLIC_URL}/${key}` };
}

export const ALLOWED_IMAGE_TYPES = Object.keys(EXT_BY_TYPE);
