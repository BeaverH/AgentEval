/** @vitest-environment jsdom */
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { NmgrApp } from "../app";
import { NmgrShell } from "../shell";

beforeEach(() => {
  localStorage.clear();
  sessionStorage.clear();
  window.history.replaceState(null, "", "/v2-mock/guardrails");
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
});

it.each(["User", "User Admin", "IT Admin"])(
  "imports Measure into the %s mock shell and preserves existing workspace entities",
  (role) => {
    const network = vi.fn();
    vi.stubGlobal("fetch", network);
    render(<NmgrApp mock />);
    fireEvent.change(screen.getByLabelText("Workbench"), {
      target: { value: role },
    });
    const before = localStorage.getItem("nmgr-v2-mock-state");
    fireEvent.click(screen.getByRole("button", { name: "Measure" }));
    expect(screen.getByRole("heading", { name: "Measure" })).toBeTruthy();
    expect(window.location.hash).toBe("#Profile/measure/");
    if (role === "IT Admin")
      expect(
        screen.getByRole("heading", { name: "System Performance" }),
      ).toBeTruthy();
    else
      expect(
        screen.getByRole("heading", { name: "Scan Overview" }),
      ).toBeTruthy();
    if (role !== "IT Admin") {
      expect(screen.queryByRole("tab", { name: "Breach Monitor" })).toBeNull();
    }
    expect(localStorage.getItem("nmgr-v2-mock-state")).toBe(before);
    expect(network).not.toHaveBeenCalled();
  },
);

it("does not expose the mock Measure feature in the default/live shell", () => {
  render(
    <NmgrShell
      kind="Guardrail"
      view="repository"
      owner="IT Admin"
      busy={false}
      onOwner={() => {}}
      onNavigate={() => {}}
    >
      Live workspace
    </NmgrShell>,
  );
  expect(screen.queryByRole("button", { name: "Measure" })).toBeNull();
});
