import { expect, it } from "vitest";
import { seed, deployedEntity, reviseEntity, transition } from "./model";
import { defaultDemo } from "../business-demo/default-demo";
import { completeDemoState } from "./mock-data";
it("uses exactly the v0.2.17 examples with original requirements, prompts and bindings", () => {
  const state = seed(),
    original = defaultDemo();
  expect(state.entities.map((e) => e.id)).toEqual(original.map((e) => e.id));
  expect(state.entities).toHaveLength(5);
  for (const e of state.entities) {
    const source = original.find((x) => x.id === e.id)!;
    expect(e.name).toBe(source.name);
    expect(e.runs[0]?.tester).toBe(
      e.kind === "Guardrail" ? "IT Admin" : undefined,
    );
    if (e.kind === "Guardrail") {
      expect(e.config).toEqual(source.workflow!.config);
      expect(e.description).toBe(source.text);
    } else expect(e.refs).toEqual(source.policies.map((p) => p.policyId));
  }
  expect(completeDemoState(state)).toEqual(state);
});
it("retains saved records without injecting extra fixtures", () => {
  const state = seed();
  state.entities = state.entities.slice(0, 1);
  expect(completeDemoState(state)).toEqual(state);
  expect(state.entities).toHaveLength(1);
});
it("repairs legacy LCS examples and missing profile dependencies without replacing user edits", () => {
  const saved = seed();
  const guard = saved.entities[0]!;
  guard.unit = "LCS";
  guard.description = "An edited business requirement";
  const removedId = saved.entities[2]!.id;
  saved.entities = saved.entities.filter((item) => item.id !== removedId);
  const migrated = completeDemoState(saved);
  expect(new Set(migrated.audit.map((entry) => entry.id)).size).toBe(
    migrated.audit.length,
  );
  expect(migrated.entities.find((item) => item.id === guard.id)).toMatchObject({
    unit: "ISS",
    description: guard.description,
  });
  for (const profile of migrated.entities.filter(
    (item) => item.kind === "Profile",
  )) {
    for (const id of [...profile.refs, ...profile.deployedRefs]) {
      expect(migrated.entities.find((item) => item.id === id)).toMatchObject({
        kind: "Guardrail",
        unit: "ISS",
      });
    }
  }
  expect(completeDemoState(migrated)).toEqual(migrated);
});
it("keeps the signed threshold and active snapshot during a revision", () => {
  let state = seed();
  const old = state.entities.find((e) => e.kind === "Profile")!;
  state = reviseEntity(state, { ...old, threshold: 12 }, "User");
  expect(
    deployedEntity(state.entities.find((e) => e.id === old.id)!).threshold,
  ).toBe(old.threshold);
  state = transition(state, old.id, "request", "User");
  state = transition(state, old.id, "approve", "User Admin");
  expect(
    deployedEntity(state.entities.find((e) => e.id === old.id)!).threshold,
  ).toBe(12);
});

it("upgrades legacy mock SLO settings and snapshots without changing configured rules", () => {
  const state = seed();
  const profile = state.entities.find((item) => item.kind === "Profile")!;
  const legacy = { ...profile, threshold: 5, thresholdMetric: undefined, thresholdWindow: undefined };
  state.entities = [{ ...legacy, revisions: { 1: { ...legacy } } },
    { ...profile, id: "authored", thresholdMetric: "Pass Rate", threshold: 92, thresholdWindow: 2 }];
  const migrated = completeDemoState(state);
  expect(deployedEntity(migrated.entities[0]!)).toMatchObject({ thresholdMetric: "Pass Rate", threshold: 85, thresholdWindow: 5 });
  expect(migrated.entities[1]).toMatchObject({ thresholdMetric: "Pass Rate", threshold: 92, thresholdWindow: 2 });
  expect(completeDemoState(migrated)).toEqual(migrated);
});
