import { expect, it } from "vitest";
import { seed as demoSeed, deployedEntity } from "./model";
import { profileScans } from "./monitoring";
import type { Entity } from "./model";
import {
  buildAlerts,
  monitoringHash,
  readMonitoringTarget,
  filterAlerts,
  defaultAlertFilters,
  profileAlertCounts,
} from "./alerts";

function seed() {
  const state = demoSeed();
  state.entities = state.entities.map((item) => item.kind === "Profile"
    ? { ...item, threshold: 5, thresholdMetric: undefined, thresholdWindow: undefined }
    : item);
  return state;
}

it("calculates the design's 90% Block Rate and 100% Pass Rate from shared mock scans", () => {
  const state = demoSeed();
  const now = Date.parse("2026-10-14T04:00:00Z");
  const profiles = state.entities.filter((item) => item.kind === "Profile");
  const scans = profiles.flatMap((profile) => profileScans(profile, state, now));
  // All ten samples per binding remain within the window throughout the minute.
  const breaches = buildAlerts(profiles, scans, now + 59_999).flatMap((alert) => alert.breach ? [alert.breach] : []);
  expect(breaches).toHaveLength(2);
  expect(breaches).toEqual(expect.arrayContaining([
    expect.objectContaining({ metric: "Block Rate", rate: 90, threshold: 80, windowMinutes: 5 }),
    expect.objectContaining({ metric: "Pass Rate", rate: 100, threshold: 85, windowMinutes: 5 }),
  ]));
});

it.each(["Block Rate", "Pass Rate"] as const)("evaluates %s only inside the configured window", (metric) => {
  const state = seed();
  const base = state.entities.find((e) => e.kind === "Profile")!;
  const profile: Entity = { ...base, mode: "Normal", thresholdMetric: metric, thresholdWindow: 5, threshold: 50 };
  const now = Date.parse("2026-10-14T03:00:00Z");
  const sample = profileScans(base, state)[0]!;
  const matched = metric === "Block Rate" ? "Blocked" : "Passed";
  const scans = [
    { ...sample, id: "recent-match", result: matched, time: new Date(now - 60_000).toISOString() },
    { ...sample, id: "boundary", result: "Detected", time: new Date(now - 300_000).toISOString() },
    { ...sample, id: "old", result: matched, time: new Date(now - 300_001).toISOString() },
    { ...sample, id: "future", result: matched, time: new Date(now + 1).toISOString() },
  ];
  expect(buildAlerts([profile], scans, now).filter((a) => a.level === "CRITICAL")).toHaveLength(0);
  const alerts = buildAlerts([{ ...profile, threshold: 49 }], scans, now);
  expect(alerts.find((a) => a.level === "CRITICAL")?.evidence).toContain("1 " + matched + " events / 2 checks");
  expect(alerts.find((a) => a.level === "CRITICAL")?.breach).toEqual({
    triggerTime: new Date(now - 60_000).toISOString(),
    profileName: profile.name,
    metric,
    rate: 50,
    threshold: 49,
    windowMinutes: 5,
  });
  expect(buildAlerts([profile], [], now)).toHaveLength(0);
});

it("keeps draft rate settings out of an older deployed revision after storage serialization", () => {
  const profile = seed().entities.find((e) => e.kind === "Profile")!;
  const oldRevision = { ...profile };
  delete oldRevision.thresholdMetric;
  delete oldRevision.thresholdWindow;
  const restored: Entity = JSON.parse(JSON.stringify({ ...profile, thresholdMetric: "Pass Rate", thresholdWindow: 2, revisions: { [profile.deployed!]: oldRevision } }));
  expect(deployedEntity(restored).thresholdMetric).toBeUndefined();
  expect(deployedEntity(restored).thresholdWindow).toBeUndefined();
});

it("separates actionable single-event alerts from aggregate error-rate breaches", () => {
  const state = seed();
  const profile = state.entities.find(
    (e) => e.id === "default-customer-assistant",
  )!;
  const scans = profileScans(profile, state);
  const alerts = buildAlerts([profile], scans);
  const aggregate = alerts.filter((a) => a.rule === "SCANNER_ERROR_RATE");
  expect(aggregate).toHaveLength(1);
  expect(aggregate[0]).toMatchObject({ level: "CRITICAL" });
  expect(aggregate[0]?.breach).toMatchObject({ profileName: profile.name, metric: "Error Rate", threshold: 5 });
  expect(aggregate[0]!.target).toBeUndefined();
  expect(aggregate[0]!.evidence).toContain(
    "2 Error events / 24 checks = 8.3% > 5%",
  );
  const singles = alerts.filter((a) => a.target);
  expect(singles).toHaveLength(6);
  expect(new Set(singles.map((a) => a.level))).toEqual(
    new Set(["WARNING", "INFO"]),
  );
  for (const alert of singles) {
    const scan = scans.find((s) => s.id === alert.target!.activity)!;
    expect(alert.target).toEqual({
      profile: scan.profile,
      guardrail: scan.guardrail,
      activity: scan.id,
    });
    expect(alert.evidence).toContain(String(scan.latency));
    if (scan.result !== "Error") expect(alert.reason).toContain(scan.policy!);
  }
});

it("uses the configured deployed threshold with a strict greater-than comparison", () => {
  const state = seed();
  const original = state.entities.find(
    (e) => e.id === "default-customer-assistant",
  )!;
  const scans = profileScans(original, state);
  const rate = (3 / 36) * 100;
  expect(
    buildAlerts([{ ...original, threshold: rate }], scans).some(
      (a) => a.level === "CRITICAL",
    ),
  ).toBe(false);
  const draft = {
    ...original,
    version: 2,
    threshold: 20,
    revisions: { 1: { ...original, threshold: 5 } },
  };
  expect(
    buildAlerts([deployedEntity(draft)], scans).some(
      (a) => a.level === "CRITICAL",
    ),
  ).toBe(true);
});

it("does not interpret forced blocks or bypass modes as policy-risk alerts", () => {
  const state = seed();
  const profiles = state.entities.filter(
    (e) => e.kind === "Profile" && ["Block all", "Pass all"].includes(e.mode),
  );
  expect(
    buildAlerts(
      profiles,
      profiles.flatMap((p) => profileScans(p, state)),
    ),
  ).toEqual([]);
});

it("restores complete activity targets from bookmarks and ignores log routes or partial targets", () => {
  const target = {
    profile: "pf-customer",
    guardrail: "gr-pii",
    activity: "pf-customer-v1-gr-pii-8",
  };
  expect(readMonitoringTarget(`#${monitoringHash(target)}`)).toEqual(target);
  expect(
    readMonitoringTarget(
      "#Profile/logs/?profile=pf-customer&guardrail=gr-pii&activity=id",
    ),
  ).toBeNull();
  expect(
    readMonitoringTarget("#Profile/operations/?profile=pf-customer"),
  ).toBeNull();
});

it("combines alert filters and counts only critical and warning alerts per Profile", () => {
  const state = seed();
  const profiles = state.entities.filter(
    (item) => item.kind === "Profile" && item.deployed !== null,
  );
  const alerts = buildAlerts(
    profiles,
    profiles.flatMap((profile) => profileScans(profile, state)),
  );
  const filtered = filterAlerts(alerts, {
    level: "INFO",
    profile: "default-customer-assistant",
    guardrail: "default-banking-restrictions",
  });
  expect(filtered).toHaveLength(1);
  expect(filtered[0]!.target?.activity).toBe(
    "default-customer-assistant-v1-default-banking-restrictions-5",
  );
  expect(filterAlerts(alerts, defaultAlertFilters)).toEqual(alerts);
  expect(profileAlertCounts(alerts, "default-customer-assistant")).toEqual({
    critical: 1,
    warning: 4,
  });
  expect(profileAlertCounts(alerts, "default-internal-assistant")).toEqual({
    critical: 1,
    warning: 4,
  });
  expect(
    filterAlerts(alerts, { ...defaultAlertFilters, profile: "pf-missing" }),
  ).toEqual([]);
});
