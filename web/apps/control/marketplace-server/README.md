# AI Marketplace server

The primary live backend contract is now `/api/nmgr/*`, shared by the bundled V3
UI and external frontends behind the same-origin API gateway. It orchestrates real
NeMo Policy/Guardrail and F5 Scanner/Project operations with durable workflow state.
Use `/api/docs` (offline Swagger), `/api/openapi.json`, and `/api/endpoints`.
See [the API inventory, workflow and deployment contract](../../../../docs/integration-api.md).
The legacy APIs listed below are retained for older UI modes, not the formal V3 integration contract.

The Node/Nitro server serves the Guardrails and Profiles UI and provides:

- `/api/demo-state`: shared SQLite state in mock/auto mode, with revision conflict handling, trace retention and size protection.
- `/api/marketplace-config`: runtime connection settings.
- `/api/guard/*`: per-user authenticated, allowlisted Guard proxy.
- `/api/health`: health check.
- Runtime logo and favicon handling.

SQLite is automatic for mock data. Its default path is `data/demo.sqlite`
relative to the server working directory, optionally overridden by
`MARKETPLACE_DEMO_DB_FILE`. The published image uses `/data/demo.sqlite`.
The frontend initializes a new database on first access; existing database
records take precedence over browser records.

Active frontend data access is in `src/features/business-demo/guard-api.ts`,
`provider.tsx` and `shared-state.ts`.

See the [project README](../../../../README.md) and
[Guard connection documentation](../../../../docs/guard-openapi-connection.md).
