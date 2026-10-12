import { expect, it } from "vitest";
import { seed, reviseEntity } from "./model";
import { profileScans, scanMetrics } from "./monitoring";

it("monitors every deployed binding and ignores un-deployed draft bindings", () => {
  const state = seed();
  const profile = state.entities.find((e) => e.id === "pf-pii-all")!;
  const extra = { ...state.entities[0]!, id: "extra-guard", mandatory: false };
  const next = reviseEntity(
    { ...state, entities: [...state.entities, extra] },
    { ...profile, refs: [...profile.refs, extra.id] },
    "Custodian",
  );
  const draft = next.entities.find((e) => e.id === profile.id)!;
  expect(profileScans(draft, next)).toEqual(profileScans(profile, state));
  expect(
    profileScans(
      { ...draft, deployedRefs: [...draft.deployedRefs, extra.id] },
      next,
    ),
  ).toHaveLength(24);
});
it("uses the same scan aggregates for monitoring and dashboard and handles bypass", () => {
  const state = seed();
  const profile = state.entities.find((e) => e.id === "pf-pii-all")!;
  const scans = profileScans(profile, state);
  expect(scanMetrics(scans)).toMatchObject({
    count: 12,
    errors: 1,
    blocked: 1,
    detected: 2,
  });
  expect(profileScans({ ...profile, mode: "Pass all" }, state)).toEqual([]);
  expect(scanMetrics([])).toEqual({
    count: 0,
    errors: 0,
    blocked: 0,
    detected: 0,
    average: 0,
  });
});
