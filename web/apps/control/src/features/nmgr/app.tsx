import { statusLabel } from "./status-label";
import { Fragment, useEffect, useState } from "react";
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
import { ProtectionSummary } from "./protection-summary";
import { actorNames, homeFor, canVisit, inScope } from "./workbench";
import "./nmgr.css";
import { ResizableSheetContent } from "./resizable-sheet";
import { TestRecords } from "./test-records";
import {
  ProfileMonitoring,
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
  WorkflowNotice,
  filterFields,
  filterValue,
  matchesFilters,
  studioStatuses,
  type Filters,
} from "./studio";

import { initialOwner, saveOwner, useDemoState } from "./demo-storage";
import { OperationHistory, EntitySummary } from "./operation-history";
import { EnforcementList } from "./enforcement-list";
import { DeploymentQueues } from "./deployment-queues";
import {
  buildAlerts,
  profileAlertCounts,
  monitoringHash,
  readMonitoringTarget,
  type MonitoringTarget,
} from "./alerts";

const stamp = (v: string) =>
  new Date(v).toLocaleString("en-GB", { timeZone: "Asia/Shanghai" });
const version = (v: number | null) => (v === null ? "None" : `${v}.0`);
function Badge({ children }: { children: React.ReactNode }) {
  return (
    <span
      className={`nm-badge ${["Error", "CRITICAL", "Pass all"].includes(String(children)) ? "warning" : ["Blocked", "Block all"].includes(String(children)) ? "bad" : ["Detected", "Transferred"].includes(String(children)) ? "info" : ""} ${String(children).includes("FAIL") ? "bad" : ["DEPLOYED", "SIGNED OFF", "TEST PASSED", "Normal"].includes(String(children)) ? "good" : ""}`}
    >
      {typeof children === "string" ? statusLabel(children) : children}
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
  const { state, ready, updateState } = useDemoState(setNotice);
  const [owner, setOwner] = useState(initialOwner);
  const role = roleForOwner(owner);
  const controlUnit = "ISS";
  const [reviewTests, setReviewTests] = useState(false);
  const [resultLink, setResultLink] = useState<{
    kind: Kind;
    view: View;
    id: string;
    label: string;
  } | null>(null);
  useEffect(() => {
    try {
      saveOwner(owner);
    } catch {}
  }, [owner]);
  function switchOwner(value: string) {
    if (busy) return;
    if (
      dirty &&
      !window.confirm("Discard unsaved changes and switch workbench?")
    )
      return;
    setOwner(value);
    setUnit("All");
    setSearch("");
    setStudioFilters({});
    setExpandedProfiles([]);
    setReviewTests(false);
    setResultLink(null);
    setNotice("");
    go(...homeFor(roleForOwner(value)));
    setModal(null);
    setDirty(false);
    setConfirmClose(false);
    try {
      saveOwner(value);
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
  const [modal, setModal] = useState<
    "create" | "edit" | Action | "report" | "reset" | null
  >(null);
  const [report, setReport] = useState<Run | null>(null);
  const [error, setError] = useState("");
  const [notification, setNotification] = useState({
    message: "", id: 0, page: "", owner: "",
  });
  function setNotice(message: string) {
    setNotification((previous) => ({
      message,
      id: previous.id + 1,
      page: window.location.hash,
      owner,
    }));
  }
  const noticeOnPage =
    notification.page === window.location.hash && notification.owner === owner;
  useEffect(() => {
    if (!noticeOnPage) {
      setNotification((previous) =>
        previous.message ? { ...previous, message: "" } : previous,
      );
      setResultLink(null);
    }
  }, [noticeOnPage]);
  const [busy, setBusy] = useState(false);
  const [dataset, setDataset] = useState("PII acceptance suite");
  const [cases, setCases] = useState(24);
  const [fail, setFail] = useState(false);
  const [reason, setReason] = useState("");
  const [signoffApprover, setSignoffApprover] = useState("Feng ZONG");
  const [policies, setPolicies] = useState(
    "Detect personal identifiers in input and output.\nBlock disclosure of unmasked customer information.",
  );
  const [configurationRefs, setConfigurationRefs] = useState<string[]>([]);
  const [configurationThreshold, setConfigurationThreshold] = useState("5");
  const [technical, setTechnical] = useState<UnifiedConfig>(emptyConfig);
  const [tab, setTab] = useState("Info");
  useEffect(() => {
    const read = () => {
      const currentRole = roleForOwner(initialOwner());
      const [k, v, id] = window.location.hash
        ? locationHash()
        : ([...homeFor(currentRole), ""] as [Kind, View, string]);
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
  useEffect(
    () => setPage(1),
    [search, unit, location, studioFilters, kind, view],
  );
  const scopedEntities = state.entities.filter((item) =>
    inScope(item, role, controlUnit),
  );
  const scopedState = { ...state, entities: scopedEntities };
  const e = scopedEntities.find((x) => x.id === selected && x.kind === kind);
  const fullDetail =
    !!e && role !== "IT Admin" && ["repository", "signoff"].includes(view);
  useEffect(() => {
    if (!canVisit(role, kind, view)) go(...homeFor(role));
    else if (selected && ready && !e) go(kind, view);
  }, [role, kind, view, selected, ready]);
  const monitoringGuardrail = state.entities
    .map(deployedEntity)
    .find((item) => item.id === monitorGuardrail);
  function go(k: Kind, v: View, id = "", target?: MonitoringTarget) {
    setMonitorGuardrail("");
    setReviewTests(false);
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
      if (!(
        role === "IT Admin" &&
        ["dashboard", "operations"].includes(view) &&
        ["dashboard", "operations"].includes(v)
      ))
        setUnit("All");
      setLocation("All");
    }
    setTab(v === "operations" ? "Monitoring" : "Info");
  }
  function open(action: typeof modal, item?: Entity) {
    if (item) setSelected(item.id);
    setResultLink(null);
    setModal(action);
    setDirty(false);
    setConfirmClose(false);
    setError("");
    setReason("");
    setSignoffApprover(item?.approver ?? e?.approver ?? "Feng ZONG");
    setFail(false);
    setDataset(`${item?.name ?? e?.name ?? "Guardrail"} acceptance suite`);
    setPolicies((item?.policies ?? e?.policies ?? []).join("\n"));
    setConfigurationRefs([...(item?.refs ?? e?.refs ?? [])]);
    setConfigurationThreshold(String(item?.threshold ?? e?.threshold ?? 5));
    setTechnical(item?.config ?? e?.config ?? emptyConfig());
  }
  function perform(action: Action) {
    if (!e) return;
    try {
      updateState((latest) =>
        transition(latest, e.id, action, role, {
          actorName: actorNames[role],
          ...(action === "implement" && e.kind === "Profile"
            ? {
                refs: configurationRefs,
                threshold: Number(configurationThreshold),
              }
            : {}),
          dataset,
          cases,
          reason,
          ...(action === "request" ? { approver: signoffApprover } : {}),
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
        }),
      );
      setModal(null);
      setDirty(false);
      setReviewTests(false);
      if (action === "implement") go("Guardrail", "tests", e.id);
      if (action === "approve" || action === "reject")
        setResultLink({
          kind: e.kind,
          view: "signoff",
          id: "",
          label: `View ${e.kind.toLowerCase()} requests`,
        });
      setNotice(
        `${e.name}: ${action === "deploy" ? "deployed successfully" : action === "reject" ? (e.kind === "Profile" ? "request rejected; returned to DRAFT" : "request rejected; returned to TEST READY") : action === "approve" ? (e.kind === "Profile" ? "request approved; Profile is now active" : "request approved; ready for Tech Implementor deployment") : action === "request" ? "signoff request submitted" : "updated successfully"}.`,
      );
    } catch (x) {
      setError(x instanceof Error ? x.message : "Unable to complete action.");
    }
  }
  function changeMode(item: Entity, mode: Entity["mode"]) {
    if (mode === item.mode) return;
    try {
      updateState((latest) =>
        transition(latest, item.id, mode, role, {
          actorName: actorNames[role],
        }),
      );
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
  const isStudio = ["repository", "tests", "signoff", "deploy"].includes(view);
  const isBlank = ["audit", "logs"].includes(view);
  const rows = scopedEntities
    .filter(
      (x) =>
        x.kind === kind &&
        (view === "tests"
          ? ["TEST READY", "TEST FAILED", "TEST PASSED"].includes(x.status)
          : view === "signoff"
            ? x.status === "SIGNOFF REQUESTED"
            : view === "deploy"
              ? x.status === "SIGNED OFF"
              : ["operations", "enforce"].includes(view)
                ? x.deployed !== null
                : true),
    )
    .map((x) =>
      ["operations", "enforce"].includes(view) ? deployedEntity(x) : x,
    )
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
  const activeProfiles = scopedEntities
    .filter(
      (x) =>
        x.kind === "Profile" &&
        x.deployed !== null &&
        (unit === "All" || x.unit === unit),
    )
    .map(deployedEntity);
  const scans = activeProfiles.flatMap((p) => profileScans(p, state));
  const alerts = buildAlerts(activeProfiles, scans);
  const alertCountsByProfile = new Map(
    activeProfiles.map((profile) => [
      profile.id,
      profileAlertCounts(alerts, profile.id),
    ]),
  );
  const enforcementList = <EnforcementList key={`${role}-${view}`} profiles={activeProfiles} state={state}
    role={role} alertCounts={alertCountsByProfile} onModeChange={changeMode} />;
  function backToAlerts() {
    go("Profile", "dashboard");
  }
  const isBusinessIntents =
    role === "User" &&
    kind === "Guardrail" &&
    view === "repository" &&
    !fullDetail;
  const showRepositoryCreate =
    view === "repository" && !fullDetail && canAuthor(role);
  const title =
    view === "enforce"
      ? "Enforce & Prevent"
      : view === "audit"
        ? "Trace"
        : view === "dashboard"
          ? "Protection Dashboard"
          : view === "logs"
            ? "Trace"
            : ["operations", "enforce"].includes(view)
              ? "Monitoring"
              : view === "deploy"
                ? "GR Deployment"
                : view === "tests"
                  ? "GR Evaluation"
                  : view === "signoff"
                    ? `${kind} Sign-Off`
                    : view === "request"
                      ? "New Guardrail Request"
                      : role === "IT Admin"
                        ? "GR Requests"
                        : kind === "Guardrail"
                          ? "Guardrails"
                          : "Configure Profiles";
  const studioFields = filterFields
    .filter(
      (field) =>
        (role === "IT Admin" || field.key !== "unit") &&
        (kind === "Profile" || !["bu", "agent", "data"].includes(field.key)),
    )
    .map((field) => {
      const options =
        field.key === "status"
          ? view === "tests"
            ? ["TEST READY", "TEST FAILED", "TEST PASSED"]
            : view === "signoff"
              ? ["SIGNOFF REQUESTED"]
              : view === "deploy"
                ? ["SIGNED OFF"]
                : kind === "Profile"
                  ? ["DRAFT", "SIGNOFF REQUESTED", "SIGNED OFF"]
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
      return { ...field, options };
    });
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
      <div className="nm-studio-filters space-y-4 border-b bg-zinc-50/40 px-5 py-4">
        <div
          className="nm-filter-scroll"
          role="region"
          aria-label="Filter options"
          tabIndex={0}
        >
          <div className="nm-filter-grid">
            {studioFields.map((field) => (
              <CheckboxFilter
                key={field.key}
                label={field.label}
                options={field.options}
                selected={studioFilters[field.key] ?? []}
                onChange={(values) =>
                  setStudioFilters((current) => ({
                    ...current,
                    [field.key]: values,
                  }))
                }
              />
            ))}
          </div>
        </div>
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
      className={`nm-filters ${["operations", "enforce"].includes(view) ? "nm-monitor-filters" : ""}`}
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
      {role === "IT Admin" && (
        <Select
          label="Control Unit"
          value={unit}
          onChange={setUnit}
          options={["All", ...controlUnits]}
        />
      )}
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
    />
  );
  const info = (item: Entity) =>
    item.kind === "Guardrail" ? (
      <GuardrailInfo
        item={item}
        state={scopedState}
        onProfile={(id) => go("Profile", "repository", id)}
      />
    ) : (
      <>
        <div className="nm-facts">
          {[
            ["Control Unit", item.unit],
            ["Location", item.location],
            ["Custodian", item.custodian],
            ["Sign-Off Approver", item.approver],
            ["Mandatory", item.mandatory ? "Yes" : "No"],
            ["Alert Threshold", `${item.thresholdMetric ?? "Error Rate"} > ${item.threshold}%${item.thresholdWindow ? ` in ${item.thresholdWindow} minutes` : ""}`],
            [
              "Target / Active",
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
          <h3>{item.kind === "Profile" ? "Use Case" : "Description"}</h3>
          <p>{item.description}</p>
          <h3>Guardrails & Matching Attributes</h3>
          {
            <>
              <p>
                BU/SU: {item.attributes.bu} · Agent Type:{" "}
                {item.attributes.agent} · Data Type: {item.attributes.data}
              </p>
              {item.refs.map((id) => (
                <button
                  className="nm-link"
                  key={id}
                  onClick={() => setMonitorGuardrail(id)}
                >
                  {state.entities.find((x) => x.id === id)?.name ?? "Unavailable Guardrail"} →
                </button>
              ))}
            </>
          }
        </section>
      </>
    );
  const detail = e ? (
    <>
      <Button variant="ghost" onClick={() => go(kind, view)}>
        <ArrowLeft size={16} />
        Back to {title}
      </Button>
      <div className="nm-detail-head">
        <div>
          <Badge>{e.status}</Badge>
          <p className="nm-muted">
            {e.kind === "Profile" ? "Active" : "Deployed"} Ver.:{" "}
            {version(e.deployed)} ·{" "}
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
            .filter(
              (a) =>
                allowed(e, a, role) &&
                !(a === "request" && e.kind === "Guardrail" && role === "User"),
            )
            .map((a) => (
              <Button
                key={a}
                variant={
                  ["reject", "revise"].includes(a) ? "outline" : "default"
                }
                onClick={() => open(a)}
              >
                {
                  {
                    implement: "Configure",
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
                view === "tests" ? open("test-pass") : go(kind, "tests", e.id)
              }
            >
              <FlaskConical size={16} />
              {view === "tests" ? "Run Test" : "Go Test"}
            </Button>
          )}
        </div>
      </div>
      {role === "User" && e.kind === "Guardrail" && e.runs.length > 0 && (
        <div className="nm-actions mb-4">
          <Button onClick={() => setReviewTests(true)}>
            Review test result
          </Button>
        </div>
      )}
      {role === "User" && e.status === "DRAFT" && (
        <Button variant="outline" className="mb-4" onClick={() => open("edit")}>
          Edit {e.kind === "Guardrail" ? "business intents" : "Profile"}
        </Button>
      )}
      <WorkflowSteps item={e} />
      <WorkflowNotice item={e} role={role} />
      {view === "tests" ? (
        runs(e)
      ) : (
        <>
          <div className="nm-tabs">
            {[
              "Info",
              ...(e.kind === "Guardrail" && role !== "User" ? ["Tests"] : []),
              ...(e.kind === "Profile" && e.deployed !== null && view !== "signoff"
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
          ) : tab === "Monitoring" && view !== "signoff" ? (
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
  ) : null;
  return (
    <>
      <NmgrShell
        kind={kind}
        view={view}
        owner={owner}
        busy={busy}
        controlUnit={controlUnit}
        title={
          fullDetail
            ? view === "signoff"
              ? `Review ${kind} Sign-off Request`
              : `${kind} Details`
            : title
        }
        description={
          fullDetail
            ? (e?.name ?? "")
            : isBusinessIntents
              ? "Guardrails repository: View guardrail or create new one. Deployed version is marked in each guardrail."
              : view === "request"
                ? "Raise a request with your business intents. Tech Implementor will configure and test the Guardrail."
                : view === "dashboard"
                  ? role === "IT Admin"
                    ? "Protection and breach alerts across all Control Units."
                    : "Protection and breach alerts for your Control Unit."
                  : view === "signoff"
                    ? "Review requests awaiting your sign-off."
                    : ""
        }
        onOwner={switchOwner}
        onNavigate={(k, v) => {
          if (dirty && !window.confirm("Discard unsaved changes?")) return;
          setDirty(false);
          setError("");
          setModal(null);
          go(k, v);
        }}
      >
        {noticeOnPage && notification.message && (
          <div
            className={`nm-inline-notice ${notification.message.includes("rejected") ? "nm-inline-error" : ""}`}
            role="status"
          >
            <div>
              <strong>{notification.message}</strong>
              {resultLink && (
                <p>
                  <button
                    className="nm-link"
                    onClick={() => {
                      go(resultLink.kind, resultLink.view, resultLink.id);
                      setResultLink(null);
                    }}
                  >
                    {resultLink.label} →
                  </button>
                </p>
              )}
            </div>
            <button
              aria-label="Dismiss notification"
              onClick={() => {
                setNotice("");
                setResultLink(null);
              }}
            >
              <X size={16} />
            </button>
          </div>
        )}
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
        {view === "request" ? (
          <section className="nm-card nm-padding nm-request-page">
            {error && (
              <div role="alert" className="nm-inline-notice nm-inline-error">
                <span>{error}</span>
                <button aria-label="Dismiss error" onClick={() => setError("")}>
                  <X size={16} />
                </button>
              </div>
            )}
            <CreateForm
              kind="Guardrail"
              state={state}
              owner={actorNames[role]}
              lockedUnit={controlUnit}
              onDirty={() => setDirty(true)}
              onCancel={() => {
                if (!dirty || window.confirm("Discard unsaved request?")) {
                  setDirty(false);
                  setError("");
                  go("Guardrail", "repository");
                }
              }}
              onSave={(item) => {
                try {
                  updateState((latest) => addEntity(latest, item, role));
                  setDirty(false);
                  setError("");
                  setNotice(
                    "Request submitted! Your Guardrail is waiting for implementation.",
                  );
                  setResultLink({
                    kind: "Guardrail",
                    view: "repository",
                    id: item.id,
                    label: "Guardrail Details",
                  });
                  go("Guardrail", "repository");
                } catch (error) {
                  setError((error as Error).message);
                }
              }}
            />
          </section>
        ) : fullDetail ? (
          <section className="nm-card nm-padding nm-full-detail">
            {detail}
          </section>
        ) : isBlank ? null : view === "dashboard" ? (
          <>
            {role === "IT Admin" && (
              <div className="nm-card nm-padding mb-4">
                <Select
                  label="Control Unit"
                  value={unit}
                  options={["All", ...controlUnits]}
                  onChange={setUnit}
                />
              </div>
            )}
            <ProtectionSummary
              scans={scans}
              profiles={activeProfiles.length}
              guardrails={state.entities.filter(
                (g) => g.kind === "Guardrail" && g.deployed !== null &&
                  ((role === "IT Admin" && unit === "All") ||
                    activeProfiles.some((p) => p.deployedRefs.includes(g.id))),
              ).length}
              onNewGuardrail={canAuthor(role) ? () => go("Guardrail", "request") : undefined}
            />
            {enforcementList}
          </>
        ) : view === "enforce" ? enforcementList : view === "deploy" ? (
          <>
            <section className="nm-card">{filters}</section>
            <DeploymentQueues
              items={rows}
              kind={kind}
              role={role}
              onOpen={(id) => go(kind, "deploy", id)}
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
            {showRepositoryCreate && (
              <div className="nm-repository-create">
                <Button
                  onClick={() =>
                    kind === "Guardrail"
                      ? go("Guardrail", "request")
                      : open("create")
                  }
                >
                  <Plus size={16} /> New {kind}
                </Button>
              </div>
            )}
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
                      <th>
                        {["operations", "enforce"].includes(view)
                          ? "Mode"
                          : "Status"}
                      </th>
                      <th>Ctrl Unit</th>
                      <th>Last Modified</th>
                      {view !== "repository" && <th>Action</th>}
                    </tr>
                  </thead>
                  <tbody>
                    {rows.slice((page - 1) * 6, page * 6).map((item) => (
                      <Fragment key={item.id}>
                        <tr>
                          <td>
                            <div
                              className={
                                ["operations", "enforce"].includes(view)
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
                                    ["operations", "enforce"].includes(view)
                                      ? "nm-profile-title"
                                      : undefined
                                  }
                                >
                                  <strong>
                                    {view === "repository" ? (
                                      <a
                                        className="nm-entity-name-link"
                                        href={`#${kind}/${view}/${item.id}`}
                                        onClick={(event) => {
                                          if (event.ctrlKey || event.metaKey || event.shiftKey || event.altKey) return;
                                          event.preventDefault();
                                          go(kind, view, item.id);
                                        }}
                                      >
                                        {item.name}
                                      </a>
                                    ) : item.name}
                                  </strong>
                                  {["operations", "enforce"].includes(view) && (
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
                                <EntitySummary item={item} state={state} />
                              </div>
                            </div>
                          </td>
                          <td>
                            <Badge>
                              {["operations", "enforce"].includes(view)
                                ? item.mode
                                : item.status}
                            </Badge>
                          </td>
                          <td>{item.unit}</td>
                          <td>{stamp(item.updated)}</td>
                          {view !== "repository" && <td>
                            {["operations", "enforce"].includes(view) ? (
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
                                  ? item.status === "TEST READY" &&
                                    allowed(item, "test-pass", role)
                                    ? "Go Test"
                                    : "View"
                                  : view === "signoff" &&
                                      allowed(item, "approve", role)
                                    ? "Sign off"
                                    : "View"}
                                <ChevronRight size={14} />
                              </Button>
                            )}
                          </td>}
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
                <div className="nm-empty">No matching records.</div>
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
            {view === "signoff" && role === "User Admin" && (
              <OperationHistory
                key={kind}
                state={state}
                kind={kind}
                controlUnit={controlUnit}
                actor={actorNames[role]}
                onOpen={(id) => go(kind, "signoff", id)}
              />
            )}
          </>
        )}
      </NmgrShell>
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
        open={
          !!e &&
          !fullDetail &&
          !isBlank &&
          view !== "dashboard" &&
          view !== "request"
        }
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
            {detail}
          </div>
        </ResizableSheetContent>
      </Sheet>
      <Sheet open={reviewTests && !!e} onOpenChange={setReviewTests}>
        <ResizableSheetContent
          aria-describedby={undefined}
          className="nm-app nm-drawer bg-white overflow-y-auto p-6 data-[side=right]:sm:max-w-[700px]"
        >
          <SheetTitle>Guardrail Test Records</SheetTitle>
          {e && (
            <>
              <h3>{e.name}</h3>
              <p className="nm-muted">
                Review test reports for the current revision.
              </p>
              {runs(e)}
              <Button
                disabled={!allowed(e, "request", role)}
                onClick={() => {
                  setReviewTests(false);
                  open("request");
                }}
              >
                Request Signoff
              </Button>
            </>
          )}
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
                          ? `Configure ${kind}`
                          : modal === "request"
                            ? `Raise ${kind} Signoff Request`
                            : modal === "approve" || modal === "reject"
                              ? `Sign-off ${kind}`
                              : modal === "deploy"
                                ? `Deploy ${kind}`
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
              allowTechnical={false}
              onCancel={closeModal}
              state={state}
              owner={actorNames[role]}
              lockedUnit={controlUnit}
              onDirty={() => setDirty(true)}
              initial={modal === "edit" || modal === "revise" ? e : undefined}
              onSave={(item) => {
                try {
                  updateState((latest) =>
                    modal === "revise"
                      ? reviseEntity(latest, item, role, actorNames[role])
                      : modal === "edit"
                        ? editEntity(latest, item, role)
                        : addEntity(latest, item, role),
                  );
                  setModal(null);
                  setDirty(false);
                  go(item.kind, "repository", item.id);
                  setNotice(
                    modal === "revise"
                      ? item.kind === "Profile"
                        ? "New revision saved. Request sign-off to make it active."
                        : "New revision saved. The deployed version remains active until the new revision is tested, approved and deployed."
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
                  : "Personal identifiers remained visible in two demo responses. Tech Implementor can review the configuration and run another test."}
              </p>
              <small>
                Simulated Demo result; no inference service was called.
              </small>
            </div>
          ) : modal === "reset" ? (
            <Button
              onClick={() => {
                updateState(() => seed());
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
                  Target {version(e.version)} · Base{" "}
                  {version(e.deployed)}
                </p>
                <small>
                  Control Unit: {e.unit} · Location: {e.location} ·
                  Approver: {e.approver}
                </small>
              </div>
              {modal === "request" && (
                <>
                  <p>Requestor: {actorNames[role]}</p>
                  <Select
                    label="Sign-Off Approver"
                    value={signoffApprover}
                    options={[
                      ...new Set([
                        signoffApprover,
                        "Feng ZONG",
                        "Narandra",
                        "Rajesh",
                        "Matthew",
                      ]),
                    ]}
                    onChange={(value) => {
                      setSignoffApprover(value);
                      setDirty(true);
                    }}
                  />
                </>
              )}
              {["request", "approve", "reject", "deploy"].includes(
                modal ?? "",
              ) &&
                e.kind === "Guardrail" && (
                  <p>
                    Last current test passed:{" "}
                    {e.runs.find(
                      (run) =>
                        run.passed &&
                        run.version === e.version &&
                        run.configurationRevision === e.configurationRevision,
                    )?.end
                      ? stamp(
                          e.runs.find(
                            (run) =>
                              run.passed &&
                              run.version === e.version &&
                              run.configurationRevision ===
                                e.configurationRevision,
                          )!.end,
                        )
                      : "None"}
                  </p>
                )}
              {modal === "implement" && e.kind === "Guardrail" && (
                <>
                  <label>
                    Requirement
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
              {modal === "implement" && e.kind === "Profile" && (
                <div className="nm-callout">
                  <p>Configure the deployed Guardrails and alert threshold.</p>
                  {state.entities
                    .filter(
                      (g) => g.kind === "Guardrail" && g.deployed !== null,
                    )
                    .map((g) => (
                      <label className="nm-check" key={g.id}>
                        <input
                          type="checkbox"
                          checked={configurationRefs.includes(g.id)}
                          onChange={(event) => {
                            setConfigurationRefs(
                              event.target.checked
                                ? [...configurationRefs, g.id]
                                : configurationRefs.filter((id) => id !== g.id),
                            );
                            setDirty(true);
                          }}
                        />
                        {g.name}
                      </label>
                    ))}
                  <label>
                    Alert threshold (%)
                    <Input
                      type="number"
                      min="0"
                      max="100"
                      step="any"
                      value={configurationThreshold}
                      onChange={(event) => {
                        setConfigurationThreshold(event.target.value);
                        setDirty(true);
                      }}
                    />
                  </label>
                  <p>
                    {e.location} · {e.attributes.bu} · {e.attributes.agent}
                  </p>
                </div>
              )}
              {modal === "test-pass" && (
                <>
                  <Select
                    label="Dataset"
                    value={dataset}
                    options={[
                      `${e.name} acceptance suite`,
                      ...(dataset.startsWith("Uploaded:") ? [dataset] : []),
                    ]}
                    onChange={(v) => {
                      setDataset(v);
                      setCases(24);
                    }}
                  />
                  <label>
                    Upload Custom Dataset (JSON Array of Test Cases)
                    <span className="nm-file-picker">
                      <span className="nm-file-picker-button" aria-hidden="true">Choose File</span>
                      <span className="nm-file-picker-name" aria-hidden="true">
                        {dataset.startsWith("Uploaded:") ? dataset.slice("Uploaded: ".length) : "No file chosen"}
                      </span>
                    <Input
                      type="file"
                      aria-label="Upload Custom Dataset (JSON Array of Test Cases)"
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
                    </span>
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
                </>
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
      "request",
      "tests",
      "signoff",
      "deploy",
      "dashboard",
      "operations",
      "logs",
      "enforce",
      "audit",
    ].includes(v ?? "")
      ? v === "logs"
        ? "audit"
        : (v as View)
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
  lockedUnit,
  onCancel,
}: {
  lockedUnit?: string;
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
  const [approver, setApprover] = useState(
    initial?.approver && initial.approver !== "User Admin"
      ? initial.approver
      : "Feng ZONG",
  );
  const [name, setName] = useState(initial?.name ?? "");
  const [id] = useState(() => initial?.id ?? `${kind === "Profile" ? "pf" : "gr"}-${crypto.randomUUID()}`);
  const [description, setDescription] = useState(initial?.description ?? "");
  const [unit, setUnit] = useState(initial?.unit ?? lockedUnit ?? "ISS");
  const [location, setLocation] = useState(initial?.location ?? "ALL");
  const [mandatory, setMandatory] = useState(initial?.mandatory ?? false);
  const [profileThreshold, setProfileThreshold] = useState(
    String(initial?.threshold ?? 10),
  );
  const [thresholdMetric, setThresholdMetric] = useState<NonNullable<Entity["thresholdMetric"]>>(initial?.thresholdMetric ?? (initial ? "Error Rate" : "Block Rate"));
  const [thresholdWindow, setThresholdWindow] = useState(String(initial?.thresholdWindow ?? 5));
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
      noValidate
      className={`nm-form nm-create-form nm-create-${kind.toLowerCase()}`}
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
          approver,
          status: "DRAFT",
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
          threshold: profileThreshold.trim() ? Number(profileThreshold) : NaN,
          ...(kind === "Profile" ? { thresholdMetric, thresholdWindow: thresholdWindow.trim() ? Number(thresholdWindow) : NaN } : {}),
        });
      }}
    >
      {revision && (
        <p className="nm-callout">
          Save as v{(initial?.version ?? 0) + 1}.0. Deployed v
          {initial?.deployed}.0 stays active until the new revision passes
          {kind === "Profile"
            ? "sign-off."
            : "testing, sign-off and deployment."}
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
        {kind === "Guardrail" ? "Business Intents" : "Use Case"}
        <Textarea
          required
          value={description}
          onChange={(x) => setDescription(x.target.value)}
        />
      </label>
      <div className="nm-create-fields">
        {lockedUnit ? (
          <label>
            Control Unit
            <Input value={unit} readOnly />
          </label>
        ) : (
          <Select
            label="Control Unit"
            value={unit}
            options={controlUnits}
            onChange={setUnit}
          />
        )}
          <Select
            label="Sign-Off Approver"
            value={approver}
            options={[
              ...new Set([
                approver,
                "Feng ZONG",
                "Narandra",
                "Rajesh",
                "Matthew",
              ]),
            ]}
            onChange={setApprover}
          />
        {kind === "Profile" && <>
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
        </>}
        <Select
          label="Location"
          value={location}
          options={["ALL", "SG", "CN", "IN", "ID", "HK", "TW"]}
          onChange={setLocation}
        />
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
              <h3>Technical Configuration</h3>
              <label>
                Requirement
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
          <fieldset className="nm-threshold">
            <legend>Alert Threshold</legend>
            <div className="nm-threshold-rule">
              <span>Trigger SLO breach alert if</span>
              <select aria-label="Alert Metric" value={thresholdMetric} onChange={(event) => setThresholdMetric(event.target.value as NonNullable<Entity["thresholdMetric"]>)}>
                <option>Block Rate</option>
                <option>Pass Rate</option>
                {initial && <option>Error Rate</option>}
              </select>
              <span>exceeds</span>
              <Input aria-label="Alert Threshold (%)" type="number" min={0} max={100} step="any" value={profileThreshold} onChange={(event) => setProfileThreshold(event.target.value)} />
              <span>% in last</span>
              <Input aria-label="Alert Window (Minutes)" type="number" min={1} step={1} value={thresholdWindow} onChange={(event) => setThresholdWindow(event.target.value)} />
              <span>minutes.</span>
            </div>
          </fieldset>
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
            <div className="nm-guardrail-picker-list" role="region" aria-label="Available Guardrails" tabIndex={0}>
            {guards
              .filter((g) =>
                `${g.name} ${g.id}`
                  .toLowerCase()
                  .includes(guardQuery.toLowerCase()),
              )
              .map((g) => (
                <div key={g.id} className="nm-guardrail-picker-card rounded-lg border p-3">
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
                    Deployed v{version(g.deployed)} ·{" "}
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
            </div>
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
            ? "Save As New Version"
            : initial
              ? "Save Changes"
              : "Submit"}
        </Button>
      </div>
    </form>
  );
}
