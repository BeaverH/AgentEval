import { Fragment, useEffect, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import {
  FlaskConical,
  Search,
  Plus,
  ArrowLeft,
  ChevronRight,
  X,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Sheet, SheetTitle, SheetDescription } from "@/components/ui/sheet";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import {
  addEntity,
  controlUnits,
  editEntity,
  reviseEntity,
  deployedEntity,
  accounts,
  roleForOwner,
  canAuthor,
  allowed,
  seed,
  transition,
  type Action,
  type Entity,
  type Kind,
  type Run,
  type State,
} from "./model";
import { NmgrShell, type View } from "./shell";
import "./nmgr.css";
import { ResizableSheetContent } from "./resizable-sheet";
import { TestRecords } from "./test-records";
import {
  ProfileMonitoring,
  MonitoringMetrics,
  profileScans,
} from "./monitoring";
import { UnifiedConfigForm } from "../business-demo/unified-config-form";
import {
  emptyConfig,
  configError,
  type UnifiedConfig,
} from "../business-demo/evaluation";
import { GuardrailInfo } from "./guardrail-info";
import {
  CheckboxFilter,
  WorkflowSteps,
  filterFields,
  filterValue,
  matchesFilters,
  studioStatuses,
  type Filters,
} from "./studio";

import { completeDemoState } from "./mock-data";
import { AlertList } from "./alert-list";
import { ActivityLogs } from "./activity-logs";
import {
  buildAlerts,
  defaultAlertFilters,
  profileAlertCounts,
  monitoringHash,
  readMonitoringTarget,
  type MonitoringTarget,
  type AlertFilters,
} from "./alerts";

const storage = "nmgr-prototype-v1";
const stamp = (v: string) =>
  new Date(v).toLocaleString("en-GB", { timeZone: "Asia/Shanghai" });
const version = (v: number | null) => (v === null ? "None" : `${v}.0`);
function Badge({ children }: { children: React.ReactNode }) {
  return (
    <span
      className={`nm-badge ${["Error", "CRITICAL", "Pass all"].includes(String(children)) ? "warning" : ["Blocked", "Block all"].includes(String(children)) ? "bad" : ["Detected", "Transferred"].includes(String(children)) ? "info" : ""} ${String(children).includes("FAIL") ? "bad" : ["DEPLOYED", "SIGNED OFF", "TEST PASSED", "Normal"].includes(String(children)) ? "good" : ""}`}
    >
      {children}
    </span>
  );
}
function Select({
  label,
  value,
  options,
  onChange,
}: {
  label: string;
  value: string;
  options: string[];
  onChange: (v: string) => void;
}) {
  return (
    <label className="nm-select">
      <span>{label}</span>
      <select
        aria-label={label}
        value={value}
        onChange={(e) => onChange(e.target.value)}
      >
        {options.map((x) => (
          <option key={x}>{x}</option>
        ))}
      </select>
    </label>
  );
}
export function NmgrApp() {
  const [state, setState] = useState<State>(() => seed());
  const [ready, setReady] = useState(false);
  const [owner, setOwner] = useState(() => {
    try {
      const value = localStorage.getItem("nmgr-owner");
      return value && accounts.includes(value) ? value : "Admin";
    } catch {
      return "Admin";
    }
  });
  const role = roleForOwner(owner);
  useEffect(() => {
    try {
      localStorage.setItem("nmgr-owner", owner);
    } catch {}
  }, [owner]);
  function switchOwner(value: string) {
    if (busy) return;
    setOwner(value);
    setModal(null);
    setDirty(false);
    setConfirmClose(false);
    try {
      localStorage.setItem("nmgr-owner", value);
    } catch {}
  }
  const [dirty, setDirty] = useState(false);
  const [confirmClose, setConfirmClose] = useState(false);
  function closeModal() {
    if (busy) return;
    if (dirty) {
      setConfirmClose(true);
      return;
    }
    setModal(null);
    setConfirmClose(false);
  }

  const [view, setView] = useState<View>("repository");
  const [kind, setKind] = useState<Kind>("Guardrail");
  const [selected, setSelected] = useState("");
  const [monitorGuardrail, setMonitorGuardrail] = useState("");
  const [search, setSearch] = useState("");
  const [unit, setUnit] = useState("All");
  const [location, setLocation] = useState("All");
  const [studioFilters, setStudioFilters] = useState<Filters>({});
  const [page, setPage] = useState(1);
  const [expandedProfiles, setExpandedProfiles] = useState<string[]>([]);
  const [monitoringTarget, setMonitoringTarget] =
    useState<MonitoringTarget | null>(null);
  const [alertFilters, setAlertFilters] =
    useState<AlertFilters>(defaultAlertFilters);
  const [showInfoAlerts, setShowInfoAlerts] = useState(false);
  const [returnedAlertId, setReturnedAlertId] = useState("");
  const repositoryFiltersRef = useRef<HTMLDivElement>(null);
  useLayoutEffect(() => {
    if (kind !== "Guardrail" || view !== "repository") return;
    const root = repositoryFiltersRef.current;
    const options = root?.querySelector(
      '[data-filter="Status"] .nm-filter-options',
    );
    const labels = options?.querySelectorAll("label");
    const all = labels?.[0],
      draft = labels?.[1];
    if (!root || !options || !all || !draft) return;
    const syncGap = () => {
      const gap =
        draft.getBoundingClientRect().left - all.getBoundingClientRect().right;
      root.style.setProperty(
        "--nm-repository-option-gap",
        `${Math.max(0, gap)}px`,
      );
    };
    syncGap();
    const observer = new ResizeObserver(syncGap);
    observer.observe(options);
    observer.observe(all);
    observer.observe(draft);
    return () => observer.disconnect();
  }, [kind, view]);
  const [modal, setModal] = useState<
    "create" | "edit" | Action | "report" | "reset" | null
  >(null);
  const [report, setReport] = useState<Run | null>(null);
  const [error, setError] = useState("");
  const [notification, setNotification] = useState({ message: "", id: 0 });
  function setNotice(message: string) {
    setNotification((previous) => ({ message, id: previous.id + 1 }));
  }
  useEffect(() => {
    if (!notification.message) return;
    const timer = window.setTimeout(() => {
      setNotification((current) =>
        current.id === notification.id ? { ...current, message: "" } : current,
      );
    }, 5000);
    return () => window.clearTimeout(timer);
  }, [notification]);
  const [busy, setBusy] = useState(false);
  const [dataset, setDataset] = useState("PII acceptance suite");
  const [cases, setCases] = useState(24);
  const [fail, setFail] = useState(false);
  const [reason, setReason] = useState("");
  const [policies, setPolicies] = useState(
    "Detect personal identifiers in input and output.\nBlock disclosure of unmasked customer information.",
  );
  const [technical, setTechnical] = useState<UnifiedConfig>(emptyConfig);
  const [tab, setTab] = useState("Info");
  const [logType, setLogType] = useState("Audit Log");
  useEffect(() => {
    try {
      const raw = localStorage.getItem(storage);
      if (raw) {
        const x = JSON.parse(raw);
        if (!Array.isArray(x.entities) || !Array.isArray(x.audit))
          throw new Error();
        setState(completeDemoState(x));
      }
    } catch {
      setNotice("Saved demo data could not be read. Sample data loaded.");
    }
    setReady(true);
    const read = () => {
      const [k, v, id] = locationHash();
      setMonitorGuardrail("");
      setMonitoringTarget(readMonitoringTarget(window.location.hash));
      setKind(k);
      setView(v);
      setSelected(id);
      setTab(v === "operations" ? "Monitoring" : "Info");
    };
    read();
    window.addEventListener("hashchange", read);
    return () => window.removeEventListener("hashchange", read);
  }, []);
  useEffect(() => {
    if (ready)
      try {
        localStorage.setItem(storage, JSON.stringify(state));
      } catch {
        setNotice(
          "Browser storage is full. Changes remain available until this page is closed.",
        );
      }
  }, [state, ready]);
  useEffect(
    () => setPage(1),
    [search, unit, location, studioFilters, kind, view],
  );
  const e = state.entities.find((x) => x.id === selected);
  const monitoringGuardrail = state.entities
    .map(deployedEntity)
    .find((item) => item.id === monitorGuardrail);
  function go(k: Kind, v: View, id = "", target?: MonitoringTarget) {
    setMonitorGuardrail("");
    setMonitoringTarget(target ?? null);
    window.location.hash = target
      ? monitoringHash(target)
      : `${k}/${v}/${encodeURIComponent(id)}`;
    setKind(k);
    setView(v);
    setSelected(id);
    if (k !== kind || v !== view || target) {
      setSearch("");
      setStudioFilters({});
      setUnit("All");
      setLocation("All");
    }
    setTab(v === "operations" ? "Monitoring" : "Info");
  }
  function open(action: typeof modal, item?: Entity) {
    if (item) setSelected(item.id);
    setModal(action);
    setDirty(false);
    setConfirmClose(false);
    setError("");
    setReason("");
    setFail(false);
    setPolicies((item?.policies ?? e?.policies ?? []).join("\n"));
    setTechnical(item?.config ?? e?.config ?? emptyConfig());
  }
  function perform(action: Action) {
    if (!e) return;
    try {
      if (action === "deploy" && fail)
        throw new Error(
          "Demo deployment failed. No version was changed. Retry or contact the support team.",
        );
      const next = transition(state, e.id, action, role, {
        actorName: owner,
        dataset,
        cases,
        reason,
        policies: policies
          .split("\n")
          .map((x) => x.trim())
          .filter(Boolean),
        ...(action === "implement" &&
        (e.config ||
          technical.content.trim() ||
          technical.scannerType !== "custom")
          ? { config: technical }
          : {}),
      });
      setState(next);
      setModal(null);
      setNotice(
        `${e.name}: ${action === "deploy" ? "deployed successfully" : action === "reject" ? "request rejected; returned to TEST READY" : action === "approve" ? "request approved; ready for deployment" : action === "request" ? "signoff request submitted" : "updated successfully"}.`,
      );
    } catch (x) {
      setError(x instanceof Error ? x.message : "Unable to complete action.");
    }
  }
  function changeMode(item: Entity, mode: Entity["mode"]) {
    if (mode === item.mode) return;
    try {
      setState(transition(state, item.id, mode, role, { actorName: owner }));
      setNotice(`${item.name}: mode changed to ${mode}.`);
    } catch (x) {
      setNotice(x instanceof Error ? x.message : "Unable to change mode.");
    }
  }
  function runTest() {
    setBusy(true);
    setError("");
    window.setTimeout(() => {
      perform(fail ? "test-fail" : "test-pass");
      setBusy(false);
    }, 650);
  }
  const isStudio = ["repository", "tests", "signoff"].includes(view);
  const rows = state.entities
    .filter(
      (x) =>
        x.kind === kind &&
        (view === "tests"
          ? ["TEST READY", "TEST FAILED", "TEST PASSED"].includes(x.status)
          : view === "signoff"
            ? x.status === "SIGNOFF REQUESTED"
            : view === "deploy"
              ? x.status === "SIGNED OFF"
              : view === "operations"
                ? x.deployed !== null
                : true),
    )
    .map((x) => (view === "operations" ? deployedEntity(x) : x))
    .filter(
      (x) =>
        `${x.name} ${x.id} ${x.description}`
          .toLowerCase()
          .includes(search.toLowerCase()) &&
        (!isStudio || matchesFilters(x, studioFilters)) &&
        (unit === "All" || x.unit === unit) &&
        (location === "All" || x.location === location || x.location === "ALL"),
    );
  useEffect(() => {
    if (view !== "operations" || !monitoringTarget) return;
    const index = rows.findIndex(
      (item) => item.id === monitoringTarget.profile,
    );
    if (index >= 0) {
      setPage(Math.floor(index / 6) + 1);
      setExpandedProfiles((ids) =>
        ids.includes(monitoringTarget.profile)
          ? ids
          : [...ids, monitoringTarget.profile],
      );
    }
  }, [monitoringTarget, view, state.entities]);
  const activeProfiles = state.entities
    .filter((x) => x.kind === "Profile" && x.deployed !== null)
    .map(deployedEntity);
  const scans = activeProfiles.flatMap((p) => profileScans(p, state));
  const alerts = buildAlerts(activeProfiles, scans);
  const alertCountsByProfile = new Map(
    activeProfiles.map((profile) => [
      profile.id,
      profileAlertCounts(alerts, profile.id),
    ]),
  );
  function backToAlerts(activity: string) {
    const alert = alerts.find((item) => item.target?.activity === activity);
    setReturnedAlertId(alert?.id ?? "");
    if (alert?.level === "INFO") setShowInfoAlerts(true);
    // A refreshed deep link can return to a board with default filters.
    if (alert)
      setAlertFilters((filters) => ({
        level:
          filters.level === "All" || filters.level === alert.level
            ? filters.level
            : "All",
        profile:
          filters.profile === "All" || filters.profile === alert.profile
            ? filters.profile
            : "All",
        guardrail:
          filters.guardrail === "All" || filters.guardrail === alert.guardrail
            ? filters.guardrail
            : "All",
      }));
    go("Profile", "dashboard");
  }
  const title =
    view === "dashboard"
      ? "Guardrail Dashboard"
      : view === "logs"
        ? "Activity Logs"
        : view === "operations"
          ? "Monitoring"
          : view === "deploy"
            ? `Deploy ${kind}s`
            : view === "tests"
              ? `${kind} Test Base`
              : view === "signoff"
                ? `${kind} Sign-Off`
                : `${kind}s`;
  const filters = isStudio ? (
    <>
      <div className="flex flex-wrap items-center gap-3 border-b p-4">
        <div className="relative min-w-40 flex-1 sm:max-w-lg">
          <Search className="pointer-events-none absolute top-3 left-3 size-4 text-muted-foreground" />
          <Input
            className="h-10 bg-white pl-9"
            aria-label={`Search ${kind}s`}
            placeholder={`Search ${kind.toLowerCase()}s…`}
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
      </div>
      <div
        ref={repositoryFiltersRef}
        className={`nm-studio-filters space-y-4 border-b bg-zinc-50/40 px-5 py-4 ${kind === "Profile" ? "nm-profile-filters" : kind === "Guardrail" && view === "repository" ? "nm-guardrail-repository-filters" : ""}`}
      >
        {filterFields
          .filter(
            (field) =>
              kind === "Profile" ||
              !["bu", "agent", "data"].includes(field.key),
          )
          .map((field) => {
            const options =
              field.key === "status"
                ? view === "tests"
                  ? ["TEST READY", "TEST FAILED", "TEST PASSED"]
                  : view === "signoff"
                    ? ["SIGNOFF REQUESTED"]
                    : studioStatuses
                : field.key === "unit"
                  ? controlUnits
                  : [
                      ...new Set([
                        ...field.options,
                        ...state.entities
                          .filter((x) => x.kind === kind)
                          .map((x) => filterValue(x, field.key))
                          .filter((value) => value && value !== "ALL"),
                      ]),
                    ];
            return (
              <CheckboxFilter
                key={field.key}
                label={field.label}
                options={options}
                selected={studioFilters[field.key] ?? []}
                onChange={(values) =>
                  setStudioFilters((current) => ({
                    ...current,
                    [field.key]: values,
                  }))
                }
              />
            );
          })}
        {Object.values(studioFilters).some((values) => values.length) && (
          <Button
            variant="ghost"
            size="sm"
            onClick={() => setStudioFilters({})}
          >
            Clear filters
          </Button>
        )}
      </div>
    </>
  ) : (
    <div
      className={`nm-filters ${view === "operations" ? "nm-monitor-filters" : ""}`}
    >
      <div className="nm-search">
        <Search size={17} />
        <Input
          aria-label="Search"
          placeholder={`Search ${kind}s by keywords…`}
          value={search}
          onChange={(x) => setSearch(x.target.value)}
        />
      </div>
      <Select
        label="Control Unit"
        value={unit}
        onChange={setUnit}
        options={["All", ...controlUnits]}
      />
      <Select
        label="Location"
        value={location}
        onChange={setLocation}
        options={["All", "SG", "CN", "IN", "ID", "HK", "TW"]}
      />
    </div>
  );
  const runs = (item: Entity) => (
    <TestRecords
      key={item.id}
      item={item}
      onReport={(run) => {
        setReport(run);
        open("report");
      }}
    />
  );
  const info = (item: Entity) =>
    item.kind === "Guardrail" ? (
      <GuardrailInfo
        item={item}
        state={state}
        onProfile={(id) => go("Profile", "repository", id)}
      />
    ) : (
      <>
        <div className="nm-facts">
          {[
            ["Control Unit", item.unit],
            ["Jurisdiction", item.location],
            ["Custodian", item.custodian],
            ["Sign-Off Approver", item.approver],
            ["Mandatory", item.mandatory ? "Yes" : "No"],
            ["Alert threshold", `${item.threshold}%`],
            [
              "Target / Deployed",
              `${version(item.version)} / ${version(item.deployed)}`,
            ],
          ].map(([k, v]) => (
            <div key={k}>
              <small>{k}</small>
              <strong>{v}</strong>
            </div>
          ))}
        </div>
        <section className="nm-card nm-padding">
          <h3>Description</h3>
          <p>{item.description}</p>
          <h3>Guardrails & matching attributes</h3>
          {item.status === "DRAFT" ? (
            <p className="nm-callout">
              Please wait while your policies are being implemented by Tech.
              Come back when TEST READY.
            </p>
          ) : (
            <>
              <p>
                BU/SU: {item.attributes.bu} · Agent Type:{" "}
                {item.attributes.agent} · Data Type: {item.attributes.data}
              </p>
              {item.refs.map((id) => (
                <button
                  className="nm-link"
                  key={id}
                  onClick={() => go("Guardrail", "repository", id)}
                >
                  {state.entities.find((x) => x.id === id)?.name ?? id} →
                </button>
              ))}
            </>
          )}
        </section>
      </>
    );
  return (
    <>
      <NmgrShell
        kind={kind}
        view={view}
        owner={owner}
        busy={busy}
        onOwner={switchOwner}
        onNavigate={go}
      >
        <div className="nm-heading">
          <div>
            <h1>{title}</h1>
          </div>
          {view === "repository" && (
            <Button disabled={!canAuthor(role)} onClick={() => open("create")}>
              <Plus size={16} />
              New {kind === "Guardrail" ? "GR" : "Profile"}
            </Button>
          )}
        </div>
        {view === "operations" && (
          <p className="nm-deployed-protection">
            Deployed Protection · <strong>{activeProfiles.length}</strong>{" "}
            Profiles /{" "}
            <strong>
              {
                state.entities.filter(
                  (g) => g.kind === "Guardrail" && g.deployed !== null,
                ).length
              }
            </strong>{" "}
            Guardrails
          </p>
        )}
        {view === "dashboard" ? (
          <>
            <MonitoringMetrics scans={scans} />
            <AlertList
              alerts={alerts}
              filters={alertFilters}
              onFilters={setAlertFilters}
              showInfo={showInfoAlerts}
              onShowInfo={setShowInfoAlerts}
              returnedAlertId={returnedAlertId}
              onActivity={(target) => {
                setReturnedAlertId("");
                go("Profile", "operations", "", target);
              }}
            />
          </>
        ) : view === "logs" ? (
          <>
            <div className="nm-tabs">
              {["Audit Log", "Detection Log"].map((t) => (
                <button
                  className={logType === t ? "active" : ""}
                  key={t}
                  onClick={() => setLogType(t)}
                >
                  {t}
                </button>
              ))}
            </div>
            <ActivityLogs
              key={logType}
              state={state}
              scans={scans}
              type={logType}
            />
          </>
        ) : (
          <>
            {view === "operations" && (
              <div className="nm-operation-summary">
                {(["Normal", "Pass all", "Block all"] as const).map((mode) => (
                  <div
                    key={mode}
                    className={
                      mode === "Normal"
                        ? "normal"
                        : mode === "Pass all"
                          ? "bypass"
                          : "block"
                    }
                  >
                    <span>
                      {mode === "Normal"
                        ? "Protection active"
                        : mode === "Pass all"
                          ? "Bypassed profiles"
                          : "Blocking all traffic"}
                    </span>
                    <strong>
                      {
                        activeProfiles.filter(
                          (profile) => profile.mode === mode,
                        ).length
                      }
                    </strong>
                    <small>
                      {mode === "Normal"
                        ? "Guardrails are checking traffic"
                        : mode === "Pass all"
                          ? "Traffic skips protection"
                          : "All matching requests are blocked"}
                    </small>
                  </div>
                ))}
              </div>
            )}
            {!isStudio && filters}
            <section className="nm-card">
              {isStudio && filters}
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
                      <th>{view === "operations" ? "Mode" : "Status"}</th>
                      <th>Ctrl Unit</th>
                      <th>Last Modified</th>
                      <th>Action</th>
                    </tr>
                  </thead>
                  <tbody>
                    {rows.slice((page - 1) * 6, page * 6).map((item) => (
                      <Fragment key={item.id}>
                        <tr>
                          <td>
                            <div
                              className={
                                view === "operations"
                                  ? "nm-profile-identity"
                                  : undefined
                              }
                            >
                              {view === "operations" && (
                                <Button
                                  variant="ghost"
                                  size="icon"
                                  className="nm-profile-expand"
                                  aria-label={`${expandedProfiles.includes(item.id) ? "Collapse" : "Expand"} monitoring for ${item.name}`}
                                  aria-expanded={expandedProfiles.includes(
                                    item.id,
                                  )}
                                  aria-controls={`monitoring-${item.id}`}
                                  onClick={() =>
                                    setExpandedProfiles((ids) =>
                                      ids.includes(item.id)
                                        ? ids.filter((id) => id !== item.id)
                                        : [...ids, item.id],
                                    )
                                  }
                                >
                                  <ChevronRight size={16} />
                                </Button>
                              )}
                              <div>
                                <div
                                  className={
                                    view === "operations"
                                      ? "nm-profile-title"
                                      : undefined
                                  }
                                >
                                  <strong>{item.name}</strong>
                                  {view === "operations" && (
                                    <span className="nm-profile-alert-counts">
                                      {(["critical", "warning"] as const).map(
                                        (level) => (
                                          <span
                                            key={level}
                                            className={`nm-alert-badge nm-alert-count ${level}`}
                                            aria-label={`${alertCountsByProfile.get(item.id)?.[level] ?? 0} ${level.toUpperCase()} alerts for ${item.name}`}
                                            title={`${level.toUpperCase()} alerts: ${alertCountsByProfile.get(item.id)?.[level] ?? 0}`}
                                          >
                                            {alertCountsByProfile.get(
                                              item.id,
                                            )?.[level] ?? 0}
                                          </span>
                                        ),
                                      )}
                                    </span>
                                  )}
                                </div>
                                <small>
                                  ID: {item.id} · Deployed Ver.:{" "}
                                  {version(item.deployed)} ·{" "}
                                  {kind === "Guardrail"
                                    ? `${state.entities.filter((p) => p.deployed !== null && p.deployedRefs.includes(item.id)).length} Active Profile Refs.`
                                    : `${item.refs.length} Guardrails Set`}
                                </small>
                              </div>
                            </div>
                          </td>
                          <td>
                            <Badge>
                              {view === "operations" ? item.mode : item.status}
                            </Badge>
                          </td>
                          <td>{item.unit}</td>
                          <td>{stamp(item.updated)}</td>
                          <td>
                            {view === "operations" ? (
                              <div className="nm-select">
                                <select
                                  aria-label={`Mode for ${item.name}`}
                                  value={item.mode ?? "Normal"}
                                  disabled={
                                    !["Normal", "Pass all", "Block all"].some(
                                      (mode) =>
                                        allowed(item, mode as Action, role),
                                    )
                                  }
                                  onChange={(event) =>
                                    changeMode(
                                      item,
                                      event.target.value as Entity["mode"],
                                    )
                                  }
                                >
                                  {(
                                    ["Normal", "Pass all", "Block all"] as const
                                  ).map((mode) => (
                                    <option
                                      key={mode}
                                      value={mode}
                                      disabled={
                                        mode !== item.mode &&
                                        !allowed(item, mode, role)
                                      }
                                    >
                                      {mode}
                                    </option>
                                  ))}
                                </select>
                              </div>
                            ) : (
                              <Button
                                variant="outline"
                                onClick={() => go(kind, view, item.id)}
                              >
                                {view === "tests"
                                  ? item.status === "TEST READY"
                                    ? "Go Test"
                                    : "View"
                                  : view === "signoff"
                                    ? "Sign off"
                                    : view === "deploy"
                                      ? "Go Deploy"
                                      : "View"}
                                <ChevronRight size={14} />
                              </Button>
                            )}
                          </td>
                        </tr>
                        {view === "operations" &&
                          expandedProfiles.includes(item.id) && (
                            <tr
                              className="nm-profile-monitor-row"
                              id={`monitoring-${item.id}`}
                            >
                              <td colSpan={5}>
                                <div className="nm-profile-monitor-content">
                                  <ProfileMonitoring
                                    profile={item}
                                    state={state}
                                    onGuardrail={setMonitorGuardrail}
                                    target={
                                      monitoringTarget?.profile === item.id
                                        ? monitoringTarget
                                        : null
                                    }
                                    onBackToAlerts={backToAlerts}
                                  />
                                </div>
                              </td>
                            </tr>
                          )}
                      </Fragment>
                    ))}
                  </tbody>
                </table>
              </div>
              {!rows.length && (
                <div className="nm-empty">
                  {view === "deploy" && !search
                    ? "All signed-off revisions are deployed, or awaiting sign-off."
                    : "No matching records."}
                </div>
              )}
              <footer className="nm-pagination">
                <span>
                  {rows.length
                    ? `${(page - 1) * 6 + 1}–${Math.min(page * 6, rows.length)}`
                    : "0"}{" "}
                  of {rows.length}
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
                  Page {page} / {Math.max(1, Math.ceil(rows.length / 6))}
                </span>
                <Button
                  size="sm"
                  variant="outline"
                  disabled={page * 6 >= rows.length}
                  onClick={() => setPage(page + 1)}
                >
                  Next
                </Button>
              </footer>
            </section>
          </>
        )}
      </NmgrShell>
      {notification.message &&
        createPortal(
          <div
            key={notification.id}
            className="nm-notice"
            role="status"
            aria-live="polite"
            aria-atomic="true"
          >
            <span>{notification.message}</span>
            <button
              type="button"
              aria-label="Dismiss notification"
              onClick={() => setNotice("")}
            >
              <X size={16} aria-hidden="true" />
            </button>
          </div>,
          document.body,
        )}
      <Sheet
        open={!!monitoringGuardrail}
        onOpenChange={(value) => {
          if (!value) setMonitorGuardrail("");
        }}
      >
        <ResizableSheetContent
          aria-describedby={undefined}
          className="nm-app nm-drawer gap-0 bg-white data-[side=right]:w-full data-[side=right]:sm:max-w-[600px]"
        >
          <div className="border-b px-6 py-5 pr-14">
            <SheetTitle className="text-xl">
              {monitoringGuardrail?.name}
            </SheetTitle>
            <p className="nm-muted">
              Deployed Guardrail · v{monitoringGuardrail?.deployed}.0
            </p>
          </div>
          <div className="nm-detail-scroll overflow-y-auto px-6 py-5">
            {monitoringGuardrail && (
              <GuardrailInfo
                item={monitoringGuardrail}
                state={state}
                onProfile={(id) => go("Profile", "operations", id)}
              />
            )}
          </div>
        </ResizableSheetContent>
      </Sheet>
      <Sheet
        open={!!e && !["dashboard", "logs"].includes(view)}
        onOpenChange={(value) => {
          if (!value && !modal && !monitorGuardrail) go(kind, view);
        }}
      >
        <ResizableSheetContent
          aria-describedby={undefined}
          className="nm-app nm-drawer gap-0 bg-white data-[side=right]:w-full data-[side=right]:sm:max-w-[600px]"
        >
          <div className="border-b px-6 py-5 pr-14">
            <SheetTitle className="text-xl">{e?.name}</SheetTitle>
          </div>
          <div className="nm-detail-scroll overflow-y-auto px-6 py-5">
            {e && (
              <>
                <Button variant="ghost" onClick={() => go(kind, view)}>
                  <ArrowLeft size={16} />
                  Back to {title}
                </Button>
                <div className="nm-detail-head">
                  <div>
                    <Badge>{e.status}</Badge>
                    <p className="nm-muted">
                      ID: {e.id} · Deployed Ver.: {version(e.deployed)} ·{" "}
                      {e.kind === "Guardrail"
                        ? `${state.entities.filter((p) => p.deployed !== null && p.deployedRefs.includes(e.id)).length} Active Profile Refs.`
                        : `${e.refs.length} Guardrails Set`}
                    </p>
                  </div>
                  <div className="nm-actions">
                    {(
                      [
                        "implement",
                        "request",
                        "approve",
                        "reject",
                        "deploy",
                        "revise",
                      ] as Action[]
                    )
                      .filter((a) => allowed(e, a, role))
                      .map((a) => (
                        <Button
                          key={a}
                          variant={
                            ["reject", "revise"].includes(a)
                              ? "outline"
                              : "default"
                          }
                          onClick={() => open(a)}
                        >
                          {
                            {
                              implement: "Mark implemented",
                              request: "Request Signoff",
                              approve: "Approve",
                              reject: "Reject",
                              deploy: "Go Deploy",
                              revise: "Modify",
                            }[a as "implement"]
                          }
                        </Button>
                      ))}
                    {allowed(e, "test-pass", role) && (
                      <Button
                        onClick={() =>
                          view === "tests"
                            ? open("test-pass")
                            : go(kind, "tests", e.id)
                        }
                      >
                        <FlaskConical size={16} />
                        {view === "tests" ? "Run Test" : "Go Test"}
                      </Button>
                    )}
                  </div>
                </div>
                <WorkflowSteps item={e} />
                <div className="nm-actions nm-detail-secondary-actions">
                  {canAuthor(role) &&
                    [
                      "DRAFT",
                      "TEST READY",
                      "TEST FAILED",
                      "TEST PASSED",
                    ].includes(e.status) && (
                      <Button variant="outline" onClick={() => open("edit")}>
                        Edit requirements
                      </Button>
                    )}
                  {allowed(e, "withdraw", role) && (
                    <Button variant="outline" onClick={() => open("withdraw")}>
                      Withdraw
                    </Button>
                  )}
                </div>
                {view === "tests" ? (
                  runs(e)
                ) : (
                  <>
                    <div className="nm-tabs">
                      {[
                        "Info",
                        "Tests",
                        ...(e.kind === "Profile" && e.deployed !== null
                          ? ["Monitoring"]
                          : []),
                      ].map((t) => (
                        <button
                          className={tab === t ? "active" : ""}
                          onClick={() => setTab(t)}
                          key={t}
                        >
                          {t === "Info" ? `${kind} Info` : t}
                        </button>
                      ))}
                    </div>
                    {tab === "Tests" ? (
                      runs(e)
                    ) : tab === "Monitoring" ? (
                      <ProfileMonitoring
                        key={e.id}
                        profile={e}
                        state={state}
                        onGuardrail={setMonitorGuardrail}
                      />
                    ) : (
                      info(e)
                    )}
                  </>
                )}
              </>
            )}
          </div>
        </ResizableSheetContent>
      </Sheet>
      <Sheet
        open={modal !== null}
        onOpenChange={(v) => {
          if (!v) closeModal();
        }}
      >
        <ResizableSheetContent
          className="nm-app nm-drawer gap-4 bg-white overflow-y-auto p-6 pt-8 data-[side=right]:w-full data-[side=right]:sm:max-w-[600px]"
          showCloseButton={!busy}
          onEscapeKeyDown={(x) => {
            if (busy) x.preventDefault();
          }}
          onInteractOutside={(x) => {
            if (busy) x.preventDefault();
          }}
        >
          <SheetTitle>
            {modal === "revise"
              ? `Modify ${kind} · v${(e?.version ?? 0) + 1}.0`
              : modal === "edit"
                ? `Edit ${kind}`
                : modal === "create"
                  ? `Create ${kind}`
                  : modal === "report"
                    ? "Test Report"
                    : modal === "reset"
                      ? "Reset Demo workspace?"
                      : modal === "test-pass"
                        ? `Run ${kind} Test`
                        : modal === "implement"
                          ? "Implemented Policies"
                          : `${modal ?? ""} ${e?.kind ?? ""}`}
          </SheetTitle>
          <SheetDescription>
            {modal === "create"
              ? "Submit a request with its business scope and ownership."
              : modal === "reset"
                ? "This clears only this NMGR Demo workspace and restores sample records."
                : modal === "report"
                  ? "Results for this recorded revision."
                  : "Review the current revision before confirming this action."}
          </SheetDescription>
          {confirmClose && (
            <div
              role="alert"
              className="flex flex-wrap items-center gap-2 border-y bg-amber-50 px-3 py-3 text-sm"
            >
              <span className="mr-auto">Discard unsaved changes?</span>
              <Button
                variant="outline"
                size="sm"
                onClick={() => setConfirmClose(false)}
              >
                Keep editing
              </Button>
              <Button
                size="sm"
                onClick={() => {
                  setModal(null);
                  setDirty(false);
                  setConfirmClose(false);
                }}
              >
                Discard
              </Button>
            </div>
          )}
          {modal === "create" || modal === "edit" || modal === "revise" ? (
            <CreateForm
              kind={kind}
              revision={modal === "revise"}
              allowTechnical={role === "Admin"}
              onCancel={closeModal}
              state={state}
              owner={owner}
              onDirty={() => setDirty(true)}
              initial={modal === "edit" || modal === "revise" ? e : undefined}
              onSave={(item) => {
                try {
                  setState(
                    modal === "revise"
                      ? reviseEntity(state, item, role, owner)
                      : modal === "edit"
                        ? editEntity(state, item, role)
                        : addEntity(state, item),
                  );
                  setModal(null);
                  setDirty(false);
                  setNotice(
                    modal === "revise"
                      ? "New revision saved. The deployed version remains active; test and sign off this revision before deploying."
                      : "Changes saved successfully.",
                  );
                } catch (x) {
                  setError((x as Error).message);
                }
              }}
            />
          ) : modal === "report" && report ? (
            <div className="nm-padding">
              <Badge>{report.passed ? "PASSED" : "TEST FAILED"}</Badge>
              <p>Dataset: {report.dataset}</p>
              <p>
                Target: {version(report.version)} · Base: {version(report.base)}
              </p>
              <p>
                {report.passed ? report.cases : Math.max(0, report.cases - 2)} /{" "}
                {report.cases} cases passed
              </p>
              <p>
                {report.passed
                  ? "Acceptance checks passed."
                  : "Personal identifiers remained visible in two demo responses. Withdraw for technical review or run another test."}
              </p>
              <small>
                Simulated Demo result; no inference service was called.
              </small>
            </div>
          ) : modal === "reset" ? (
            <Button
              onClick={() => {
                setState(seed());
                setSelected("");
                setModal(null);
                setNotice("Demo workspace reset.");
                go("Guardrail", "repository");
              }}
            >
              Reset workspace
            </Button>
          ) : e ? (
            <>
              <div className="nm-callout">
                <strong>{e.name}</strong>
                <p>
                  {e.id} · Target {version(e.version)} · Base{" "}
                  {version(e.deployed)}
                </p>
                <small>
                  Control Unit: {e.unit} · Jurisdiction: {e.location} ·
                  Approver: {e.approver}
                </small>
              </div>
              {modal === "implement" && (
                <>
                  <label>
                    Policies (one per line)
                    <Textarea
                      value={policies}
                      onChange={(x) => {
                        setPolicies(x.target.value);
                        setDirty(true);
                      }}
                    />
                  </label>
                  <UnifiedConfigForm
                    config={technical}
                    sources={[]}
                    onSources={() => {}}
                    onChange={(value) => {
                      setTechnical(value);
                      setDirty(true);
                    }}
                  />
                </>
              )}
              {modal === "test-pass" && (
                <>
                  <Select
                    label="Dataset"
                    value={dataset}
                    options={[
                      "PII acceptance suite",
                      "LangSmith sample (Demo)",
                      ...(dataset.startsWith("Uploaded:") ? [dataset] : []),
                    ]}
                    onChange={(v) => {
                      setDataset(v);
                      setCases(24);
                    }}
                  />
                  <label>
                    Upload custom dataset (JSON array of test cases)
                    <Input
                      type="file"
                      accept=".json"
                      onChange={async (x) => {
                        try {
                          const file = x.target.files?.[0];
                          if (!file) return;
                          if (file.size > 1000000)
                            throw new Error("Maximum dataset size is 1 MB.");
                          const data = JSON.parse(await file.text());
                          if (
                            !Array.isArray(data) ||
                            !data.length ||
                            data.some(
                              (c) =>
                                !c ||
                                typeof c !== "object" ||
                                typeof c.input !== "string" ||
                                typeof c.expected !== "string",
                            )
                          )
                            throw new Error(
                              "Use a non-empty array of objects with input and expected strings.",
                            );
                          setDataset(`Uploaded: ${file.name}`);
                          setCases(data.length);
                          setError("");
                        } catch (x) {
                          setError((x as Error).message);
                        }
                      }}
                    />
                  </label>
                  <p>{cases} acceptance cases · simulated locally</p>
                  <label className="nm-check">
                    <input
                      type="checkbox"
                      checked={fail}
                      onChange={(x) => setFail(x.target.checked)}
                    />
                    Demonstrate a failed test
                  </label>
                </>
              )}
              {modal === "reject" && (
                <label>
                  Reason for rejection
                  <Textarea
                    value={reason}
                    onChange={(x) => setReason(x.target.value)}
                  />
                </label>
              )}
              {modal === "deploy" && (
                <>
                  <p>
                    Signed off by {e.signedBy}. This revision will become the
                    active protection version.
                  </p>
                  {e.kind === "Guardrail" ? (
                    <p>
                      Active profiles referencing this Guardrail will use the
                      newly deployed version.
                    </p>
                  ) : (
                    <p>
                      Alert threshold: {e.threshold}% · configured on this
                      Profile revision.
                    </p>
                  )}
                  <label className="nm-check">
                    <input
                      type="checkbox"
                      checked={fail}
                      onChange={(x) => setFail(x.target.checked)}
                    />
                    Demonstrate deployment failure
                  </label>
                </>
              )}
              {modal === "withdraw" && (
                <p>
                  Withdraw invalidates current test evidence and sign-off.
                  Historical test records are kept. The deployed version
                  continues protecting traffic.
                </p>
              )}
              {["Normal", "Pass all", "Block all"].includes(modal ?? "") && (
                <p>
                  {modal === "Normal"
                    ? "Resume normal Guardrail detection."
                    : modal === "Pass all"
                      ? "Bypass Guardrail detection for all traffic matching this profile."
                      : "Block all traffic matching this profile."}
                </p>
              )}
              <div className="nm-actions">
                <Button variant="outline" disabled={busy} onClick={closeModal}>
                  Cancel
                </Button>
                <Button
                  disabled={busy}
                  onClick={() =>
                    modal === "test-pass" ? runTest() : perform(modal as Action)
                  }
                >
                  {busy
                    ? "Running test…"
                    : modal === "test-pass"
                      ? "Run Test"
                      : "Confirm"}
                </Button>
              </div>
            </>
          ) : null}
          {error && (
            <p role="alert" className="nm-error">
              {error}
            </p>
          )}
        </ResizableSheetContent>
      </Sheet>
    </>
  );
}
function decodeId(value: string) {
  try {
    return decodeURIComponent(value);
  } catch {
    return "";
  }
}
function locationHash(): [Kind, View, string] {
  const [k, v, id] = window.location.hash.slice(1).split("?")[0]!.split("/");
  return [
    k === "Profile" ? "Profile" : "Guardrail",
    [
      "repository",
      "tests",
      "signoff",
      "deploy",
      "dashboard",
      "operations",
      "logs",
    ].includes(v ?? "")
      ? (v as View)
      : "repository",
    decodeId(id ?? ""),
  ];
}
function CreateForm({
  kind,
  state,
  onSave,
  initial,
  owner,
  onDirty,
  revision = false,
  allowTechnical = false,
  onCancel,
}: {
  revision?: boolean;
  allowTechnical?: boolean;
  onCancel: () => void;
  owner: string;
  onDirty: () => void;
  kind: Kind;
  state: State;
  initial?: Entity | undefined;
  onSave: (e: Entity) => void;
}) {
  const [formError, setFormError] = useState("");
  const [policyText, setPolicyText] = useState(
    initial?.policies.join("\n") ?? "",
  );
  const [config, setConfig] = useState<UnifiedConfig>(() => ({
    ...(initial?.config ?? emptyConfig()),
    versionName: revision
      ? `v${(initial?.version ?? 0) + 1}`
      : (initial?.config?.versionName ?? `v${initial?.version ?? 1}`),
  }));
  const [guardQuery, setGuardQuery] = useState("");
  const [name, setName] = useState(initial?.name ?? "");
  const [id, setId] = useState(initial?.id ?? "");
  const [description, setDescription] = useState(initial?.description ?? "");
  const [unit, setUnit] = useState(initial?.unit ?? "ISS");
  const [location, setLocation] = useState(initial?.location ?? "ALL");
  const [mandatory, setMandatory] = useState(initial?.mandatory ?? false);
  const [profileThreshold, setProfileThreshold] = useState(
    String(initial?.threshold ?? 5),
  );
  const [refs, setRefs] = useState<string[]>(initial?.refs ?? []);
  const [bu, setBu] = useState(initial?.attributes.bu ?? "ALL");
  const [agent, setAgent] = useState(initial?.attributes.agent ?? "ALL");
  const [data, setData] = useState(initial?.attributes.data ?? "Personal");
  const guards = state.entities
    .filter((x) => x.kind === "Guardrail" && x.deployed !== null)
    .map(deployedEntity);
  const required = guards
    .filter(
      (g) =>
        g.mandatory &&
        (g.location === "ALL" || location === "ALL" || g.location === location),
    )
    .map((g) => g.id);
  return (
    <form
      className="nm-form"
      onChange={onDirty}
      onSubmit={(ev) => {
        ev.preventDefault();
        if (
          kind === "Guardrail" &&
          allowTechnical &&
          (initial?.config ||
            config.content.trim() ||
            config.scannerType !== "custom")
        ) {
          const problem = configError(config);
          if (problem) {
            setFormError(problem);
            return;
          }
        }
        onSave({
          id,
          name,
          kind,
          description,
          unit,
          location,
          mandatory,
          custodian: initial?.custodian ?? owner,
          approver: "Feng ZONG",
          status: kind === "Guardrail" ? "DRAFT" : "TEST READY",
          version: 1,
          deployed: null,
          updated: new Date().toISOString(),
          policies:
            initial && allowTechnical
              ? policyText
                  .split("\n")
                  .map((p) => p.trim())
                  .filter(Boolean)
              : (initial?.policies ?? []),
          ...(config.content.trim() && allowTechnical
            ? { config }
            : initial?.config
              ? { config: initial.config }
              : {}),
          refs: kind === "Profile" ? [...new Set([...refs, ...required])] : [],
          deployedRefs: [],
          attributes: { bu, agent, data },
          runs: [],
          mode: "Normal",
          threshold: Number(profileThreshold),
        });
      }}
    >
      {revision && (
        <p className="nm-callout">
          Save as v{(initial?.version ?? 0) + 1}.0. Deployed v
          {initial?.deployed}.0 stays active until the new revision passes
          testing, sign-off and deployment.
        </p>
      )}
      <label>
        {kind} Name
        <Input
          required
          value={name}
          onChange={(x) => setName(x.target.value)}
        />
      </label>
      <label>
        {kind} ID (unique)
        <Input
          required
          disabled={!!initial}
          value={id}
          onChange={(x) => setId(x.target.value)}
          placeholder={kind === "Guardrail" ? "gr-pii-sg" : "pf-remittance"}
        />
      </label>
      <label>
        Description
        <Textarea
          required
          value={description}
          onChange={(x) => setDescription(x.target.value)}
        />
      </label>
      <div className="nm-form-grid">
        <Select
          label="Control Unit"
          value={unit}
          options={controlUnits}
          onChange={setUnit}
        />
        <Select
          label="Jurisdiction"
          value={location}
          options={["ALL", "SG", "CN", "IN", "ID", "HK", "TW"]}
          onChange={setLocation}
        />
      </div>
      <div className="nm-facts">
        <div>
          <small>Custodian</small>
          {initial?.custodian ?? owner}
        </div>
        <div>
          <small>Sign-Off Approver</small>Feng ZONG
        </div>
      </div>
      {kind === "Guardrail" ? (
        <>
          <label className="nm-check">
            <input
              type="checkbox"
              checked={mandatory}
              onChange={(x) => setMandatory(x.target.checked)}
            />
            Mandatory
          </label>
          {initial && allowTechnical && (
            <section className="nm-configuration">
              <h3>Technical configuration</h3>
              <label>
                Policies (one per line)
                <Textarea
                  value={policyText}
                  onChange={(e) => setPolicyText(e.target.value)}
                />
              </label>
              <UnifiedConfigForm
                config={config}
                sources={[]}
                onSources={() => {}}
                onChange={(value) => {
                  setConfig(value);
                  onDirty();
                }}
              />
            </section>
          )}
        </>
      ) : (
        <>
          <div className="nm-form-grid">
            <Select
              label="BU/SU"
              value={bu}
              options={["ALL", "CBG", "IBG", "GFMT", "ISS", "RMG"]}
              onChange={setBu}
            />
            <Select
              label="Agent Type"
              value={agent}
              options={[
                "ALL",
                "Customer",
                "Employee",
                "Financials",
                "Security",
                "Productivity",
              ]}
              onChange={setAgent}
            />
            <Select
              label="Data Type"
              value={data}
              options={["Personal", "Financial", "No Sensitive Data"]}
              onChange={setData}
            />
          </div>
          <label>
            Alert threshold (%)
            <Input
              type="number"
              required
              min={0}
              max={100}
              step="any"
              value={profileThreshold}
              onChange={(e) => setProfileThreshold(e.target.value)}
            />
            <small>
              Alert when the scanner error percentage exceeds this value.
            </small>
          </label>
          <fieldset className="space-y-3">
            <legend className="font-medium">Guardrails</legend>
            <p className="text-xs text-muted-foreground">
              Select Guardrails for this Profile. Each Guardrail contains its
              own Policies.
            </p>
            <p className="text-xs">
              {new Set([...refs, ...required]).size} selected
            </p>
            {!guards.length && (
              <p role="status" className="nm-callout">
                No deployed Guardrails are available. Deploy a Guardrail before
                creating a Profile.
              </p>
            )}
            <Input
              aria-label="Search available Guardrails"
              placeholder="Search Guardrails…"
              value={guardQuery}
              onChange={(e) => setGuardQuery(e.target.value)}
            />
            {guards
              .filter((g) =>
                `${g.name} ${g.id}`
                  .toLowerCase()
                  .includes(guardQuery.toLowerCase()),
              )
              .map((g) => (
                <div key={g.id} className="rounded-lg border p-3">
                  <label className="nm-check">
                    <input
                      type="checkbox"
                      checked={required.includes(g.id) || refs.includes(g.id)}
                      disabled={required.includes(g.id)}
                      onChange={(x) =>
                        setRefs(
                          x.target.checked
                            ? [...refs, g.id]
                            : refs.filter((id) => id !== g.id),
                        )
                      }
                    />
                    {g.name}
                    {required.includes(g.id) && <Badge>Mandatory</Badge>}
                  </label>
                  <p className="text-xs text-muted-foreground">
                    {g.id} · Deployed v{version(g.deployed)} ·{" "}
                    {g.policies.length} Policies
                  </p>
                  <details className="mt-2 text-xs">
                    <summary className="cursor-pointer text-primary">
                      View Policies
                    </summary>
                    <ol className="list-decimal pl-5 pt-2 space-y-1">
                      {g.policies.map((policy, i) => (
                        <li key={i}>{policy}</li>
                      ))}
                    </ol>
                  </details>
                </div>
              ))}
          </fieldset>
        </>
      )}
      {formError && (
        <p role="alert" className="nm-error">
          {formError}
        </p>
      )}
      <div className="nm-actions">
        <Button type="button" variant="outline" onClick={onCancel}>
          Cancel
        </Button>
        <Button type="submit">
          {revision
            ? "Save as new version"
            : initial
              ? "Save changes"
              : "Submit"}
        </Button>
      </div>
    </form>
  );
}
