import "fastify";

/**
 * Augments Fastify's own types (as opposed to `./fastify.ts`, which adds the
 * `gateways` decorator). Split into its own file so a `.d.ts` (types only,
 * never emits JS) doesn't mix with `fastify.ts`'s runtime-adjacent `Gateways`
 * type export.
 */
declare module "fastify" {
  interface FastifyContextConfig {
    /** Opt-out of the global `authHook` (see `src/http/hooks/auth.ts`). */
    public?: boolean;
  }

  interface FastifyRequest {
    /** Set by `authHook` after verifying the bearer access token. */
    user?: { userId: string };
  }
}
