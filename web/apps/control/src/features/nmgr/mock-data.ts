import type { Entity, State, Run } from "./model";

// Rename retired demo accounts without changing configurations or audit evidence.
export function normalizeDemoAccounts(state: State): State {
  const rename = (name: string) =>
    /^(it\s*admin|line\s*1\.5|line\s*2|l1 deployer|tech team)$/i.test(
      name.trim(),
    )
      ? "Admin"
      : name;
  let changed = false;
  const entities = state.entities.map((item) => {
    const custodian = rename(item.custodian);
    const approver = rename(item.approver);
    const signedBy = item.signedBy && rename(item.signedBy);
    if (
      custodian === item.custodian &&
      approver === item.approver &&
      signedBy === item.signedBy
    )
      return item;
    changed = true;
    return { ...item, custodian, approver, ...(signedBy ? { signedBy } : {}) };
  });
  const audit = state.audit.map((entry) => {
    const actor = rename(entry.actor);
    if (actor === entry.actor) return entry;
    changed = true;
    return { ...entry, actor };
  });
  return changed ? { ...state, entities, audit } : state;
}

// Add only missing fixtures and migrate retired account labels in saved data.
export function completeDemoState(state: State): State {
  state = normalizeDemoAccounts(state);
  const deployedAt = new Date(Date.now() - 3600000).toISOString();
  const guards = [
    [
      "injection",
      "Prompt Injection",
      "Ignore previous instructions",
      "Detect instruction override attempts.",
    ],
    [
      "credentials",
      "Credential Protection",
      "password|api[_-]?key",
      "Block disclosure of passwords and API keys.",
    ],
    [
      "financial",
      "Financial Advice",
      "guaranteed return",
      "Detect unsupported guarantees in financial advice.",
    ],
    [
      "abuse",
      "Abusive Content",
      "synthetic-abuse",
      "Block the synthetic abusive-content marker.",
    ],
  ].map(([slug, name, content, policy], i): Entity => ({
    id: `gr-demo-${slug}`,
    kind: "Guardrail",
    name: `${name} (Demo)`,
    description: `${policy} Deterministic fixture for frontend walkthroughs.`,
    unit: ["ISS", "LCS", "RMG", "ISS"][i]!,
    location: "ALL",
    custodian: "Admin",
    approver: "Admin",
    mandatory: false,
    status: "DEPLOYED",
    version: 1,
    deployed: 1,
    deployedAt,
    updated: deployedAt,
    policies: [policy!],
    refs: [],
    deployedRefs: [],
    attributes: { bu: "ALL", agent: "ALL", data: "Personal" },
    runs: [],
    mode: "Normal",
    threshold: 5,
    signedBy: "Admin",
    config: {
      scannerType: "regex",
      direction: "response",
      content: content!,
      versionName: "v1",
      versionDescription: "Synthetic demo configuration",
    },
  }));
  const { config: _config, ...base } = guards[0]!;
  const profiles = (
    [
      [
        "normal",
        "Customer Support",
        "Normal",
        "ISS",
        "SG",
        ["gr-pii-all", guards[0]!.id, guards[1]!.id],
      ],
      [
        "bypass",
        "Internal Assistant",
        "Pass all",
        "LCS",
        "CN",
        ["gr-pii-all", guards[3]!.id],
      ],
      [
        "block",
        "Financial Review",
        "Block all",
        "RMG",
        "ALL",
        ["gr-pii-all", guards[2]!.id],
      ],
    ] as const
  ).map(([slug, name, mode, unit, location, refs]): Entity => ({
    ...base,
    id: `pf-demo-${slug}`,
    kind: "Profile",
    name: `${name} (Demo)`,
    description: `Demonstrates ${mode} with multiple deployed Guardrails. Synthetic traffic only.`,
    unit,
    location,
    custodian: unit,
    mode,
    policies: [],
    refs: [...refs],
    deployedRefs: [...refs],
    attributes: {
      bu: "CBG",
      agent: "Customer",
      data: slug === "block" ? "Financial" : "Personal",
    },
  }));
  const available = new Set([...state.entities, ...guards].map((e) => e.id));
  const fixtures = [
    ...guards,
    ...profiles.filter((p) => p.refs.every((id) => available.has(id))),
  ];
  const additions = fixtures.filter(
    (item) => !state.entities.some((e) => e.id === item.id),
  );
  const history = additions.flatMap((item) => {
    const actions = [
      "created",
      ...(item.kind === "Guardrail" ? ["implement"] : []),
      "test-fail",
      "test-pass",
      "request",
      "approve",
      "deploy",
      ...(item.mode !== "Normal" ? [item.mode] : []),
    ];
    const timeAt = (index: number) =>
      new Date(
        Date.parse(deployedAt) - (actions.length - 1 - index) * 60000,
      ).toISOString();
    item.deployedAt = timeAt(actions.indexOf("deploy"));
    item.runs = [true, false].map((passed): Run => ({
      id: `run-${item.id}-${passed ? "pass" : "fail"}`,
      version: 1,
      base: null,
      dataset: "Synthetic acceptance suite (Demo)",
      cases: 24,
      passed,
      start: timeAt(actions.indexOf(passed ? "test-pass" : "test-fail")),
      end: timeAt(actions.indexOf(passed ? "test-pass" : "test-fail")),
    }));
    return actions.map((action, index) => ({
      id: `audit-${item.id}-${index}`,
      time: timeAt(index),
      entity: item.id,
      action,
      actor: ["implement", "approve", "deploy"].includes(action)
        ? "Admin"
        : item.custodian,
    }));
  });
  return additions.length
    ? {
        entities: [...state.entities, ...additions],
        audit: [
          ...state.audit,
          ...history.filter(
            (entry) => !state.audit.some((saved) => saved.id === entry.id),
          ),
        ]
          .sort((a, b) => b.time.localeCompare(a.time))
          .slice(0, 500),
      }
    : state;
}
