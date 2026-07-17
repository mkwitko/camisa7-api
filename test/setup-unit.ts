import { setDummyEnv } from "./helpers/dummy-env";

// Unit tests never hit the DB, but a service under test may transitively
// import a module that eagerly parses `env.ts` at import time (e.g.
// `infra/observability/logger` — pulled in by the best-effort push helpers in
// `cancel-presence`/`join-request` services). Dummy env lets that parse
// succeed; the values are never used to open a real connection here. Same
// helper `setup-integration.ts`/`setup-e2e.ts` use.
setDummyEnv();
