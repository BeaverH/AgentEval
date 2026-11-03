import {
  agents,
  policyHits,
  policyEvents,
  type PolicyEvent,
} from "./measure-data";

// Reuse the V2 examples and placeholders. Never read Profile runtime or call a service.
export const mockScans = agents.flatMap((agent) =>
  policyHits.flatMap((policy) => policyEvents(agent.id, policy.id)),
);
export const mockGuardrails = [...new Set(policyHits.map((p) => p.guardrail))];
export type ScanDecision = "all" | "Passed" | "Blocked" | "Modified";
export const scanDecision = (
  event: PolicyEvent,
): Exclude<ScanDecision, "all"> =>
  event.action === "Transformed" ? "Modified" : "Blocked";
export function filterMockScans(
  records: PolicyEvent[],
  decision: ScanDecision,
) {
  return records.filter(
    (event) => decision === "all" || scanDecision(event) === decision,
  );
}
export function mockCounts(records: PolicyEvent[]) {
  return {
    total: records.length,
    Passed: 0,
    Blocked: records.filter((e) => e.action === "Blocked").length,
    Modified: records.filter((e) => e.action === "Transformed").length,
  };
}
