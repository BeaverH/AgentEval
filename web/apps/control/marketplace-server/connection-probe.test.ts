import { afterEach, expect, it, vi } from "vitest";
const driver = vi.hoisted(() => ({ query: vi.fn(async () => ({ rows: [{ value: 1 }] })), end: vi.fn(async () => {}), on: vi.fn() }));
vi.mock("pg", () => ({ Pool: class { query = driver.query; end = driver.end; on = driver.on; } }));
vi.mock("mariadb", () => ({ createConnection: async () => driver }));
import { probeConnection } from "./connection-probe";
afterEach(() => { vi.clearAllMocks(); });
it.each(["postgresql", "mariadb"])("tests %s credentials read-only without any NeMo configuration and closes the client", async dialect => {
  const result = await probeConnection("databaseUrl", { MARKETPLACE_DATABASE_URL: `${dialect}://test:password@db/marketplace` }, async () => { throw new Error("NeMo must not be called"); });
  expect(result.ok).toBe(true);
  expect(driver.query.mock.calls).toEqual([["SELECT 1"]]);
  expect(driver.end).toHaveBeenCalledOnce();
});
it("closes a database client after a query failure and preserves its cause", async () => {
  const error = Object.assign(new Error("permission denied"), { code: "42501" });
  driver.query.mockRejectedValueOnce(error);
  await expect(probeConnection("databaseUrl", { MARKETPLACE_DATABASE_URL: "postgresql://test:password@db/marketplace" }, fetch)).rejects.toBe(error);
  expect(driver.end).toHaveBeenCalledOnce();
});
it("tests the F5 address without requiring or forwarding a Token", async () => {
  const result = await probeConnection("f5Url", { F5_API_URL: "https://f5.test/backend/v1" }, async (_url, init) => {
    expect(new Headers(init?.headers).has("authorization")).toBe(false);
    return Response.json({ error: { code: "unauthenticated" } }, { status: 401 });
  });
  expect(result).toMatchObject({ ok: true, httpStatus: 401 });
});
