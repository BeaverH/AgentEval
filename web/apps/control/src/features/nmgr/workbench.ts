import type { Entity, Kind, Role } from "./model";

export type View =
  | "repository"
  | "request"
  | "tests"
  | "signoff"
  | "deploy"
  | "dashboard"
  | "operations"
  | "logs"
  | "enforce"
  | "audit";
export const workbenchLabels: Record<Role, string> = {
  User: "Control Unit User",
  "User Admin": "Control Unit Approver",
  "IT Admin": "Tech",
};
export const actorNames: Record<Role, string> = {
  User: "Yann GUO",
  "User Admin": "Feng ZONG",
  "IT Admin": "Tech Implementor",
};
type NavItem = { label: string; kind: Kind; view: View };
export const workbenchNavigation: Record<Role, NavItem[]> = {
  User: [
    { label: "Dashboard", kind: "Profile", view: "dashboard" },
    { label: "Business Intents", kind: "Guardrail", view: "repository" },
    { label: "Configure Profiles", kind: "Profile", view: "repository" },
    { label: "Enforce & Prevent", kind: "Profile", view: "enforce" },
    { label: "Trace", kind: "Profile", view: "audit" },
  ],
  "User Admin": [
    { label: "Dashboard", kind: "Profile", view: "dashboard" },
    { label: "GR Signoff", kind: "Guardrail", view: "signoff" },
    { label: "Profile Signoff", kind: "Profile", view: "signoff" },
    { label: "Trace", kind: "Profile", view: "audit" },
  ],
  "IT Admin": [
    { label: "GR Requests", kind: "Guardrail", view: "repository" },
    { label: "GR Evaluation", kind: "Guardrail", view: "tests" },
    { label: "GR Deployment", kind: "Guardrail", view: "deploy" },
    { label: "Trace", kind: "Profile", view: "audit" },
    { label: "Dashboard", kind: "Profile", view: "dashboard" },
  ],
};
export function homeFor(role: Role): [Kind, View] {
  return role === "IT Admin"
    ? ["Guardrail", "repository"]
    : ["Profile", "dashboard"];
}
export function canVisit(role: Role, kind: Kind, view: View) {
  if (view === "operations" && kind === "Profile") return true;
  if (view === "request") return role === "User" && kind === "Guardrail";
  // Referenced objects may be inspected from a detail page, without adding a menu.
  if (view === "repository") return role !== "IT Admin" || kind === "Guardrail";
  return workbenchNavigation[role].some(
    (item) => item.kind === kind && item.view === view,
  );
}
export function inScope(item: Entity, role: Role, controlUnit: string) {
  return role === "IT Admin" || item.unit === controlUnit;
}
