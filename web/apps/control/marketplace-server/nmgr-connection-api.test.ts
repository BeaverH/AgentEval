import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, expect, it, vi } from "vitest";
const db = vi.hoisted(() => ({
  readDocument: vi.fn(async () => undefined),
  close: vi.fn(),
  exclusive: async (fn: () => Promise<any>) => fn(),
}));
vi.mock("./storage/database", () => ({ openDatabase: async () => db }));
import { ConnectionStore } from "./nmgr-connection-store";
import {
  connectionApi,
  nmgrRequest,
  v3RuntimeResponse,
} from "./nmgr-connection-api";
const env = {
  GUARD_API_URL: "https://nemo.private/api/v1",
  GUARD_API_TOKEN: "secret-business-token",
  MARKETPLACE_DATABASE_URL:
    "postgres://app:private-password@db.private/marketplace",
};
const identity = vi.fn<typeof fetch>(async () =>
  Response.json({ userId: "real-nemo-user", role: "user" }),
);
const dirs: string[] = [];
async function store() {
  const dir = await mkdtemp(join(tmpdir(), "nmgr-settings-"));
  dirs.push(dir);
  return new ConnectionStore(dir);
}
const request = (path: string, role?: string) =>
  new Request(`https://ui.internal/api/nmgr/${path}`, {
    headers: role ? { "X-Marketplace-Role": role } : {},
  });
const save = (body: unknown, origin = "https://ui.internal") =>
  new Request("https://ui.internal/api/nmgr/connection", {
    method: "POST",
    headers: { Origin: origin, "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
const testConnection = (target: string, settings = {}) => new Request("https://ui.internal/api/nmgr/connection/test", {
  method: "POST", headers: { Origin: "https://ui.internal", "Content-Type": "application/json" },
  body: JSON.stringify({ target, settings }),
});

it("tests NeMo URL without a token or database and never saves the candidate", async () => {
  const saved = await store();
  const response = await nmgrRequest(testConnection("nemoUrl", { nemoUrl: env.GUARD_API_URL }), {},
    async (_url, init) => {
      expect(new Headers(init?.headers).has("authorization")).toBe(false);
      return Response.json({ error: { code: "unauthenticated" } }, { status: 401 });
    }, saved);
  expect(response.status).toBe(200);
  expect(await response.json()).toMatchObject({ ok: true, target: "nemoUrl", httpStatus: 401 });
  expect(await saved.read()).toBeNull();
});
it("tests Token independently, rejects HTML and does not accept identity without policies/guardrails write access", async () => {
  const saved = await store();
  for (const upstream of [new Response("<html>login</html>", { headers: { "Content-Type": "text/html" } }), Response.json({ userId: "u", effectivePermissions: { policies: "read" } })]) {
    const response = await nmgrRequest(testConnection("nemoToken"), { GUARD_API_URL: env.GUARD_API_URL, GUARD_API_TOKEN: env.GUARD_API_TOKEN }, async () => upstream, saved);
    expect(response.ok).toBe(false);
    expect((await response.json()).error.component).toBe("nemo");
  }
  const success = await nmgrRequest(testConnection("nemoToken"), { GUARD_API_URL: env.GUARD_API_URL, GUARD_API_TOKEN: env.GUARD_API_TOKEN },
    async () => Response.json({ userId: "u", effectivePermissions: { policies: "write", guardrails: "write" } }), saved);
  expect(success.status).toBe(200);
  expect(await saved.read()).toBeNull();
});
it("retains nested connection errors in both response and log, with credentials redacted", async () => {
  const log = vi.spyOn(console, "error").mockImplementation(() => {});
  const saved = await store();
  const response = await nmgrRequest(testConnection("nemoToken"), env, async () => {
    throw new TypeError("fetch failed", { cause: Object.assign(new Error(`connect ECONNREFUSED token=${env.GUARD_API_TOKEN}`), { code: "ECONNREFUSED", syscall: "connect" }) });
  }, saved);
  const body = await response.json();
  expect(body.error).toMatchObject({ component: "nemo", details: { causes: expect.arrayContaining([expect.objectContaining({ code: "ECONNREFUSED" })]) } });
  expect(JSON.stringify(log.mock.calls)).toContain("ECONNREFUSED");
  expect(JSON.stringify([body, log.mock.calls])).not.toContain(env.GUARD_API_TOKEN);
});
it("does not forward existing tokens to changed probe destinations", async () => {
  const response = await nmgrRequest(testConnection("nemoToken", { nemoUrl: "https://other.test/api/v1" }), env, identity, await store());
  expect(response.status).toBe(422);
  expect(identity).not.toHaveBeenCalled();
});
it("ignores unrelated changed URLs when an external UI submits its complete form for a single probe", async () => {
  const response = await nmgrRequest(testConnection("databaseUrl", { databaseUrl: "invalid-db-url", nemoUrl: "https://changed.test/api/v1", f5Url: "https://changed-f5.test/backend/v1" }), env, identity, await store());
  expect((await response.json()).error).toMatchObject({ component: "database", code: "database_config_invalid" });
  expect(identity).not.toHaveBeenCalled();
});
afterEach(async () => {
  vi.restoreAllMocks();
  identity.mockClear();
  db.close.mockClear();
  db.readDocument.mockReset().mockResolvedValue(undefined);
  await Promise.all(
    dirs.splice(0).map((dir) => rm(dir, { recursive: true, force: true })),
  );
});

it("enters a server-verified demo with three inputs, no SSO/mapping and switchable roles", async () => {
  const saved = await store();
  const config = await (
    await v3RuntimeResponse(request("workspace"), env, saved)
  ).json();
  expect(config).toMatchObject({
    mode: "live",
    demoRoleSwitching: true,
    connectionRevision: expect.any(String),
  });
  const snapshots = [];
  for (const role of ["User", "User Admin", "IT Admin"]) {
    const response = await nmgrRequest(
      request("workspace", role),
      env,
      identity,
      saved,
    );
    expect(response.status).toBe(200);
    const snapshot = await response.json();
    expect(snapshot).toMatchObject({ accessMode: "demo", actor: { role } });
    snapshots.push(snapshot);
  }
  expect(new Set(snapshots.map((s) => s.actor.id)).size).toBe(3);
  expect(
    new Headers(identity.mock.calls[0]![1]?.headers).get("authorization"),
  ).toBe("Bearer secret-business-token");
});
it("returns only masked-state metadata and persists explicit overrides for other clients", async () => {
  const saved = await store();
  const override = {
    nemoUrl: "https://replacement.private/api/v1",
    nemoToken: "replacement-private-token",
    databaseUrl:
      "mariadb://app:replacement-password@replacement.private/marketplace",
  };
  const response = await connectionApi(save(override), {}, identity, saved);
  expect(response.status).toBe(200);
  const text = await response.text();
  for (const value of Object.values(override))
    expect(text).not.toContain(value);
  expect(await saved.read()).toEqual(override);
  const state = await (
    await connectionApi(request("connection"), {}, identity, saved)
  ).json();
  expect(state).toMatchObject({
    saved: true,
    configured: { nemoUrl: true, nemoToken: true, databaseUrl: true },
  });
  const workspace = await nmgrRequest(
    request("workspace", "IT Admin"),
    {},
    identity,
    saved,
  );
  expect(workspace.status).toBe(200);
});
it("preserves working settings on a failed dependency check and does not expose driver details", async () => {
  vi.spyOn(console, "error").mockImplementation(() => {});
  const saved = await store(),
    working = {
      nemoUrl: env.GUARD_API_URL,
      nemoToken: env.GUARD_API_TOKEN,
      databaseUrl: env.MARKETPLACE_DATABASE_URL,
    };
  await saved.save(working);
  db.readDocument.mockRejectedValueOnce(
    new Error("private-password driver detail"),
  );
  const response = await connectionApi(
    save({ nemoToken: "new-token" }),
    {},
    identity,
    saved,
  );
  expect(response.status).toBe(503);
  expect(await response.text()).not.toContain("private-password");
  expect(await saved.read()).toEqual(working);
});
it("rejects cross-origin configuration changes before contacting dependencies", async () => {
  vi.spyOn(console, "error").mockImplementation(() => {});
  const saved = await store();
  expect(
    (
      await connectionApi(
        save({ nemoUrl: env.GUARD_API_URL }, "https://other.internal"),
        env,
        identity,
        saved,
      )
    ).status,
  ).toBe(403);
  expect(identity).not.toHaveBeenCalled();
  expect(await saved.read()).toBeNull();
});
it("never sends an existing deployment or saved token to a changed NeMo destination", async () => {
  vi.spyOn(console, "error").mockImplementation(() => {});
  const saved = await store();
  for (const previous of [
    null,
    { nemoUrl: env.GUARD_API_URL, nemoToken: "saved-private-token" },
  ]) {
    if (previous) await saved.save(previous);
    const response = await connectionApi(
      save({ nemoUrl: "https://other.private/api/v1" }),
      env,
      identity,
      saved,
    );
    expect(response.status).toBe(422);
    expect((await response.json()).error.code).toBe(
      "connection_token_required",
    );
  }
  expect(identity).not.toHaveBeenCalled();
});
it("ignores saved demo overrides and broken demo storage in strict identity mode", async () => {
  const saved = await store();
  vi.spyOn(saved, "read").mockRejectedValue(new Error("Corrupt demo settings"));
  const strict = {
    ...env,
    MARKETPLACE_V3_DEMO: "false",
    MARKETPLACE_DATA_MODE: "live",
    MARKETPLACE_PUBLIC_ORIGIN: "https://ui.internal",
    MARKETPLACE_V2_ACCOUNTS_JSON: JSON.stringify({
      "real-nemo-user": { name: "Explicit User", role: "User", unit: "ISS" },
    }),
  };
  const config = await v3RuntimeResponse(request("workspace"), strict, saved);
  expect(config.status).toBe(200);
  expect((await config.json()).manualConfiguration).toBe(false);
  const response = await nmgrRequest(
    new Request("https://ui.internal/api/nmgr/workspace", {
      headers: { Authorization: "Bearer explicit-user-token" },
    }),
    strict,
    async () =>
      Response.json({
        userId: "real-nemo-user",
        role: "user",
        effectivePermissions: { policies: "read", guardrails: "read" },
      }),
    saved,
  );
  expect(response.status).toBe(200);
  expect(saved.read).not.toHaveBeenCalled();
});
it("rejects stale browser commands after shared connection configuration changes", async () => {
  vi.spyOn(console, "error").mockImplementation(() => {});
  const saved = await store();
  const config = await (
    await v3RuntimeResponse(request("workspace"), env, saved)
  ).json();
  await saved.save({ nemoToken: "new-configured-token" });
  const response = await nmgrRequest(
    new Request("https://ui.internal/api/nmgr/commands", {
      method: "POST",
      headers: {
        Origin: "https://ui.internal",
        "Content-Type": "application/json",
        "X-Marketplace-Connection": config.connectionRevision,
      },
      body: "{}",
    }),
    env,
    identity,
    saved,
  );
  expect(response.status).toBe(409);
  expect((await response.json()).error.code).toBe("connection_changed");
  expect(identity).not.toHaveBeenCalled();
});
it("repairs optional deployment blockers on the same connection endpoint without returning advanced values", async () => {
  const saved = await store();
  const response = await connectionApi(
    save({
      workspaceId: "uat-fixed",
      databaseTls: "url",
      caMode: "system",
      f5Mode: "disabled",
    }),
    {
      ...env,
      MARKETPLACE_WORKSPACE_ID: "bad namespace",
      MARKETPLACE_DB_TLS: "true",
      MARKETPLACE_DB_CA_FILE: "/missing/ca.crt",
      MARKETPLACE_F5_ENABLED: "true",
      F5_API_URL: "invalid",
    },
    identity,
    saved,
  );
  expect(response.status).toBe(200);
  const text = await response.text();
  expect(text).not.toContain("uat-fixed");
  expect(JSON.parse(text)).toMatchObject({
    advanced: { caMode: "system", f5Mode: "disabled", databaseTls: "url" },
  });
});
it("requires fresh F5 credentials at a changed destination and does not overwrite working settings", async () => {
  vi.spyOn(console, "error").mockImplementation(() => {});
  const saved = await store();
  await saved.save({
    f5Mode: "enabled",
    f5Url: "https://old.private/backend/v1",
    f5Token: "old-token",
  });
  const response = await connectionApi(
    save({ f5Url: "https://new.private/backend/v1" }),
    env,
    identity,
    saved,
  );
  expect(response.status).toBe(422);
  expect(identity).not.toHaveBeenCalled();
  expect((await saved.read())?.f5Token).toBe("old-token");
});
it("validates optional F5 before saving and preserves the old connection when F5 rejects the token", async () => {
  vi.spyOn(console, "error").mockImplementation(() => {});
  const saved = await store();
  await saved.save({ nemoToken: env.GUARD_API_TOKEN });
  const previous = await saved.read();
  const fetcher = vi.fn<typeof fetch>(async (input) =>
    String(input).includes("/backend/v1/")
      ? Response.json({}, { status: 403 })
      : Response.json({ userId: "real-user" }),
  );
  const response = await connectionApi(
    save({
      f5Mode: "enabled",
      f5Url: "https://f5.private/backend/v1",
      f5Token: "rejected-private-token",
    }),
    env,
    fetcher,
    saved,
  );
  expect(response.status).toBe(403);
  expect(await saved.read()).toEqual(previous);
  expect(await response.text()).not.toContain("rejected-private-token");
});
it("does not save malformed CA material or return its plaintext", async () => {
  vi.spyOn(console, "error").mockImplementation(() => {});
  const saved = await store();
  const response = await connectionApi(
    save({ caMode: "custom", caPem: "private-invalid-certificate" }),
    env,
    identity,
    saved,
  );
  expect(response.status).toBe(422);
  expect(await response.text()).not.toContain("private-invalid-certificate");
  expect(await saved.read()).toBeNull();
  expect(identity).not.toHaveBeenCalled();
});
