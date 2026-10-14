import { statusLabel } from "./status-label";
import { useState } from "react";
import { ChevronRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import type { Entity, Kind, State } from "./model";

const stamp = (value: string) =>
  new Date(value).toLocaleString("en-GB", { timeZone: "Asia/Shanghai" });

export function EntitySummary({ item, state }: { item: Entity; state: State }) {
  return (
    <small>
      {item.kind === "Profile" ? "Active" : "Deployed"} Ver.:{" "}
      <strong className="nm-summary-value">
        {item.deployed === null ? "None" : `${item.deployed}.0`}
      </strong>{" "}
      ·{" "}
      <strong className="nm-summary-value">
        {item.kind === "Guardrail"
          ? state.entities.filter(
              (profile) =>
                profile.kind === "Profile" &&
                profile.deployed !== null &&
                profile.deployedRefs.includes(item.id),
            ).length
          : item.refs.length}
      </strong>{" "}
      {item.kind === "Guardrail" ? "Active Profile Refs." : "Guardrails Set"}
    </small>
  );
}

export function signoffHistory(
  state: State,
  kind: Kind,
  unit: string,
  actor: string,
) {
  const items = new Map(
    state.entities
      .filter((item) => item.kind === kind && item.unit === unit)
      .map((item) => [item.id, item]),
  );
  return state.audit
    .filter(
      (entry) =>
        entry.action === "approve" &&
        (entry.actor === actor ||
          (actor === "Feng ZONG" && entry.actor === "User Admin")) &&
        items.has(entry.entity),
    )
    .map((entry) => ({ entry, item: items.get(entry.entity)! }))
    .sort((a, b) => Date.parse(b.entry.time) - Date.parse(a.entry.time));
}

export function OperationHistory({
  state,
  kind,
  controlUnit,
  actor,
  onOpen,
}: {
  state: State;
  kind: Kind;
  controlUnit: string;
  actor: string;
  onOpen: (id: string) => void;
}) {
  const records = signoffHistory(state, kind, controlUnit, actor);
  const [requestedPage, setPage] = useState(1);
  const pages = Math.max(1, Math.ceil(records.length / 6));
  const page = Math.min(requestedPage, pages);
  return (
    <details className="nm-card nm-operation-history">
      <summary>
        <ChevronRight size={16} />
        <strong>Operation History</strong>
        <span>{records.length} sign-offs</span>
      </summary>
      <div className="nm-scroll">
        <table aria-label={`${kind} sign-off history`}>
          <thead>
            <tr>
              <th>Sign-Off Time</th>
              <th>{kind}</th>
              <th>Status</th>
              <th>Ctrl Unit</th>
              <th>Last Modified</th>
              <th>Action</th>
            </tr>
          </thead>
          <tbody>
            {records.slice((page - 1) * 6, page * 6).map(({ entry, item }) => (
              <tr key={entry.id}>
                <td>
                  <time dateTime={entry.time}>{stamp(entry.time)}</time>
                </td>
                <td>
                  <strong>{item.name}</strong>
                  <EntitySummary item={item} state={state} />
                </td>
                <td>
                  <span
                    className={`nm-badge ${["SIGNED OFF", "DEPLOYED", "TEST PASSED"].includes(item.status) ? "good" : item.status === "TEST FAILED" ? "bad" : ""}`}
                  >
                    {statusLabel(item.status)}
                  </span>
                </td>
                <td>{item.unit}</td>
                <td>{stamp(item.updated)}</td>
                <td>
                  <Button variant="outline" onClick={() => onOpen(item.id)}>
                    View
                    <ChevronRight size={14} />
                  </Button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {!records.length && <div className="nm-empty">No sign-offs yet.</div>}
      <footer className="nm-pagination">
        <span>
          {records.length
            ? `${(page - 1) * 6 + 1}–${Math.min(page * 6, records.length)}`
            : "0"}{" "}
          of {records.length}
        </span>
        <Button
          size="sm"
          variant="outline"
          disabled={page === 1}
          onClick={() => setPage(page - 1)}
        >
          Previous
        </Button>
        <span>
          Page {page} / {pages}
        </span>
        <Button
          size="sm"
          variant="outline"
          disabled={page === pages}
          onClick={() => setPage(page + 1)}
        >
          Next
        </Button>
      </footer>
    </details>
  );
}
