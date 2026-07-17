import type { FastifyPluginAsync } from "fastify";
import type { ZodTypeProvider } from "fastify-type-provider-zod";
import { requireUser } from "@/http/hooks/auth";
import { createPresignedUpload, isStorageConfigured } from "@/infra/storage/r2";
import { ERRORS } from "@/shared/errors/catalog";
import { AvatarUploadUrlBody, AvatarUploadUrlResponse } from "./avatar.schema";

/**
 * `POST /players/me/avatar-upload-url` — mints a presigned R2 PUT URL so the
 * app uploads the avatar image directly to storage (never through the API),
 * then persists the returned `publicUrl` via `PATCH /players/me { avatarUrl }`.
 * 503 when storage isn't configured on this deploy.
 */
export const avatarUploadUrlRoute: FastifyPluginAsync = async (app) => {
  app.withTypeProvider<ZodTypeProvider>().post(
    "/players/me/avatar-upload-url",
    {
      schema: {
        operationId: "createAvatarUploadUrl",
        tags: ["players"],
        body: AvatarUploadUrlBody,
        response: { 200: AvatarUploadUrlResponse },
      },
    },
    async (req, reply) => {
      if (!isStorageConfigured) throw ERRORS.PLR.STORAGE_DISABLED();
      const { userId } = requireUser(req);
      try {
        const result = await createPresignedUpload(`avatars/${userId}`, req.body.contentType);
        void reply.code(200).send(result);
      } catch {
        throw ERRORS.PLR.UNSUPPORTED_MEDIA_TYPE();
      }
    },
  );
};
