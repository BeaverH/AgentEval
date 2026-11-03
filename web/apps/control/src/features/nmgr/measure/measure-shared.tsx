import type { ReactNode } from "react";
import { Button } from "@/components/ui/button";
import { Sheet, SheetDescription, SheetTitle } from "@/components/ui/sheet";
import { ResizableSheetContent } from "../resizable-sheet";
import type { Agent } from "./measure-data";

export function StatusBadge({ children }: { children: string }) {
  const tone =
    children === "Blocked"
      ? "bad"
      : children === "Reviewed" || children === "Passed"
        ? "good"
        : children === "Transformed"
          ? "info"
          : "";
  return <span className={`nm-badge ${tone}`}>{children}</span>;
}
export function AgentIdentity({
  agent,
  onOpen,
  openLabel,
}: {
  agent: Agent;
  onOpen?: () => void;
  openLabel?: string;
}) {
  return (
    <div className="nm-measure-agent">
      {onOpen ? (
        <button className="nm-link" onClick={onOpen} aria-label={openLabel}>
          {agent.name}
        </button>
      ) : (
        <strong>{agent.name}</strong>
      )}
      <p>{agent.description}</p>
      <small>
        BU: {agent.bu}
        <span>Version: {agent.version}</span>
        <span>PoC: {agent.poc}</span>
      </small>
    </div>
  );
}
export function MeasureCard({
  title,
  aside,
  children,
  className = "",
}: {
  title: string;
  aside?: ReactNode;
  children: ReactNode;
  className?: string;
}) {
  return (
    <section className={`nm-card nm-measure-card ${className}`}>
      <header className="nm-card-head">
        <h3>{title}</h3>
        {aside}
      </header>
      {children}
    </section>
  );
}
export function Pager({
  page,
  count,
  size,
  onPage,
}: {
  page: number;
  count: number;
  size: number;
  onPage: (page: number) => void;
}) {
  const pages = Math.max(1, Math.ceil(count / size));
  return (
    <footer className="nm-pagination">
      <span>
        {count
          ? `${(page - 1) * size + 1}–${Math.min(page * size, count)}`
          : "0"}{" "}
        of {count} items
      </span>
      <Button
        size="sm"
        variant="outline"
        disabled={page <= 1}
        onClick={() => onPage(page - 1)}
      >
        Previous
      </Button>
      <span>
        Page {page} / {pages}
      </span>
      <Button
        size="sm"
        variant="outline"
        disabled={page >= pages}
        onClick={() => onPage(page + 1)}
      >
        Next
      </Button>
    </footer>
  );
}
export function MeasureSheet({
  title,
  description,
  children,
  onClose,
  width = 820,
}: {
  title: string;
  description: string;
  children: ReactNode;
  onClose: () => void;
  width?: number;
}) {
  return (
    <Sheet
      open
      onOpenChange={(open) => {
        if (!open) onClose();
      }}
    >
      <ResizableSheetContent
        defaultWidth={width}
        storageKey="nmgr-measure-detail-width"
        className="nm-app nm-drawer nm-measure nm-measure-sheet flex flex-col gap-0 bg-white p-0"
      >
        <header className="border-b px-6 py-5 pr-14">
          <SheetTitle className="text-xl">{title}</SheetTitle>
          <SheetDescription>{description}</SheetDescription>
        </header>
        <div className="nm-measure-sheet-body">{children}</div>
        <footer className="nm-measure-sheet-footer">
          <Button variant="outline" onClick={onClose}>
            Close
          </Button>
        </footer>
      </ResizableSheetContent>
    </Sheet>
  );
}
export const utc = (value: string) =>
  new Date(value).toLocaleString("en-GB", {
    timeZone: "UTC",
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
  });
