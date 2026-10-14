import { useState } from "react";
import { Search } from "lucide-react";
import { Input } from "@/components/ui/input";
import type { State } from "./model";
import type { Scan } from "./monitoring";

export function ActivityLogs({
  state,
  scans,
  type,
}: {
  state: State;
  scans: Scan[];
  type: string;
}) {
  const [query, setQuery] = useState("");
  const [entity, setEntity] = useState("All");
  const [action, setAction] = useState("All");
  const [actor, setActor] = useState("All");
  const [range, setRange] = useState("All time");
  const audit = type === "Audit Log";
  const records = audit
    ? state.audit.map((log) => ({
        id: log.id,
        time: log.time,
        entity: log.entity,
        guardrail: "",
        actor: log.actor,
        action: log.action,
        category: log.action.split(":")[0]!,
        search: log.action,
      }))
    : scans.map((scan) => ({
        id: scan.id,
        time: scan.time,
        entity: scan.profile,
        guardrail: scan.guardrail,
        actor: "",
        action: scan.result,
        category: scan.result,
        search: `${scan.input} ${scan.message}`,
      }));
  const names = new Map(state.entities.map((e) => [e.id, e.name]));
  const limit =
    range === "Last 24 hours"
      ? Date.now() - 86400000
      : range === "Last 7 days"
        ? Date.now() - 7 * 86400000
        : -Infinity;
  const filtered = records
    .filter(
      (r) =>
        (entity === "All" || r.entity === entity) &&
        (action === "All" || r.category === action) &&
        (actor === "All" || r.actor === actor) &&
        Date.parse(r.time) >= limit &&
        `${r.id} ${r.entity} ${names.get(r.entity) ?? ""} ${r.guardrail} ${names.get(r.guardrail) ?? ""} ${r.actor} ${r.action} ${r.search}`
          .toLowerCase()
          .includes(query.trim().toLowerCase()),
    )
    .sort((a, b) => b.time.localeCompare(a.time));
  const selector = (
    label: string,
    value: string,
    set: (v: string) => void,
    options: string[],
  ) => (
    <label className="nm-select">
      <span>{label}</span>
      <select
        aria-label={label}
        value={value}
        onChange={(e) => set(e.target.value)}
      >
        {options.map((option) => (
          <option key={option} value={option}>
            {label === "Entity" || label === "Profile"
              ? option === "All" ? "All" : names.get(option) ?? "Unavailable Entity"
              : option}
          </option>
        ))}
      </select>
    </label>
  );
  return (
    <>
      <div className="nm-log-filters nm-filters">
        <div className="nm-search">
          <Search size={17} />
          <Input
            aria-label="Search activity logs"
            placeholder="Search names, actions or keywords…"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
        </div>
        {selector(audit ? "Entity" : "Profile", entity, setEntity, [
          "All",
          ...new Set(records.map((r) => r.entity)),
        ])}
        {selector(audit ? "Action" : "Decision", action, setAction, [
          "All",
          ...new Set(records.map((r) => r.category)),
        ])}
        {audit &&
          selector("Actor", actor, setActor, [
            "All",
            ...new Set(records.map((r) => r.actor)),
          ])}
        {selector("Time range", range, setRange, [
          "All time",
          "Last 24 hours",
          "Last 7 days",
        ])}
        {(query ||
          entity !== "All" ||
          action !== "All" ||
          actor !== "All" ||
          range !== "All time") && (
          <button
            className="nm-link"
            onClick={() => {
              setQuery("");
              setEntity("All");
              setAction("All");
              setActor("All");
              setRange("All time");
            }}
          >
            Clear filters
          </button>
        )}
      </div>
      <section className="nm-card nm-scroll">
        <table>
          <thead>
            <tr>
              {(audit
                ? ["Time (UTC+08)", "Actor", "Entity", "Action"]
                : [
                    "Time (UTC+08)",
                    "Profile",
                    "Guardrail",
                    "Decision",
                  ]
              ).map((h) => (
                <th key={h}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {filtered.map((record) => (
              <tr key={record.id}>
                <td>
                  {new Date(record.time).toLocaleString("en-GB", {
                    timeZone: "Asia/Shanghai",
                  })}
                </td>
                {audit ? (
                  <>
                    <td>{record.actor}</td>
                    <td>{names.get(record.entity) ?? "Unavailable Entity"}</td>
                    <td>{record.action}</td>
                  </>
                ) : (
                  <>
                    <td>{names.get(record.entity) ?? "Unavailable Profile"}</td>
                    <td>{names.get(record.guardrail) ?? "Unavailable Guardrail"}</td>
                    <td>
                      <span className="nm-badge">{record.action}</span>
                    </td>
                  </>
                )}
              </tr>
            ))}
          </tbody>
        </table>
        {!filtered.length && (
          <p className="nm-empty">
            {records.length
              ? "No matching activity. Clear or adjust the filters."
              : "No activity recorded."}
          </p>
        )}
        <div className="nm-card-head">
          <span>
            {filtered.length} of {records.length} records
          </span>
        </div>
      </section>
    </>
  );
}
