import { configError, type UnifiedConfig } from "../business-demo/evaluation";
import { defaultNmgrDemo } from "./mock-data";
export const controlUnits = ["ISS", "RMG", "LCS"];

export type Kind = "Guardrail" | "Profile";
export type Status =
  | "DRAFT"
  | "TEST READY"
  | "TEST FAILED"
  | "TEST PASSED"
  | "SIGNOFF REQUESTED"
  | "SIGNED OFF"
  | "DEPLOYED";
export type Role = "User" | "User Admin" | "IT Admin";
export const accounts: Role[] = ["User", "User Admin", "IT Admin"];
export function roleForOwner(owner: string): Role {
  return accounts.includes(owner as Role) ? (owner as Role) : "User";
}
export const canAuthor = (role: Role) => role === "User";
export type Run = {
  tester?: Role;
  configurationRevision?: number;
  id: string;
  version: number;
  base: number | null;
  dataset: string;
  passed: boolean;
  start: string;
  end: string;
  cases: number;
};
export type Entity = {
  configurationRevision?: number;
  id: string;
  kind: Kind;
  name: string;
  description: string;
  unit: string;
  location: string;
  custodian: string;
  approver: string;
  mandatory: boolean;
  status: Status;
  version: number;
  deployed: number | null;
  deployedAt?: string;
  updated: string;
  policies: string[];
  refs: string[];
  deployedRefs: string[];
  attributes: { bu: string; agent: string; data: string };
  runs: Run[];
  mode: "Normal" | "Pass all" | "Block all";
  threshold: number;
  thresholdMetric?: "Block Rate" | "Pass Rate" | "Error Rate";
  thresholdWindow?: number;
  signedBy?: string;
  config?: UnifiedConfig;
  revisions?: Record<number, Revision>;
};
export type Revision = Pick<
  Entity,
  | "name"
  | "description"
  | "policies"
  | "refs"
  | "unit"
  | "location"
  | "mandatory"
  | "attributes"
  | "config"
> & { threshold?: number; thresholdMetric?: Entity["thresholdMetric"]; thresholdWindow?: number };
export function deployedEntity(item: Entity): Entity {
  const saved =
    item.deployed === null ? undefined : item.revisions?.[item.deployed];
  return saved ? { ...item, ...saved, thresholdMetric: saved.thresholdMetric, thresholdWindow: saved.thresholdWindow } : item;
}
export type Audit = {
  id: string;
  time: string;
  entity: string;
  action: string;
  actor: string;
};
export type State = { entities: Entity[]; audit: Audit[] };
export type Action =
  | "implement"
  | "withdraw"
  | "test-pass"
  | "test-fail"
  | "request"
  | "approve"
  | "reject"
  | "deploy"
  | "revise"
  | "Normal"
  | "Pass all"
  | "Block all";
export const roles = accounts;
export const actor = (role: Role) => role;
export function hasTechnicalPass(e: Entity): boolean {
  return e.runs.some(
    (r) =>
      r.version === e.version &&
      r.configurationRevision === (e.configurationRevision ?? 0) &&
      r.passed &&
      r.tester === "IT Admin",
  );
}
export function allowed(e: Entity, action: Action, role: Role): boolean {
  switch (action) {
    case "implement":
      return (
        e.kind === "Guardrail" &&
        role === "IT Admin" &&
        ["DRAFT", "TEST FAILED"].includes(e.status)
      );
    case "test-pass":
    case "test-fail":
      return (
        e.kind === "Guardrail" &&
        role === "IT Admin" &&
        ["TEST READY", "TEST FAILED", "TEST PASSED"].includes(e.status)
      );
    case "request":
      return (
        role === "User" &&
        (e.kind === "Profile"
          ? e.status === "DRAFT" && e.refs.length > 0
          : e.status === "TEST PASSED" &&
            e.runs[0]?.passed === true &&
            e.runs[0]?.version === e.version &&
            e.runs[0]?.configurationRevision ===
              (e.configurationRevision ?? 0) &&
            hasTechnicalPass(e))
      );
    case "approve":
    case "reject":
      return role === "User Admin" && e.status === "SIGNOFF REQUESTED";
    case "deploy":
      return (
        e.kind === "Guardrail" &&
        role === "IT Admin" &&
        e.status === "SIGNED OFF"
      );
    case "withdraw":
      return (
        role === "User" &&
        [
          "TEST READY",
          "TEST FAILED",
          "TEST PASSED",
          "SIGNOFF REQUESTED",
          "SIGNED OFF",
        ].includes(e.status)
      );
    case "revise":
      return (
        role === "User" &&
        (e.status === "DEPLOYED" ||
          (e.kind === "Profile" && e.status === "SIGNED OFF"))
      );
    default:
      return (
        role === "User" &&
        e.kind === "Profile" &&
        e.deployed !== null &&
        e.mode !== action
      );
  }
}
export function transition(
  state: State,
  id: string,
  action: Action,
  role: Role,
  options: {
    dataset?: string;
    cases?: number;
    policies?: string[];
    refs?: string[];
    threshold?: number;
    reason?: string;
    actorName?: string;
    approver?: string;
    config?: UnifiedConfig;
  } = {},
): State {
  const current = state.entities.find((e) => e.id === id);
  if (!current || !allowed(current, action, role))
    throw new Error(
      "This action is not available for the current role or status.",
    );
  const e: Entity = { ...current, updated: new Date().toISOString() };
  if (action === "implement") {
    if (e.kind === "Guardrail" && !options.policies?.length)
      throw new Error("Add at least one implemented policy.");
    if (e.kind === "Guardrail" && !options.config)
      throw new Error("Configure the Guardrail before testing.");
    if (e.kind === "Profile") {
      e.refs = options.refs ?? e.refs;
      e.threshold = options.threshold ?? e.threshold;
      addEntity(
        { ...state, entities: state.entities.filter((x) => x.id !== id) },
        e,
      );
    }
    if (e.kind === "Guardrail" && options.config) {
      const problem = configError(options.config);
      if (problem) throw new Error(problem);
      e.config = options.config;
    }
    if (e.kind === "Guardrail") e.policies = options.policies!;
    e.configurationRevision = (e.configurationRevision ?? 0) + 1;
    e.status = "TEST READY";
  }
  if (action === "withdraw") {
    e.status = "DRAFT";
    e.configurationRevision = (e.configurationRevision ?? 0) + 1;
    delete e.signedBy;
  }
  if (action === "test-pass" || action === "test-fail") {
    if (!options.dataset || !options.cases)
      throw new Error("Select a dataset.");
    e.status = action === "test-pass" ? "TEST PASSED" : "TEST FAILED";
    e.runs = [
      {
        id: crypto.randomUUID(),
        tester: role,
        configurationRevision: e.configurationRevision ?? 0,
        version: e.version,
        base: e.deployed,
        dataset: options.dataset,
        cases: options.cases,
        passed: action === "test-pass",
        start: e.updated,
        end: e.updated,
      },
      ...e.runs,
    ];
  }
  if (action === "request") {
    e.status = "SIGNOFF REQUESTED";
    e.approver = options.approver?.trim() || e.approver;
  }
  if (action === "approve") {
    e.status = "SIGNED OFF";
    e.signedBy = options.actorName ?? actor(role);
    if (e.kind === "Profile") {
      // Profiles become effective on approval; deployed stores the active snapshot
      // for compatibility with the existing monitoring/version model.
      addEntity(
        { ...state, entities: state.entities.filter((x) => x.id !== id) },
        e,
      );
      e.deployed = e.version;
      e.deployedAt = e.updated;
      e.deployedRefs = [...e.refs];
    }
  }
  if (action === "reject") {
    if (!options.reason?.trim()) throw new Error("Enter a rejection reason.");
    e.status = e.kind === "Profile" ? "DRAFT" : "TEST READY";
    e.configurationRevision = (e.configurationRevision ?? 0) + 1;
    delete e.signedBy;
  }
  if (action === "revise") {
    e.revisions = { ...e.revisions, [e.version]: snapshot(e) };
    e.version++;
    e.status = "DRAFT";
    e.configurationRevision = (e.configurationRevision ?? 0) + 1;
    delete e.signedBy;
  }
  if (action === "deploy") {
    e.deployed = e.version;
    e.deployedAt = e.updated;
    e.status = "DEPLOYED";
  }
  if (["Normal", "Pass all", "Block all"].includes(action))
    e.mode = action as Entity["mode"];
  return {
    entities: state.entities.map((x) => (x.id === id ? e : x)),
    audit: [
      {
        id: crypto.randomUUID(),
        time: e.updated,
        entity: id,
        actor: options.actorName ?? actor(role),
        action: options.reason ? `${action}: ${options.reason}` : action,
      },
      ...state.audit,
    ].slice(0, 500),
  };
}
function validateThreshold(value: number) {
  if (!Number.isFinite(value) || value < 0 || value > 100)
    throw new Error("Alert threshold must be between 0 and 100%.");
}
export function addEntity(state: State, e: Entity, role: Role = "User"): State {
  if (!canAuthor(role)) throw new Error("Only User can create requests.");
  if (e.kind === "Profile") {
    validateThreshold(e.threshold);
    if (e.thresholdMetric !== undefined && !["Block Rate", "Pass Rate", "Error Rate"].includes(e.thresholdMetric)) throw new Error("Select a valid Alert Metric.");
    if (e.thresholdWindow !== undefined && (!Number.isSafeInteger(e.thresholdWindow) || e.thresholdWindow < 1)) throw new Error("Alert Window must be a positive whole number of minutes.");
  }
  if (!e.name.trim() || !e.description.trim())
    throw new Error(
      e.kind === "Guardrail"
        ? "Guardrail name and business intents are required."
        : "Profile name and use case are required.",
    );
  if (!/^[a-z][a-z0-9-]{2,63}$/.test(e.id))
    throw new Error(
      "ID must be 3–64 lowercase letters, numbers or hyphens, starting with a letter.",
    );
  if (state.entities.some((x) => x.id === e.id))
    throw new Error("This ID has already been taken.");
  if (
    e.kind === "Profile" &&
    (!e.refs.length ||
      e.refs.some(
        (id) =>
          !state.entities.some(
            (g) => g.id === id && g.kind === "Guardrail" && g.deployed !== null,
          ),
      ))
  )
    throw new Error("Select at least one deployed Guardrail.");
  if (e.kind === "Profile") {
    const mandatory = state.entities
      .map(deployedEntity)
      .filter(
        (g) =>
          g.kind === "Guardrail" &&
          g.deployed !== null &&
          g.mandatory &&
          (g.location === "ALL" ||
            e.location === "ALL" ||
            g.location === e.location),
      );
    if (mandatory.some((g) => !e.refs.includes(g.id)))
      throw new Error(
        "Include all mandatory Guardrails for this jurisdiction.",
      );
  }
  return {
    entities: [e, ...state.entities],
    audit: [
      {
        id: crypto.randomUUID(),
        time: e.updated,
        entity: e.id,
        action: "created",
        actor: e.custodian,
      },
      ...state.audit,
    ],
  };
}
export function editEntity(state: State, item: Entity, role: Role): State {
  const current = state.entities.find((e) => e.id === item.id);
  if (
    !current ||
    !canAuthor(role) ||
    !["DRAFT", "TEST READY", "TEST FAILED", "TEST PASSED"].includes(
      current.status,
    )
  )
    throw new Error("Withdraw this revision before editing.");

  const validated = addEntity(
    { ...state, entities: state.entities.filter((e) => e.id !== item.id) },
    item,
  );
  const saved: Entity = {
    ...current,
    name: item.name,
    description: item.description,
    unit: item.unit,
    location: item.location,
    approver: item.approver,
    mandatory: item.mandatory,
    refs: item.refs,
    attributes: item.attributes,
    threshold: item.threshold,
    thresholdMetric: item.thresholdMetric,
    thresholdWindow: item.thresholdWindow,
    updated: item.updated,
    runs: current.runs,
    policies: current.policies,
    configurationRevision: (current.configurationRevision ?? 0) + 1,
    status: "DRAFT",
  };
  delete saved.signedBy;
  return {
    entities: state.entities.map((e) => (e.id === saved.id ? saved : e)),
    audit: [
      {
        ...validated.audit[0]!,
        action: "requirements updated; test evidence invalidated",
      },
      ...state.audit,
    ],
  };
}
function snapshot(e: Entity): Revision {
  return {
    name: e.name,
    description: e.description,
    unit: e.unit,
    location: e.location,
    mandatory: e.mandatory,
    attributes: { ...e.attributes },
    threshold: e.threshold,
    thresholdMetric: e.thresholdMetric,
    thresholdWindow: e.thresholdWindow,
    policies: [...e.policies],
    refs: [...e.refs],
    ...(e.config ? { config: { ...e.config } } : {}),
  };
}
export function reviseEntity(
  state: State,
  item: Entity,
  role: Role,
  actorName?: string,
): State {
  const current = state.entities.find((e) => e.id === item.id);
  if (!current || !allowed(current, "revise", role))
    throw new Error("Only a deployed revision can be modified.");
  // Validate the whole form before creating a revision; cancelling never mutates state.
  addEntity(
    { ...state, entities: state.entities.filter((e) => e.id !== item.id) },
    item,
  );

  const revised = transition(
    state,
    item.id,
    "revise",
    role,
    actorName ? { actorName } : {},
  );
  const next = editEntity(
    revised,
    { ...item, version: current.version + 1 },
    role,
  );
  return { ...next, audit: revised.audit };
}
export function seed(): State {
  return defaultNmgrDemo();
}
