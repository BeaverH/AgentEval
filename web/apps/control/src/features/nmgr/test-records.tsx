import { useState } from "react";
import { Button } from "@/components/ui/button";
import type { Entity } from "./model";
export function TestRecords({
  item,
}: {
  item: Entity;
}) {
  const [filter, setFilter] = useState("All");
  const [page, setPage] = useState(1);
  const versions = [
    ...new Set([item.version, ...item.runs.map((run) => run.version)]),
  ].sort((a, b) => b - a);
  const runs = item.runs.filter(
    (run) => filter === "All" || String(run.version) === filter,
  );
  const current = Math.min(page, Math.max(1, Math.ceil(runs.length / 5)));
  return (
    <section className="nm-card">
      <div className="nm-card-head">
        <h3>Test Records</h3>
        <label className="nm-select">
          Version
          <select
            aria-label="Test record version"
            value={filter}
            onChange={(e) => {
              setFilter(e.target.value);
              setPage(1);
            }}
          >
            <option value="All">All versions</option>
            {versions.map((v) => (
              <option key={v} value={v}>
                v{v}.0{v === item.version ? " · Current" : ""}
              </option>
            ))}
          </select>
        </label>
      </div>
      <div className="nm-scroll">
        <table className="nm-test-records" aria-label="Test Records">
          <thead>
            <tr>
              <th>Test / Version</th>
              <th>Result</th>
            </tr>
          </thead>
          <tbody>
            {runs.slice((current - 1) * 5, current * 5).map((r) => (
              <tr key={r.id}>
                <td>
                  {r.dataset}
                  <small>
                    Target {r.version}.0 · Base{" "}
                    {r.base === null ? "None" : `${r.base}.0`}
                  </small>
                </td>
                <td>
                  <span className={`nm-badge ${r.passed ? "good" : "bad"}`}>
                    {r.passed ? "Passed" : "Test failed"}
                  </span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {!runs.length && (
        <p className="nm-empty">No tests recorded for this version.</p>
      )}
      <footer className="nm-pagination">
        <span>{runs.length} records</span>
        <Button
          variant="outline"
          disabled={current === 1}
          onClick={() => setPage(current - 1)}
        >
          Previous
        </Button>
        <span>
          {current} / {Math.max(1, Math.ceil(runs.length / 5))}
        </span>
        <Button
          variant="outline"
          disabled={current * 5 >= runs.length}
          onClick={() => setPage(current + 1)}
        >
          Next
        </Button>
      </footer>
    </section>
  );
}
