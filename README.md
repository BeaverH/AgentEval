# AI Marketplace

AI Marketplace manages **Guardrails** and **Profiles**. Current release:
**v0.2.24**, image `ghcr.io/idddd/tali-ui-demo:0.2.24`.

The current source also exposes the real NeMo/F5 integration backend for a separate
UI behind the same-origin `/api` gateway. Interactive Swagger is at `/api/docs`,
OpenAPI at `/api/openapi.json`, and the API inventory at `/api/endpoints`.
The bundled V3 UI remains available for quick deployment and connection testing;
V2 remains independent Mock. See [integration API and frontend contract](docs/integration-api.md).
Version 0.2.24 includes these APIs, independent connection tests, and detailed masked diagnostics.

## Current UI

Version URLs select the interface: **`/v1/`** keeps the existing two-section
Profiles / Guardrails UI; **`/v2/`** opens the NMGR Mock role workbenches,
and **`/v3/`** opens the real integration workspace. The mode banner links
between Mock V2 and Real V3; `/v2-mock/` remains a compatible Mock alias. V2 configuration import is available
only at the hidden **`/v2/import`** page. Upload or paste JSON, preview it,
then confirm; imports add drafts without replacing existing records.
The existing technical-test JSON dataset upload remains available.
See [local version URLs and JSON format](docs/local-ui-versions.md).

V2 includes a responsive Profile operating sidebar, NeMo/F5 provider badges,
mode approval and Bypass controls, and evaluation rows that expand into results.
Control Unit filters always include ISS, RMG, LCS, Line 1.5, and Line 2.

- **Guardrails**: create requirements, implement and evaluate versions, and review readiness.
- **Profiles**: select Guardrails and versions, view statistics, and expand each Guardrail to inspect traces and errors.
- Each Guardrail in a Profile has its own **Monitoring** or **Preventing** mode. Submit the Profile's final mode configuration for approval as a whole. Pending changes do not replace approved modes.
- Monitoring records detections without blocking. Preventing records detections and actual blocks.
- Profile **Bypass** requires confirmation and skips all Guardrail checks. In mock mode, this simulates forwarding to the original upstream without creating traces. Exiting Bypass returns all Guardrails to Monitoring.
- Mock traffic is generated approximately every five seconds while the Profile overview is open and visible, including success, error, detection and, in Preventing mode, block.
- Local accounts include Admin, IT Admin, Line 1.5 and Line 2.

## Start the published image

Requires Docker. Default demo data is stored in browser localStorage; no database is used.

```sh
docker pull ghcr.io/idddd/tali-ui-demo:0.2.24
docker run -d --name ai-marketplace -p 18082:8080 \
  ghcr.io/idddd/tali-ui-demo:0.2.24
```

Open [V1](http://127.0.0.1:18082/v1/) or [V2](http://127.0.0.1:18082/v2/).
V1 Guardrails are at `/v1/policies`; Profiles are at `/v1/guardrails`.

See [deployment and source export](docs/marketplace-release.md) for Helm,
JFrog and the embedded project source, or [runtime branding](docs/runtime-branding.md)
for logo and favicon replacement.

## Shared database and initial data

V2 Mock defaults to browser localStorage (`MARKETPLACE_DEMO_STORAGE=browser`).
Different browsers do not share cases. Server-side storage APIs are disabled.

- Default cases initialize on the first visit in each browser. Refresh retains edits.
- Other tabs on the same origin pick up changes. Different browsers and domains are independent.
- Pod restart does not clear browser data; clearing browser site data does.
- No PVC is required. Use the unlinked `/api/demo-backup` page to export and restore cases. Import validation is stateless and does not store data on the server.
- Completed trace details are limited to 200 per Profile, 1,000 overall and 24 hours, with an additional size budget. Older details are folded into aggregate statistics. A total state size limit prevents oversized writes.

## Local development

Requires Node.js 22+ and npm.

```sh
cd web
npm ci
npm run dev:control -- --host 127.0.0.1 --port 18082
```

The server defaults to `data/demo.sqlite` relative to its working directory.
`MARKETPLACE_DEMO_DB_FILE` optionally changes the file location.

Build and run from `web/`:

```sh
npm run build:control
npm run start:control
```

## Live Guard connection

Open `/v3/guardrails` for the default live demo. Only a NeMo `/api/v1` URL,
business API Token and full PostgreSQL/MariaDB URL are needed; all three can
be entered on that page when deployment configuration is missing or invalid.
Masked fallback settings are encrypted and shared by the demo instance;
optional TLS/CA/workspace/F5 controls are on the same page. Role switching is
enabled without extra SSO/account mapping. Explicit `demoRoles: false` selects
strict identity mode. Persist the connection directory or attach an existing
PVC to retain saved configuration across container/Pod replacement.
See [the current deployment guide](docs/marketplace-release.md). Mock `/v2/`
continues to work when real configuration or connections fail.

See [Guard API connection](docs/guard-openapi-connection.md) for supported
operations and optional authoring configuration.

## Verification

From `web/`:

```sh
node node_modules/typescript/bin/tsc -p apps/control/tsconfig.json --noEmit
cd apps/control
node ../../node_modules/vitest/vitest.mjs run --config vitest.config.ts src/features/business-demo marketplace-server/shared-demo.test.ts marketplace-server/guard-api.test.ts
```

The [release workflow](.github/workflows/container-images.yml) checks image
startup, default database reads and writes, embedded source integrity and
the Helm chart before completing publication.
