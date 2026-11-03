/** @vitest-environment jsdom */
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { NmgrApp } from "./app";

beforeEach(() => {
  localStorage.clear();
  sessionStorage.clear();
  window.history.replaceState(null, "", "/v2/guardrails");
  vi.stubGlobal("ResizeObserver", class { observe() {} disconnect() {} });
  window.matchMedia = vi.fn().mockReturnValue({ matches: false, addEventListener() {}, removeEventListener() {} });
});
afterEach(() => { cleanup(); vi.unstubAllGlobals(); vi.restoreAllMocks(); });

it("runs the explicit mock entry locally and keeps workbench navigation in mock mode", () => {
  const network = vi.fn(() => Promise.reject(new Error("Mock must not contact runtime")));
  vi.stubGlobal("fetch", network);
  render(<NmgrApp mock />);
  expect(screen.getByText("Mock V2")).toBeTruthy();
  expect(screen.getByRole("link", { name: "Open Real V3" }).getAttribute("href")).toBe("/v3/guardrails");
  expect(screen.getByRole("heading", { name: "Protection Dashboard" })).toBeTruthy();
  fireEvent.change(screen.getByLabelText("Workbench"), { target: { value: "IT Admin" } });
  fireEvent.click(screen.getByRole("button", { name: "Guardrail Deployment" }));
  expect(window.location.pathname).toBe("/v2/guardrails");
  expect(network).not.toHaveBeenCalled();
});

it("shows the real entry and its mock link while real configuration is unavailable", async () => {
  vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("Runtime unavailable")));
  render(<NmgrApp />);
  expect(screen.getByText("Real V3")).toBeTruthy();
  expect(screen.getByRole("link", { name: "Open Mock V2" }).getAttribute("href")).toBe("/v2/guardrails");
  expect(await screen.findByRole("alert")).toBeTruthy();
  expect(screen.queryByRole("heading", { name: "Protection Dashboard" })).toBeNull();
});

it("explains an API proxy serving HTML and never enters mock automatically", async () => {
  vi.spyOn(console, "error").mockImplementation(() => {});
  vi.stubGlobal("fetch", vi.fn(async () => new Response("<html>static fallback</html>", { headers: { "Content-Type": "text/html" } })));
  render(<NmgrApp />);
  expect((await screen.findByRole("alert")).textContent).toMatch(/api_response_invalid.*reverse proxy/);
  expect(screen.getByRole("button", { name: "Retry" })).toBeTruthy();
  expect(screen.getByRole("link", { name: "Open Mock workspace" }).getAttribute("href")).toBe("/v2/guardrails");
  expect(screen.queryByRole("heading", { name: "Protection Dashboard" })).toBeNull();
});

it.each(["network", "configuration", "database", "f5"])("keeps saved Mock work usable after a real %s failure", async (failure) => {
  vi.spyOn(console, "error").mockImplementation(() => {});
  const network = vi.fn(async (input: RequestInfo | URL) => {
    if (failure === "network") throw new Error("Upstream offline");
    if (failure !== "configuration" && String(input).includes("marketplace-config")) return Response.json({ mode: "live" });
    return Response.json({ error: { code: `${failure}_unavailable`, component: failure, settings: ["CHECK_CONFIG"], requestId: "test-reference", message: "Configured integration is unavailable." } }, { status: 503 });
  });
  vi.stubGlobal("fetch", network);
  const ui = render(<NmgrApp mock />);
  fireEvent.change(screen.getByLabelText("Workbench"), { target: { value: "IT Admin" } });
  const saved = localStorage.getItem("nmgr-v2-mock-state");
  expect(saved).toBeTruthy();
  expect(network).not.toHaveBeenCalled();
  ui.rerender(<NmgrApp />);
  expect(await screen.findByRole("alert")).toBeTruthy();
  expect(screen.queryByRole("heading", { name: "Protection Dashboard" })).toBeNull();
  const requests = network.mock.calls.length;
  ui.rerender(<NmgrApp mock />);
  fireEvent.click(screen.getByRole("button", { name: "Measure" }));
  expect(screen.getByRole("heading", { name: "Resource Health" })).toBeTruthy();
  fireEvent.click(screen.getByRole("button", { name: "View Runners" }));
  expect(screen.getByRole("heading", { name: "Runner List" })).toBeTruthy();
  expect(network).toHaveBeenCalledTimes(requests);
  expect(localStorage.getItem("nmgr-v2-mock-state")).toBe(saved);
});
