import { useEffect, useId, useRef } from "react";
import { ChevronDown, ChevronRight, CircleHelp } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
} from "@/components/ui/dropdown-menu";
import {
  alertCriteria,
  defaultAlertFilters,
  filterAlerts,
  type Alert,
  type AlertFilters,
  type MonitoringTarget,
} from "./alerts";

function ColumnFilter({
  label,
  value,
  options,
  onChange,
}: {
  label: string;
  value: string;
  options: string[];
  onChange: (value: string) => void;
}) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button
          className="nm-alert-filter"
          aria-label={`Filter by ${label}`}
          aria-pressed={value !== "All"}
          title={`${label}: ${value}`}
        >
          <ChevronDown size={14} aria-hidden="true" />
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent
        align="start"
        className="max-h-72 max-w-[calc(100vw-24px)] overflow-y-auto"
      >
        <DropdownMenuRadioGroup
          value={value}
          onValueChange={onChange}
          aria-label={`${label} filter`}
        >
          {["All", ...options].map((option) => (
            <DropdownMenuRadioItem key={option} value={option}>
              {option}
            </DropdownMenuRadioItem>
          ))}
        </DropdownMenuRadioGroup>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

export function AlertList({
  alerts,
  onActivity,
  filters,
  onFilters,
  showInfo,
  onShowInfo,
  returnedAlertId,
}: {
  alerts: Alert[];
  onActivity: (target: MonitoringTarget) => void;
  filters: AlertFilters;
  onFilters: (filters: AlertFilters) => void;
  showInfo: boolean;
  onShowInfo: (show: boolean) => void;
  returnedAlertId: string;
}) {
  const infoId = useId();
  const returnedRow = useRef<HTMLTableRowElement>(null);
  const matching = filterAlerts(alerts, filters);
  const primary = matching.filter((alert) => alert.level !== "INFO");
  const info = matching.filter((alert) => alert.level === "INFO");
  const filtered = Object.values(filters).some((value) => value !== "All");
  useEffect(() => {
    returnedRow.current?.scrollIntoView({ block: "center" });
    returnedRow.current?.focus({ preventScroll: true });
  }, [
    returnedAlertId,
    showInfo,
    filters.level,
    filters.profile,
    filters.guardrail,
  ]);
  const columnFilter = (
    field: keyof AlertFilters,
    label: string,
    options: string[],
  ) => (
    <ColumnFilter
      label={label}
      value={filters[field]}
      options={options}
      onChange={(value) => {
        onFilters({ ...filters, [field]: value });
        if (field === "level" && value === "INFO") onShowInfo(true);
      }}
    />
  );
  const renderAlert = (alert: Alert) => (
    <tr
      key={alert.id}
      ref={returnedAlertId === alert.id ? returnedRow : undefined}
      tabIndex={returnedAlertId === alert.id ? -1 : undefined}
      data-returned={returnedAlertId === alert.id}
    >
      <td>{alert.event}</td>
      <td>
        <span className={`nm-alert-badge ${alert.level.toLowerCase()}`}>
          {alert.level}
        </span>
      </td>
      <td>{alert.profile}</td>
      <td>{alert.guardrail}</td>
      <td className="nm-alert-details">
        <p>
          <strong>Rule:</strong> {alert.rule}
        </p>
        <p>
          <strong>Reason:</strong> {alert.reason}
        </p>
        <p className="nm-muted">{alert.evidence}</p>
        {alert.target ? (
          <Button
            size="sm"
            variant="outline"
            onClick={() => onActivity(alert.target!)}
          >
            View activity
          </Button>
        ) : (
          <small>Statistical alert · multiple-event evidence</small>
        )}
      </td>
    </tr>
  );
  return (
    <section className="nm-card nm-alerts">
      <div className="nm-card-head">
        <h3>Alerts</h3>
        <span>
          Demo snapshot · {primary.length + (showInfo ? info.length : 0)} shown
          / {matching.length} matching / {alerts.length} total
        </span>
      </div>
      {filtered && (
        <div className="nm-alert-filter-summary">
          {Object.entries(filters)
            .filter(([, value]) => value !== "All")
            .map(([key, value]) => (
              <span key={key}>
                {key}: {value}
              </span>
            ))}
          <button
            className="nm-link"
            onClick={() => {
              onFilters(defaultAlertFilters);
              onShowInfo(false);
            }}
          >
            Clear alert filters
          </button>
        </div>
      )}
      <div className="nm-scroll">
        <table>
          <thead>
            <tr>
              <th>Event</th>
              <th>
                <span className="nm-alert-level-heading">
                  Level
                  <Popover>
                    <PopoverTrigger asChild>
                      <button
                        aria-label="Alert level criteria"
                        className="nm-alert-help"
                      >
                        <CircleHelp size={15} />
                      </button>
                    </PopoverTrigger>
                    <PopoverContent
                      side="right"
                      align="start"
                      collisionPadding={12}
                      className="nm-app max-h-[calc(100vh-24px)] w-96 max-w-[calc(100vw-32px)] overflow-y-auto p-4"
                    >
                      <h3>Alert level criteria</h3>
                      <p className="nm-muted mt-2">
                        Demo criteria · Profile thresholds are configured at
                        creation or revision.
                      </p>
                      <dl className="nm-alert-criteria">
                        {alertCriteria.map(([level, description]) => (
                          <div key={level}>
                            <dt>{level}</dt>
                            <dd>{description}</dd>
                          </div>
                        ))}
                      </dl>
                      <p className="nm-muted mt-3">
                        Passed checks and forced Block all / Pass all modes do
                        not create policy-risk alerts. Statistical alerts use
                        all checks in the current demo snapshot, not a rolling
                        time window.
                      </p>
                    </PopoverContent>
                  </Popover>
                  {columnFilter("level", "Level", [
                    "CRITICAL",
                    "WARNING",
                    "INFO",
                  ])}
                </span>
              </th>
              <th>
                <span className="nm-alert-level-heading">
                  Profile ID{" "}
                  {columnFilter("profile", "Profile ID", [
                    ...new Set(alerts.map((alert) => alert.profile)),
                  ])}
                </span>
              </th>
              <th>
                <span className="nm-alert-level-heading">
                  Guardrail ID{" "}
                  {columnFilter("guardrail", "Guardrail ID", [
                    ...new Set(alerts.map((alert) => alert.guardrail)),
                  ])}
                </span>
              </th>
              <th>Details</th>
            </tr>
          </thead>
          <tbody>
            {primary.map(renderAlert)}
            {!!info.length && (
              <tr className="nm-info-alert-toggle">
                <td colSpan={5}>
                  <button
                    className="nm-info-disclosure"
                    aria-expanded={showInfo}
                    aria-controls={infoId}
                    onClick={() => onShowInfo(!showInfo)}
                  >
                    {showInfo ? (
                      <ChevronDown size={16} />
                    ) : (
                      <ChevronRight size={16} />
                    )}
                    {showInfo ? "Hide" : "Show"} INFO alerts ({info.length})
                  </button>
                </td>
              </tr>
            )}
          </tbody>
          <tbody id={infoId}>{showInfo && info.map(renderAlert)}</tbody>
        </table>
      </div>
      {!matching.length && (
        <p className="nm-empty">
          {alerts.length
            ? "No alerts match these filters."
            : "No alerts in this snapshot."}
        </p>
      )}
    </section>
  );
}
