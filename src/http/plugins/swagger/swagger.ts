import fastifySwagger from "@fastify/swagger";
import fastifySwaggerUi from "@fastify/swagger-ui";
import type { FastifyPluginAsync } from "fastify";
import fp from "fastify-plugin";
import { jsonSchemaTransform } from "fastify-type-provider-zod";
import { SERVICE_NAME } from "@/config/env";

/**
 * OpenAPI 3 + Swagger UI. Registrado ANTES de `httpRoutes` (ver ARCHITECTURE.md
 * §7.2) para que o hook `onRoute` do `@fastify/swagger` capture o schema Zod de
 * cada rota. Exposto sem autenticação em `/docs` (UI) e `/docs/json` (spec).
 */
const _swaggerPlugin: FastifyPluginAsync = async (app) => {
  await app.register(fastifySwagger, {
    openapi: {
      info: {
        title: SERVICE_NAME,
        version: "0.1.0",
      },
      components: {
        securitySchemes: {
          bearerAuth: {
            type: "http",
            scheme: "bearer",
            bearerFormat: "JWT",
          },
        },
      },
    },
    transform: jsonSchemaTransform,
  });

  await app.register(fastifySwaggerUi, {
    routePrefix: "/docs",
  });
};

export const swaggerPlugin = fp(_swaggerPlugin, { fastify: "5.x", name: "swagger" });
