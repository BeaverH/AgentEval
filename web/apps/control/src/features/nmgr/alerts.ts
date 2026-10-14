import type { Entity } from "./model";
import type { Scan } from "./monitoring";

export type MonitoringTarget = {
  profile: string;
  guardrail: string;
  activity: string;
};
export type Alert = {
  id: string;
  level: "INFO" | "WARNING" | "CRITICAL";
  event: string;
  profile: string;
  guardrail: string;
  rule: string;
  reason: string;
  evidence: string;
  breach?: {
    triggerTime: string;
    profileName: string;
    metric: string;
    rate: number;
    threshold: number;
    windowMinutes?: number;
  };
  target?: MonitoringTarget;
};

export type AlertFilters = {
  level: Alert["level"] | "All";
  profile: string;
  guardrail: string;
};
export const defaultAlertFilters: AlertFilters = {
  level: "All",
  profile: "All",
  guardrail: "All",
};
export function filterAlerts(alerts: Alert[], filters: AlertFilters) {
  return alerts.filter(
    (alert) =>
      (filters.level === "All" || alert.level === filters.level) &&
      (filters.profile === "All" || alert.profile === filters.profile) &&
      (filters.guardrail === "All" || alert.guardrail === filters.guardrail),
  );
}
export function profileAlertCounts(alerts: Alert[], profile: string) {
  const matching = alerts.filter((alert) => alert.profile === profile);
  return {
    critical: matching.filter((alert) => alert.level === "CRITICAL").length,
    warning: matching.filter((alert) => alert.level === "WARNING").length,
  };
}

export const alertCriteria = [
  ["INFO", "One policy detection recorded for review (Detected)."],
  [
    "WARNING",
    "One policy match blocked, or one scanner execution error (Blocked / Error).",
  ],
  [
    "CRITICAL",
    "A deployed Profile exceeds its configured rate threshold within the selected time window. Legacy Profiles use scanner error percentage across the demo snapshot.",
  ],
] as const;

export function buildAlerts(profiles: Entity[], scans: Scan[], now = Date.now()): Alert[] {
  const alerts: Alert[] = [];
  for (const profile of profiles) {
    if (profile.mode !== "Normal") continue;
    const checks = scans.filter((s) => s.profile === profile.id);
    const errors = checks.filter((s) => s.result === "Error");
    const errorRate = checks.length ? (errors.length / checks.length) * 100 : 0;
    if (profile.thresholdMetric) {
      const windowMinutes = profile.thresholdWindow ?? 5;
      const recent = checks.filter((scan) => {
        const age = now - Date.parse(scan.time);
        return age >= 0 && age <= windowMinutes * 60_000;
      });
      const result = profile.thresholdMetric === "Block Rate" ? "Blocked" : profile.thresholdMetric === "Pass Rate" ? "Passed" : "Error";
      const count = recent.filter((scan) => scan.result === result).length;
      const rate = recent.length ? count / recent.length * 100 : 0;
      if (rate > profile.threshold) alerts.push({
        id: `slo-rate-${profile.id}`,
        level: "CRITICAL",
        event: `${profile.thresholdMetric} exceeded`,
        profile: profile.id,
        guardrail: "All deployed Guardrails",
        rule: profile.thresholdMetric.toUpperCase().replaceAll(" ", "_"),
        breach: {
          triggerTime: new Date(Math.max(...recent.map((scan) => Date.parse(scan.time)))).toISOString(),
          profileName: profile.name,
          metric: profile.thresholdMetric,
          rate,
          threshold: profile.threshold,
          windowMinutes,
        },
        reason: `${profile.thresholdMetric} exceeded this Profile's configured threshold (${profile.threshold}%) in the last ${windowMinutes} minutes.`,
        evidence: `${count} ${result} events / ${recent.length} checks = ${rate.toFixed(1)}% > ${profile.threshold}%. Window: ${windowMinutes} minutes.`,
      });
    } else if (errorRate > profile.threshold)
      alerts.push({
        id: `error-rate-${profile.id}`,
        level: "CRITICAL",
        event: "Scanner error rate exceeded",
        profile: profile.id,
        guardrail: "All deployed Guardrails",
        rule: "SCANNER_ERROR_RATE",
        breach: {
          triggerTime: new Date(Math.max(...checks.map((scan) => Date.parse(scan.time)))).toISOString(),
          profileName: profile.name,
          metric: "Error Rate",
          rate: errorRate,
          threshold: profile.threshold,
        },
        reason: `Scanner error percentage exceeded this Profile's configured threshold (${profile.threshold}%).`,
        evidence: `${errors.length} Error events / ${checks.length} checks = ${errorRate.toFixed(1)}% > ${profile.threshold}%. Scope: ${profile.deployedRefs.length} Guardrails, current demo snapshot.`,
      });
    for (const scan of checks) {
      if (!["Detected", "Blocked", "Error"].includes(scan.result)) continue;
      const isError = scan.result === "Error";
      alerts.push({
        id: `event-${scan.id}`,
        level: scan.result === "Detected" ? "INFO" : "WARNING",
        event: isError
          ? "Scanner execution error"
          : scan.result === "Blocked"
            ? "Policy match blocked"
            : "Policy detection recorded",
        profile: scan.profile,
        guardrail: scan.guardrail,
        rule: isError
          ? "SCANNER_EXECUTION_ERROR"
          : (scan.policyId ?? "POLICY_MATCH"),
        reason: isError
          ? scan.message
          : `Matched policy: ${(scan.policy ?? "Active protection policy").replace(/[.!?]+$/, "")}. ${scan.message}`,
        evidence: `Event ${scan.id} · ${scan.result} · ${scan.latency} ms · ${scan.time}. ${isError ? "Scanner did not return a completed result." : `Synthetic input: ${scan.input}`}`,
        target: {
          profile: scan.profile,
          guardrail: scan.guardrail,
          activity: scan.id,
        },
      });
    }
  }
  const rank = { CRITICAL: 0, WARNING: 1, INFO: 2 };
  return alerts.sort((a, b) => rank[a.level] - rank[b.level]);
}

export function monitoringHash(target: MonitoringTarget) {
  return `Profile/operations/?${new URLSearchParams(target).toString()}`;
}
export function readMonitoringTarget(hash: string): MonitoringTarget | null {
  if (!hash.replace(/^#/, "").startsWith("Profile/operations/")) return null;
  const params = new URLSearchParams(hash.split("?")[1]);
  const profile = params.get("profile"),
    guardrail = params.get("guardrail"),
    activity = params.get("activity");
  return profile && guardrail && activity
    ? { profile, guardrail, activity }
    : null;
}
