import { expect, it } from "vitest";
import { apiDocumentation } from "./api-docs";
import { commandSchema } from "./nmgr-contract";

it("serves a same-origin OpenAPI contract without NeMo or database configuration", async () => {
  const response = await apiDocumentation(new Request("https://ui.test/api/openapi.json"));
  expect(response.status).toBe(200);
  const spec = await response.json();
  expect(spec.openapi).toBe("3.1.0");
  expect(spec.servers).toEqual([{ url: "/", description: "Same-origin gateway; forward /api to this service" }]);
  for (const [path, method] of [["/api/nmgr/workspace", "get"], ["/api/nmgr/commands", "post"], ["/api/nmgr/connection/test", "post"], ["/api/nmgr/connection", "get"], ["/api/nmgr/connection", "delete"], ["/api/health", "get"]]) {
    expect(spec.paths[path!][method!].responses["200"]).toBeTruthy();
  }
  expect(spec.paths["/api/f5/policies"]).toBeUndefined(); // legacy simulation is not the real integration API
  expect(spec.components.schemas.ConnectionSettings.properties.nemoToken.writeOnly).toBe(true);
  const examples = spec.paths["/api/nmgr/commands"].post.requestBody.content["application/json"].examples;
  for (const example of Object.values(examples) as Array<{ value: unknown }>) expect(commandSchema.safeParse(example.value).success).toBe(true);
  expect(Object.keys(examples)).toEqual(expect.arrayContaining(["create", "implementNeMo", "implementF5", "evaluate", "approve", "deploy", "advance", "reconcile"]));
});
it("serves interactive Swagger and its assets locally with no CDN or online validator", async () => {
  const response = await apiDocumentation(new Request("https://ui.test/api/docs"));
  expect(response.headers.get("content-type")).toContain("text/html");
  const html = await response.text();
  expect(html).toContain('/api/openapi.json');
  expect(html).toContain('validatorUrl: null');
  expect(html).not.toMatch(/https?:\/\//);
  for (const path of ["swagger-ui-bundle.js", "swagger-ui.css"]) {
    const asset = await apiDocumentation(new Request(`https://ui.test/api/docs/${path}`));
    expect(asset.status).toBe(200);
    expect((await asset.text()).length).toBeGreaterThan(1000);
  }
  expect((await apiDocumentation(new Request("https://ui.test/api/docs/package.json"))).status).toBe(404);
});
it("derives a complete machine-readable inventory from documented operations", async () => {
  const spec = await (await apiDocumentation(new Request("https://ui.test/api/openapi.json"))).json();
  const inventory = await (await apiDocumentation(new Request("https://ui.test/api/endpoints"))).json();
  const count = Object.values(spec.paths).reduce((n: number, item: any) => n + Object.keys(item).length, 0);
  expect(inventory.items).toHaveLength(count);
  expect(inventory.items).toContainEqual(expect.objectContaining({ method: "POST", path: "/api/nmgr/commands", operationId: "executeCommand" }));
});
