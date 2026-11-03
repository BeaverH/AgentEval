import { afterEach, expect, it, vi } from "vitest";
import { runtimeRequest } from "./runtime-request";
afterEach(() => { vi.unstubAllGlobals(); vi.restoreAllMocks(); });
it("displays sanitized backend cause details with HTTP status and operation", async () => {
  vi.spyOn(console, "error").mockImplementation(() => {});
  vi.stubGlobal("fetch", async () => Response.json({ error: { code: "nemo_unreachable", message: "Cannot reach NeMo", requestId: "probe-id", details: { operation: "connection.test.nemoToken", causes: [{ code: "ENOTFOUND", message: "DNS lookup failed" }] } } }, { status: 502 }));
  await expect(runtimeRequest("/api/nmgr/connection/test")).rejects.toThrow(/ENOTFOUND/);
});

it("explains a static host / API reverse-proxy fallback without displaying HTML", async () => {
  vi.spyOn(console, "error").mockImplementation(() => {});
  vi.stubGlobal("fetch", vi.fn(async () => new Response("<html>private upstream page</html>", { headers: { "Content-Type": "text/html" } })));
  await expect(runtimeRequest("/api/nmgr/workspace")).rejects.toThrow(/api_response_invalid.*API.*proxy/i);
});
it("keeps server component, settings, code and trace ID in the displayed error", async () => {
  vi.spyOn(console, "error").mockImplementation(() => {});
  vi.stubGlobal("fetch", vi.fn(async () => Response.json({ error: { code: "database_unavailable", component: "database", message: "Cannot connect to database.", settings: ["MARKETPLACE_DATABASE_URL"], requestId: "server-trace" } }, { status: 503 })));
  await expect(runtimeRequest("/api/nmgr/workspace")).rejects.toThrow(/database_unavailable.*MARKETPLACE_DATABASE_URL.*server-trace/);
});
it("classifies network failures without exposing raw errors or repeating writes", async () => {
  const log = vi.spyOn(console, "error").mockImplementation(() => {});
  const fetcher = vi.fn().mockRejectedValue(new Error("secret host password")); vi.stubGlobal("fetch", fetcher);
  await expect(runtimeRequest("/api/nmgr/commands", { method: "POST", body: "private body" })).rejects.toThrow(/api_unreachable.*Reconcile/);
  expect(fetcher).toHaveBeenCalledTimes(1);
  expect(JSON.stringify(log.mock.calls)).not.toMatch(/secret|private body/);
});
