import { readFileSync } from "node:fs";
import { createHash } from "node:crypto";
import { z } from "zod";
import { guardConfig, guardProxy } from "./guard-api";
import { hasNemoCredentials, nemoServiceFetch } from "./nemo-session";
import { StoreError } from "./marketplace-db";
import { databaseCacheKey, databaseConfig } from "./storage/config";
import { DeploymentError, diagnosticResponse, upstreamFailure, type Component } from "./diagnostics";
import { openDatabase } from "./storage/database";
import { NmgrService, type NmgrActor, type NmgrRemote } from "./nmgr";
import { createF5Client, f5Configuration } from "./f5-client";

const stores = new Map<string, ReturnType<typeof openDatabase>>();
const accountSchema = z.record(z.string().min(1), z.object({ name: z.string().min(1).max(160), role: z.enum(["User", "User Admin", "IT Admin"]), unit: z.string().min(1).max(100) }).strict());
const reply = (body: unknown, status = 200) => Response.json(body, { status, headers: { "Cache-Control": "no-store" } });
export function nmgrConfiguration(env: NodeJS.ProcessEnv) {
  const config = guardConfig(env);
  const demo = env.MARKETPLACE_V3_DEMO === "true";
  const localAccess = env.MARKETPLACE_V2_LOCAL_ACCESS === "true";
  if (localAccess && (!config.publicOrigin || !["127.0.0.1", "localhost", "[::1]"].includes(new URL(config.publicOrigin).hostname))) throw new DeploymentError("identity", "local_access_unsafe", "Fixed-identity access is restricted to a loopback local test deployment. Disable MARKETPLACE_V2_LOCAL_ACCESS in deployed services.", ["MARKETPLACE_V2_LOCAL_ACCESS", "MARKETPLACE_PUBLIC_ORIGIN"]);
  if (config.mode !== "live") throw new DeploymentError("runtime", "live_mode_required", "Real V3 requires MARKETPLACE_DATA_MODE=live. Use /v2/guardrails for Mock.");
  if (!demo && !config.publicOrigin) throw new DeploymentError("origin", "public_origin_missing", "Configure MARKETPLACE_PUBLIC_ORIGIN to the browser origin.");
  try { databaseConfig(env); } catch { throw new DeploymentError("database", "database_config_invalid", "Configure a valid PostgreSQL or MariaDB URL, database credentials and readable TLS CA file."); }
  if (!config.base?.endsWith("/api/v1")) throw new DeploymentError("nemo", "nemo_url_invalid", "GUARD_API_URL must end with /api/v1.", ["GUARD_API_URL"]);
  if (env.MARKETPLACE_CRUD_ONLY === "true") throw new DeploymentError("runtime", "crud_only_enabled", "Real V3 requires MARKETPLACE_CRUD_ONLY=false for evaluations and publishing.", ["MARKETPLACE_CRUD_ONLY"]);
  if (demo || localAccess || hasNemoCredentials(env)) nemoServiceFetch(env); // Validate selected credential source, without a network request.
  let accounts: z.infer<typeof accountSchema>;
  try { accounts = demo ? {} : accountSchema.parse(JSON.parse(env.MARKETPLACE_V2_ACCOUNTS_FILE ? readFileSync(env.MARKETPLACE_V2_ACCOUNTS_FILE, "utf8") : env.MARKETPLACE_V2_ACCOUNTS_JSON ?? "{}")); }
  catch { throw new DeploymentError("identity", "account_mapping_invalid", "Configure valid account-role JSON and a readable MARKETPLACE_V2_ACCOUNTS_FILE when selected."); }
  if (!demo && !Object.keys(accounts).length) throw new DeploymentError("identity", "account_mapping_missing", "Configure NeMo account IDs and Marketplace roles in MARKETPLACE_V2_ACCOUNTS_FILE or MARKETPLACE_V2_ACCOUNTS_JSON.");
  if (localAccess && !Object.hasOwn(accounts, env.MARKETPLACE_V2_LOCAL_ACTOR_ID ?? "")) throw new DeploymentError("identity", "local_actor_invalid", "MARKETPLACE_V2_LOCAL_ACTOR_ID must match an account in the mapping.");
  const namespace = env.MARKETPLACE_WORKSPACE_ID ?? "uat";
  if (!/^[a-z0-9-]{1,24}$/.test(namespace)) throw new DeploymentError("workspace", "workspace_id_invalid", "MARKETPLACE_WORKSPACE_ID must use 1–24 lowercase letters, numbers or hyphens.");
  return { ...config, demo, localAccess, accounts, f5: f5Configuration(env), workspace: createHash("sha256").update(`${namespace}:${config.base}`).digest("hex").slice(0, 12) };
}
function store(env: NodeJS.ProcessEnv) {
  const key = databaseCacheKey(env);
  let opening = stores.get(key);
  if (!opening) {
    if (stores.size >= 8) throw new DeploymentError("database", "connection_limit_reached", "Too many active database configurations. Retry after the previous connection is closed.");
    opening = openDatabase(env).catch(error => { stores.delete(key); throw error; }); stores.set(key, opening);
  }
  return opening;
}
export async function closeNmgrDatabase(env: NodeJS.ProcessEnv) {
  const key = databaseCacheKey(env), opening = stores.get(key);
  if (!opening) return;
  stores.delete(key);
  await (await opening).close?.();
}
export async function nmgrApi(request: Request, env = process.env, fetcher: typeof fetch = fetch) {
  let component: Component = "runtime";
  try {
    const config = nmgrConfiguration(env), url = new URL(request.url);
    const resource = url.searchParams.get("resource");
    if (url.search && (url.pathname !== "/api/nmgr/workspace" || [...url.searchParams].length !== 1 || !resource || !/^[a-z][a-z0-9-]{2,63}$/.test(resource)) || !["/api/nmgr/workspace", "/api/nmgr/commands", "/api/nmgr/ready"].includes(url.pathname)) throw new StoreError(404, "Route not found.");
    if (url.pathname === "/api/nmgr/ready" && request.method === "GET") {
      component = "database";
      await (await store(env)).readDocument(`nmgr:${config.workspace}`);
      return reply({ ready: true, workspace: "v3", backend: "configured", checks: { database: "reachable", nemo: "not_probed", f5: config.f5 ? "not_probed" : "not_configured", identity: "mapping_configured" } });
    }
    const write = url.pathname === "/api/nmgr/commands";
    if (request.method !== (write ? "POST" : "GET")) throw new StoreError(405, "Method not allowed.");
    if (request.headers.get("origin") && request.headers.get("origin") !== config.publicOrigin || request.headers.get("sec-fetch-site") === "cross-site") throw new DeploymentError("origin", "origin_mismatch", "Cross-origin requests are not allowed. Check MARKETPLACE_PUBLIC_ORIGIN and the browser URL.", undefined, 403);
    if (config.localAccess && (url.origin !== config.publicOrigin || write && request.headers.get("origin") !== config.publicOrigin)) throw new DeploymentError("origin", "origin_mismatch", "Local test requests must use the configured origin.", undefined, 403);
    component = "nemo";
    const serviceFetch = config.demo || config.localAccess || hasNemoCredentials(env) ? nemoServiceFetch(env, fetcher) : undefined;
    let actor: NmgrActor;
    if (config.demo) {
      let response: Response;
      try { response = await serviceFetch!(`${config.base}/account/identity`, { headers: { Accept: "application/json" } }); }
      catch (error) { if (error instanceof DeploymentError) throw error; throw new DeploymentError("nemo", "nemo_unreachable", "Cannot reach NeMo. Check the URL, network and TLS settings.", undefined, 503, error); }
      if (!response.ok) throw await upstreamFailure("nemo", "nemo_identity_rejected", "NeMo identity request failed. Check the URL, gateway and token permissions.", response, 503);
      if (!response.headers.get("content-type")?.includes("application/json")) throw await upstreamFailure("nemo", "nemo_response_invalid", "NeMo identity returned non-JSON content. Check the URL and API routing.", response);
      let identity: any;
      try { identity = await response.json(); } catch (error) { throw new DeploymentError("nemo", "nemo_response_invalid", "NeMo identity returned invalid JSON. Check the URL and API routing.", undefined, 503, error); }
      if (typeof identity.userId !== "string" || !identity.userId) throw new DeploymentError("nemo", "nemo_response_invalid", "NeMo identity is incompatible. Check the URL and API version.");
      const requested = request.headers.get("x-marketplace-role") ?? "User";
      if (!["User", "User Admin", "IT Admin"].includes(requested)) throw new StoreError(422, "Choose a supported demo workbench role.");
      const role = requested as NmgrActor["role"];
      actor = { id: `demo-${createHash("sha256").update(`${identity.userId}:${role}`).digest("hex").slice(0, 24)}`, name: role === "IT Admin" ? "Demo Tech" : role === "User Admin" ? "Demo Approver" : "Demo User", role, unit: "ISS" };
    } else if (config.localAccess) {
      const id = env.MARKETPLACE_V2_LOCAL_ACTOR_ID ?? "";
      if (!Object.hasOwn(config.accounts, id)) throw new StoreError(503, "Configure a fixed local actor ID from the Marketplace account mapping.");
      const identityResponse = await serviceFetch!(`${config.base}/account/identity`, { headers: { Accept: "application/json" } });
      if (!identityResponse.ok) throw new DeploymentError("nemo", "nemo_identity_rejected", "Cannot verify the configured NeMo service account. Check credentials and NeMo permissions.");
      const identity = await identityResponse.json();
      if (identity.authentication !== "session" || identity.role !== "user") throw new DeploymentError("nemo", "nemo_account_invalid", "Configure a NeMo business user account for backend operations.");
      actor = { id, ...config.accounts[id]! };
    } else {
      const identityResponse = await guardProxy(new Request(new URL("/api/guard/account/identity", url), { headers: request.headers }), { ...env, MARKETPLACE_DEMO_TOKEN: "" }, fetcher);
      if (!identityResponse.ok) {
        if (identityResponse.status >= 500) {
          const body = await identityResponse.json().catch(() => ({}));
          const code = ["upstream_redirect", "invalid_response", "upstream_unavailable"].includes(body.error?.code) ? body.error.code : "nemo_identity_failed";
          throw new DeploymentError("nemo", code, "Cannot verify user identity through NeMo. Check GUARD_API_URL, gateway routing, DNS/network and trusted TLS CA.", undefined, identityResponse.status);
        }
        throw new DeploymentError("identity", "identity_unavailable", identityResponse.status === 401 ? "No authenticated Marketplace user. Configure the user authentication/SSO integration; a server NeMo token does not sign in the browser user." : "Cannot verify the Marketplace user. Check user permissions and authentication forwarding.", ["GUARD_API_URL", "MARKETPLACE_V2_ACCOUNTS_FILE", "MARKETPLACE_V2_ACCOUNTS_JSON"], identityResponse.status);
      }
      const identity = await identityResponse.json();
      const mapping = Object.hasOwn(config.accounts, identity.userId) ? config.accounts[identity.userId] : undefined;
      if (!mapping) throw new DeploymentError("identity", "identity_role_unmapped", "This NeMo account is not assigned a Marketplace role. Check the account mapping.", undefined, 403);
      for (const module of ["policies", "guardrails"]) {
        const grant = identity.effectivePermissions?.[module];
        if (identity.role !== "user" || !["read", "write"].includes(grant) || write && grant !== "write") throw new StoreError(403, "Use a NeMo business user token with policies and guardrails permissions.");
      }
      actor = { id: identity.userId, ...mapping };
    }
    component = "database";
    const service = new NmgrService(await store(env), config.workspace, config.f5 ? createF5Client(config.f5, fetcher) : undefined);
    const remote: NmgrRemote = { async request(path, method = "GET", body) {
      // Paths originate exclusively in the workflow, never from client input.
      let response: Response;
      try { response = await (serviceFetch ?? fetcher)(`${config.base}${path}`, { method, redirect: "manual", signal: AbortSignal.timeout(20_000),
        headers: { ...(!serviceFetch ? { Authorization: request.headers.get("authorization")! } : {}), Accept: "application/json", ...(body ? { "Content-Type": "application/json" } : {}) },
        ...(body ? { body: JSON.stringify(body) } : {}) }); }
      catch (error) { if (error instanceof DeploymentError) throw error; throw new DeploymentError("nemo", "nemo_unreachable", "Cannot reach NeMo. Check URL, DNS, network, TLS settings and authentication. Reconcile before retrying a write.", undefined, 502, error); }
      if (!response.ok) throw await upstreamFailure("nemo", `nemo_http_${response.status}`, `NeMo rejected the operation (HTTP ${response.status}). Check token permissions, request configuration and NeMo logs. Reconcile before retrying a write.`, response);
      if (!response.headers.get("content-type")?.includes("application/json")) throw await upstreamFailure("nemo", "nemo_response_invalid", "NeMo returned a non-JSON response. Check GUARD_API_URL, gateway routing and API compatibility.", response);
      let result: any;
      try { result = await response.json(); } catch (error) { throw new DeploymentError("nemo", "nemo_response_invalid", "NeMo returned invalid JSON. Check the gateway and API compatibility.", undefined, 502, error); }
      return result;
    } };
    if (!write) return reply(resource ? await service.resourceStatus(actor, resource, remote) : { ...await service.snapshot(actor), accessMode: config.demo ? "demo" : config.localAccess ? "local" : "authenticated" });
    if (!request.headers.get("content-type")?.startsWith("application/json")) throw new StoreError(415, "JSON is required.");
    const raw = await request.text();
    if (Buffer.byteLength(raw) > 1_000_000) throw new StoreError(413, "Request is too large.");
    let command: unknown; try { command = JSON.parse(raw); } catch { throw new StoreError(422, "Invalid JSON."); }
    return reply(await service.command(actor, command, remote));
  } catch (error) {
    if (error instanceof z.ZodError) return diagnosticResponse(new StoreError(422, "Invalid command fields. Check the record, configuration and test cases."), "workspace", "nmgr.request", "Invalid command.");
    if (error instanceof StoreError && !(error instanceof DeploymentError) && error.status < 500) component = "workspace";
    const endpoint = new URL(request.url).pathname.endsWith("/ready") ? "ready" : new URL(request.url).pathname.endsWith("/commands") ? "commands" : "workspace";
    return diagnosticResponse(error, component, `nmgr.${endpoint}`, component === "database" ? "Cannot connect to Marketplace database. Check database URL/password, network, TLS CA and schema permissions." : "Cannot connect to the configured dependency. Check the listed settings, network and TLS CA.");
  }
}
