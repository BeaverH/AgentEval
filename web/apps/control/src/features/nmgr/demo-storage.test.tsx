/** @vitest-environment jsdom */
import { act, cleanup, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import {
  demoStorageKey,
  initialOwner,
  saveOwner,
  useDemoState,
} from "./demo-storage";
import { seed, transition } from "./model";

beforeEach(() => {
  localStorage.clear();
  sessionStorage.clear();
  window.history.replaceState(null, "", "/guardrails");
});
afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

it("keeps role selection per tab and allows three direct role links", () => {
  for (const [query, role] of [
    ["user", "User"],
    ["approver", "User Admin"],
    ["tech", "IT Admin"],
  ]) {
    window.history.replaceState(null, "", `/guardrails?role=${query}`);
    expect(initialOwner()).toBe(role);
  }
  saveOwner("User Admin");
  expect(sessionStorage.getItem("nmgr-owner")).toBe("User Admin");
  expect(localStorage.getItem("nmgr-owner")).toBeNull();
  expect(window.location.search).toBe("?role=approver");
  localStorage.setItem("nmgr-owner", "IT Admin");
  expect(initialOwner()).toBe("User Admin");
});

it("receives changes without echoing them, and applies actions to the latest shared state", () => {
  const { result } = renderHook(() => useDemoState(() => {}));
  const initial = seed();
  const profile = initial.entities.find((item) => item.kind === "Profile")!;
  const changed = transition(initial, profile.id, "Pass all", "User");
  localStorage.setItem(demoStorageKey, JSON.stringify(changed));
  const writes = vi.spyOn(Storage.prototype, "setItem");
  act(() =>
    window.dispatchEvent(
      new StorageEvent("storage", {
        key: demoStorageKey,
        newValue: JSON.stringify(changed),
        storageArea: localStorage,
      }),
    ),
  );
  expect(
    result.current.state.entities.find((item) => item.id === profile.id)?.mode,
  ).toBe("Pass all");
  expect(writes).not.toHaveBeenCalled();
  expect(result.current.state).toEqual(changed);
  // Another tab writes before this tab has processed its storage event.
  const another = changed.entities.find(
    (item) => item.kind === "Profile" && item.id !== profile.id,
  )!;
  const latest = transition(changed, another.id, "Block all", "User");
  localStorage.setItem(demoStorageKey, JSON.stringify(latest));
  act(() =>
    result.current.updateState((state) =>
      transition(state, profile.id, "Normal", "User"),
    ),
  );
  expect(
    result.current.state.entities.find((item) => item.id === another.id)?.mode,
  ).toBe("Block all");
  expect(result.current.state.audit).toHaveLength(latest.audit.length + 1);
});
