import { AsyncLocalStorage } from "node:async_hooks";
import { readFileSync } from "node:fs";

const context = new AsyncLocalStorage<{ env: NodeJS.ProcessEnv; operation: string }>();
export const withConnectionDiagnostics = <T>(env: NodeJS.ProcessEnv, operation: string, run: () => T): T =>
  env.MARKETPLACE_V3_DEMO === "true" ? context.run({ env, operation }, run) : run();

function redactor(env: NodeJS.ProcessEnv) {
  const secrets = new Set<string>();
  const add = (value?: string) => { if (value) { secrets.add(value); secrets.add(encodeURIComponent(value)); } };
  for (const [key, value] of Object.entries(env)) {
    if (/(TOKEN|PASSWORD|SECRET|CA_PEM)/.test(key) && !key.endsWith("_FILE")) add(value);
  }
  for (const key of ["GUARD_API_TOKEN_FILE", "GUARD_PASSWORD_FILE", "F5_API_TOKEN_FILE"]) {
    try { if (env[key]) add(readFileSync(env[key], "utf8").trim()); } catch { /* No secret contents in a failed read. */ }
  }
  for (const key of ["MARKETPLACE_DATABASE_URL", "GUARD_API_URL", "F5_API_URL"]) {
    try {
      const url = new URL(env[key]!);
      add(url.username); add(url.password); add(decodeURIComponent(url.username)); add(decodeURIComponent(url.password));
      // Paths can contain gateway credentials. Never echo configured full addresses.
      add(env[key]);
      for (const value of url.searchParams.values()) add(value);
    } catch { add(env[key]); }
  }
  const values = [...secrets].sort((a, b) => b.length - a.length);
  return (input: unknown) => {
    if (typeof input !== "string" && typeof input !== "number") return undefined;
    let text = String(input);
    for (const value of values) text = text.split(value).join("[redacted]");
    return text
      .replace(/\b(?:sql|query|parameters|params)\s*[:=][\s\S]*/gi, "[database statement omitted]")
      .replace(/-----BEGIN [\s\S]*?-----END [^-]+-----/g, "[redacted certificate]")
      .replace(/\b(?:https?|postgres(?:ql)?|mysql|mariadb):\/\/[^\s<>"']+/gi, "[redacted URL]")
      .replace(/\b(?:Bearer|Basic)\s+[^\s,"'}]+/gi, "[redacted authorization]")
      .replace(/\b(?:tlg_pat_|sk-)[A-Za-z0-9_-]+/g, "[redacted token]")
      .replace(/((?:password|passwd|token|secret|authorization|api[-_]?key|cookie)["']?\s*[:=]\s*)(?:"[^"]*"|'[^']*'|[^\s,;}]+)/gi, "$1[redacted]")
      .replace(/[\u0000-\u0008\u000b-\u001f\u007f]/g, "")
      .slice(0, 1800);
  };
}

const hints: Record<string, string> = {
  ENOTFOUND: "Pod DNS could not resolve the configured host. Check the hostname and cluster DNS.",
  EAI_AGAIN: "Temporary DNS failure. Check cluster DNS availability.",
  ECONNREFUSED: "The destination refused the connection. Check the service, port and listener.",
  ECONNRESET: "The peer or gateway reset the connection. Check upstream and proxy logs.",
  ETIMEDOUT: "Connection timed out. Check routing, firewall and NetworkPolicy.",
  UND_ERR_CONNECT_TIMEOUT: "Connection timed out. Check routing, firewall and NetworkPolicy.",
  TimeoutError: "The dependency did not respond before the request deadline.",
  DEPTH_ZERO_SELF_SIGNED_CERT: "The certificate is self-signed. Choose NeMo skip verification or supply its trusted CA.",
  SELF_SIGNED_CERT_IN_CHAIN: "The certificate chain contains an untrusted CA.",
  UNABLE_TO_VERIFY_LEAF_SIGNATURE: "The server did not provide a verifiable certificate chain.",
  UNABLE_TO_GET_ISSUER_CERT_LOCALLY: "The issuing CA is not trusted in this Pod.",
  CERT_HAS_EXPIRED: "The server certificate has expired.",
  ERR_TLS_CERT_ALTNAME_INVALID: "The URL hostname does not match the server certificate.",
  "28P01": "Database password authentication failed. Check the Secret value and user.",
  ER_ACCESS_DENIED_ERROR: "Database authentication failed. Check credentials and allowed client hosts.",
};

// Include causal diagnostics, not arbitrary exception properties, SQL, headers or stack dumps.
export function connectionErrorDetails(error: unknown) {
  const active = context.getStore();
  if (!active) return undefined;
  const clean = redactor(active.env);
  const causes: Array<Record<string, string | number | undefined>> = [];
  const seen = new Set<unknown>();
  const visit = (value: unknown) => {
    if (!value || typeof value !== "object" || seen.has(value) || seen.size >= 8) return;
    seen.add(value);
    const item = value as Record<string, unknown>;
    const code = typeof item.code === "string" && /^[A-Za-z0-9_]{1,80}$/.test(item.code) ? item.code : undefined;
    causes.push({ name: clean(item.name), code, message: clean(item.message), syscall: clean(item.syscall) });
    visit(item.cause);
    if (Array.isArray(item.errors)) item.errors.slice(0, 4).forEach(visit);
  };
  visit(error);
  const upstream = error && typeof error === "object" && "upstream" in error ? error.upstream as Record<string, unknown> : undefined;
  return {
    operation: active.operation,
    certificateVerification: active.env.MARKETPLACE_NEMO_TLS === "skip" ? "NeMo skipped" : "NeMo enabled",
    ...(upstream ? { httpStatus: typeof upstream.httpStatus === "number" ? upstream.httpStatus : undefined,
      contentType: clean(upstream.contentType), upstreamCode: clean(upstream.code), upstreamMessage: clean(upstream.message) } : {}),
    causes,
    hints: [...new Set(causes.map(c => hints[String(c.code)] || hints[String(c.name)]).filter(Boolean))],
  };
}
