import { configError, type UnifiedConfig } from "../business-demo/evaluation";
import { completeDemoState } from "./mock-data";
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
export type Role =
  | "Custodian"
  | "Tech"
  | "Approver"
  | "Deployer"
  | "Operator"
  | "Admin"
  | "Control Unit";
export const accounts = ["Admin", "ISS", "LCS", "RMG"];
export function roleForOwner(owner: string): Role {
  return owner === "Admin" ? "Admin" : "Control Unit";
}
export const canAuthor = (role: Role) =>
  ["Custodian", "Control Unit", "Admin"].includes(role);
export type Run = {
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
> & { threshold?: number };
export function deployedEntity(item: Entity): Entity {
  const saved =
    item.deployed === null ? undefined : item.revisions?.[item.deployed];
  return saved ? { ...item, ...saved } : item;
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
export const roles: Role[] = [
  "Custodian",
  "Tech",
  "Approver",
  "Deployer",
  "Operator",
];
export const actor = (role: Role) =>
  ({
    Admin: "Admin",
    "Control Unit": "ISS",
    Custodian: "Yann GUO",
    Tech: "Admin",
    Approver: "Feng ZONG",
    Deployer: "Admin",
    Operator: "ISS Operator",
  })[role];
export function allowed(e: Entity, action: Action, role: Role): boolean {
  if (role === "Admin") return roles.some((r) => allowed(e, action, r));
  if (role === "Control Unit")
    return allowed(e, action, "Custodian") || allowed(e, action, "Operator");
  switch (action) {
    case "implement":
      return role === "Tech" && e.kind === "Guardrail" && e.status === "DRAFT";
    case "test-pass":
    case "test-fail":
      return (
        (role === "Custodian" || role === "Tech") &&
        ["TEST READY", "TEST FAILED", "TEST PASSED"].includes(e.status)
      );
    case "request":
      return (
        role === "Custodian" &&
        e.status === "TEST PASSED" &&
        e.runs[0]?.passed === true &&
        e.runs[0]?.version === e.version
      );
    case "approve":
    case "reject":
      return role === "Approver" && e.status === "SIGNOFF REQUESTED";
    case "deploy":
      return role === "Deployer" && e.status === "SIGNED OFF";
    case "withdraw":
      return (
        role === "Custodian" &&
        [
          "TEST READY",
          "TEST FAILED",
          "TEST PASSED",
          "SIGNOFF REQUESTED",
          "SIGNED OFF",
        ].includes(e.status)
      );
    case "revise":
      return role === "Custodian" && e.status === "DEPLOYED";
    default:
      return (
        role === "Operator" &&
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
    threshold?: number;
    reason?: string;
    actorName?: string;
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
    if (!options.policies?.length)
      throw new Error("Add at least one implemented policy.");
    if (options.config) {
      const problem = configError(options.config);
      if (problem) throw new Error(problem);
      e.config = options.config;
    }
    e.policies = options.policies;
    e.status = "TEST READY";
  }
  if (action === "withdraw") {
    e.status = e.kind === "Guardrail" ? "DRAFT" : "TEST READY";
    delete e.signedBy;
  }
  if (action === "test-pass" || action === "test-fail") {
    if (!options.dataset || !options.cases)
      throw new Error("Select a dataset.");
    e.status = action === "test-pass" ? "TEST PASSED" : "TEST FAILED";
    e.runs = [
      {
        id: crypto.randomUUID(),
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
  if (action === "request") e.status = "SIGNOFF REQUESTED";
  if (action === "approve") {
    e.status = "SIGNED OFF";
    e.signedBy = options.actorName ?? actor(role);
  }
  if (action === "reject") {
    if (!options.reason?.trim()) throw new Error("Enter a rejection reason.");
    e.status = "TEST READY";
    delete e.signedBy;
  }
  if (action === "revise") {
    e.revisions = { ...e.revisions, [e.version]: snapshot(e) };
    e.version++;
    e.status = e.kind === "Guardrail" ? "DRAFT" : "TEST READY";
    delete e.signedBy;
  }
  if (action === "deploy") {
    if (e.kind === "Profile") {
      if (
        !e.refs.length ||
        e.refs.some(
          (id) =>
            !state.entities.some(
              (g) =>
                g.kind === "Guardrail" && g.id === id && g.deployed !== null,
            ),
        )
      )
        throw new Error("Deploy all referenced Guardrails first.");
      validateThreshold(e.threshold);
      if (options.threshold !== undefined && options.threshold !== e.threshold)
        throw new Error(
          "Update the Profile threshold before testing and sign-off.",
        );
      e.deployedRefs = [...e.refs];
    }
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
export function addEntity(state: State, e: Entity): State {
  if (e.kind === "Profile") validateThreshold(e.threshold);
  if (!e.name.trim() || !e.description.trim())
    throw new Error("Name and description are required.");
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
  if (role === "Admin" && item.config) {
    const problem = configError(item.config);
    if (problem) throw new Error(problem);
  }
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
    mandatory: item.mandatory,
    refs: item.refs,
    attributes: item.attributes,
    threshold: item.threshold,
    updated: item.updated,
    runs: current.runs,
    policies: role === "Admin" ? item.policies : current.policies,
    ...(role === "Admin" && item.config ? { config: item.config } : {}),
    status: current.kind === "Guardrail" ? "DRAFT" : "TEST READY",
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
  if (role === "Admin" && item.config) {
    const problem = configError(item.config);
    if (problem) throw new Error(problem);
  }
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
  const statuses: Status[] = [
    "DEPLOYED",
    "DRAFT",
    "TEST READY",
    "TEST FAILED",
    "TEST PASSED",
    "SIGNOFF REQUESTED",
    "SIGNED OFF",
  ];
  const entities: Entity[] = [];
  for (const kind of ["Guardrail", "Profile"] as const)
    statuses.forEach((status, i) => {
      const id = `${kind === "Guardrail" ? "gr" : "pf"}-${["pii-all", "pii-sg", "pii-cn", "remittance", "customer-support", "risk-review", "financial-advice"][i]}`;
      const now = new Date(Date.now() - 3600000).toISOString();
      entities.push({
        id,
        kind,
        name: `${["Personal Identifiable Information Protection", "Personal Data Protection · Singapore", "Personal Data Protection · China", "Cross-border Remittance", "Customer Support Safety", "Risk Review", "Financial Advice Controls"][i]}`,
        description:
          "Protect personal data and ensure compliant responses across the selected business scope.",
        unit: i % 2 ? "RMG" : "ISS",
        location: i === 1 ? "SG" : i === 2 ? "CN" : "ALL",
        custodian: "Yann GUO",
        approver: "Feng ZONG",
        mandatory: i === 0,
        status:
          kind === "Profile" && status === "DRAFT" ? "TEST READY" : status,
        version: 1,
        deployed: status === "DEPLOYED" ? 1 : null,
        updated: now,
        policies: [
          "Detect personal identifiers in input and output.",
          "Block disclosure of unmasked customer information.",
        ],
        refs: kind === "Profile" ? ["gr-pii-all"] : [],
        deployedRefs:
          kind === "Profile" && status === "DEPLOYED" ? ["gr-pii-all"] : [],
        attributes: { bu: "ALL", agent: "ALL", data: "Personal" },
        runs: [
          "TEST PASSED",
          "SIGNOFF REQUESTED",
          "SIGNED OFF",
          "DEPLOYED",
          "TEST FAILED",
        ].includes(status)
          ? [
              {
                id: `run-${id}`,
                version: 1,
                base: null,
                dataset: "PII acceptance suite",
                cases: 24,
                passed: status !== "TEST FAILED",
                start: now,
                end: now,
              },
            ]
          : [],
        mode: "Normal",
        threshold: 5,
        ...(["SIGNED OFF", "DEPLOYED"].includes(status)
          ? { signedBy: "Feng ZONG" }
          : {}),
      });
    });
  return completeDemoState({ entities, audit: [] });
}
