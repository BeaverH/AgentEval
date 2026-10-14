import { useEffect, useRef, useState } from "react";
import { accounts, seed, type State } from "./model";
import { completeDemoState } from "./mock-data";

export const demoStorageKey = "nmgr-three-role-v2";
export const ownerStorageKey = "nmgr-owner";

export function readDemoState(raw: string): State {
  const state = JSON.parse(raw);
  if (!Array.isArray(state.entities) || !Array.isArray(state.audit))
    throw new Error("Invalid demo data");
  return completeDemoState(state);
}

export function initialOwner(): string {
  try {
    const requested = new URLSearchParams(window.location.search).get("role");
    const roles: Record<string, string> = {
      user: "User",
      approver: "User Admin",
      tech: "IT Admin",
    };
    const linked = roles[requested ?? ""];
    const value =
      linked ??
      sessionStorage.getItem(ownerStorageKey) ??
      localStorage.getItem(ownerStorageKey);
    return value && accounts.some((account) => account === value)
      ? value
      : "User";
  } catch {
    return "User";
  }
}

export function saveOwner(owner: string) {
  try {
    sessionStorage.setItem(ownerStorageKey, owner);
    const url = new URL(window.location.href);
    url.searchParams.set(
      "role",
      owner === "IT Admin"
        ? "tech"
        : owner === "User Admin"
          ? "approver"
          : "user",
    );
    window.history.replaceState(null, "", url);
  } catch {}
}

// Persist only local mutations. Incoming storage events must never write back,
// otherwise open tabs can overwrite each other or enter a storage-event loop.
export function useDemoState(onNotice: (message: string) => void) {
  const [state, setState] = useState<State>(() => seed());
  const [ready, setReady] = useState(false);
  const current = useRef(state);
  const notice = useRef(onNotice);
  notice.current = onNotice;

  useEffect(() => {
    let next = current.current;
    try {
      const raw = localStorage.getItem(demoStorageKey);
      if (raw) next = readDemoState(raw);
      const serialized = JSON.stringify(next);
      if (raw !== serialized) localStorage.setItem(demoStorageKey, serialized);
    } catch {
      notice.current("Saved demo data could not be read. Sample data loaded.");
    }
    current.current = next;
    setState(next);
    setReady(true);
    const receive = (event: StorageEvent) => {
      if (
        event.key !== demoStorageKey ||
        (event.storageArea && event.storageArea !== localStorage)
      )
        return;
      try {
        // Read the latest value, even when several events have been queued.
        const raw = localStorage.getItem(demoStorageKey);
        if (!raw) return;
        const incoming = readDemoState(raw);
        current.current = incoming;
        setState(incoming);
      } catch {
        notice.current(
          "Changes from another tab could not be loaded. Please refresh this page.",
        );
      }
    };
    window.addEventListener("storage", receive);
    return () => window.removeEventListener("storage", receive);
  }, []);

  function updateState(change: (latest: State) => State) {
    let latest = current.current;
    try {
      const raw = localStorage.getItem(demoStorageKey);
      if (raw) latest = readDemoState(raw);
    } catch {}
    const next = change(latest);
    current.current = next;
    setState(next);
    try {
      localStorage.setItem(demoStorageKey, JSON.stringify(next));
    } catch {
      notice.current(
        "Browser storage is unavailable. Changes in this tab cannot be synchronized.",
      );
    }
  }
  return { state, ready, updateState };
}
