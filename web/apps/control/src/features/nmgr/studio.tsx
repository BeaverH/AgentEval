import { Check, X } from "lucide-react";
import { controlUnits, type Entity } from "./model";

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
    <fieldset
      data-filter={label}
      className="nm-filter-row flex flex-wrap items-baseline gap-x-5 gap-y-2"
    >
      <legend className="float-left w-24 shrink-0 pt-1 text-xs font-medium text-muted-foreground">
        {label}
      </legend>
      <div className="nm-filter-options flex flex-1 flex-wrap gap-x-5 gap-y-2">
        {["All", ...options].map((value) => (
          <label
            key={value}
            data-value={value}
            className="flex cursor-pointer items-center gap-2 py-0.5 text-sm"
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
            {value}
          </label>
        ))}
      </div>
    </fieldset>
  );
}
export function WorkflowSteps({ item }: { item: Entity }) {
  const steps = [
    "Draft",
    "Test ready",
    "Test passed",
    "Sign-off requested",
    "Signed off",
    "Deployed",
  ];
  const states = studioStatuses.filter((s) => s !== "TEST FAILED");
  const failed = item.status === "TEST FAILED";
  const current = failed ? 2 : states.indexOf(item.status);
  return (
    <ol className="nm-steps" aria-label={`Workflow: ${item.status}`}>
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
