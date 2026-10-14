import { defaultDemo } from "../business-demo/default-demo";
import type { Entity, State } from "./model";

function demoSlo(id: string) {
  return {
    thresholdMetric: id === "default-customer-assistant" ? "Pass Rate" as const : "Block Rate" as const,
    threshold: id === "default-customer-assistant" ? 85 : 80,
    thresholdWindow: 5,
  };
}

// Upgrade the old, implicit 5% error-rate sample without replacing authored rules.
function migrateDemoSlo(item: Entity): Entity {
  if (item.kind !== "Profile") return item;
  const upgrade = <T extends { threshold?: number; thresholdMetric?: string }>(value: T): T =>
    value.thresholdMetric === undefined && value.threshold === 5
      ? { ...value, ...demoSlo(item.id) }
      : value;
  return {
    ...upgrade(item),
    ...(item.revisions ? {
      revisions: Object.fromEntries(Object.entries(item.revisions).map(([version, revision]) => [version, upgrade(revision)])),
    } : {}),
  };
}

// v0.2.17 calls atomic guardrails "policies" and composed profiles "guardrails".
// Preserve its real requirements, scanner prompts, scope and reference bindings.
export function defaultNmgrDemo(now = Date.now()): State {
  const source = defaultDemo(now);
  const time = new Date(now - 3600000).toISOString();
  const entities = source.map((item): Entity => {
    const guard = item.kind === "policies";
    const refs = guard ? [] : item.policies.map((p) => p.policyId);
    return {
      id: item.id,
      kind: guard ? "Guardrail" : "Profile",
      name: item.name,
      description: guard ? item.text : item.useCase,
      // These linked examples belong to the ISS workbench in the NMGR demo.
      unit: "ISS",
      location: guard ? "ALL" : item.location,
      custodian: "User",
      approver: "User Admin",
      mandatory: item.mandatory ?? false,
      status: guard ? "DEPLOYED" : "SIGNED OFF",
      version: 1,
      deployed: 1,
      updated: time,
      deployedAt: time,
      configurationRevision: 1,
      policies: guard ? [item.text] : [],
      refs,
      deployedRefs: [...refs],
      attributes: {
        bu: guard ? "ALL" : item.busu,
        agent: guard ? "ALL" : item.agentType,
        data: guard ? "Personal data" : item.dataType,
      },
      runs: guard
        ? [
            {
              id: `run-${item.id}`,
              version: 1,
              configurationRevision: 1,
              tester: "IT Admin",
              base: null,
              dataset: `${item.name} acceptance suite`,
              passed: true,
              start: time,
              end: time,
              cases: 24,
            },
          ]
        : [],
      mode: "Normal",
      threshold: 5,
      ...(!guard ? demoSlo(item.id) : {}),
      signedBy: "User Admin",
      ...(guard && item.workflow?.config
        ? { config: item.workflow.config }
        : {}),
    };
  });
  return {
    entities,
    audit: entities.flatMap((item) =>
      (item.kind === "Guardrail"
        ? ["created", "implement", "test-pass", "request", "approve", "deploy"]
        : ["created", "request", "approve"]
      ).map((action, i) => ({
        id: `audit-${item.id}-${i}`,
        entity: item.id,
        action,
        time,
        actor: ["implement", "test-pass", "deploy"].includes(action)
          ? "IT Admin"
          : action === "approve"
            ? "User Admin"
            : "User",
      })),
    ),
  };
}
// Repair only the built-in examples; preserve authored entities and lifecycle data.
export function completeDemoState(state: State): State {
  const defaults = defaultNmgrDemo();
  const builtinGuards = defaults.entities.filter(
    (item) => item.kind === "Guardrail",
  );
  const missing = builtinGuards.filter(
    (guard) =>
      !state.entities.some((item) => item.id === guard.id) &&
      state.entities.some(
        (item) =>
          item.kind === "Profile" &&
          [...item.refs, ...item.deployedRefs].includes(guard.id),
      ),
  );
  return {
    ...state,
    audit: [
      ...state.audit,
      ...defaults.audit.filter(
        (entry) =>
          missing.some((item) => item.id === entry.entity) &&
          !state.audit.some((saved) => saved.id === entry.id),
      ),
    ],
    entities: [...state.entities, ...missing].map(migrateDemoSlo).map((item): Entity =>
      item.kind !== "Profile"
        ? builtinGuards.some((guard) => guard.id === item.id) &&
          item.unit === "LCS"
          ? {
              ...item,
              unit: "ISS",
              ...(item.revisions
                ? {
                    revisions: Object.fromEntries(
                      Object.entries(item.revisions).map(
                        ([version, revision]) => [
                          version,
                          revision.unit === "LCS"
                            ? { ...revision, unit: "ISS" }
                            : revision,
                        ],
                      ),
                    ),
                  }
                : {}),
            }
          : item
        : {
            ...item,
            status:
              item.status === "DEPLOYED"
                ? "SIGNED OFF"
                : ["TEST READY", "TEST PASSED", "TEST FAILED"].includes(
                      item.status,
                    )
                  ? "DRAFT"
                  : item.status,
            ...(item.status === "SIGNED OFF" && item.deployed !== item.version
              ? {
                  deployed: item.version,
                  deployedRefs: [...item.refs],
                  deployedAt: item.updated,
                }
              : {}),
          },
    ),
  };
}
