import type { FastifyPluginAsync } from "fastify";
import type { ZodTypeProvider } from "fastify-type-provider-zod";
import { z } from "zod/v4";
import { env } from "@/config/env";

const AppleAppSiteAssociation = z.object({
  applinks: z.object({
    apps: z.array(z.string()),
    details: z.array(z.object({ appID: z.string(), paths: z.array(z.string()) })),
  }),
});

const AssetLinks = z.array(
  z.object({
    relation: z.array(z.string()),
    target: z.object({
      namespace: z.literal("android_app"),
      package_name: z.string(),
      sha256_cert_fingerprints: z.array(z.string()),
    }),
  }),
);

/**
 * Arquivos de associação de domínio para universal links (iOS) e app links
 * (Android) — habilitam `/j/:slug` a abrir o app quando instalado. Públicos,
 * servidos como JSON. O AASA NÃO pode ter extensão `.json` no path — é assim
 * que o iOS reconhece o formato ao buscar `https://<host>/.well-known/
 * apple-app-site-association`.
 */
export const wellKnownRoutes: FastifyPluginAsync = async (app) => {
  const typed = app.withTypeProvider<ZodTypeProvider>();

  typed.get(
    "/.well-known/apple-app-site-association",
    {
      schema: {
        operationId: "wellKnownAppleAppSiteAssociation",
        tags: ["share"],
        response: { 200: AppleAppSiteAssociation },
      },
      config: { public: true },
    },
    async (_req, reply) => {
      void reply
        .header("Content-Type", "application/json")
        .code(200)
        .send({
          applinks: {
            apps: [],
            details: [{ appID: env.IOS_APP_ID, paths: ["/j/*"] }],
          },
        });
    },
  );

  typed.get(
    "/.well-known/assetlinks.json",
    {
      schema: {
        operationId: "wellKnownAssetLinks",
        tags: ["share"],
        response: { 200: AssetLinks },
      },
      config: { public: true },
    },
    async (_req, reply) => {
      void reply
        .header("Content-Type", "application/json")
        .code(200)
        .send([
          {
            relation: ["delegate_permission/common.handle_all_urls"],
            target: {
              namespace: "android_app" as const,
              package_name: env.ANDROID_PACKAGE,
              sha256_cert_fingerprints: env.ANDROID_SHA256 ? [env.ANDROID_SHA256] : [],
            },
          },
        ]);
    },
  );
};
