import { useEffect, useState } from "react";
import type { Role } from "../model";
import { actorNames } from "../workbench";
import {
  seedMeasure,
  type Decision,
  type MeasureState,
  type PolicyEvent,
} from "./measure-data";
import {
  commitMeasure,
  measureStorageKey,
  readMeasure,
  reportEvent,
  reviewReport,
} from "./measure-store";
import { BusinessMeasure } from "./measure-business";
import { TechnicalMeasure } from "./measure-technical";
import type { MeasureCenter } from "./measure-runner";
import "./measure.css";
import { Button } from "@/components/ui/button";
import { TechWorkspace } from "./tech-workspace";
import { ScanJourney } from "./scan-journey";

export function Measure({
  role,
  onPolicyAdjustment,
  onDashboard,
  center = "overview",
  onCenter,
  initialBusinessView = "activity",
  technicalPlaceholders = false,
}: {
  role: Role;
  onPolicyAdjustment?: () => void;
  onDashboard?: () => void;
  center?: MeasureCenter;
  onCenter?: (center: MeasureCenter) => void;
  initialBusinessView?: "scans" | "activity";
  technicalPlaceholders?: boolean;
}) {
  const [state, setState] = useState<MeasureState>(seedMeasure);
  const [error, setError] = useState("");
  const [loadError, setLoadError] = useState("");
  const [localCenter, setLocalCenter] = useState<MeasureCenter>(center);
  const [businessView, setBusinessView] = useState(initialBusinessView);
  useEffect(() => {
    function read() {
      try {
        const raw = localStorage.getItem(measureStorageKey);
        setState(raw ? readMeasure(raw) : seedMeasure());
        setLoadError("");
      } catch {
        setLoadError(
          "Saved Measure reports could not be read. Existing data was retained.",
        );
      }
    }
    read();
    const receive = (event: StorageEvent) => {
      if (
        event.key === measureStorageKey &&
        (!event.storageArea || event.storageArea === localStorage)
      )
        read();
    };
    window.addEventListener("storage", receive);
    return () => window.removeEventListener("storage", receive);
  }, []);
  useEffect(() => setError(""), [role]);
  function change(update: (current: MeasureState) => MeasureState) {
    try {
      const raw = localStorage.getItem(measureStorageKey);
      const latest = raw ? readMeasure(raw) : state;
      const next = update(latest);
      commitMeasure(next, localStorage);
      setState(next);
      setError("");
      return true;
    } catch (e) {
      setError(
        e instanceof Error ? e.message : "The report could not be saved.",
      );
      return false;
    }
  }
  const report = (event: PolicyEvent, reason: string) =>
    change((current) =>
      reportEvent(current, event, actorNames[role], role, reason),
    );
  const review = (id: string, decision: Decision, reason: string) =>
    change((current) =>
      reviewReport(current, id, decision, reason, "Alex MORGAN · TEC", role),
    );
  return (
    <div className="nm-measure" data-figma-source="67c1etjhoxv02cH1nAh5SM/0:1">
      {loadError && (
        <p role="alert" className="nm-inline-notice nm-inline-error">
          {loadError}
        </p>
      )}
      {role !== "IT Admin" && (
        <div className="nm-tabs" role="tablist" aria-label="Measure views">
          <Button
            role="tab"
            aria-selected={businessView === "scans"}
            variant={businessView === "scans" ? "secondary" : "ghost"}
            onClick={() => setBusinessView("scans")}
          >
            Scan Overview
          </Button>
        </div>
      )}
      {role === "IT Admin" && technicalPlaceholders ? (
        <TechWorkspace />
      ) : role === "IT Admin" ? (
        <TechnicalMeasure
          key={role}
          state={state}
          onReview={review}
          error={error}
          clearError={() => setError("")}
          center={onCenter ? center : localCenter}
          onCenter={onCenter ?? setLocalCenter}
          {...(onPolicyAdjustment ? { onPolicyAdjustment } : {})}
        />
      ) : businessView === "scans" ? (
        <ScanJourney
          key={role}
          state={state}
          role={role}
          change={change}
          error={error}
          clearError={() => setError("")}
        />
      ) : (
        <BusinessMeasure
          key={role}
          role={role}
          state={state}
          onReport={report}
          error={error}
          clearError={() => setError("")}
          {...(onDashboard ? { onDashboard } : {})}
        />
      )}
    </div>
  );
}
