import { createRequire } from "node:module";
import { readFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { createOpenApi, apiInventory } from "./openapi";

const require = createRequire(import.meta.url);
const swaggerHtml = `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Marketplace Integration API</title><link rel="stylesheet" href="/api/docs/swagger-ui.css"><style>body{margin:0;background:#fafafa}nav{padding:16px 24px;font:14px system-ui;display:flex;gap:24px;flex-wrap:wrap;border-bottom:1px solid #ddd}nav a{color:#9b1c31}</style></head><body><nav><strong>NeMo / F5 Integration API</strong><a href="/api/endpoints">API list (JSON)</a><a href="/api/openapi.json">OpenAPI</a><a href="/v3/guardrails">Connection &amp; live UI</a><a href="/v2/guardrails">Mock UI</a></nav><div id="swagger-ui"></div><script src="/api/docs/swagger-ui-bundle.js"></script><script>window.ui = SwaggerUIBundle({url: '/api/openapi.json', dom_id: '#swagger-ui', deepLinking: true, validatorUrl: null, persistAuthorization: false, queryConfigEnabled: false, displayRequestDuration: true, tryItOutEnabled: false});</script></body></html>`;

export async function apiDocumentation(request: Request): Promise<Response> {
  const path = new URL(request.url).pathname.replace(/\/$/, "");
  const headers = { "Cache-Control": "no-store", "X-Content-Type-Options": "nosniff" };
  if (request.method !== "GET") return new Response("Method not allowed", { status: 405, headers: { ...headers, Allow: "GET" } });
  if (path === "/api/openapi.json") return Response.json(createOpenApi(), { headers });
  if (path === "/api/endpoints") return Response.json(apiInventory(), { headers });
  if (path === "/api/docs") return new Response(swaggerHtml, { headers: { ...headers, "Content-Type": "text/html; charset=utf-8" } });
  const asset = path.slice("/api/docs/".length);
  if (path.startsWith("/api/docs/") && ["swagger-ui-bundle.js", "swagger-ui.css"].includes(asset)) {
    const root = dirname(require.resolve("swagger-ui-dist/package.json"));
    const body = await readFile(join(root, asset), "utf8");
    return new Response(body, { headers: { ...headers, "Content-Type": asset.endsWith(".css") ? "text/css; charset=utf-8" : "text/javascript; charset=utf-8" } });
  }
  return new Response("Not found", { status: 404, headers });
}
