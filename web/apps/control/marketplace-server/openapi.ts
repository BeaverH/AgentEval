import { z } from "zod";
import { commandSchema, connectionTestSchema } from "./nmgr-contract";
import { connectionSettingsSchema } from "./nmgr-connection-config";

const ref = (name: string) => ({ $ref: `#/components/schemas/${name}` });
const string = { type: "string" };
const integer = { type: "integer" };
const strings = { type: "array", items: string };
const object = { type: "object", additionalProperties: true };
const json = (schema: unknown) => ({ "application/json": { schema } });
const inputSchema = (schema: z.ZodType) => {
  const { $schema, ...value } = z.toJSONSchema(schema, { io: "input" });
  return value;
};
const role = { name: "X-Marketplace-Role", in: "header", required: false, description: "Default V3 demo role selection (not authentication). Strict mode derives role from the authenticated user instead.", schema: { type: "string", enum: ["User", "User Admin", "IT Admin"], default: "User" } };
const revision = { name: "X-Marketplace-Connection", in: "header", required: false, description: "Use connectionRevision returned by GET /api/nmgr/connection. A stale value returns 409 before sending work to a changed backend.", schema: string };
const errorResponses = Object.fromEntries([400, 401, 403, 404, 405, 409, 413, 415, 422, 502, 503].map(status => [status, { description: status === 409 ? "Revision/idempotency conflict or uncertain operation; reload and reconcile, do not blindly retry writes." : "Structured failure; correlate error.requestId with server logs.", content: json(ref("ErrorResponse")) }]));
const responses = (schema: unknown, description = "Success") => ({ "200": { description, content: json(schema) }, ...errorResponses });

const draft = { id: "customer-data", kind: "Guardrail", name: "Customer data protection", description: "Block configured sensitive terms", location: "Gateway", mandatory: false, refs: [], attributes: { bu: "ISS", agent: "Customer assistant", data: "Text" }, threshold: 20 };
const config = { scannerType: "keyword", direction: "both", content: "private-key", versionName: "v1", versionDescription: "Initial version" };
const envelope = { requestId: "c119f72b-9acb-43bf-93d2-88a4a177286c", expectedRevision: 0 };
const example = (summary: string, value: object) => ({ summary, value: { ...envelope, ...value } });
export const commandExamples = {
  create: example("User: create a requirement; Tech selects provider later", { type: "create", draft }),
  edit: example("User: update own draft", { type: "edit", draft }),
  revise: example("User: create the next business revision", { type: "revise", draft }),
  implementNeMo: example("IT Admin: implement using a NeMo Policy", { type: "action", id: draft.id, action: "implement", provider: "NeMo", config }),
  implementF5: example("IT Admin: implement using an F5 Scanner", { type: "action", id: draft.id, action: "implement", provider: "F5", config }),
  evaluate: example("IT Admin: queue real evaluation (advance until complete)", { type: "evaluate", id: draft.id, dataset: "Acceptance", cases: [{ input: "private-key", expected: "block", phase: "input" }, { input: "private-key", expected: "block", phase: "output" }, { input: "hello", expected: "allow", phase: "input" }] }),
  request: example("User: request signoff", { type: "action", id: draft.id, action: "request" }),
  approve: example("User Admin: approve independently of author", { type: "action", id: draft.id, action: "approve" }),
  reject: example("User Admin: reject with reason", { type: "action", id: draft.id, action: "reject", reason: "Revise the policy" }),
  withdraw: example("User: withdraw own request", { type: "action", id: draft.id, action: "withdraw" }),
  deploy: example("IT Admin: queue release of signed-off, tested revision", { type: "action", id: draft.id, action: "deploy" }),
  advance: example("Initiating Tech/authorized author: advance one pending job step", { type: "advance", id: draft.id }),
  reconcile: example("Recover a failed/uncertain operation before retrying", { type: "reconcile", id: draft.id }),
  createProfile: example("User: compose existing same-provider Guardrails", { type: "create", draft: { ...draft, id: "customer-profile", kind: "Profile", name: "Customer profile", refs: [draft.id] } }),
};

export function createOpenApi() {
  const connection = inputSchema(connectionSettingsSchema) as any;
  for (const key of ["nemoUrl", "nemoToken", "databaseUrl", "workspaceId", "caPem", "f5Url", "f5Token", "f5AdminIds"])
    connection.properties[key] = { ...connection.properties[key], writeOnly: true };
  return {
    openapi: "3.1.0",
    info: { title: "Marketplace NeMo / F5 Integration API", version: "1.0.0", description: "Backend contract for the formal UI and the bundled V3 connection/workflow UI. Forward /api through the same-origin gateway. Default demo uses server-side NeMo/F5 credentials and role switching; it is not a user-authorization boundary. Secrets are never returned. /v2/guardrails remains browser Mock; /v3/guardrails uses these live APIs. Legacy /api/f5/* simulation and /api/marketplace/* CRUD APIs are not this contract." },
    servers: [{ url: "/", description: "Same-origin gateway; forward /api to this service" }],
    tags: [{ name: "Connections", description: "Shared encrypted connection settings and read-only independent probes" }, { name: "Workflow", description: "Real NeMo/F5 business workflow; HTTP 200 is not proof a background job succeeded" }, { name: "Operations" }, { name: "Documentation" }],
    paths: {
      "/api/health": { get: { tags: ["Operations"], operationId: "health", summary: "UI/API process health", description: "Independent of database, NeMo and F5. Suitable for Kubernetes probes; does not prove integration readiness.", responses: responses({ type: "object", properties: { ok: { type: "boolean" } } }) } },
      "/api/marketplace-config": { get: { tags: ["Connections"], operationId: "v3Runtime", summary: "Read V3 runtime flags and connection revision", parameters: [{ name: "workspace", in: "query", required: true, schema: { type: "string", enum: ["v3"] } }], responses: responses({ allOf: [ref("ConnectionStatus"), { type: "object", properties: { mode: { type: "string", const: "live" } } }] }) } },
      "/api/nmgr/connection": {
        get: { tags: ["Connections"], operationId: "getConnection", summary: "Read configured/masked state", description: "Returns presence flags, choices and connectionRevision, never saved URL, Token, password or certificate values.", responses: responses(ref("ConnectionStatus")) },
        post: { tags: ["Connections"], operationId: "saveConnection", summary: "Validate and save shared fallback settings", description: "Blank/omitted fields preserve values. Changing NeMo/F5 URL requires fresh corresponding Token. Checks NeMo identity, database schema access, and F5 when changed before encrypting/saving; failures preserve old settings. Default V3 demo only; strict mode rejects manual configuration. Database initialization can create application tables.", parameters: [revision], requestBody: { required: true, content: json(ref("ConnectionSettings")) }, responses: responses(ref("ConnectionStatus")) },
        delete: { tags: ["Connections"], operationId: "clearConnection", summary: "Remove saved overrides and use deployment configuration", description: "Does not modify Kubernetes Secrets/YAML or delete backend business resources. Default V3 demo only.", parameters: [revision], responses: responses(ref("ConnectionStatus")) },
      },
      "/api/nmgr/connection/test": { post: { tags: ["Connections"], operationId: "testConnection", summary: "Test a single connection using entered or saved values", description: "Does not save settings. nemoUrl/f5Url test an unauthenticated API address; JSON 401 means reachable only. nemoToken verifies identity plus policies/guardrails write grants. databaseUrl runs SELECT 1 without migrations. f5Token checks scanner read access. Other dependencies need not be configured. Credentials must be re-entered when testing a Token at a changed URL. NeMo demo TLS defaults to skip; choose verify to enforce certificates.", parameters: [revision], requestBody: { required: true, content: json(ref("ConnectionTest")) }, responses: responses(ref("ProbeResult")) } },
      "/api/nmgr/ready": { get: { tags: ["Operations"], operationId: "databaseReadiness", summary: "Check V3 configuration and application database", description: "Validates selected configuration and accesses application storage (may initialize schema). Does not contact NeMo/F5; use independent connection tests for those.", responses: responses(object) } },
      "/api/nmgr/workspace": { get: { tags: ["Workflow"], operationId: "getWorkspace", summary: "Read workflow snapshot or a resource's live backend status", description: "Validates NeMo identity and reads durable Marketplace workflow state. This is not an import/list of every existing upstream object. resource queries inspect the corresponding linked NeMo/F5 resource and can return status=unavailable in HTTP 200. Reading a snapshot does not advance a job.", parameters: [role, revision, { name: "resource", in: "query", required: false, schema: { type: "string", pattern: "^[a-z][a-z0-9-]{2,63}$" }, description: "Marketplace resource ID. Omit for the full snapshot." }], responses: responses({ oneOf: [ref("Workspace"), ref("ResourceObservation")] }) } },
      "/api/nmgr/commands": { post: { tags: ["Workflow"], operationId: "executeCommand", summary: "Create, edit, implement, evaluate, approve, publish or recover", description: "Use a fresh UUID requestId for each new command and the latest expectedRevision from the snapshot. Retrying the same logical request reuses its UUID and identical body. Provider assignment belongs to IT Admin implement, not User create. Guardrail maps to NeMo Policy/F5 Scanner; Profile maps to NeMo Guardrail/F5 Project. Inspect jobs[id].status and message even on HTTP 200. Pending work requires explicit advance commands; there is no autonomous job worker. Uncertain/failed work requires reconcile before continuing. Demo roles select workbenches; strict mode uses authenticated account mapping.", parameters: [role, revision], requestBody: { required: true, content: { "application/json": { schema: ref("Command"), examples: commandExamples } } }, responses: responses(ref("Workspace"), "Updated snapshot; check jobs and business status, not HTTP status alone") } },
      "/api/openapi.json": { get: { tags: ["Documentation"], operationId: "openApi", summary: "Download OpenAPI 3.1 contract", responses: responses(object) } },
      "/api/endpoints": { get: { tags: ["Documentation"], operationId: "apiInventory", summary: "Read API inventory and command examples", responses: responses(object) } },
      "/api/docs": { get: { tags: ["Documentation"], operationId: "swagger", summary: "Open offline interactive Swagger UI", responses: { "200": { description: "Swagger UI HTML; all assets served under /api/docs/", content: { "text/html": { schema: string } } } } } },
    },
    components: { schemas: {
      Command: inputSchema(commandSchema), ConnectionSettings: connection,
      ConnectionTest: { ...inputSchema(connectionTestSchema), properties: { target: { type: "string", enum: ["nemoUrl", "nemoToken", "databaseUrl", "f5Url", "f5Token"] }, settings: ref("ConnectionSettings") } },
      ConnectionStatus: { type: "object", properties: { saved: { type: "boolean" }, configured: { type: "object", additionalProperties: { type: "boolean" } }, advanced: { type: "object", properties: { nemoTls: { type: "string", enum: ["skip", "verify"] }, databaseTls: string, caMode: string, f5Mode: string } }, connectionRevision: string, demoRoleSwitching: { type: "boolean" }, manualConfiguration: { type: "boolean" }, persistence: { type: "string", enum: ["persistent", "pod"] } } },
      ProbeResult: { type: "object", required: ["ok", "target", "message", "durationMs"], properties: { ok: { type: "boolean", const: true }, target: string, message: string, durationMs: integer, httpStatus: integer } },
      ErrorResponse: { type: "object", required: ["error"], properties: { error: { type: "object", required: ["code", "component", "message", "requestId"], properties: { code: string, component: string, message: string, settings: strings, requestId: string, details: { type: "object", properties: { operation: string, certificateVerification: string, httpStatus: integer, contentType: string, upstreamCode: string, upstreamMessage: string, causes: { type: "array", items: { type: "object", properties: { name: string, code: string, message: string, syscall: string } } }, hints: strings } } } } } },
      Workspace: { type: "object", required: ["revision", "actor", "state", "jobs", "bindings"], properties: { revision: integer, actor: { type: "object", properties: { id: string, name: string, role: { type: "string", enum: ["User", "User Admin", "IT Admin"] }, unit: string } }, sources: strings, accessMode: { type: "string", enum: ["demo", "authenticated", "local"] }, state: { type: "object", properties: { entities: { type: "array", items: ref("Entity") }, audit: { type: "array", items: { type: "object", properties: { id: string, time: string, entity: string, action: string, actor: string } } } } }, jobs: { type: "object", additionalProperties: ref("Job") }, bindings: { type: "object", description: "Keys are resourceId@businessVersion; values identify real upstream Policy/Guardrail or Scanner/Project and revision.", additionalProperties: object } } },
      Entity: { type: "object", required: ["id", "kind", "name", "status", "version"], properties: { id: string, kind: { type: "string", enum: ["Guardrail", "Profile"] }, provider: { type: "string", enum: ["NeMo", "F5"] }, sourcePending: { type: "boolean" }, name: string, description: string, unit: string, location: string, mandatory: { type: "boolean" }, refs: strings, deployedRefs: strings, status: { type: "string", enum: ["DRAFT", "TEST READY", "TEST FAILED", "TEST PASSED", "SIGNOFF REQUESTED", "SIGNED OFF", "DEPLOYED"] }, version: integer, configurationRevision: integer, deployed: { type: ["integer", "null"] }, config: object, attributes: object, runs: { type: "array", items: object } }, additionalProperties: true },
      Job: { type: "object", properties: { phase: string, status: { type: "string", enum: ["pending", "failed", "uncertain", "done"] }, started: string, actor: string, message: string, purpose: string, inflight: { type: "boolean" }, canCorrect: { type: "boolean" }, canResume: { type: "boolean" }, runId: string, dataset: string } },
      ResourceObservation: { type: "object", required: ["id", "revision", "checkedAt", "status", "message"], properties: { id: string, revision: integer, checkedAt: string, status: { type: "string", enum: ["local_only", "available", "changed", "missing", "unavailable", "source_changed"] }, message: string, remoteVersion: string } },
    } },
  };
}

export function apiInventory() {
  const spec = createOpenApi();
  return { openapi: "/api/openapi.json", swagger: "/api/docs", items: Object.entries(spec.paths).flatMap(([path, operations]) => Object.entries(operations).map(([method, operation]) => ({ method: method.toUpperCase(), path, operationId: operation.operationId, summary: operation.summary }))), commandExamples };
}
