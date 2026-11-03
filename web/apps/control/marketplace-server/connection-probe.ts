import { Pool } from "pg";
import { createConnection } from "mariadb";
import { databaseConfig } from "./storage/config";
import { nemoServiceFetch } from "./nemo-session";
import { DeploymentError, upstreamFailure } from "./diagnostics";
import { f5Configuration, createF5Client } from "./f5-client";

export type ProbeTarget = "nemoUrl" | "nemoToken" | "databaseUrl" | "f5Url" | "f5Token";
export async function probeConnection(target: ProbeTarget, env: NodeJS.ProcessEnv, fetcher: typeof fetch) {
  const started = Date.now();
  let message: string, httpStatus: number | undefined;
  if (target === "databaseUrl") {
    let config: ReturnType<typeof databaseConfig>;
    try { config = databaseConfig(env); }
    catch { throw new DeploymentError("database", "database_config_invalid", "Provide a PostgreSQL or MariaDB URL including credentials and valid TLS settings."); }
    const { host, port, database, user, password, ssl, schema } = config;
    if (config.dialect === "postgresql") {
      const pool = new Pool({ host, port, database, user, password, ssl: ssl ?? false,
        options: `-c search_path=${schema}`, max: 1, connectionTimeoutMillis: 5000, statement_timeout: 5000, query_timeout: 6000 });
      pool.on("error", () => {});
      try { await pool.query("SELECT 1"); }
      finally { await pool.end(); }
    } else {
      const connection = await createConnection({ host, port, database, user, password, ...(ssl ? { ssl } : {}), connectTimeout: 5000, socketTimeout: 6000, queryTimeout: 5000 });
      try { await connection.query("SELECT 1"); }
      finally { await connection.end(); }
    }
    message = "Database connection and authentication succeeded (SELECT 1). Schema creation/write permissions are checked by Save & connect.";
  } else if (target === "f5Url" || target === "f5Token") {
    const config = f5Configuration(target === "f5Url" ? { ...env, F5_API_TOKEN: "address-probe-only", F5_API_TOKEN_FILE: undefined } : env);
    if (!config) throw new DeploymentError("f5", "f5_config_missing", "Enable F5 and provide its URL and Token before testing.");
    if (target === "f5Url") {
      let response: Response;
      try { response = await fetcher(`${config.base}/scanners`, { headers: { Accept: "application/json" }, redirect: "manual", signal: AbortSignal.timeout(10_000) }); }
      catch (error) { throw new DeploymentError("f5", "f5_unreachable", "Cannot reach F5. Inspect the connection error below.", undefined, 502, error); }
      if ((!response.ok && response.status !== 401) || !response.headers.get("content-type")?.includes("application/json"))
        throw await upstreamFailure("f5", `f5_http_${response.status}`, "Expected a JSON response from the F5 API. Check routing.", response);
      await response.body?.cancel();
      httpStatus = response.status;
      message = `Address reachable (HTTP ${response.status}). Test F5 Token next to verify access.`;
    } else {
      await createF5Client(config, fetcher).request("/scanners");
      message = "F5 connection, Token and scanner read access succeeded.";
      httpStatus = 200;
    }
  } else {
    let base: URL;
    try {
      base = new URL(env.GUARD_API_URL!);
      if (!/^https?:$/.test(base.protocol) || base.username || base.password || base.search || base.hash || !base.pathname.replace(/\/+$/, "").endsWith("/api/v1")) throw new Error();
    } catch { throw new DeploymentError("nemo", "nemo_url_invalid", "Provide the Controller API URL ending in /api/v1, without a page path or Token.", ["GUARD_API_URL"], 422); }
    const url = `${base.href.replace(/\/+$/, "")}/account/identity`;
    let response: Response;
    try {
      response = await (target === "nemoToken" ? nemoServiceFetch(env, fetcher) : fetcher)(url,
        { headers: { Accept: "application/json" }, redirect: "manual", signal: AbortSignal.timeout(10_000) });
    } catch (error) {
      if (error instanceof DeploymentError) throw error;
      throw new DeploymentError("nemo", "nemo_unreachable", "Cannot reach NeMo. Inspect the connection error below.", undefined, 502, error);
    }
    httpStatus = response.status;
    if (target === "nemoUrl" && response.status === 401 && response.headers.get("content-type")?.includes("application/json")) {
      await response.body?.cancel();
      message = "Address reachable (HTTP 401). Test NeMo Token next to verify identity and API permissions.";
    } else {
      if (!response.ok) throw await upstreamFailure("nemo", `nemo_http_${response.status}`, "NeMo returned an HTTP error. Check API routing and authentication.", response);
      if (!response.headers.get("content-type")?.includes("application/json"))
        throw await upstreamFailure("nemo", "nemo_response_invalid", "Expected a JSON identity response; check whether the URL points to the login page or an API gateway fallback.", response);
      let identity: any;
      try { identity = await response.json(); }
      catch (error) { throw new DeploymentError("nemo", "nemo_response_invalid", "NeMo returned invalid JSON.", undefined, 502, error); }
      if (typeof identity?.userId !== "string" || !identity.userId)
        throw new DeploymentError("nemo", "nemo_response_invalid", "The response does not contain a NeMo userId. Check Controller API compatibility.", undefined, 502);
      if (target === "nemoToken" && (identity.effectivePermissions?.policies !== "write" || identity.effectivePermissions?.guardrails !== "write"))
        throw new DeploymentError("nemo", "nemo_token_permissions", "Token authenticated, but V3 requires policies:write and guardrails:write. Create a PAT for a NeMo business user with both permissions.", ["GUARD_API_TOKEN"], 403);
      message = target === "nemoToken" ? "NeMo Token authenticated; policies and guardrails write permissions verified." : "NeMo Controller identity API is reachable.";
    }
  }
  return { ok: true, target, message, durationMs: Date.now() - started, ...(httpStatus === undefined ? {} : { httpStatus }) };
}
