import { useEffect, useState } from "react";
import {
  readScanLocation,
  scanHash,
  scanParent,
  type ScanLocation,
} from "./scan-navigation";

export function useScanNavigation() {
  const [route, setRoute] = useState(() =>
    readScanLocation(typeof window === "undefined" ? "" : window.location.hash),
  );
  useEffect(() => {
    const sync = () => {
      if (window.location.hash.split("?")[0] === "#Profile/measure/")
        setRoute(readScanLocation(window.location.hash));
    };
    window.addEventListener("popstate", sync);
    window.addEventListener("hashchange", sync);
    return () => {
      window.removeEventListener("popstate", sync);
      window.removeEventListener("hashchange", sync);
    };
  }, []);
  function go(next: Partial<ScanLocation>, replace = false) {
    const location = readScanLocation(scanHash({ ...route, ...next }));
    const hash = scanHash(location);
    const state = replace
      ? window.history.state
      : { ...window.history.state, nmgrMeasurePrevious: window.location.hash };
    window.history[replace ? "replaceState" : "pushState"](state, "", hash);
    setRoute(location);
  }
  function back() {
    const parent = scanParent(route);
    const previousHash = window.history.state?.nmgrMeasurePrevious;
    const previous =
      typeof previousHash === "string"
        ? readScanLocation(previousHash)
        : undefined;
    if (
      previous &&
      previous.view === parent.view &&
      previous.guardrail === parent.guardrail &&
      previous.policy === parent.policy &&
      previous.agent === parent.agent &&
      previous.event === parent.event
    ) {
      window.history.back();
    } else go(parent);
  }
  return { route, go, back, previous: scanParent(route) };
}
