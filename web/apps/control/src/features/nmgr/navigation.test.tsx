/** @vitest-environment jsdom */
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { NmgrShell } from "./shell";
import { workbenchNavigation, homeFor, canVisit, inScope } from "./workbench";
import { seed, type Role } from "./model";
beforeEach(() => {
  vi.stubGlobal(
    "ResizeObserver",
    class {
      observe() {}
      disconnect() {}
    },
  );
});
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});
it.each(["User", "User Admin", "IT Admin"] as Role[])(
  "renders the %s workbench with its own navigation",
  (role) => {
    const navigate = vi.fn();
    render(
      <NmgrShell
        kind="Profile"
        view="dashboard"
        owner={role}
        busy={false}
        onOwner={() => {}}
        onNavigate={navigate}
      >
        Content
      </NmgrShell>,
    );
    for (const item of workbenchNavigation[role]) {
      if (item.view === "enforce") {
        expect(screen.queryByRole("button", { name: item.label })).toBeNull();
        continue;
      }
      fireEvent.click(screen.getByRole("button", { name: item.label }));
      expect(navigate).toHaveBeenLastCalledWith(item.kind, item.view);
    }
    expect(
      screen.queryByRole("button", { name: "GR Deployment" }) !== null,
    ).toBe(role === "IT Admin");
    expect(
      screen.queryByRole("button", { name: "Profile Signoff" }) !== null,
    ).toBe(role === "User Admin");
  },
);
it("separates departmental scope from workbench selection", () => {
  const item = { ...seed().entities[0]!, unit: "RMG" };
  expect(inScope(item, "User", "ISS")).toBe(false);
  expect(inScope(item, "User Admin", "ISS")).toBe(false);
  expect(inScope(item, "IT Admin", "ISS")).toBe(true);
  expect(homeFor("User")).toEqual(["Profile", "dashboard"]);
  expect(canVisit("User", "Guardrail", "deploy")).toBe(false);
  expect(canVisit("IT Admin", "Profile", "tests")).toBe(false);
});
