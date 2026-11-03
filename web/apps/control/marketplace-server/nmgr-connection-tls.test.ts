import { createServer } from "node:https";
import { readFileSync } from "node:fs";
import { once } from "node:events";
import { expect, it } from "vitest";
import { connectionTransport } from "./nmgr-connection-tls";
import { connectionEnvironment } from "./nmgr-connection-config";

it("trusts a supplied CA for this operation while built-in trust still rejects the self-signed endpoint", async () => {
  const cert = readFileSync(
    new URL("./fixtures/connection-tls/localhost-test.crt", import.meta.url),
    "utf8",
  );
  const key = readFileSync(
    new URL("./fixtures/connection-tls/localhost-test-key.txt", import.meta.url),
    "utf8",
  );
  const server = createServer({ key, cert }, (_request, response) => {
    response.writeHead(200, { "Content-Type": "application/json" });
    response.end('{"reachable":true}');
  });
  server.listen(0, "127.0.0.1");
  await once(server, "listening");
  const port = (server.address() as { port: number }).port;
  const custom = connectionTransport(
    {
      MARKETPLACE_CONNECTION_CA_MODE: "custom",
      MARKETPLACE_CONNECTION_CA_PEM: cert,
    },
    fetch,
  );
  const system = connectionTransport(
    { MARKETPLACE_CONNECTION_CA_MODE: "system" },
    fetch,
  );
  const previous = process.env.NODE_TLS_REJECT_UNAUTHORIZED;
  const demo = connectionTransport(connectionEnvironment(new Request("https://ui.test"), {
    GUARD_API_URL: `https://127.0.0.1:${port}/api/v1`,
    F5_API_URL: `https://127.0.0.1:${port}/api/v1/backend/v1`,
  }), fetch);
  try {
    const url = `https://127.0.0.1:${port}/api/v1/account/identity`;
    expect((await demo.fetcher(url)).status).toBe(200);
    await expect(demo.fetcher(`https://127.0.0.1:${port}/api/v1/backend/v1/scanners`)).rejects.toThrow();
    await expect(demo.fetcher(`https://127.0.0.1:${port}/backend/v1/scanners`)).rejects.toThrow();
    await expect(system.fetcher(url)).rejects.toThrow();
    const response = await custom.fetcher(url);
    expect(await response.json()).toEqual({ reachable: true });
    await expect(system.fetcher(url)).rejects.toThrow();
    expect(process.env.NODE_TLS_REJECT_UNAUTHORIZED).toBe(previous);
  } finally {
    await Promise.all([custom.close(), system.close(), demo.close()]);
    server.closeAllConnections();
    await new Promise<void>((resolve) => server.close(() => resolve()));
  }
});
it("releases an unconsumed upstream error body when the operation ends", async () => {
  const cert = readFileSync(
    new URL("./fixtures/connection-tls/localhost-test.crt", import.meta.url),
    "utf8",
  );
  const key = readFileSync(
    new URL("./fixtures/connection-tls/localhost-test-key.txt", import.meta.url),
    "utf8",
  );
  const server = createServer({ key, cert }, (_request, response) => {
    response.writeHead(500, { "Content-Type": "text/plain" });
    response.write("upstream failure");
  });
  server.listen(0, "127.0.0.1");
  await once(server, "listening");
  const port = (server.address() as { port: number }).port;
  const transport = connectionTransport(
    {
      MARKETPLACE_CONNECTION_CA_MODE: "custom",
      MARKETPLACE_CONNECTION_CA_PEM: cert,
    },
    fetch,
  );
  let close: Promise<void> | undefined;
  try {
    const response = await transport.fetcher(
      `https://127.0.0.1:${port}/api/v1/account/identity`,
    );
    expect(response.status).toBe(500);
    close = transport.close();
    const completed = await Promise.race([
      close.then(() => true),
      new Promise<boolean>((resolve) => setTimeout(() => resolve(false), 1500)),
    ]);
    expect(completed).toBe(true);
  } finally {
    server.closeAllConnections();
    await close;
    await new Promise<void>((resolve) => server.close(() => resolve()));
  }
});
