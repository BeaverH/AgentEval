# AI Marketplace deployment — v0.2.24

Image: `ghcr.io/idddd/tali-ui-demo:0.2.24` (Linux amd64).
Chart: `oci://ghcr.io/idddd/charts/tali-ui-demo`, version `0.2.24`.

V3 now needs only a NeMo API URL, business API token and full PostgreSQL/MariaDB URL. The default demo keeps role switching, with no extra SSO/account map. The same V3 connection page supports masked manual fallbacks, optional TLS/CA/workspace/F5 settings and encrypted shared server storage. Failed saves retain the last valid connection. Mock remains independent of real dependencies.

| Entry | Behavior |
| --- | --- |
| `/v2/guardrails` | Browser-only Mock with saved demonstration data |
| `/v2-mock/guardrails` | Compatible Mock alias |
| `/v3/guardrails` | Real integration and inline connection setup/fallback |
| `/v1/` | Existing Profiles / Guardrails UI |

## Start or upgrade

```sh
docker pull ghcr.io/idddd/tali-ui-demo:0.2.24
docker run -d --name ai-marketplace -p 18082:8080 \
  -v marketplace-connections:/var/lib/marketplace/connection \
  -e MARKETPLACE_CONNECTION_DIR=/var/lib/marketplace/connection \
  -e MARKETPLACE_CONNECTION_PERSISTENT=true \
  ghcr.io/idddd/tali-ui-demo:0.2.24
```

Open `/v3/guardrails` to configure connections, or `/v2/guardrails` for Mock.

```sh
helm upgrade --install tali-ui-demo oci://ghcr.io/idddd/charts/tali-ui-demo \
  --version 0.2.24 --namespace YOUR_NAMESPACE -f values.uat.yaml
```

Keep the existing release name, namespace, registry, Istio and resource settings. Preserve `workspaceId` and NeMo URL to retain the same workspace. The new chart defaults read token/DB URL from existing Secret `tali`, keys `tali-guard-bootstrap-user-ini` and `tali-guard-postgresql-init`. Only the NeMo URL must be added to normal connection values; override Secret references only when names differ. Credentials do not belong in values.

## Internal Helm delta

Follow the complete [internal upgrade instructions](../deploy/v2/UAT-token-config.md). For a separately maintained internal chart, updating the image tag alone is insufficient:

- Merge new env mappings and a writable `connection-settings` mount for encrypted shared settings. The new chart supplies these automatically.
- Use `/api/health` for startup/readiness/liveness; real diagnostics `/api/nmgr/ready` do not gate Mock.
- Use optional integration Secret/ConfigMap references; remove old template requirements for account mapping or missing real connections.
- Default `emptyDir` keeps manual settings across browser sessions and in-Pod container restarts. Optional `marketplace.connectionStorage.existingClaim` retains them across Pod replacement. Keep data and key together and preserve compatible file ownership. Default single-replica deployment is retained.

No extra account ConfigMap, `publicOrigin`, `dataMode`, `v2Live`, `crudOnly` or local actor setup is required for default V3. Advanced connection settings are in the same page. Explicit `demoRoles: false` retains strict identity mode and ignores stored demo overrides.

## Credentials, diagnostics and persistence

Saved settings take precedence over deployment settings until Use deployment settings clears them. Secret/YAML are not overwritten. After rotating a deployment Secret, restart as usual and clear old manual overrides if those were saved. Changing a NeMo/F5 address requires a fresh token, so existing credentials are never forwarded to a new destination.

Stored plaintext is not returned to clients or logged; all inputs are masked by default. V3 demo defaults to skipping certificate verification only for the configured NeMo API. Set `marketplace.nemoTls: verify` or choose verification in the connection page to use trusted certificates. F5 and database TLS policies remain unchanged. Every visitor can configure and switch roles in this user-requested demo mode. Browser Mock data and shared server connection settings have separate storage lifecycles.

Version 0.2.24 adds read-only independent URL/Token/database probes and masked error cause chains. The external UI can use the same `/api/nmgr/*` contract through a same-origin gateway. Forward `/api` unchanged, including `/api/docs/*` for bundled offline Swagger assets; no CORS or new required connection values are needed. See [API inventory and frontend integration](integration-api.md). Swagger is `/api/docs`, the machine-readable contract is `/api/openapi.json`, and the API list is `/api/endpoints`.

V3 failures include component, code, setting names and Reference matching `X-Request-ID` and structured logs. See [connection behavior and persistence](uat/2026-10-29-v3-three-input-fallback.md). UI health does not certify backend permissions, models, Runner capacity or real publishing; target OCP acceptance remains environment-specific.

## Internal registry and offline artifacts

```sh
docker pull ghcr.io/idddd/tali-ui-demo:0.2.24
docker tag ghcr.io/idddd/tali-ui-demo:0.2.24 INTERNAL_REGISTRY/tali-ui:0.2.24
docker push INTERNAL_REGISTRY/tali-ui:0.2.24
```

The published image embeds its matching chart and sanitized source archive:

- `/opt/tali/helm/tali-UI-demo.tgz`
- `/opt/tali/source/project-source.zip`
- `/opt/tali/source/project-source.zip.sha256`
- `/opt/marketplace/check-nemo.mjs`

```sh
container=$(docker create ghcr.io/idddd/tali-ui-demo:0.2.24)
docker cp "$container:/opt/tali/helm/tali-UI-demo.tgz" ./tali-ui-demo-0.2.24.tgz
docker cp "$container:/opt/tali/source/project-source.zip" ./project-source.zip
docker cp "$container:/opt/tali/source/project-source.zip.sha256" ./project-source.zip.sha256
docker rm "$container"
sha256sum -c project-source.zip.sha256
```

Source excludes real credentials, local environment files, databases, logs, dependencies and generated output. Public localhost TLS fixtures are test-only. The release workflow verifies startup, embedded source/chart integrity, Helm templates and 16 synthetic dependency failures before publishing the OCI chart. Release assets include checksums; validate offline archives before importing.
