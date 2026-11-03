import { agents, policyHits } from "./measure-data";
import {
  mockScans,
  mockGuardrails,
  type ScanDecision,
} from "./scan-journey-data";

export type ScanPage =
  | "overview"
  | "guardrails"
  | "guardrail"
  | "policy"
  | "agents"
  | "agent"
  | "scan"
  | "feedback";
export type ScanLocation = {
  view: ScanPage;
  guardrail: string;
  policy: string;
  agent: string;
  event: string;
  source: "guardrail" | "agent";
  origin: "overview" | "guardrails" | "agents";
  decision: ScanDecision;
  query: string;
  listPage: number;
  eventPage: number;
};
export const scanHome: ScanLocation = {
  view: "overview",
  guardrail: "",
  policy: "",
  agent: "",
  event: "",
  source: "guardrail",
  origin: "overview",
  decision: "all",
  query: "",
  listPage: 1,
  eventPage: 1,
};
const pages: ScanPage[] = [
  "overview",
  "guardrails",
  "guardrail",
  "policy",
  "agents",
  "agent",
  "scan",
  "feedback",
];
export function readScanLocation(hash: string): ScanLocation {
  const q = new URLSearchParams(hash.split("?")[1]);
  const view = q.get("view") as ScanPage;
  if (!pages.includes(view)) return { ...scanHome };
  const page = (key: string) => {
    const n = Number(q.get(key));
    return Number.isSafeInteger(n) && n > 0 ? n : 1;
  };
  const decision = q.get("decision") as ScanDecision;
  const location: ScanLocation = {
    ...scanHome,
    view,
    guardrail: q.get("guardrail") ?? "",
    policy: q.get("policy") ?? "",
    agent: q.get("agent") ?? "",
    event: q.get("event") ?? "",
    source: q.get("source") === "agent" ? "agent" : "guardrail",
    origin:
      q.get("origin") === "agents"
        ? "agents"
        : q.get("origin") === "guardrails"
          ? "guardrails"
          : "overview",
    decision: ["Passed", "Blocked", "Modified"].includes(decision)
      ? decision
      : "all",
    query: q.get("query") ?? "",
    listPage: page("listPage"),
    eventPage: page("eventPage"),
  };
  if (view === "scan" || view === "feedback") {
    const event = mockScans.find((e) => e.id === location.event);
    if (event) {
      location.agent = event.agentId;
      location.policy = event.policyId;
    }
  }
  const policy = policyHits.find((p) => p.id === location.policy);
  if (policy) location.guardrail = policy.guardrail;
  return location;
}
export function scanHash(location: ScanLocation): string {
  const q = new URLSearchParams();
  for (const key of Object.keys(scanHome) as (keyof ScanLocation)[]) {
    if (location[key] !== scanHome[key]) q.set(key, String(location[key]));
  }
  // A filtered overview still needs its view to survive a reload.
  if (q.size && !q.has("view")) q.set("view", location.view);
  return `#Profile/measure/${q.size ? `?${q}` : ""}`;
}
export function validScanLocation(location: ScanLocation): boolean {
  switch (location.view) {
    case "guardrail":
      return mockGuardrails.includes(location.guardrail);
    case "agent":
      return agents.some((a) => a.id === location.agent);
    case "policy":
      return (
        policyHits.some((p) => p.id === location.policy) &&
        (location.source !== "agent" ||
          agents.some((a) => a.id === location.agent))
      );
    case "scan":
    case "feedback":
      return mockScans.some((e) => e.id === location.event);
    default:
      return true;
  }
}
export function scanParent(location: ScanLocation): ScanLocation {
  const next = { ...location };
  switch (location.view) {
    case "feedback":
      return { ...next, view: "scan" };
    case "scan":
      return {
        ...next,
        view: "policy",
        event: "",
        agent: location.source === "agent" ? location.agent : "",
      };
    case "policy":
      return {
        ...next,
        view: location.source === "agent" ? "agent" : "guardrail",
        policy: "",
        event: "",
        guardrail: location.source === "agent" ? "" : location.guardrail,
      };
    case "guardrail":
      return {
        ...next,
        view: location.origin === "guardrails" ? "guardrails" : "overview",
        guardrail: "",
        policy: "",
        agent: "",
        event: "",
      };
    case "agent":
      return {
        ...next,
        view: location.origin === "agents" ? "agents" : "overview",
        agent: "",
        policy: "",
        guardrail: "",
        event: "",
      };
    default:
      return {
        ...scanHome,
        decision: location.decision,
        query: location.query,
      };
  }
}
