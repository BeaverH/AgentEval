import { statusLabel } from "./status-label";
import { useEffect, useState } from "react";
import { ChevronRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { allowed, type Entity, type Kind, type Role } from "./model";

export function DeploymentQueues({
  items,
  kind,
  role,
  onOpen,
}: {
  items: Entity[];
  kind: Kind;
  role: Role;
  onOpen: (id: string) => void;
}) {
  return (
    <div className="mt-5 space-y-5">
      <Queue
        title="Deployment"
        status="SIGNED OFF"
        items={items}
        kind={kind}
        role={role}
        onOpen={onOpen}
      />
    </div>
  );
}

function Queue({
  title,
  status,
  items,
  kind,
  role,
  onOpen,
}: {
  title: string;
  status: Entity["status"];
  items: Entity[];
  kind: Kind;
  role: Role;
  onOpen: (id: string) => void;
}) {
  const rows = items.filter((item) => item.status === status);
  const [page, setPage] = useState(1);
  const signature = rows.map((item) => item.id).join("|");
  useEffect(() => setPage(1), [signature, kind]);
  const pages = Math.max(1, Math.ceil(rows.length / 6));
  const current = Math.min(page, pages);
  const action = status === "SIGNOFF REQUESTED" ? "approve" : "deploy";
  return (
    <section className="nm-card" aria-label={`${kind} ${title}`}>
      <div className="nm-card-head">
        <h3>{title}</h3>
        <span>
          {rows.length} {kind.toLowerCase()}s
        </span>
      </div>
      <div className="nm-scroll">
        <table>
          <thead>
            <tr>
              <th>{kind}</th>
              <th>Status</th>
              <th>Ctrl Unit</th>
              <th>Last Modified</th>
              <th>Action</th>
            </tr>
          </thead>
          <tbody>
            {rows.slice((current - 1) * 6, current * 6).map((item) => (
              <tr key={item.id}>
                <td>
                  <strong>{item.name}</strong>
                  <small>
                    Target Ver.: {item.version}.0 · Deployed
                    Ver.:{" "}
                    {item.deployed === null ? "None" : `${item.deployed}.0`}
                  </small>
                </td>
                <td>
                  <span
                    className={`nm-badge ${status === "SIGNED OFF" ? "good" : ""}`}
                  >
                    {statusLabel(item.status)}
                  </span>
                </td>
                <td>{item.unit}</td>
                <td>
                  {new Date(item.updated).toLocaleString("en-GB", {
                    timeZone: "Asia/Shanghai",
                  })}
                </td>
                <td>
                  <Button variant="outline" onClick={() => onOpen(item.id)}>
                    {allowed(item, action, role)
                      ? action === "approve"
                        ? "Sign off"
                        : "Go Deploy"
                      : "View"}
                    <ChevronRight size={14} />
                  </Button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {!rows.length && (
        <div className="nm-empty">
          {status === "SIGNOFF REQUESTED"
            ? "No matching requests awaiting sign-off."
            : "No matching revisions awaiting deployment."}
        </div>
      )}
      <footer className="nm-pagination">
        <span>{rows.length} records</span>
        <Button
          variant="outline"
          size="sm"
          disabled={current === 1}
          onClick={() => setPage(current - 1)}
        >
          Previous
        </Button>
        <span>
          Page {current} / {pages}
        </span>
        <Button
          variant="outline"
          size="sm"
          disabled={current === pages}
          onClick={() => setPage(current + 1)}
        >
          Next
        </Button>
      </footer>
    </section>
  );
}
