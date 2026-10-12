import { expect, it } from "vitest";
import {
  seed,
  addEntity,
  deployedEntity,
  reviseEntity,
  transition,
} from "./model";
import { completeDemoState, normalizeDemoAccounts } from "./mock-data";
import { profileScans } from "./monitoring";

it("fills deployed examples, technical configurations and lifecycle evidence without replacing saved data", () => {
  const state = seed();
  const samples = state.entities.filter((e) => e.id.includes("-demo-"));
  expect(samples).toHaveLength(7);
  for (const item of samples) {
    expect(item.runs[0]?.passed).toBe(true);
    expect(item.runs[1]?.passed).toBe(false);
    expect(
      state.audit.filter((a) => a.entity === item.id).map((a) => a.action),
    ).toContain("approve");
    if (item.kind === "Guardrail") expect(item.config?.content).toBeTruthy();
    else expect(item.deployedRefs.length).toBeGreaterThan(1);
  }
  expect(
    new Set(samples.filter((e) => e.kind === "Profile").map((e) => e.mode)),
  ).toEqual(new Set(["Normal", "Pass all", "Block all"]));
  expect(completeDemoState(state)).toBe(state);
  const normal = state.entities.find((e) => e.id === "pf-demo-normal")!;
  const saved = {
    entities: [
      { ...normal, name: "My saved profile", threshold: 17 },
      ...state.entities.filter(
        (e) => e.id !== normal.id && e.id !== "gr-demo-abuse",
      ),
    ],
    audit: state.audit,
  };
  const filled = completeDemoState(saved);
  expect(filled.entities[0]).toEqual(saved.entities[0]);
  expect(filled.audit.filter((a) => a.entity === normal.id)).toEqual(
    saved.audit.filter((a) => a.entity === normal.id),
  );
  expect(filled.entities.some((e) => e.id === "gr-demo-abuse")).toBe(true);
});

it("validates the creation threshold, signs off that value, and keeps the deployed threshold while revising", () => {
  const state = seed(),
    profile = state.entities.find((e) => e.id === "pf-pii-all")!;
  for (const threshold of [NaN, -1, 101])
    expect(() =>
      addEntity(state, { ...profile, id: "pf-invalid-threshold", threshold }),
    ).toThrow("threshold");
  const next = reviseEntity(state, { ...profile, threshold: 12 }, "Custodian");
  const draft = next.entities.find((e) => e.id === profile.id)!;
  expect(draft.threshold).toBe(12);
  expect(deployedEntity(draft).threshold).toBe(5);
  let signed = transition(next, profile.id, "test-pass", "Tech", {
    dataset: "Demo",
    cases: 24,
  });
  signed = transition(signed, profile.id, "request", "Custodian");
  signed = transition(signed, profile.id, "approve", "Approver");
  expect(() =>
    transition(signed, profile.id, "deploy", "Deployer", { threshold: 20 }),
  ).toThrow("sign-off");
  const deployed = transition(signed, profile.id, "deploy", "Deployer");
  expect(
    deployedEntity(deployed.entities.find((e) => e.id === profile.id)!)
      .threshold,
  ).toBe(12);
});

it("offers all outcomes in normal traffic and an empty scan state in bypass mode", () => {
  const state = seed();
  const normal = state.entities.find((e) => e.id === "pf-demo-normal")!;
  expect(new Set(profileScans(normal, state).map((s) => s.result))).toEqual(
    new Set(["Passed", "Blocked", "Detected", "Error"]),
  );
  expect(
    profileScans(
      state.entities.find((e) => e.id === "pf-demo-bypass")!,
      state,
    ),
  ).toEqual([]);
});

it("never places newly deployed mock activity in the future", () => {
  const state = seed();
  const now = new Date().toISOString();
  const profile = {
    ...state.entities.find((e) => e.id === "pf-demo-normal")!,
    deployedAt: now,
  };
  const scans = profileScans(profile, state);
  const observedAt = Date.now();
  expect(
    scans.every(
      (s) =>
        Date.parse(s.time) >= Date.parse(now) &&
        Date.parse(s.time) <= observedAt,
    ),
  ).toBe(true);
});

it("migrates retired actors and ownership without replacing saved workflow evidence", () => {
  const current = seed();
  const entity = {
    ...current.entities[0]!,
    custodian: "IT Admin",
    approver: "line2",
    signedBy: "Line 2",
  };
  const audit = ["IT Admin", "Line 1.5", "line2", "ISS"].map((actor, i) => ({
    id: `migration-${i}`,
    entity: entity.id,
    action: "deploy",
    actor,
    time: "2026-10-12T00:00:00Z",
  }));
  const original = { entities: [entity], audit };
  const migrated = normalizeDemoAccounts(original);
  expect(migrated.entities[0]).toEqual({
    ...entity,
    custodian: "Admin",
    approver: "Admin",
    signedBy: "Admin",
  });
  expect(migrated.entities[0]!.runs).toBe(entity.runs);
  expect(migrated.audit).toEqual(
    audit.map((entry, i) => ({ ...entry, actor: i < 3 ? "Admin" : "ISS" })),
  );
  expect(original.entities[0]!.custodian).toBe("IT Admin");
  expect(normalizeDemoAccounts(migrated)).toBe(migrated);
  expect(
    completeDemoState(original).audit.filter((entry) =>
      entry.id.startsWith("migration-"),
    ),
  ).toEqual(migrated.audit);
});
