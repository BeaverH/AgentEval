import { Fragment, useEffect, useState, useRef, useId } from "react";
import { Button } from "@/components/ui/button";
import { ArrowLeft } from "lucide-react";
import type { MonitoringTarget } from "./alerts";
import { deployedEntity, type Entity, type State } from "./model";

export type Scan = {
  id: string;
  profile: string;
  guardrail: string;
  result: string;
  latency: number;
  time: string;
  version: number;
  input: string;
  message: string;
  policyId?: string;
  policy?: string;
};
export function profileScans(profile: Entity, state: State, snapshotTime = Math.floor(Date.now() / 60_000) * 60_000): Scan[] {
  if (profile.deployed === null || profile.mode === "Pass all") return [];
  const active = deployedEntity(profile);
  const rateScenario = active.thresholdMetric === "Block Rate" || active.thresholdMetric === "Pass Rate";
  const sampleCount = rateScenario ? 10 : 12;
  return profile.deployedRefs.flatMap((id, guardIndex) =>
    Array.from({ length: sampleCount }, (_, i) => {
      const result =
        profile.mode === "Block all"
          ? "Blocked"
          : rateScenario
            ? active.thresholdMetric === "Block Rate" && i < 9 ? "Blocked" : "Passed"
          : i === 2
            ? "Blocked"
          : i === 5
            ? "Detected"
            : i === 8
              ? "Error"
              : "Passed";
      const guard = state.entities.map(deployedEntity).find((g) => g.id === id);
      return {
        ...(["Detected", "Blocked"].includes(result) &&
        profile.mode === "Normal"
          ? {
              policyId: `${id}-v${guard?.deployed ?? 1}-policy-1`,
              policy: guard?.policies[0] ?? "Active protection policy",
            }
          : {}),
        id: `${profile.id}-v${profile.deployed}-${id}-${i}`,
        profile: profile.id,
        guardrail: id,
        version: state.entities.find((g) => g.id === id)?.deployed ?? 1,
        result,
        latency: 45 + ((i * 31 + guardIndex * 73) % 450),
        // A rolling demo snapshot keeps the same samples in the current monitoring window.
        time: new Date(snapshotTime - (rateScenario
          ? (sampleCount - 1 - i) / (sampleCount - 1) * Math.max(0, (active.thresholdWindow ?? 5) - 1) * 60_000
          : (11 - i) * 30_000)).toISOString(),
        input:
          result === "Passed"
            ? "Explain how to keep customer data private."
            : result === "Error"
              ? "Synthetic content submitted to the scanner."
              : `Synthetic rule-match sample: ${guard?.config?.content || guard?.policies[0] || "alex.example@example.test"}`,
        message:
          result === "Error"
            ? "DETECTOR_TIMEOUT · Scanner did not respond within the demo deadline."
            : result === "Blocked"
              ? "Request blocked by the active protection policy."
              : result === "Detected"
                ? "Risk detected and recorded for review."
                : "Content passed the protection checks.",
      };
    }),
  );
}
const rate = (n: number, total: number) =>
  total ? `${((n / total) * 100).toFixed(1)}%` : "—";
export function scanMetrics(scans: Scan[]) {
  const errors = scans.filter((s) => s.result === "Error").length;
  const blocked = scans.filter((s) => s.result === "Blocked").length;
  return {
    count: scans.length,
    errors,
    blocked,
    detected: scans.filter((s) => ["Detected", "Blocked"].includes(s.result))
      .length,
    average: scans.length
      ? Math.round(scans.reduce((sum, s) => sum + s.latency, 0) / scans.length)
      : 0,
  };
}
export function MonitoringMetrics({ scans }: { scans: Scan[] }) {
  const m = scanMetrics(scans);
  return (
    <div className="nm-monitor-metrics">
      {[
        [
          "Scans",
          m.count,
          `${rate(m.count - m.errors, m.count)} success rate`,
          "success",
        ],
        ["Avg response", m.count ? `${m.average} ms` : "—", "", "neutral"],
        ["Error", m.errors, rate(m.errors, m.count), "error"],
        ["Detected", m.detected, rate(m.detected, m.count), "detected"],
        ["Block", m.blocked, rate(m.blocked, m.count), "block"],
      ].map(([label, value, sub, tone]) => (
        <div key={label} data-tone={tone}>
          <span>{label}</span>
          <strong>{value}</strong>
          <small>{sub}</small>
        </div>
      ))}
    </div>
  );
}
export function ProfileMonitoring({
  profile,
  state,
  onGuardrail,
  target,
  onBackToAlerts,
}: {
  profile: Entity;
  state: State;
  onGuardrail: (id: string) => void;
  target?: MonitoringTarget | null;
  onBackToAlerts?: (activity: string) => void;
}) {
  const detailRef = useRef<HTMLElement>(null);
  const detailPrefix = useId();
  const [expanded, setExpanded] = useState("");
  const [filter, setFilter] = useState("All");
  const [selected, setSelected] = useState<Scan | null>(null);
  const [sort, setSort] = useState("name");
  const [descending, setDescending] = useState(false);
  useEffect(() => {
    setSelected(null);
    setFilter("All");
  }, [profile.id, profile.deployed, profile.mode]);
  const scans = profileScans(profile, state);
  useEffect(() => {
    if (!target || target.profile !== profile.id) return;
    setExpanded(target.guardrail);
    setFilter("All");
    setSelected(
      profileScans(profile, state).find(
        (scan) => scan.id === target.activity,
      ) ?? null,
    );
  }, [
    target?.profile,
    target?.guardrail,
    target?.activity,
    profile.id,
    profile.deployed,
    profile.mode,
  ]);
  useEffect(() => {
    if (target && selected?.id === target.activity)
      detailRef.current?.scrollIntoView({ block: "center" });
  }, [target?.activity, selected?.id]);
  const rows = profile.deployedRefs
    .map((id) => ({
      id,
      guard: state.entities.map(deployedEntity).find((e) => e.id === id),
      scans: scans.filter((s) => s.guardrail === id),
      ...scanMetrics(scans.filter((s) => s.guardrail === id)),
    }))
    .sort((a, b) => {
      const delta =
        sort === "name"
          ? (a.guard?.name ?? a.id).localeCompare(b.guard?.name ?? b.id)
          : Number(a[sort as "count"]) - Number(b[sort as "count"]);
      return descending ? -delta : delta;
    });
  return (
    <div className="nm-monitoring">
      <div className="nm-monitor-caption">
        <span>
          Deployed v{profile.deployed}.0 · {profile.mode} · Alert threshold{" "}
          {deployedEntity(profile).threshold}%
        </span>
        <span>Simulated traffic · UTC+08:00</span>
      </div>
      {profile.mode !== "Normal" && (
        <p
          className={`nm-mode-banner ${profile.mode === "Block all" ? "block" : "bypass"}`}
        >
          {profile.mode === "Pass all"
            ? "Bypass is active. Traffic skips all Guardrails; no new scans are generated."
            : "Block all is active. All matching traffic is blocked."}
        </p>
      )}
      {target && !scans.some((scan) => scan.id === target.activity) && (
        <p className="nm-callout" role="status">
          This alert's activity is no longer present in the current demo
          snapshot.
        </p>
      )}
      <MonitoringMetrics scans={scans} />
      <section className="nm-card nm-scroll">
        <table className="nm-monitor-table">
          <thead>
            <tr>
              {[
                ["name", "Guardrail"],
                ["mode", "Mode"],
                ["count", "Scans"],
                ["average", "Avg response"],
                ["errors", "Error"],
                ["detected", "Detected"],
                ["blocked", "Block"],
              ].map(([key, label]) => (
                <th
                  key={key}
                  aria-sort={
                    sort === key
                      ? descending
                        ? "descending"
                        : "ascending"
                      : "none"
                  }
                >
                  {key === "mode" ? (
                    label
                  ) : (
                    <button
                      onClick={() => {
                        setSort(key!);
                        setDescending(sort === key ? !descending : false);
                      }}
                    >
                      {label} ↕
                    </button>
                  )}
                </th>
              ))}
              <th>Action</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <Fragment key={row.id}>
                <tr>
                  <td>
                    <button
                      className="nm-monitor-name"
                      aria-expanded={expanded === row.id}
                      onClick={() => {
                        setExpanded(expanded === row.id ? "" : row.id);
                        setFilter("All");
                        setSelected(null);
                      }}
                    >
                      {expanded === row.id ? "▾" : "▸"}{" "}
                      {row.guard?.name ?? "Unavailable Guardrail"}
                    </button>
                    <small>v{row.guard?.deployed ?? "—"}.0</small>
                  </td>
                  <td>
                    <span
                      className={`nm-runtime-mode ${profile.mode === "Normal" ? "normal" : profile.mode === "Pass all" ? "bypass" : "block"}`}
                    >
                      ● Current: {profile.mode}
                    </span>
                  </td>
                  <td>{row.count}</td>
                  <td>{row.count ? `${row.average} ms` : "—"}</td>
                  <td className="nm-tone-error">
                    <button
                      className="underline"
                      onClick={() => {
                        setExpanded(row.id);
                        setFilter("Error");
                        setSelected(null);
                      }}
                    >
                      {row.errors}
                    </button>
                    <small>{rate(row.errors, row.count)}</small>
                  </td>
                  <td className="nm-tone-detected">
                    {row.detected}
                    <small>{rate(row.detected, row.count)}</small>
                  </td>
                  <td className="nm-tone-block">
                    {row.blocked}
                    <small>{rate(row.blocked, row.count)}</small>
                  </td>
                  <td>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => onGuardrail(row.id)}
                    >
                      View Guardrail
                    </Button>
                  </td>
                </tr>
                {expanded === row.id && (
                  <tr>
                    <td colSpan={8}>
                      <div className="nm-traces">
                        <div className="nm-monitor-caption">
                          <h3>Recent activity</h3>
                          <select
                            aria-label="Trace outcomes"
                            value={filter}
                            onChange={(e) => {
                              setFilter(e.target.value);
                              setSelected(null);
                            }}
                          >
                            {[
                              "All",
                              "Passed",
                              "Error",
                              "Detected",
                              "Blocked",
                            ].map((x) => (
                              <option key={x}>{x}</option>
                            ))}
                          </select>
                        </div>
                        {row.scans
                          .filter(
                            (s) => filter === "All" || s.result === filter,
                          )
                          .map((s) => (
                            <Fragment key={s.id}>
                              <button
                                className="nm-trace-row"
                                data-selected={selected?.id === s.id}
                                aria-expanded={selected?.id === s.id}
                                aria-controls={`${detailPrefix}-trace-detail-${s.id}`}
                                onClick={() =>
                                  setSelected(selected?.id === s.id ? null : s)
                                }
                              >
                                <span>
                                  {new Date(s.time).toLocaleTimeString(
                                    "en-GB",
                                    {
                                      timeZone: "Asia/Shanghai",
                                    },
                                  )}
                                </span>
                                <span>Guardrail Check</span>
                                <span
                                  className={`nm-outcome ${s.result.toLowerCase()}`}
                                >
                                  {s.result}
                                </span>
                                <span>{s.latency} ms</span>
                              </button>
                              {selected?.id === s.id && (
                                <section
                                  id={`${detailPrefix}-trace-detail-${s.id}`}
                                  ref={detailRef}
                                  className={`nm-trace-detail ${target && onBackToAlerts ? "has-alert-back" : ""}`}
                                  aria-label="Trace details"
                                >
                                  {target && onBackToAlerts && (
                                    <button
                                      className="nm-back-to-alerts"
                                      aria-label="Back to Alerts board"
                                      title="Back to Alerts board"
                                      onClick={() =>
                                        onBackToAlerts(target.activity)
                                      }
                                    >
                                      <ArrowLeft size={18} aria-hidden="true" />
                                    </button>
                                  )}
                                  <div className="nm-monitor-caption nm-trace-heading">
                                    <h3>Check details</h3>
                                    <Button
                                      variant="ghost"
                                      onClick={() => setSelected(null)}
                                    >
                                      Close trace
                                    </Button>
                                  </div>
                                  <p>{selected.message}</p>
                                  <dl>
                                    {selected.policy && (
                                      <>
                                        <dt>Matched rule</dt>
                                        <dd>
                                          {selected.policy}
                                        </dd>
                                      </>
                                    )}
                                    <dt>Profile</dt>
                                    <dd>{profile.name}</dd>
                                    <dt>Guardrail</dt>
                                    <dd>{row.guard?.name ?? "Unavailable Guardrail"}</dd>
                                    <dt>Outcome / latency</dt>
                                    <dd>
                                      {selected.result} · {selected.latency} ms
                                    </dd>
                                    <dt>Scanned content (synthetic)</dt>
                                    <dd>{selected.input}</dd>
                                    <dt>Guardrail version</dt>
                                    <dd>v{selected.version}.0</dd>
                                    <dt>Timestamp</dt>
                                    <dd>{selected.time}</dd>
                                  </dl>
                                </section>
                              )}
                            </Fragment>
                          ))}
                        {!row.scans.filter(
                          (s) => filter === "All" || s.result === filter,
                        ).length && (
                          <p className="nm-empty">No matching activity.</p>
                        )}
                      </div>
                    </td>
                  </tr>
                )}
              </Fragment>
            ))}
          </tbody>
        </table>
        {!rows.length && (
          <p className="nm-empty">No deployed Guardrail bindings.</p>
        )}
      </section>
    </div>
  );
}
