import type { Role } from "../model";
import {
  agents,
  eventEvidence,
  policyHits,
  type Decision,
  type MeasureState,
  type PolicyEvent,
  type Report,
} from "./measure-data";
export const measureStorageKey = "nmgr-v2-mock-measure-v1";
export function reportEvent(
  state: MeasureState,
  event: PolicyEvent,
  actor: string,
  role: Role,
  reason: string,
  time = new Date().toISOString(),
): MeasureState {
  if (role === "IT Admin")
    throw new Error("Report false positives from a Control Unit workbench.");
  if (event.reported || state.reports.some((r) => r.eventId === event.id))
    return state;
  if (!reason.trim()) throw new Error("Enter a report reason.");
  if (reason.trim().length > 5000)
    throw new Error("Report reason must be 5000 characters or fewer.");
  const report = reportForEvent(event, actor, time);
  return {
    ...state,
    reports: [{ ...report, reportReason: reason.trim() }, ...state.reports],
  };
}

export function reportForEvent(
  event: PolicyEvent,
  actor: string,
  time = new Date().toISOString(),
): Report {
  const agent = agents.find((a) => a.id === event.agentId);
  const policy = policyHits.find((p) => p.id === event.policyId);
  if (!agent || !policy) throw new Error("The original event is unavailable.");
  return {
    id: `FPR-MOCK-${encodeURIComponent(event.id)}`,
    eventId: event.id,
    agentId: event.agentId,
    policy: policy.policy,
    policyDescription: policy.description,
    guardrail: policy.guardrail,
    guardDescription: policy.guardDescription,
    reportedAt: time,
    reporter: actor,
    controlUnit: "ISS",
    status: "Pending review",
    action: event.action,
    evidence: eventEvidence(event),
  };
}
export function reviewReport(
  state: MeasureState,
  id: string,
  decision: Decision,
  reason: string,
  reviewer: string,
  role: Role,
  time = new Date().toISOString(),
): MeasureState {
  if (role !== "IT Admin")
    throw new Error("Only the technical workbench can review reports.");
  if (!["Confirm false positive", "Not a false positive"].includes(decision))
    throw new Error("Select a review decision.");
  if (!reason.trim()) throw new Error("Enter a review reason.");
  const report = state.reports.find((r) => r.id === id);
  if (!report) throw new Error("Report is no longer available.");
  if (report.status === "Reviewed")
    throw new Error("This report is already reviewed.");
  return {
    ...state,
    reports: state.reports.map((r) =>
      r.id === id
        ? {
            ...r,
            status: "Reviewed",
            review: { decision, reason: reason.trim(), reviewer, time },
          }
        : r,
    ),
  };
}
export function commitMeasure(
  state: MeasureState,
  storage: Pick<Storage, "setItem">,
): void {
  try {
    storage.setItem(measureStorageKey, JSON.stringify(state));
  } catch {
    throw new Error(
      "Your changes could not be saved. Browser storage is unavailable; please retry.",
    );
  }
}
export function readMeasure(raw: string): MeasureState {
  const parsed = JSON.parse(raw) as MeasureState;
  if (
    parsed?.version !== 1 ||
    (parsed.suspendedGuardrails !== undefined &&
      (!Array.isArray(parsed.suspendedGuardrails) ||
        parsed.suspendedGuardrails.some(
          (id) =>
            typeof id !== "string" ||
            !policyHits.some((p) => p.guardrail === id),
        ))) ||
    (parsed.feedback !== undefined &&
      (!Array.isArray(parsed.feedback) ||
        parsed.feedback.some(
          (f) =>
            !f ||
            typeof f.eventId !== "string" ||
            !["common", "false-negative"].includes(f.category) ||
            typeof f.description !== "string" ||
            typeof f.reporter !== "string" ||
            typeof f.time !== "string",
        ))) ||
    !Array.isArray(parsed.reports) ||
    parsed.reports.some(
      (r) =>
        !r ||
        typeof r.id !== "string" ||
        typeof r.eventId !== "string" ||
        (r.reportReason !== undefined && typeof r.reportReason !== "string") ||
        (r.controlUnit !== undefined && typeof r.controlUnit !== "string") ||
        !agents.some((a) => a.id === r.agentId) ||
        !["Pending review", "In review", "Reviewed"].includes(r.status) ||
        !r.evidence ||
        typeof r.evidence.request !== "string" ||
        typeof r.evidence.response !== "string" ||
        (r.status === "Reviewed" &&
          (!r.review || typeof r.review.reason !== "string")),
    )
  )
    throw new Error(
      "Saved Measure reports could not be read. Existing data was retained.",
    );
  return parsed;
}
