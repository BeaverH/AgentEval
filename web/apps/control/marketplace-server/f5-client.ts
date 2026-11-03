import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { z } from "zod";
import { StoreError } from "./marketplace-db";
import { DeploymentError, upstreamFailure } from "./diagnostics";
import type { UnifiedConfig } from "../src/features/business-demo/evaluation";

export type F5Configuration = { base: string; token: string; sourceId: string; adminIds: string[] };
export interface F5Remote { sourceId: string; adminIds: string[]; request(path: string, method?: string, body?: unknown): Promise<any> }
export type F5ScannerRef = { id: string; version: string; direction: "request" | "response" | "both"; enabled: true; blocking: true; mode: "block" };
export function f5Configuration(env: NodeJS.ProcessEnv): F5Configuration | undefined {
  if (!env.F5_API_URL && !env.F5_API_TOKEN && !env.F5_API_TOKEN_FILE && env.MARKETPLACE_F5_ENABLED !== "true") return undefined;
  try {
    const url = new URL(env.F5_API_URL ?? "");
    if (url.username || url.password || url.search || url.hash || !url.pathname.replace(/\/$/, "").endsWith("/backend/v1") ||
      !(url.protocol === "https:" || url.protocol === "http:" && ["localhost", "127.0.0.1", "[::1]"].includes(url.hostname))) throw new Error();
    const token = (env.F5_API_TOKEN_FILE ? readFileSync(env.F5_API_TOKEN_FILE, "utf8") : env.F5_API_TOKEN ?? "").trim();
    if (!token || /\s/.test(token)) throw new Error();
    const base = url.toString().replace(/\/$/, "");
    const adminIds = (env.F5_PROJECT_ADMIN_IDS ?? "").split(",").map(x => x.trim()).filter(Boolean);
    return { base, token, adminIds, sourceId: createHash("sha256").update(base).digest("hex").slice(0, 16) };
  } catch { throw new DeploymentError("f5", "f5_config_invalid", "F5 configuration requires an HTTPS /backend/v1 URL and a server token. Check F5_API_URL and F5_API_TOKEN_FILE or F5_API_TOKEN."); }
}
export function createF5Client(config: F5Configuration, fetcher: typeof fetch = fetch): F5Remote {
  return { sourceId: config.sourceId, adminIds: config.adminIds, async request(path, method = "GET", body) {
    if (!/^\/(scanners|projects|scans)(?:\/|\?|$)/.test(path) || /[\\#]/.test(path) || path.includes("..")) throw new StoreError(422, "Invalid F5 resource path.");
    let response: Response;
    try { response = await fetcher(`${config.base}${path}`, { method, redirect: "manual", signal: AbortSignal.timeout(20_000),
      headers: { Authorization: `Bearer ${config.token}`, Accept: "application/json", ...(body === undefined ? {} : { "Content-Type": "application/json" }) },
      ...(body === undefined ? {} : { body: JSON.stringify(body) }) }); }
    catch (error) { throw new DeploymentError("f5", "f5_unreachable", "F5 connection failed or timed out. Check URL, DNS, network and TLS CA. Reconcile before retrying a write.", undefined, 502, error); }
    if (!response.ok) throw await upstreamFailure("f5", `f5_http_${response.status}`, `F5 request failed (${response.status}). Check permissions, configuration and backend logs.`, response);
    if (!response.headers.get("content-type")?.includes("application/json")) throw await upstreamFailure("f5", "f5_response_invalid", "F5 returned an incompatible response. Check F5_API_URL, gateway routing and API compatibility.", response);
    try { return await response.json(); } catch { throw new DeploymentError("f5", "f5_response_invalid", "F5 returned invalid JSON.", undefined, 502); }
  } };
}
export function scannerBody(name: string, config: UnifiedConfig) {
  if (!/^[a-zA-Z0-9_-]{1,100}$/.test(config.versionName)) throw new StoreError(422, "F5 version names allow 1–100 letters, numbers, underscores or hyphens.");
  const words = config.content.split(/[\n,]/).map(s => s.trim()).filter(Boolean);
  if (!config.content.trim() || config.scannerType === "keyword" && !words.length) throw new StoreError(422, "Enter detection content.");
  const native = config.scannerType === "keyword" ? { type: "keyword", words } : config.scannerType === "regex" ? { type: "regex", pattern: config.content } : { type: "custom", input: config.content, scanContext: "directional" };
  return { name, config: native, direction: config.direction, global: false, published: false,
    version: { name: config.versionName, description: config.versionDescription, published: false, push: false } };
}
export function mergeProjectConfig(original: Record<string, any>, refs: F5ScannerRef[]) {
  const existing = z.array(z.object({ id: z.string() }).passthrough()).parse(original.scanners ?? []);
  return { ...original, scanners: [...existing.map(old => ({ ...old, ...refs.find(ref => ref.id === old.id) })), ...refs.filter(ref => !existing.some(old => old.id === ref.id))] };
}
export function scanEvidence(raw: any, scannerId: string, version: string, phase: "input" | "output", expected: "allow" | "block", caseId: string) {
  const direction = phase === "input" ? "request" : "response";
  const results = z.array(z.object({ scannerId: z.string(), scannerVersionMeta: z.object({ id: z.string() }).nullish(), scanDirection: z.string(), outcome: z.string() }).passthrough()).parse(raw?.result?.scannerResults);
  const matches = results.filter(r => r.scannerId === scannerId && r.scanDirection === direction);
  const match = matches[0];
  if (matches.length !== 1 || match?.scannerVersionMeta?.id !== version || !["passed", "failed"].includes(match.outcome)) throw new StoreError(409, "F5 scan evidence is missing or does not match the exact Scanner version and direction.");
  const actualDecision = match.outcome === "passed" ? "allow" : "block";
  return { caseId, passed: actualDecision === expected, actualDecision, scannerId, version, scanDirection: direction, scanId: typeof raw.id === "string" ? raw.id : null };
}
