import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { StoreError } from "./marketplace-db";
import { DeploymentError, upstreamFailure } from "./diagnostics";

type Session = { cookie: string };
type Entry = { pending?: Promise<Session>; failedUntil: number };
const sessions = new WeakMap<typeof fetch, Map<string, Entry>>();
const sessionPattern = /^(?:__Secure-)?(?:tali-guard|better-auth)\.session_token=[A-Za-z0-9%._~+\/-]+=*$/;
const hasNemoToken = (env: NodeJS.ProcessEnv) => env.MARKETPLACE_NEMO_AUTH_MODE ? env.MARKETPLACE_NEMO_AUTH_MODE === "token" : env.GUARD_API_TOKEN !== undefined || env.GUARD_API_TOKEN_FILE !== undefined;
export const hasNemoCredentials = (env: NodeJS.ProcessEnv) => !!env.MARKETPLACE_NEMO_AUTH_MODE || hasNemoToken(env) || !!(env.GUARD_USERNAME || env.GUARD_PASSWORD || env.GUARD_PASSWORD_FILE);
export function nemoServiceFetch(env: NodeJS.ProcessEnv, fetcher: typeof fetch = fetch): typeof fetch {
  if (env.MARKETPLACE_NEMO_AUTH_MODE && !["token", "password"].includes(env.MARKETPLACE_NEMO_AUTH_MODE)) throw new DeploymentError("nemo", "nemo_auth_mode_invalid", "Choose one backend NeMo credential source: token or password.", ["MARKETPLACE_NEMO_AUTH_MODE", "GUARD_API_TOKEN", "GUARD_USERNAME", "GUARD_PASSWORD"]);
  // Honor an explicitly selected source. Legacy deployments without a selector
  // keep token precedence; invalid/missing selected credentials never fall back.
  if (hasNemoToken(env)) return nemoTokenFetch(env, fetcher);
  const base = env.GUARD_API_URL?.replace(/\/+$/, ""), username = env.GUARD_USERNAME?.trim();
  let password: string | undefined;
  try { password = env.GUARD_PASSWORD_FILE ? readFileSync(env.GUARD_PASSWORD_FILE, "utf8").replace(/\r?\n$/, "") : env.GUARD_PASSWORD; }
  catch { throw new DeploymentError("nemo", "nemo_password_file_unreadable", "Cannot read the configured NeMo password file.", ["GUARD_PASSWORD_FILE"]); }
  if (!base?.endsWith("/api/v1") || !username || !password) throw new DeploymentError("nemo", "nemo_credentials_missing", "Configure the NeMo username and password on the Marketplace server.", ["GUARD_API_URL", "GUARD_USERNAME", "GUARD_PASSWORD", "GUARD_PASSWORD_FILE"]);
  const origin = env.GUARD_AUTH_ORIGIN || new URL(base).origin;
  try { if (!/^https?:\/\//.test(origin) || new URL(origin).origin !== origin) throw new Error(); }
  catch { throw new DeploymentError("nemo", "nemo_auth_origin_invalid", "NeMo authentication origin is not configured correctly.", ["GUARD_AUTH_ORIGIN"]); }
  const authBase = base.slice(0, -"/api/v1".length) + "/api/auth";
  let cache = sessions.get(fetcher);
  if (!cache) { cache = new Map(); sessions.set(fetcher, cache); }
  const key = createHash("sha256").update(JSON.stringify([base, origin, username, password])).digest("hex");
  let entry = cache.get(key);
  if (!entry) { if (cache.size >= 8) cache.clear(); entry = { failedUntil: 0 }; cache.set(key, entry); }
  const state = entry;
  const unavailable = () => new DeploymentError("nemo", "nemo_sign_in_failed", "NeMo automatic sign-in is unavailable. Check the backend account configuration, network and TLS CA or retry shortly.");
  async function login() {
    if (Date.now() < state.failedUntil) throw unavailable();
    if (!state.pending) state.pending = (async () => {
      try {
        const response = await fetcher(`${authBase}/sign-in/email`, { method: "POST", headers: { "Content-Type": "application/json", Origin: origin }, body: JSON.stringify({ email: username, password, rememberMe: false }), redirect: "manual", signal: AbortSignal.timeout(20_000) });
        const cookie = response.headers.getSetCookie().map(value => value.split(";")[0] ?? "").find(value => sessionPattern.test(value));
        await response.body?.cancel();
        if (!response.ok || !cookie || cookie.length > 2000) throw unavailable();
        return { cookie };
      } catch {
        state.failedUntil = Date.now() + 30_000; delete state.pending; throw unavailable();
      }
    })();
    return state.pending;
  }
  return async (input, init = {}) => {
    const target = String(input);
    if (!target.startsWith(base + "/")) throw new StoreError(503, "Invalid NeMo service request target.");
    for (let attempt = 0; attempt < 2; attempt++) {
      const session = await login();
      const headers = new Headers(init.headers);
      headers.delete("authorization"); headers.set("Cookie", session.cookie); headers.set("Origin", origin);
      const response = await fetcher(target, { ...init, headers, redirect: "manual", signal: init.signal ?? AbortSignal.timeout(20_000) });
      if (response.status !== 401) return response;
      await response.body?.cancel();
      // Invalidate only this session; concurrent 401s must share the replacement login.
      const previous = state.pending;
      if (previous && await previous.catch(() => undefined) === session && state.pending === previous) delete state.pending;
      if (attempt === 1) { state.failedUntil = Date.now() + 30_000; throw unavailable(); }
    }
    throw unavailable();
  };
}

function nemoTokenFetch(env: NodeJS.ProcessEnv, fetcher: typeof fetch): typeof fetch {
  let token: string;
  let base: URL;
  try {
    token = (env.GUARD_API_TOKEN_FILE !== undefined ? readFileSync(env.GUARD_API_TOKEN_FILE, "utf8") : env.GUARD_API_TOKEN ?? "").trim();
    if (!/^[A-Za-z0-9._~+\/-]+=*$/.test(token)) throw new Error();
    base = new URL(env.GUARD_API_URL!);
    if (!/^https?:$/.test(base.protocol) || base.username || base.password || base.search || base.hash || !base.pathname.replace(/\/+$/, "").endsWith("/api/v1")) throw new Error();
    base.pathname = base.pathname.replace(/\/+$/, "");
  } catch { throw new DeploymentError("nemo", "nemo_token_config_invalid", "Configure a valid NeMo API URL and backend token (or readable token file).", ["GUARD_API_URL", "GUARD_API_TOKEN", "GUARD_API_TOKEN_FILE"]); }
  return async (input, init = {}) => {
    const target = new URL(String(input));
    if (target.origin !== base.origin || target.username || target.password || !target.pathname.startsWith(base.pathname + "/")) throw new StoreError(503, "Invalid NeMo service request target.");
    const headers = new Headers(init.headers);
    headers.delete("cookie");
    headers.set("Authorization", `Bearer ${token}`);
    // No redirect following or retries: failed writes may already have reached NeMo.
    const response = await fetcher(target.href, { ...init, headers, redirect: "manual", signal: init.signal ?? AbortSignal.timeout(20_000) });
    if (response.status === 401 || response.status === 403) {
      throw await upstreamFailure("nemo", "nemo_token_rejected", "NeMo backend token was rejected. Check its validity and permissions.", response, 503);
    }
    return response;
  };
}
