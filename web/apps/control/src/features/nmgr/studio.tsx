import { statusLabel } from "./status-label";
import { Check, Clock3, X } from "lucide-react";
import {
  controlUnits,
  hasTechnicalPass,
  type Entity,
  type Role,
} from "./model";

export function WorkflowNotice({ item, role }: { item: Entity; role: Role }) {
  if (role !== "User") return null;
  if (item.kind === "Profile")
    return (
      <p className="nm-callout">
        {item.status === "SIGNED OFF"
          ? "This approved Profile is active for protection."
          : item.status === "SIGNOFF REQUESTED"
            ? "Waiting for Control Unit Approver sign-off."
            : "Configure the referenced Guardrails, then request sign-off. No testing or deployment is required."}
      </p>
    );
  let title: string;
  let message: string;
  if (item.status === "DRAFT") {
    title = "Waiting for Tech Implementor configuration";
    message =
      "Tech Implementor needs to configure this request and complete the first passing test before you can review results and request sign-off.";
  } else if (
    ["TEST READY", "TEST FAILED", "TEST PASSED"].includes(item.status) &&
    !hasTechnicalPass(item)
  ) {
    title = "Waiting for Tech Implementor testing";
    message =
      "Tech Implementor must record a passing test for the current configuration. You can then review the results and request sign-off.";
  } else if (item.status === "SIGNOFF REQUESTED") {
    title = "Waiting for Control Unit Approver sign-off";
    message =
      "Your request is awaiting review. Control Unit Approver will sign off or return it for further testing.";
  } else if (item.status === "SIGNED OFF") {
    title = "Waiting for Tech Implementor deployment";
    message =
      "This revision has been signed off. Tech Implementor can now deploy it.";
  } else {
    return null;
  }
  return (
    <div className="nm-workflow-notice" role="status" aria-live="polite">
      <Clock3 size={18} aria-hidden="true" />
      <div>
        <strong>{title}</strong>
        <p>{message}</p>
      </div>
    </div>
  );
}

export type Filters = Record<string, string[]>;
export const studioStatuses = [
  "DRAFT",
  "TEST READY",
  "TEST FAILED",
  "TEST PASSED",
  "SIGNOFF REQUESTED",
  "SIGNED OFF",
  "DEPLOYED",
];
export const filterFields = [
  { key: "status", label: "Status", options: studioStatuses },
  {
    key: "unit",
    label: "Control unit",
    options: controlUnits,
  },
  {
    key: "bu",
    label: "BUSU",
    options: ["CBG", "IBG", "ISS", "RMG", "Compliance", "GFM", "GFMT"],
  },
  {
    key: "location",
    label: "Location",
    options: ["SG", "CN", "IN", "ID", "HK", "TW"],
  },
  {
    key: "agent",
    label: "Agent type",
    options: ["Customer", "Employee", "Financials", "Security", "Productivity"],
  },
  {
    key: "data",
    label: "Data type",
    options: ["Financial data", "Personal data", "No sensitive data"],
  },
];
export function filterValue(item: Entity, key: string): string {
  if (key === "bu" || key === "agent") return item.attributes[key];
  if (key === "data")
    return (
      {
        Personal: "Personal data",
        Financial: "Financial data",
        "No Sensitive Data": "No sensitive data",
      }[item.attributes.data] ?? item.attributes.data
    );
  return String(item[key as keyof Entity] ?? "");
}
export function matchesFilters(item: Entity, filters: Filters) {
  return Object.entries(filters).every(([key, values]) => {
    const value = filterValue(item, key);
    return (
      !values.length ||
      values.includes(value) ||
      (["bu", "location", "agent", "data"].includes(key) && value === "ALL")
    );
  });
}
export function CheckboxFilter({
  label,
  options,
  selected,
  onChange,
}: {
  label: string;
  options: string[];
  selected: string[];
  onChange: (values: string[]) => void;
}) {
  return (
    <div
      role="group"
      aria-label={label}
      data-filter={label}
      className="nm-filter-row"
    >
      <span className="nm-filter-label text-xs font-medium text-muted-foreground">
        {label}
      </span>
      <div className="nm-filter-options">
        {["All", ...options].map((value) => (
          <label
            key={value}
            data-value={value}
            className="nm-filter-option cursor-pointer text-sm"
          >
            <input
              type="checkbox"
              className="size-4 rounded accent-primary"
              checked={
                value === "All" ? !selected.length : selected.includes(value)
              }
              onChange={() =>
                onChange(
                  value === "All"
                    ? []
                    : selected.includes(value)
                      ? selected.filter((v) => v !== value)
                      : [...selected, value],
                )
              }
            />
            {label === "Status" ? statusLabel(value) : value}
          </label>
        ))}
      </div>
    </div>
  );
}
export function WorkflowSteps({ item }: { item: Entity }) {
  const steps =
    item.kind === "Profile"
      ? ["Draft", "Sign-off requested", "Signed off"]
      : [
          "Draft",
          "Test ready",
          "Test passed",
          "Sign-off requested",
          "Signed off",
          "Deployed",
        ];
  const states =
    item.kind === "Profile"
      ? ["DRAFT", "SIGNOFF REQUESTED", "SIGNED OFF"]
      : studioStatuses.filter((s) => s !== "TEST FAILED");
  const failed = item.status === "TEST FAILED";
  const current = failed ? 2 : states.indexOf(item.status);
  return (
    <ol
      className="nm-steps"
      style={{ gridTemplateColumns: `repeat(${steps.length}, minmax(0, 1fr))` }}
      aria-label={`Workflow: ${statusLabel(item.status)}`}
    >
      {steps.map((label, i) => (
        <li
          key={label}
          aria-current={i === current ? "step" : undefined}
          className={`${i < current || item.status === "DEPLOYED" ? "complete" : ""} ${i === current ? "current" : ""} ${i === current && failed ? "failed" : ""}`}
        >
          <span className="nm-step-node" aria-hidden="true">
            {i === current && failed ? (
              <X size={14} />
            ) : i < current || item.status === "DEPLOYED" ? (
              <Check size={14} />
            ) : (
              i + 1
            )}
          </span>
          <span className="nm-step-label">
            {i === current && failed ? "Test failed" : label}
          </span>
        </li>
      ))}
    </ol>
  );
}
