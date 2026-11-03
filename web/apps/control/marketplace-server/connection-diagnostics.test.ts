import { afterEach, expect, it, vi } from "vitest";
import { withConnectionDiagnostics } from "./connection-diagnostics";
import { diagnosticResponse, upstreamFailure } from "./diagnostics";
afterEach(() => vi.restoreAllMocks());
it("returns HTTP backend code/message and nested causes without exposing token, password, URL or arbitrary response fields", async () => {
  const log = vi.spyOn(console, "error").mockImplementation(() => {});
  const env = { MARKETPLACE_V3_DEMO: "true", GUARD_API_TOKEN: "a-private-token", MARKETPLACE_DATABASE_URL: "postgres://u:db-password@db/db" };
  await withConnectionDiagnostics(env, "connection.test.nemoToken", async () => {
    const error = await upstreamFailure("nemo", "nemo_token_rejected", "Token rejected", Response.json({ error: { code: "expired_token", message: "expired a-private-token; db-password; Authorization: Bearer opaque-credential; https://u:pass@host/path?token=q" }, secret: "hidden-property" }, { status: 403 }));
    const response = diagnosticResponse(error, "nemo", "connection.test.nemoToken", "Failed");
    const body = await response.json();
    expect(body.error.details).toMatchObject({ httpStatus: 403, upstreamCode: "expired_token", upstreamMessage: expect.stringContaining("expired") });
    expect(JSON.stringify([body, log.mock.calls])).not.toMatch(/a-private-token|db-password|opaque-credential|hidden-property|u:pass|token=q/);
    expect(JSON.stringify(log.mock.calls)).toContain(body.error.requestId);
  });
});
it("bounds error-body reads even when a gateway never finishes its response", async () => {
  const response = new Response(new ReadableStream({ start(controller) { controller.enqueue(new TextEncoder().encode('{"error":')); } }), { status: 502, headers: { "Content-Type": "application/json" } });
  const error = await upstreamFailure("nemo", "nemo_http_502", "Gateway failed", response);
  expect(error.upstream?.httpStatus).toBe(502);
}, 2500);
it("omits driver SQL and parameters while preserving the failure code", async () => {
  const log = vi.spyOn(console, "error").mockImplementation(() => {});
  await withConnectionDiagnostics({ MARKETPLACE_V3_DEMO: "true" }, "connection.test.databaseUrl", async () => {
    const response = diagnosticResponse(Object.assign(new Error("Database permission denied\nsql: INSERT INTO records VALUES (?) - parameters: ['private-business-payload']"), { code: "42501" }), "database", "connection.test.databaseUrl", "Database failed");
    const body = await response.json();
    expect(body.error.details.causes[0].code).toBe("42501");
    expect(JSON.stringify([body, log.mock.calls])).not.toMatch(/INSERT INTO|private-business-payload/);
  });
});
