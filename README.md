# Camisa7 · Backend API

**Node.js · Fastify · TypeScript · PostgreSQL/Prisma**

API and infrastructure layer in the Camisa7 football product family. This is one part of a multi-repository project. Other related components:

- [Camisa7 · React Native](https://github.com/mkwitko/camisa7-app)
- [Camisa7 · Web](https://github.com/mkwitko/camisa7-web)

> **Portfolio status:** Public source available for technical inspection. No live deployment, measured user adoption, current passing CI, or production security posture is asserted by this README. Product/customer data must not be included in demos.

## What the repository contains

Fastify application/server separation, API routes, payment/provider gateways, background jobs, database migrations, automated unit/integration/E2E test scripts and type checks.

## System boundaries

```mermaid
flowchart LR
 Mobile["React Native / Expo"] --> Contract["OpenAPI contract"]
 Web["React web client"] --> Contract
 Contract --> API["Fastify API"]
 API --> DB[("PostgreSQL / Prisma")]
 API --> Providers["Gateway integrations"]
```

This is a conceptual map across repositories based on the inspected stack, not a verified production deployment diagram.

## Inspect the implementation

- [Application composition](src/app.ts)
- [HTTP modules](src/http/)
- [Gateway boundary](src/gateways/)
- [Background jobs](src/jobs/)
- [Test suites](test/)

## Development and checks

Dependencies and configured services are required. Environment values belong in **local files**, never in committed source. Refer to `.env.example` for keys and use demo data only.

```bash
pnpm install --frozen-lockfile
pnpm typecheck
pnpm check
pnpm test:run
pnpm build
```

The commands above are exposed through project scripts; they were **not run** during this documentation update. Verify compatible Node/pnpm versions and services before relying on the setup as a one-command installation.

## Architecture and verification backlog

- [ ] Confirm data ownership and whether third-party marks/screenshots can be shared commercially in a public portfolio.
- [ ] Capture real anonymized web/mobile screenshots, with explicit approval for brands and user content.
- [ ] Explain one cross-repository feature from UI → generated client → route → service → persistence.
- [ ] Add CI based on genuinely passing checks and link the latest runs.
- [ ] Record one reproducible performance measurement (including environment and method) if available.
- [ ] Run secret scanning of the complete Git history and check license/dependency obligations.

**Technical focus:** separation between mobile, web, API contracts and server responsibilities, together with independently testable layers.
