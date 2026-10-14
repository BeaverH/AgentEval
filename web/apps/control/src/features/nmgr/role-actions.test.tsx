/** @vitest-environment jsdom */
import {
  cleanup,
  fireEvent,
  render,
  screen,
  within,
  act,
} from "@testing-library/react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { NmgrApp } from "./app";
import { seed, type Role, type Kind, type Status } from "./model";
beforeEach(() => {
  localStorage.clear();
  sessionStorage.clear();
  window.history.replaceState(null, "", "/guardrails");
  vi.stubGlobal(
    "ResizeObserver",
    class {
      observe() {}
      disconnect() {}
    },
  );
  window.matchMedia = vi.fn().mockReturnValue({
    matches: false,
    addEventListener() {},
    removeEventListener() {},
  });
});
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  vi.useRealTimers();
});
function openDetail(
  role: Role,
  kind: Kind,
  status: Status,
  view = "repository",
) {
  const state = seed();
  const item = state.entities.find((e) => e.kind === kind)!;
  item.unit = "ISS";
  item.status = status;
  if (status === "DRAFT") item.runs = [];
  localStorage.setItem("nmgr-three-role-v2", JSON.stringify(state));
  localStorage.setItem("nmgr-owner", role);
  window.location.hash = `${kind}/${view}/${item.id}`;
  render(<NmgrApp />);
  return item;
}
it("opens User dashboard by default and switches entire workbenches", () => {
  render(<NmgrApp />);
  expect(
    screen.getByRole("heading", { name: "Protection Dashboard" }),
  ).toBeTruthy();
  fireEvent.change(screen.getByLabelText("Workbench"), {
    target: { value: "User Admin" },
  });
  expect(screen.getByRole("button", { name: "GR Signoff" })).toBeTruthy();
  expect(screen.queryByRole("button", { name: "Business Intents" })).toBeNull();
  fireEvent.change(screen.getByLabelText("Workbench"), {
    target: { value: "IT Admin" },
  });
  expect(
    screen.getByRole("heading", { name: "GR Requests", level: 1 }),
  ).toBeTruthy();
  expect(
    screen.getByRole("button", { name: "GR Deployment" }),
  ).toBeTruthy();
});
it("shows User test records in a drawer and requests approval from there", () => {
  openDetail("User", "Guardrail", "TEST PASSED");
  expect(screen.queryByRole("dialog")).toBeNull();
  expect(screen.queryByRole("button", { name: "Run Test" })).toBeNull();
  expect(screen.queryByRole("button", { name: "Tests" })).toBeNull();
  fireEvent.click(screen.getByRole("button", { name: "Review test result" }));
  expect(
    screen.getByRole("heading", { name: "Guardrail Test Records" }),
  ).toBeTruthy();
  fireEvent.click(screen.getByRole("button", { name: "Request Signoff" }));
  fireEvent.click(screen.getByRole("button", { name: "Confirm" }));
  expect(screen.getByText(/signoff request submitted/)).toBeTruthy();
  expect(
    JSON.parse(localStorage.getItem("nmgr-three-role-v2")!).entities.some(
      (e: { status: string }) => e.status === "SIGNOFF REQUESTED",
    ),
  ).toBe(true);
});
it.each(["sidebar", "history", "workbench"])("clears page notifications after %s navigation", (navigation) => {
  const item = openDetail("User", "Profile", "DRAFT");
  fireEvent.click(screen.getByRole("button", { name: "Request Signoff" }));
  fireEvent.click(screen.getByRole("button", { name: "Confirm" }));
  expect(screen.getByText(/signoff request submitted/)).toBeTruthy();
  if (navigation === "sidebar") {
    fireEvent.click(screen.getByRole("button", { name: "Business Intents" }));
  } else if (navigation === "workbench") {
    fireEvent.change(screen.getByLabelText("Workbench"), { target: { value: "User Admin" } });
  } else {
    act(() => {
      window.history.replaceState(null, "", "#Profile/dashboard/");
      window.dispatchEvent(new HashChangeEvent("hashchange"));
    });
  }
  expect(screen.queryByText(/signoff request submitted/)).toBeNull();
  act(() => {
    window.history.replaceState(null, "", `#Profile/repository/${item.id}`);
    window.dispatchEvent(new HashChangeEvent("hashchange"));
  });
  expect(screen.queryByText(/signoff request submitted/)).toBeNull();
});
it("lets approvers review tests on the page and approve without deploying", () => {
  openDetail("User Admin", "Guardrail", "SIGNOFF REQUESTED", "signoff");
  expect(screen.queryByRole("dialog")).toBeNull();
  fireEvent.click(screen.getByRole("button", { name: "Tests" }));
  expect(within(screen.getByRole("table", { name: "Test Records" })).getAllByRole("columnheader").map((cell) => cell.textContent)).toEqual(["Test / Version", "Result"]);
  expect(screen.queryByRole("button", { name: "Report" })).toBeNull();
  fireEvent.click(screen.getByRole("button", { name: "Approve" }));
  fireEvent.click(screen.getByRole("button", { name: "Confirm" }));
  expect(
    screen.getByText(/ready for Tech Implementor deployment/),
  ).toBeTruthy();
  expect(screen.queryByRole("button", { name: "Go Deploy" })).toBeNull();
});
it("requests Profile approval directly without Tests or Deploy", () => {
  openDetail("User", "Profile", "DRAFT");
  expect(screen.getByRole("button", { name: "Request Signoff" })).toBeTruthy();
  expect(screen.queryByRole("button", { name: "Tests" })).toBeNull();
  fireEvent.click(screen.getByRole("button", { name: "Request Signoff" }));
  fireEvent.click(screen.getByRole("button", { name: "Confirm" }));
  expect(screen.getByText(/signoff request submitted/)).toBeTruthy();
});
it("allows only technical workbench to deploy signed Guardrails", () => {
  openDetail("IT Admin", "Guardrail", "SIGNED OFF", "deploy");
  fireEvent.click(
    within(screen.getByRole("dialog")).getByRole("button", {
      name: "Go Deploy",
    }),
  );
  fireEvent.click(screen.getByRole("button", { name: "Confirm" }));
  expect(screen.getByText(/deployed successfully/)).toBeTruthy();
});
it.each(["Guardrail", "Profile"] as Kind[])("opens %s repository details through the name without an Action column", (kind) => {
  const state = seed();
  const item = state.entities.find((entity) => entity.kind === kind)!;
  item.unit = "ISS";
  localStorage.setItem("nmgr-three-role-v2", JSON.stringify(state));
  localStorage.setItem("nmgr-owner", "User");
  window.location.hash = `${kind}/repository/`;
  render(<NmgrApp />);
  expect(screen.queryByRole("columnheader", { name: "Action" })).toBeNull();
  expect(screen.queryByRole("button", { name: "View", exact: true })).toBeNull();
  const link = screen.getByRole("link", { name: item.name, exact: true });
  expect(document.body.textContent).not.toContain(item.id);
  expect(link.getAttribute("href")).toBe(`#${kind}/repository/${item.id}`);
  fireEvent.click(link);
  expect(screen.getByRole("heading", { name: `${kind} Details`, exact: true })).toBeTruthy();
  expect(document.body.textContent).not.toContain(item.id);
});
it("keeps uploaded datasets usable with English file-picker text and no visible entity ID", async () => {
  const item = openDetail("IT Admin", "Guardrail", "TEST READY", "tests");
  fireEvent.click(screen.getByRole("button", { name: "Run Test", exact: true }));
  const dialog = within(screen.getByRole("dialog"));
  expect(dialog.getByText("Choose File")).toBeTruthy();
  expect(dialog.getByText("No file chosen")).toBeTruthy();
  expect(screen.getByRole("dialog").textContent).not.toContain(item.id);
  await act(async () => {
    fireEvent.change(dialog.getByLabelText("Upload Custom Dataset (JSON Array of Test Cases)"), {
      target: { files: [{ name: "acceptance.json", size: 100, text: async () => JSON.stringify([{ input: "Hello", expected: "Pass" }]) }] },
    });
  });
  expect(dialog.getByText("acceptance.json")).toBeTruthy();
  expect(dialog.getByText("1 acceptance cases · simulated locally")).toBeTruthy();
});
it("creates a Profile with an automatic ID and the simplified fields", () => {
  const state = seed();
  const guard = state.entities.find((entity) => entity.kind === "Guardrail" && entity.deployed !== null)!;
  guard.mandatory = true;
  guard.location = "ALL";
  localStorage.setItem("nmgr-three-role-v2", JSON.stringify(state));
  window.location.hash = "Profile/repository/";
  render(<NmgrApp />);
  fireEvent.click(screen.getByRole("button", { name: "New Profile" }));
  const form = within(screen.getByRole("dialog"));
  expect(form.queryByLabelText("Profile ID (unique)")).toBeNull();
  expect(form.queryByText("Custodian")).toBeNull();
  expect(form.getByLabelText("Location")).toBeTruthy();
  expect(form.getByRole("region", { name: "Available Guardrails" })).toBeTruthy();
  fireEvent.change(form.getByLabelText("Profile Name"), { target: { value: "Auto ID profile" } });
  fireEvent.change(form.getByLabelText("Use Case"), { target: { value: "Protect customer requests" } });
  fireEvent.change(form.getByLabelText("Alert Metric"), { target: { value: "Pass Rate" } });
  fireEvent.change(form.getByLabelText("Alert Threshold (%)"), { target: { value: "25" } });
  fireEvent.change(form.getByLabelText("Alert Window (Minutes)"), { target: { value: "3" } });
  fireEvent.click(form.getByRole("button", { name: "Submit" }));
  expect(screen.getByRole("heading", { name: "Profile Details", exact: true })).toBeTruthy();
  expect(window.location.hash).toMatch(/^#Profile\/repository\/pf-[0-9a-f-]{36}$/);
  expect(screen.getByText("Pass Rate > 25% in 3 minutes")).toBeTruthy();
});
it("keeps Trace content blank while retaining its navigation and title", () => {
  window.location.hash = "Profile/audit/";
  render(<NmgrApp />);
  expect(screen.getByRole("heading", { name: "Trace", level: 1 })).toBeTruthy();
  expect(screen.getByRole("button", { name: "Trace", exact: true })).toBeTruthy();
  expect(screen.getByRole("main").textContent).toBe("");
  expect(screen.queryByRole("table")).toBeNull();
});
it("shows the shared enforcement list on the dashboard", () => {
  render(<NmgrApp />);
  expect(screen.queryByRole("button", { name: /Show Info alerts/ })).toBeNull();
  expect(screen.queryByText("Policy detection recorded")).toBeNull();
  expect(screen.getAllByRole("columnheader").map((cell) => cell.textContent)).toEqual(["Profile", "Mode", "Ctrl Unit", "Last Modified", "Action"]);
  expect(screen.getByRole("table", { name: "Enforce & Prevent" })).toBeTruthy();
  expect(screen.queryByRole("button", { name: "Enforce & Prevent", exact: true })).toBeNull();
  expect(screen.queryByText("SLO Breach Alert")).toBeNull();
});
it.each(["Block all", "Pass all"])("synchronizes dashboard %s actions with Enforce and mock scan totals", (mode) => {
  render(<NmgrApp />);
  const name = "Mode for Customer Banking Assistant";
  fireEvent.change(screen.getByLabelText(name), { target: { value: mode } });
  const saved = JSON.parse(localStorage.getItem("nmgr-three-role-v2")!);
  expect(saved.entities.find((item: { id: string }) => item.id === "default-customer-assistant").mode).toBe(mode);
  const summary = within(screen.getByRole("region", { name: "In Last 10 Minutes" }));
  expect(summary.getByText("Pass: 2")).toBeTruthy();
  expect(summary.getByText(mode === "Block all" ? "Block: 38" : "Block: 18")).toBeTruthy();
  act(() => {
    window.location.hash = "Profile/enforce/";
    window.dispatchEvent(new HashChangeEvent("hashchange"));
  });
  expect((screen.getByLabelText(name) as HTMLSelectElement).value).toBe(mode);
  fireEvent.change(screen.getByLabelText(name), { target: { value: "Normal" } });
  fireEvent.click(screen.getByRole("button", { name: "Dashboard", exact: true }));
  expect((screen.getByLabelText(name) as HTMLSelectElement).value).toBe("Normal");
  expect(screen.getByText("Pass: 22")).toBeTruthy();
});
it("validates full-page requests and keeps success feedback until dismissed", async () => {
  render(<NmgrApp />);
  fireEvent.click(screen.getByRole("button", { name: "New Guardrail" }));
  expect(screen.queryByRole("dialog")).toBeNull();
  fireEvent.click(screen.getByRole("button", { name: "Submit" }));
  expect(screen.getByRole("alert").textContent).toContain("required");
  fireEvent.change(screen.getByLabelText("Guardrail Name"), {
    target: { value: "Example protection" },
  });
  expect(screen.queryByLabelText("Guardrail ID (unique)")).toBeNull();
  expect(screen.queryByText("Custodian")).toBeNull();
  fireEvent.change(screen.getByRole("textbox", { name: "Business Intents" }), {
    target: { value: "Protect personal information" },
  });
  fireEvent.click(screen.getByRole("button", { name: "Submit" }));
  expect(screen.getByText(/Request submitted!/)).toBeTruthy();
  vi.useFakeTimers();
  await act(async () => {
    vi.advanceTimersByTime(6000);
  });
  expect(screen.getByText(/Request submitted!/)).toBeTruthy();
  fireEvent.click(screen.getByRole("button", { name: /Guardrail Details/ }));
  expect(
    screen.getByRole("heading", { name: "Guardrail Details" }),
  ).toBeTruthy();
  expect(screen.queryByRole("button", { name: "Dismiss notification" })).toBeNull();
  expect(screen.queryByText(/Request submitted!/)).toBeNull();
});
it("does not expose another department via a detail URL", () => {
  const state = seed();
  const item = state.entities[0]!;
  item.unit = "RMG";
  item.name = "Other department secret";
  localStorage.setItem("nmgr-three-role-v2", JSON.stringify(state));
  window.location.hash = `Guardrail/repository/${item.id}`;
  render(<NmgrApp />);
  expect(screen.queryByText("Other department secret")).toBeNull();
});

it("resets technical department filters when switching to a Control Unit workbench", () => {
  localStorage.setItem("nmgr-owner", "IT Admin");
  render(<NmgrApp />);
  fireEvent.click(screen.getByRole("button", { name: "Dashboard" }));
  fireEvent.change(screen.getByLabelText("Control Unit"), {
    target: { value: "RMG" },
  });
  expect(screen.getByText("No matching records.")).toBeTruthy();
  fireEvent.change(screen.getByLabelText("Workbench"), {
    target: { value: "User" },
  });
  expect(screen.queryByText("No matching records.")).toBeNull();
});
