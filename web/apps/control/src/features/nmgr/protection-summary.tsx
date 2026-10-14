import { Button } from "@/components/ui/button";
import { Plus } from "lucide-react";
import type { Scan } from "./monitoring";

export function ProtectionSummary({ scans, profiles, guardrails, onNewGuardrail }: {
  scans: Scan[];
  profiles: number;
  guardrails: number;
  onNewGuardrail?: () => void;
}) {
  const now = Date.now();
  const recent = scans.filter((scan) => {
    const age = now - Date.parse(scan.time);
    return age >= 0 && age <= 10 * 60 * 1000;
  });
  return (
    <div className="nm-protection-summary">
      <section className="nm-protection-panel" aria-label="In Last 10 Minutes">
        <h2>In Last 10 Minutes</h2>
        <div className="nm-protection-scan-grid">
          <div className="nm-protection-total">
            <span>Total Scans</span>
            <strong>{recent.length}</strong>
          </div>
          <div className="nm-protection-results">
            {([["Pass", "Passed"], ["Block", "Blocked"], ["Transfer", "Transferred"]] as const).map(([label, result]) => {
              const count = recent.filter((scan) => scan.result === result).length;
              return (
                <div className="nm-protection-result" key={label}>
                  <span>{label}: {count}</span>
                  <span>{recent.length ? ((count / recent.length) * 100).toFixed(2) : "0.00"} %</span>
                </div>
              );
            })}
          </div>
        </div>
      </section>
      <section className="nm-protection-panel" aria-label="Deployed Protection">
        <h2>Deployed Protection</h2>
        <dl className="nm-protection-deployed">
          <div><dt>Profiles</dt><dd>{profiles}</dd></div>
          <div><dt>Guardrails</dt><dd>{guardrails}</dd></div>
        </dl>
      </section>
      {onNewGuardrail && (
        <div className="nm-protection-actions">
          <Button onClick={onNewGuardrail}><Plus size={16} /> New Guardrail</Button>
        </div>
      )}
    </div>
  );
}
