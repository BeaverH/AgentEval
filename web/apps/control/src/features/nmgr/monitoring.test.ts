import { expect, it } from "vitest";
import { seed, reviseEntity } from "./model";
import { profileScans, scanMetrics } from "./monitoring";

it("keeps old deployed mock bindings inside the current dashboard window", () => {
  const state = seed();
  const profile = state.entities.find((entity) => entity.kind === "Profile")!;
  const now = Date.parse("2026-10-14T04:00:00Z");
  const scans = profileScans({ ...profile, deployedAt: "2020-01-01T00:00:00Z" }, state, now);
  expect(scans.length).toBeGreaterThan(0);
  expect(scans.every((scan) => now - Date.parse(scan.time) >= 0 && now - Date.parse(scan.time) <= 10 * 60_000)).toBe(true);
  const blocked = profileScans({ ...profile, mode: "Block all" }, state, now);
  expect(scanMetrics(blocked).blocked).toBe(scans.length);
  expect(profileScans({ ...profile, mode: "Pass all" }, state, now)).toEqual([]);
});

it("monitors every deployed binding and ignores un-deployed draft bindings", () => {
  const state = seed();
  const profile = state.entities.find(
    (e) => e.id === "default-customer-assistant",
  )!;
  const extra = { ...state.entities[0]!, id: "extra-guard", mandatory: false };
  const next = reviseEntity(
    { ...state, entities: [...state.entities, extra] },
    { ...profile, refs: [...profile.refs, extra.id] },
    "User",
  );
  const draft = next.entities.find((e) => e.id === profile.id)!;
  expect(profileScans(draft, next)).toEqual(profileScans(profile, state));
  expect(
    profileScans(
      { ...draft, deployedRefs: [...draft.deployedRefs, extra.id] },
      next,
    ),
  ).toHaveLength(30);
});
it("uses the same scan aggregates for monitoring and dashboard and handles bypass", () => {
  const state = seed();
  const profile = state.entities.find(
    (e) => e.id === "default-customer-assistant",
  )!;
  const scans = profileScans(profile, state);
  expect(scanMetrics(scans)).toMatchObject({
    count: 20,
    errors: 0,
    blocked: 0,
    detected: 0,
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
