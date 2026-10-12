import { describe, expect, it } from "vitest";
import { seed, transition, addEntity, editEntity, reviseEntity } from "./model";
describe("NMGR prototype lifecycle", () => {
  it("requires tests and sign-off before deployment, preserving deployed version while revising", () => {
    let s = seed();
    const id = "gr-pii-sg";
    expect(() => transition(s, id, "deploy", "Deployer")).toThrow();
    s = transition(s, id, "implement", "Tech", {
      policies: ["Mask personal identifiers"],
    });
    s = transition(s, id, "test-fail", "Custodian", {
      dataset: "PII",
      cases: 5,
    });
    expect(() => transition(s, id, "request", "Custodian")).toThrow();
    s = transition(s, id, "test-pass", "Custodian", {
      dataset: "PII",
      cases: 5,
    });
    s = transition(s, id, "request", "Custodian");
    expect(() => transition(s, id, "approve", "Custodian")).toThrow();
    s = transition(s, id, "approve", "Approver");
    s = transition(s, id, "deploy", "Deployer");
    s = transition(s, id, "revise", "Custodian");
    expect(s.entities.find((e) => e.id === id)).toMatchObject({
      deployed: 1,
      version: 2,
      status: "DRAFT",
    });
    expect(s.entities.find((e) => e.id === id)!.runs).toHaveLength(2);
    expect(() => transition(s, id, "request", "Custodian")).toThrow();
  });
  it("rejects duplicate ids and requires a deployed Guardrail for profiles", () => {
    const s = seed();
    expect(() => addEntity(s, s.entities[0]!)).toThrow("taken");
    const p = s.entities.find((e) => e.kind === "Profile")!;
    expect(() =>
      addEntity(s, { ...p, id: "new-profile", refs: ["gr-pii-sg"] }),
    ).toThrow("deployed");
  });
  it("invalidates evidence on edit and forces rejected requests back through tests", () => {
    let s = seed();
    const id = "gr-risk-review";
    s = transition(s, id, "reject", "Approver", {
      reason: "Recheck data coverage",
    });
    expect(() => transition(s, id, "request", "Custodian")).toThrow();
    const current = s.entities.find((e) => e.id === "gr-customer-support")!;
    s = editEntity(
      s,
      { ...current, description: "Changed requirements" },
      "Custodian",
    );
    expect(s.entities.find((e) => e.id === current.id)).toMatchObject({
      status: "DRAFT",
    });
  });
  it("only allows operators to change deployed profiles and preserves deployed references", () => {
    let s = seed();
    expect(() => transition(s, "pf-pii-sg", "Block all", "Operator")).toThrow();
    expect(() =>
      transition(s, "pf-pii-all", "Block all", "Custodian"),
    ).toThrow();
    s = transition(s, "pf-pii-all", "Block all", "Operator");
    s = transition(s, "pf-pii-all", "revise", "Custodian");
    expect(s.entities.find((e) => e.id === "pf-pii-all")).toMatchObject({
      deployed: 1,
      mode: "Block all",
      deployedRefs: ["gr-pii-all"],
    });
  });
  it("validates profile deployment threshold and logs successful actions only", () => {
    const s = seed();
    expect(() =>
      transition(s, "pf-financial-advice", "deploy", "Deployer", {
        threshold: 101,
      }),
    ).toThrow();
    const next = transition(s, "pf-financial-advice", "deploy", "Deployer", {
      threshold: 5,
    });
    expect(next.audit).toHaveLength(s.audit.length + 1);
    expect(next.audit[0]!.action).toBe("deploy");
  });
});

import { roleForOwner, allowed } from "./model";
it("keeps account choices usable without bypassing lifecycle gates", () => {
  const state = seed();
  const draft = state.entities.find((e) => e.id === "gr-pii-sg")!;
  expect(allowed(draft, "deploy", roleForOwner("Admin"))).toBe(false);
  expect(allowed(draft, "implement", roleForOwner("Admin"))).toBe(true);
  expect(allowed(draft, "implement", roleForOwner("ISS"))).toBe(false);
  const active = state.entities.find((e) => e.id === "pf-pii-all")!;
  expect(allowed(active, "Block all", roleForOwner("ISS"))).toBe(true);
});
it("profiles reference Guardrails, keep their Policies nested, and require mandatory bindings", () => {
  const s = seed();
  const p = s.entities.find((e) => e.kind === "Profile")!;
  const guard = s.entities[0]!;
  expect(() =>
    addEntity(s, {
      ...p,
      id: "profile-invalid-policy",
      refs: [guard.policies[0]!],
    }),
  ).toThrow("deployed");
  const optional = { ...guard, id: "optional-guard", mandatory: false };
  const withOptional = { ...s, entities: [...s.entities, optional] };
  expect(() =>
    addEntity(withOptional, {
      ...p,
      id: "profile-missing-required",
      refs: [optional.id],
    }),
  ).toThrow("mandatory");
  const created = addEntity(withOptional, {
    ...p,
    id: "profile-composed",
    refs: [guard.id, optional.id],
  });
  expect(created.entities[0]!.refs).toEqual([guard.id, optional.id]);
  expect(created.entities.find((e) => e.id === guard.id)!.policies).toEqual(
    guard.policies,
  );
});

it("keeps every run across versions, edits and withdrawal without reusing old evidence", () => {
  let state = seed();
  const id = "pf-pii-all";
  const old = state.entities.find((e) => e.id === id)!;
  state = reviseEntity(state, { ...old, name: "Revised profile" }, "Custodian");
  let item = state.entities.find((e) => e.id === id)!;
  expect(item).toMatchObject({
    version: 2,
    deployed: 1,
    name: "Revised profile",
    status: "TEST READY",
  });
  expect(item.runs).toEqual(old.runs);
  expect(item.revisions?.[1]?.name).toBe(old.name);
  expect(() => transition(state, id, "request", "Custodian")).toThrow();
  for (let i = 0; i < 7; i++)
    state = transition(state, id, "test-pass", "Custodian", {
      dataset: "PII",
      cases: 24,
    });
  item = state.entities.find((e) => e.id === id)!;
  expect(item.runs).toHaveLength(8);
  state = transition(state, id, "withdraw", "Custodian");
  expect(state.entities.find((e) => e.id === id)!.runs).toHaveLength(8);
  expect(() => transition(state, id, "request", "Custodian")).toThrow();
  state = editEntity(
    state,
    {
      ...state.entities.find((e) => e.id === id)!,
      description: "Changed scope",
    },
    "Custodian",
  );
  expect(state.entities.find((e) => e.id === id)!.runs).toHaveLength(8);
  expect(() => transition(state, id, "request", "Custodian")).toThrow();
});
it("saves technical changes atomically while preserving the deployed Guardrail snapshot", () => {
  const state = seed(),
    old = state.entities.find((e) => e.id === "gr-pii-all")!;
  const config = {
    scannerType: "regex" as const,
    direction: "response" as const,
    content: "[",
    versionName: "v2",
    versionDescription: "Updated protection",
  };
  expect(() => reviseEntity(state, { ...old, config }, "Admin")).toThrow(
    "regular expression",
  );
  expect(state.entities.find((e) => e.id === old.id)).toBe(old);
  const next = reviseEntity(
    state,
    {
      ...old,
      policies: ["New policy"],
      config: { ...config, content: "test" },
    },
    "Admin",
  );
  const item = next.entities.find((e) => e.id === old.id)!;
  expect(item).toMatchObject({
    version: 2,
    deployed: 1,
    policies: ["New policy"],
    config: { content: "test" },
  });
  expect(item.revisions?.[1]?.policies).toEqual(old.policies);
  expect(item.runs).toEqual(old.runs);
});
