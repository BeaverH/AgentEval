import { createHmac, randomBytes } from "node:crypto";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { ConnectionStore } from "./nmgr-connection-store";
import {
  connectionEnvironment,
  connectionOrigin,
  connectionSettingsSchema,
  type ConnectionSettings,
} from "./nmgr-connection-config";
import { closeNmgrDatabase, nmgrApi } from "./nmgr-api";
import { databaseCacheKey } from "./storage/config";
import { runtimeResponse } from "./guard-api";
import { DeploymentError, diagnosticResponse } from "./diagnostics";
import { connectionTransport } from "./nmgr-connection-tls";
import { createF5Client, f5Configuration } from "./f5-client";
import { withConnectionDiagnostics } from "./connection-diagnostics";
import { probeConnection, type ProbeTarget } from "./connection-probe";
import { connectionTestSchema } from "./nmgr-contract";

const stores = new Map<string, ConnectionStore>();
const locks = new WeakMap<ConnectionStore, Promise<unknown>>();
const revisionKey = randomBytes(32);
const probeFields: Record<ProbeTarget, string[]> = {
  nemoUrl: ["nemoUrl", "nemoTls", "caMode", "caPem"],
  nemoToken: ["nemoUrl", "nemoToken", "nemoTls", "caMode", "caPem"],
  databaseUrl: ["databaseUrl", "databaseTls", "caMode", "caPem"],
  f5Url: ["f5Url", "f5Mode", "caMode", "caPem"],
  f5Token: ["f5Url", "f5Token", "f5Mode", "caMode", "caPem"],
};
function defaultStore(env: NodeJS.ProcessEnv) {
  const dir =
    env.MARKETPLACE_CONNECTION_DIR || join(tmpdir(), "marketplace-connection");
  if (!stores.has(dir)) stores.set(dir, new ConnectionStore(dir));
  return stores.get(dir)!;
}
const savedFor = (env: NodeJS.ProcessEnv, store: ConnectionStore) =>
  env.MARKETPLACE_V3_DEMO === "false" ? Promise.resolve(null) : store.read();
function revision(env: NodeJS.ProcessEnv) {
  return createHmac("sha256", revisionKey)
    .update(
      JSON.stringify([
        env.GUARD_API_URL,
        env.GUARD_API_TOKEN,
        env.GUARD_API_TOKEN_FILE,
        env.GUARD_USERNAME,
        env.GUARD_PASSWORD,
        env.GUARD_PASSWORD_FILE,
        env.MARKETPLACE_NEMO_AUTH_MODE,
        env.MARKETPLACE_DATABASE_URL,
        env.MARKETPLACE_DATABASE_PASSWORD,
        env.MARKETPLACE_DB_TLS,
        env.MARKETPLACE_DB_CA_FILE,
        env.MARKETPLACE_DB_CA_PEM,
        env.MARKETPLACE_CONNECTION_CA_MODE,
        env.MARKETPLACE_CONNECTION_CA_PEM,
        env.MARKETPLACE_NEMO_TLS,
        env.MARKETPLACE_WORKSPACE_ID,
        env.MARKETPLACE_F5_ENABLED,
        env.F5_API_URL,
        env.F5_API_TOKEN,
        env.F5_API_TOKEN_FILE,
        env.F5_PROJECT_ADMIN_IDS,
      ]),
    )
    .digest("hex");
}
function state(effective: NodeJS.ProcessEnv, saved: ConnectionSettings | null) {
  return {
    saved: !!saved,
    configured: {
      nemoUrl: !!effective.GUARD_API_URL,
      nemoToken: !!(
        effective.GUARD_API_TOKEN ||
        effective.GUARD_API_TOKEN_FILE ||
        effective.GUARD_PASSWORD ||
        effective.GUARD_PASSWORD_FILE
      ),
      databaseUrl: !!effective.MARKETPLACE_DATABASE_URL,
      workspaceId: !!effective.MARKETPLACE_WORKSPACE_ID,
      caPem: !!(
        effective.MARKETPLACE_CONNECTION_CA_PEM ||
        effective.MARKETPLACE_DB_CA_FILE ||
        effective.NODE_EXTRA_CA_CERTS
      ),
      f5Url: !!effective.F5_API_URL,
      f5Token: !!(effective.F5_API_TOKEN || effective.F5_API_TOKEN_FILE),
      f5AdminIds: !!effective.F5_PROJECT_ADMIN_IDS,
    },
    advanced: {
      nemoTls: effective.MARKETPLACE_NEMO_TLS || "verify",
      databaseTls: effective.MARKETPLACE_DB_TLS === "true" ? "true" : "url",
      caMode: effective.MARKETPLACE_CONNECTION_CA_MODE || "deployment",
      f5Mode:
        effective.MARKETPLACE_F5_ENABLED === "true" || effective.F5_API_URL
          ? "enabled"
          : "disabled",
    },
    connectionRevision: revision(effective),
    demoRoleSwitching: effective.MARKETPLACE_V3_DEMO === "true",
    manualConfiguration: effective.MARKETPLACE_V3_DEMO === "true",
    persistence:
      effective.MARKETPLACE_CONNECTION_PERSISTENT === "true"
        ? "persistent"
        : "pod",
  };
}
const json = (body: unknown) =>
  Response.json(body, { headers: { "Cache-Control": "no-store" } });
function assertRevision(request: Request, effective: NodeJS.ProcessEnv) {
  const supplied = request.headers.get("x-marketplace-connection");
  if (supplied && supplied !== revision(effective))
    throw new DeploymentError(
      "runtime",
      "connection_changed",
      "The shared demo connection changed. Reconnect before continuing; no command was sent to the new connection.",
      [],
      409,
    );
}
async function closeChanged(
  previous: NodeJS.ProcessEnv,
  next: NodeJS.ProcessEnv,
) {
  if (databaseCacheKey(previous) !== databaseCacheKey(next))
    await closeNmgrDatabase(previous).catch(() => {});
}

export async function v3RuntimeResponse(
  request: Request,
  env = process.env,
  store = defaultStore(env),
) {
  try {
    const saved = await savedFor(env, store),
      effective = connectionEnvironment(request, env, saved ?? {});
    const response = runtimeResponse(effective, true);
    if (!response.ok) return response;
    return json({ ...(await response.json()), ...state(effective, saved) });
  } catch (error) {
    return diagnosticResponse(
      error,
      "runtime",
      "connection.runtime",
      "Connection settings are unavailable.",
    );
  }
}

export async function nmgrRequest(
  request: Request,
  env = process.env,
  fetcher: typeof fetch = fetch,
  store = defaultStore(env),
) {
  if (["/api/nmgr/connection", "/api/nmgr/connection/test"].includes(new URL(request.url).pathname))
    return connectionApi(request, env, fetcher, store);
  try {
    const saved = await savedFor(env, store),
      effective = connectionEnvironment(request, env, saved ?? {});
    assertRevision(request, effective);
    const transport = connectionTransport(effective, fetcher);
    try {
      return await withConnectionDiagnostics(effective, `nmgr.${new URL(request.url).pathname.split("/").pop()}`, () => nmgrApi(request, effective, transport.fetcher));
    } finally {
      await transport.close();
    }
  } catch (error) {
    return diagnosticResponse(
      error,
      "runtime",
      "connection.request",
      "Connection settings are unavailable.",
    );
  }
}

export async function connectionApi(
  request: Request,
  env = process.env,
  fetcher: typeof fetch = fetch,
  store = defaultStore(env),
): Promise<Response> {
  const testing = new URL(request.url).pathname === "/api/nmgr/connection/test";
  let target: ProbeTarget | undefined;
  try {
    connectionOrigin(request, env);
    if (testing && request.method !== "POST") throw new DeploymentError("runtime", "connection_method_invalid", "Use POST to test a connection.", [], 405);
    if (request.method === "GET") {
      const saved = await savedFor(env, store);
      return json(
        state(connectionEnvironment(request, env, saved ?? {}), saved),
      );
    }
    if (!["POST", "DELETE"].includes(request.method))
      throw new DeploymentError(
        "runtime",
        "connection_method_invalid",
        "Use GET, POST or DELETE for demo connection settings.",
        [],
        405,
      );
    if (env.MARKETPLACE_V3_DEMO === "false")
      throw new DeploymentError(
        "runtime",
        "manual_configuration_disabled",
        "Manual configuration is available only in the demo integration mode.",
        [],
        403,
      );
    let input: ConnectionSettings = {};
    if (request.method === "POST") {
      if (!request.headers.get("content-type")?.startsWith("application/json"))
        throw new DeploymentError(
          "runtime",
          "connection_fields_invalid",
          "Provide JSON connection settings.",
          [],
          415,
        );
      const raw = await request.text();
      if (Buffer.byteLength(raw) > 100_000)
        throw new DeploymentError(
          "runtime",
          "connection_fields_invalid",
          "Connection settings exceed the size limit.",
          [],
          413,
        );
      try {
        const payload = JSON.parse(raw);
        if (testing) {
          const parsed = connectionTestSchema.parse(payload);
          target = parsed.target;
          input = Object.fromEntries(Object.entries(parsed.settings ?? {}).filter(([key]) => probeFields[target!].includes(key)));
        } else input = connectionSettingsSchema.parse(payload);
      } catch {
        throw new DeploymentError(
          "runtime",
          "connection_fields_invalid",
          "Provide valid connection fields from this page. Workspace ID allows 1–24 lowercase letters, numbers or hyphens.",
          ["GUARD_API_URL", "GUARD_API_TOKEN", "MARKETPLACE_DATABASE_URL"],
          422,
        );
      }
    }
    const operation = async () => {
      let saved: ConnectionSettings | null;
      try {
        saved = await store.read();
      } catch (error) {
        if (
          request.method !== "DELETE" &&
          !(input.nemoUrl && input.nemoToken && input.databaseUrl)
        )
          throw error;
        saved = null;
      }
      const previous = connectionEnvironment(request, env, saved ?? {});
      assertRevision(request, previous);
      if (request.method === "DELETE") {
        await store.clear();
        const effective = connectionEnvironment(request, env);
        await closeChanged(previous, effective);
        return json(state(effective, null));
      }
      if (
        input.nemoUrl &&
        target !== "nemoUrl" &&
        input.nemoUrl.replace(/\/+$/, "") !==
          previous.GUARD_API_URL?.replace(/\/+$/, "") &&
        !input.nemoToken
      )
        throw new DeploymentError(
          "nemo",
          "connection_token_required",
          "Enter a Token when changing the NeMo URL. Existing saved or Secret credentials are never sent to a new destination.",
          ["GUARD_API_URL", "GUARD_API_TOKEN"],
          422,
        );
      const candidate = {
        ...saved,
        ...Object.fromEntries(
          Object.entries(input).filter(([, value]) => !!value),
        ),
      };
      if (
        candidate.f5Mode !== "disabled" &&
        input.f5Url &&
        target !== "f5Url" &&
        input.f5Url.replace(/\/+$/, "") !==
          previous.F5_API_URL?.replace(/\/+$/, "") &&
        !input.f5Token
      )
        throw new DeploymentError(
          "f5",
          "connection_token_required",
          "Enter an F5 Token when changing the F5 URL. Existing credentials are never sent to a new destination.",
          ["f5Url", "f5Token"],
          422,
        );
      const effective = connectionEnvironment(request, env, candidate);
      const transport = connectionTransport(effective, fetcher);
      if (target) {
        try {
          return await withConnectionDiagnostics(effective, `connection.test.${target}`, async () => {
            try { return json(await probeConnection(target!, effective, transport.fetcher)); }
            catch (error) { return diagnosticResponse(error, target === "databaseUrl" ? "database" : target!.startsWith("f5") ? "f5" : "nemo", `connection.test.${target}`, "Connection test failed. Inspect the diagnostic details."); }
          });
        } finally { await transport.close(); }
      }
      let probe: Response;
      try {
        probe = await withConnectionDiagnostics(effective, "connection.save", () => nmgrApi(
          new Request(new URL("/api/nmgr/workspace", request.url)),
          effective,
          transport.fetcher,
        ));
        if (
          probe.ok &&
          candidate.f5Mode !== "disabled" &&
          (input.f5Mode || input.f5Url || input.f5Token || input.f5AdminIds)
        ) {
          const f5 = f5Configuration(effective);
          if (f5)
            await withConnectionDiagnostics(effective, "connection.save.f5", async () => {
              try { await createF5Client(f5, transport.fetcher).request("/scanners"); }
              catch (error) { probe = diagnosticResponse(error, "f5", "connection.save.f5", "F5 connection failed."); }
            });
        }
      } catch (error) {
        await closeChanged(effective, previous);
        throw error;
      } finally {
        await transport.close();
      }
      if (!probe.ok) {
        await closeChanged(effective, previous);
        return probe;
      }
      try {
        await store.save(candidate);
      } catch (error) {
        await closeChanged(effective, previous);
        throw error;
      }
      await closeChanged(previous, effective);
      console.info(
        JSON.stringify({
          event: "demo_connection_saved",
          component: "runtime",
        }),
      );
      return json(state(effective, candidate));
    };
    const prior = locks.get(store) ?? Promise.resolve();
    const next = prior.catch(() => {}).then(operation);
    locks.set(
      store,
      next.catch(() => {}),
    );
    return await next;
  } catch (error) {
    return diagnosticResponse(
      error,
      "runtime",
      "connection.settings",
      "Connection settings could not be applied. Check the configured dependencies and storage.",
    );
  }
}
