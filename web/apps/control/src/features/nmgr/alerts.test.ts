import { expect, it } from "vitest";
import { seed, deployedEntity } from "./model";
import { profileScans } from "./monitoring";
import {
  buildAlerts,
  monitoringHash,
  readMonitoringTarget,
  filterAlerts,
  defaultAlertFilters,
  profileAlertCounts,
} from "./alerts";

it("separates actionable single-event alerts from aggregate error-rate breaches", () => {
  const state = seed();
  const profile = state.entities.find((e) => e.id === "pf-demo-normal")!;
  const scans = profileScans(profile, state);
  const alerts = buildAlerts([profile], scans);
  const aggregate = alerts.filter((a) => a.rule === "SCANNER_ERROR_RATE");
  expect(aggregate).toHaveLength(1);
  expect(aggregate[0]).toMatchObject({ level: "CRITICAL" });
  expect(aggregate[0]!.target).toBeUndefined();
  expect(aggregate[0]!.evidence).toContain(
    "3 Error events / 36 checks = 8.3% > 5%",
  );
  const singles = alerts.filter((a) => a.target);
  expect(singles).toHaveLength(9);
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
  const original = state.entities.find((e) => e.id === "pf-demo-normal")!;
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
    profile: "pf-demo-normal",
    guardrail: "gr-demo-injection",
  });
  expect(filtered).toHaveLength(1);
  expect(filtered[0]!.target?.activity).toBe(
    "pf-demo-normal-v1-gr-demo-injection-5",
  );
  expect(filterAlerts(alerts, defaultAlertFilters)).toEqual(alerts);
  expect(profileAlertCounts(alerts, "pf-demo-normal")).toEqual({
    critical: 1,
    warning: 6,
  });
  expect(profileAlertCounts(alerts, "pf-demo-bypass")).toEqual({
    critical: 0,
    warning: 0,
  });
  expect(
    filterAlerts(alerts, { ...defaultAlertFilters, profile: "pf-missing" }),
  ).toEqual([]);
});
