import { useState } from "react";
import { Search } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { allowed, type Entity, type Role, type State } from "./model";
import { EntitySummary } from "./operation-history";

export function EnforcementList({ profiles, state, role, alertCounts, onModeChange }: {
  profiles: Entity[];
  state: State;
  role: Role;
  alertCounts: Map<string, { critical: number; warning: number }>;
  onModeChange: (item: Entity, mode: Entity["mode"]) => void;
}) {
  const [search, setSearch] = useState("");
  const [location, setLocation] = useState("All");
  const [requestedPage, setPage] = useState(1);
  const rows = profiles.filter((item) =>
    `${item.name} ${item.description}`.toLowerCase().includes(search.trim().toLowerCase()) &&
    (location === "All" || item.location === location || item.location === "ALL"));
  const pages = Math.max(1, Math.ceil(rows.length / 6));
  const page = Math.min(requestedPage, pages);
  return <>
    <div className="nm-filters nm-monitor-filters">
      <div className="nm-search">
        <Search size={17} />
        <Input aria-label="Search" placeholder="Search Profiles by keywords…" value={search}
          onChange={(event) => { setSearch(event.target.value); setPage(1); }} />
      </div>
      <label className="nm-select"><span>Location</span>
        <select aria-label="Location" value={location} onChange={(event) => { setLocation(event.target.value); setPage(1); }}>
          {["All", "SG", "CN", "IN", "ID", "HK", "TW"].map((value) => <option key={value}>{value}</option>)}
        </select>
      </label>
    </div>
    <section className="nm-card">
      <div className="nm-card-head"><h3>Enforce &amp; Prevent</h3><span>{rows.length} profiles</span></div>
      <div className="nm-scroll">
        <table aria-label="Enforce & Prevent">
          <thead><tr><th>Profile</th><th>Mode</th><th>Ctrl Unit</th><th>Last Modified</th><th>Action</th></tr></thead>
          <tbody>{rows.slice((page - 1) * 6, page * 6).map((item) => <tr key={item.id}>
            <td><div className="nm-profile-identity"><div>
              <div className="nm-profile-title"><strong>{item.name}</strong>
                <span className="nm-profile-alert-counts">{(["critical", "warning"] as const).map((level) =>
                  <span key={level} className={`nm-alert-badge nm-alert-count ${level}`}
                    aria-label={`${alertCounts.get(item.id)?.[level] ?? 0} ${level.toUpperCase()} alerts for ${item.name}`}
                    title={`${level.toUpperCase()} alerts: ${alertCounts.get(item.id)?.[level] ?? 0}`}>
                    {alertCounts.get(item.id)?.[level] ?? 0}
                  </span>)}</span>
              </div>
              <EntitySummary item={item} state={state} />
            </div></div></td>
            <td><span className={`nm-badge ${item.mode === "Pass all" ? "warning" : item.mode === "Block all" ? "bad" : "good"}`}>{item.mode}</span></td>
            <td>{item.unit}</td>
            <td>{new Date(item.updated).toLocaleString("en-GB", { timeZone: "Asia/Shanghai" })}</td>
            <td><div className="nm-select">
              <select aria-label={`Mode for ${item.name}`} value={item.mode}
                disabled={!["Normal", "Pass all", "Block all"].some((mode) => allowed(item, mode as Entity["mode"], role))}
                onChange={(event) => onModeChange(item, event.target.value as Entity["mode"])}>
                {(["Normal", "Pass all", "Block all"] as const).map((mode) =>
                  <option key={mode} value={mode} disabled={mode !== item.mode && !allowed(item, mode, role)}>{mode}</option>)}
              </select>
            </div></td>
          </tr>)}</tbody>
        </table>
      </div>
      {!rows.length && <div className="nm-empty">No matching records.</div>}
      <footer className="nm-pagination">
        <span>{rows.length ? `${(page - 1) * 6 + 1}–${Math.min(page * 6, rows.length)}` : "0"} of {rows.length}</span>
        <Button size="sm" variant="outline" disabled={page === 1} onClick={() => setPage(page - 1)}>Previous</Button>
        <span>Page {page} / {pages}</span>
        <Button size="sm" variant="outline" disabled={page === pages} onClick={() => setPage(page + 1)}>Next</Button>
      </footer>
    </section>
  </>;
}
