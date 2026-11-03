import { useEffect, useRef, useState, type ReactNode } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { NmgrShell, type View } from "./shell";
import { TestResultsReview } from "./test-results-review";
import { LiveForm } from "./live-form";
import { ArrowLeft } from "lucide-react";
import { LiveDashboard } from "./live-dashboard";
import { LiveRecordList } from "./live-record-list";
import { OperationHistory } from "./operation-history";
import { WorkflowSteps } from "./studio";
import { GuardrailInfo } from "./guardrail-info";
import { UnifiedConfigForm } from "../business-demo/unified-config-form";
import { emptyConfig, type UnifiedConfig } from "../business-demo/evaluation";
import type { Entity, Kind, State, Role } from "./model";
import { sourceLabel, roleForOwner } from "./model";
import type { NmgrActor, NmgrBinding, NmgrJob } from "../../../marketplace-server/nmgr";
import type { ResourceObservation } from "../../../marketplace-server/nmgr-observation";
import { runtimeFailure, runtimeRequest } from "@/lib/runtime-request";
import { ConnectionSetup } from "./connection-setup";
import { initialOwner, saveOwner } from "./demo-storage";

type Snapshot = { accessMode?: "local" | "authenticated" | "demo"; sources?: Array<"NeMo" | "F5">; revision: number; actor: NmgrActor; state: State; jobs: Record<string, NmgrJob>; bindings: Record<string, NmgrBinding> };
export function NmgrMode(_props: { demo?: ReactNode } = {}) {
  const [config, setConfig] = useState<{ demoRoleSwitching?: boolean; connectionRevision?: string } | null>(null), [error, setError] = useState("");
  const [attempt, setAttempt] = useState(0), [editing, setEditing] = useState(false), [role, setRole] = useState(() => roleForOwner(initialOwner()));
  const reconnect = () => { setConfig(null); setError(""); setEditing(false); setAttempt(value => value + 1); };
  useEffect(() => { let active = true; runtimeRequest("/api/marketplace-config?workspace=v3", { cache: "no-store" }).then(config => {
    if (config.mode !== "live") throw runtimeFailure({ code: "live_mode_required", component: "runtime", settings: ["MARKETPLACE_DATA_MODE"], message: "Real V3 requires live configuration on the API server. This host is configured for Mock/preview. Use Mock V2 for demonstrations." }, "/api/marketplace-config");
    if (active) setConfig(config);
  }).catch(e => { if (active) setError(e.message); }); return () => { active = false; }; }, [attempt]);
  if (error || editing) return <ConnectionSetup initialError={error} onConnected={reconnect} onRetry={reconnect} {...(config ? { onCancel: () => setEditing(false) } : {})} />;
  if (!config) return <p className="p-8" role="status">Loading Marketplace V3… Checking runtime configuration.</p>;
  return <LiveWorkspace key={`${attempt}:${config.demoRoleSwitching ? role : "fixed"}`} demoRoles={!!config.demoRoleSwitching} role={role} connectionRevision={config.connectionRevision} onRole={value => { saveOwner(value); setRole(value); }} onConfigure={() => setEditing(true)} onReconnect={reconnect} />;
}

function LiveWorkspace({ demoRoles = false, role, connectionRevision, onRole, onConfigure, onReconnect }: { demoRoles?: boolean; role?: Role; connectionRevision?: string | undefined; onRole?: (role: Role) => void; onConfigure?: () => void; onReconnect?: () => void }) {
  const [snapshot, setSnapshot] = useState<Snapshot | null>(null), current = useRef<Snapshot | null>(null);
  const [error, setError] = useState(""), [notice, setNotice] = useState("");
  const [busy, setBusy] = useState(false), working = useRef(false);
  const [observations, setObservations] = useState<Record<string, ResourceObservation>>({});
  const [querying, setQuerying] = useState(false);
  const queryAbort = useRef<AbortController | null>(null);
  const [kind, setKind] = useState<Kind>("Guardrail"), [view, setView] = useState<View>("repository");
  const [selected, setSelected] = useState("");
  const [form, setForm] = useState<"create" | "edit" | "revise" | null>(null);
  const [config, setConfig] = useState<UnifiedConfig>(emptyConfig());
  const [source, setSource] = useState<"NeMo" | "F5" | "">("");
  const [cases, setCases] = useState("[]"), [dataset, setDataset] = useState("Acceptance tests"), [reason, setReason] = useState("");
  const [remoteId, setRemoteId] = useState(""), [datasetFile, setDatasetFile] = useState("");
  const mounted = useRef(true);
  const headers = () => ({ "Content-Type": "application/json", ...(demoRoles && role ? { "X-Marketplace-Role": role } : {}), ...(connectionRevision ? { "X-Marketplace-Connection": connectionRevision } : {}) });
  const apply = (value: Snapshot) => { if (mounted.current) { if (current.current?.revision !== value.revision) setObservations({}); current.current = value; setSnapshot(value); } };
  async function read() {
    const value = await runtimeRequest("/api/nmgr/workspace", { headers: headers(), cache: "no-store" });
    if (!Number.isSafeInteger(value.revision) || !value.actor || !Array.isArray(value.state?.entities) || !value.jobs || !value.bindings) throw new Error("[workspace_response_invalid] API response is incompatible. Check the deployed UI/API release versions and /api routing.");
    return value as Snapshot;
  }
  async function send(command: Record<string, unknown>, base = current.current) {
    if (!mounted.current) throw new Error("Workspace closed. Reopen it before making changes.");
    if (!base) throw new Error("Connect before making changes.");
    const value = await runtimeRequest("/api/nmgr/commands", { method: "POST", headers: headers(), body: JSON.stringify({ ...command, expectedRevision: base.revision, requestId: crypto.randomUUID() }) });
    apply(value); return value as Snapshot;
  }
  async function refresh(advance = false) {
    if (working.current || !mounted.current) return;
    working.current = true;
    try {
      const value = await read();
      if (!mounted.current) return;
      apply(value);
      const pending = Object.entries(value.jobs).find(([, j]) => (j.canResume ?? j.actor === value.actor.id) && j.status === "pending" && !j.inflight);
      if (advance && pending) await send({ type: "advance", id: pending[0] }, value);
      if (mounted.current) setError("");
    } catch (e) { if (mounted.current) setError(e instanceof Error ? e.message : "Connection unavailable. No local changes were saved."); }
    finally { if (mounted.current) working.current = false; }
  }
  async function refreshBackend() {
    if (working.current) { setNotice("Workspace is synchronizing. Try again shortly."); return; }
    working.current = true; setBusy(true); setQuerying(true); setError(""); setNotice(""); setObservations({});
    const controller = new AbortController(); queryAbort.current = controller;
    try {
      const base = await read(); apply(base);
      let next = 0, completed = 0, stale = false;
      const active = () => mounted.current && !controller.signal.aborted;
      await Promise.all(Array.from({ length: Math.min(4, base.state.entities.length) }, async () => {
        while (active()) {
          const entity = base.state.entities[next++]; if (!entity) return;
          let observation: ResourceObservation;
          try {
            observation = await runtimeRequest(`/api/nmgr/workspace?resource=${encodeURIComponent(entity.id)}`, { headers: headers(), cache: "no-store", signal: AbortSignal.any([controller.signal, AbortSignal.timeout(25000)]) });
            if (observation.id !== entity.id || observation.revision !== base.revision) { stale = true; continue; }
          } catch (error) {
            observation = { id: entity.id, revision: base.revision, checkedAt: new Date().toISOString(), status: "unavailable", message: error instanceof Error ? error.message : "Query failed; check permissions and connection" };
          }
          if (active() && current.current?.revision === base.revision) {
            setObservations(previous => ({ ...previous, [entity.id]: observation }));
            setNotice(`Queried ${++completed} of ${base.state.entities.length} records. Results are read-only observations.`);
          }
        }
      }));
      if (active() && stale) { setObservations({}); setNotice("Workspace changed during the query. Refresh backend status again."); await refreshSnapshot(); }
      else if (active() && !base.state.entities.length) setNotice("No managed records to query. Existing backend resources are not imported by refresh.");
    } catch (e) { if (mounted.current) setError(e instanceof Error ? e.message : "Cannot query backend status."); }
    finally { if (queryAbort.current === controller) { queryAbort.current = null; if (mounted.current) { working.current = false; if (mounted.current) { setBusy(false); setQuerying(false); } } } }
  }
  async function refreshSnapshot() { const value = await read(); apply(value); }
  useEffect(() => {
    try { sessionStorage.removeItem("marketplace-v2-token"); } catch {}
    mounted.current = true; void refresh();
    const timer = window.setInterval(() => { if (current.current && document.visibilityState !== "hidden") void refresh(true); }, 2500);
    return () => { mounted.current = false; queryAbort.current?.abort(); window.clearInterval(timer); };
  }, []);
  useEffect(() => {
    const item = snapshot?.state.entities.find(e => e.id === selected);
    setConfig(item?.config ?? emptyConfig()); setSource(""); setCases("[]"); setDatasetFile(""); setReason(""); setRemoteId("");
  }, [selected]);
  async function execute(command: Record<string, unknown>) {
    if (working.current) { setError("Workspace is synchronizing. Try again shortly."); return false; }
    working.current = true; setBusy(true); setError(""); setNotice("");
    try {
      const saved = await send(command);
      const id = (command.draft as { id?: string } | undefined)?.id ?? command.id as string | undefined;
      const sync = id ? saved.jobs[id] : undefined;
      setNotice(saved.state.entities.find(e => e.id === id)?.sourcePending ? "Request saved. Tech will choose the source and configure the implementation before backend synchronization." : sync?.purpose === "draft-sync" ? sync.status === "done" ? "Saved and synchronized to an unpublished NeMo draft." : "Saved locally. NeMo synchronization needs attention; review the operation below." : "Saved to Marketplace. Backend operations continue below.");
      return true;
    }
    catch (e) { setError(e instanceof Error ? e.message : "Connection lost. Refresh to check the saved result before retrying."); try { apply(await read()); } catch {} return false; }
    finally { working.current = false; setBusy(false); }
  }
  if (!snapshot) return error ? <ConnectionSetup initialError={error} retryLabel="Retry connection" onConnected={onReconnect ?? (() => void refresh())} onRetry={onReconnect ?? (() => { setError(""); void refresh(); })} /> : <p className="p-8" role="status">Connecting to the configured backend…</p>;
  const actor = snapshot.actor, state = snapshot.state, item = state.entities.find(e => e.id === selected), job = item ? snapshot.jobs[item.id] : undefined;
  const pending = job && (job.status === "pending" || job.status === "uncertain" || job.inflight || job.purpose === "draft-sync" && job.status !== "done");
  const canCorrect = job?.purpose === "draft-sync" && job.status === "failed" && job.canCorrect && !job.inflight;
  const rows = state.entities.filter(e => e.kind === kind && (view === "tests" ? ["TEST READY", "TEST PASSED", "TEST FAILED"].includes(e.status) : view === "signoff" ? e.status === "SIGNOFF REQUESTED" : view === "deploy" ? e.status === "SIGNED OFF" : true));
  const binding = item ? snapshot.bindings[`${item.id}@${item.version}`] : undefined;
  function navigate(k: Kind, v: View) { setKind(k); setView(v); setSelected(""); setForm(null); }
  function openRecord(record: Entity) { navigate(record.kind, "repository"); setSelected(record.id); }
  const implementationSource = item?.sourcePending ? source : item?.provider ?? "NeMo";
  const action = (name: string) => item && execute({ type: "action", id: item.id, action: name, ...(name === "implement" ? { config, provider: implementationSource } : {}), ...(name === "reject" ? { reason } : {}) });
  const pageTitle = form ? `${form === "create" ? "New" : form === "revise" ? "Revise" : "Edit"} ${kind}${kind === "Guardrail" && form === "create" ? " Request" : ""}` : view === "dashboard" || view === "operations" ? "Protection Dashboard" : view === "audit" || view === "logs" ? "Trace" : view === "tests" ? `${kind} Evaluation` : view === "signoff" ? `${kind} Sign-Off` : view === "deploy" ? `${kind} Deployment` : kind === "Profile" ? "Configure Profiles" : actor.role === "IT Admin" ? "Guardrail Requests" : "Guardrails";
  return <NmgrShell kind={kind} view={view} owner={actor.role} identity={actor.name} controlUnit={actor.unit} busy={busy} allowRoleSwitch={demoRoles} onOwner={value => onRole?.(value as Role)} onNavigate={navigate}
    title={pageTitle} description={error ? "Marketplace V3 · Connection or action requires attention" : `Marketplace V3${snapshot.accessMode === "local" ? " · Local test identity" : snapshot.accessMode === "demo" ? " · Demo role switching" : ""} · Sources: ${(snapshot.sources ?? ["NeMo"]).join(" / ")}`} actions={<div className="nm-actions">{onConfigure && <Button variant="outline" disabled={busy} onClick={onConfigure}>Connection settings</Button>}<Button variant="outline" disabled={busy} onClick={() => void refreshBackend()}>{querying ? "Querying backends…" : "Refresh backend status"}</Button></div>}>
    {error && <p role="alert" className="nm-callout nm-connection-error mb-4">{error}</p>}{notice && <p role="status" className="nm-callout mb-4">{notice}</p>}
    {view === "dashboard" || view === "operations" ? <LiveDashboard state={state} bindings={snapshot.bindings} role={actor.role} onCreate={() => { navigate("Guardrail", "repository"); setForm("create"); }} onOpen={openRecord} />
    : view === "audit" || view === "logs" ? <section className="nm-card"><div className="nm-card-head"><h3>Operation History</h3><span>{state.audit.length} recorded actions</span></div><p className="nm-muted nm-padding">Marketplace configuration history. Runtime traffic traces are not connected (0).</p><div className="nm-scroll"><table><thead><tr><th>Time</th><th>Record</th><th>Actor</th><th>Action</th></tr></thead><tbody>{state.audit.map(a => <tr key={a.id}><td>{new Date(a.time).toLocaleString()}</td><td>{a.entity}</td><td>{a.actor}</td><td>{a.action}</td></tr>)}</tbody></table></div>{!state.audit.length && <p className="nm-empty">No recorded actions.</p>}</section>
    : form ? <LiveForm key={`${form}:${selected}`} kind={kind} initial={form === "create" ? undefined : item} state={state} sources={snapshot.sources ?? ["NeMo"]} mode={form} controlUnit={actor.unit} busy={busy} onCancel={() => setForm(null)} onSave={async draft => { if (await execute({ type: form, draft })) { setSelected(draft.id); setForm(null); } }} />
    : item ? <div className="space-y-5"><Button variant="ghost" onClick={() => setSelected("")}><ArrowLeft size={16} />Back to list</Button><section className="nm-card nm-padding nm-full-detail nm-live-panel"><div className="nm-detail-head"><div><h2>{item.name}</h2><p className="nm-muted">{sourceLabel(item)} · Revision {item.version}</p></div><LiveStatus item={item} /></div><WorkflowSteps item={item} releaseProfile />{item.kind === "Guardrail" ? <GuardrailInfo item={item} state={state} onProfile={id => { const profile = state.entities.find(e => e.id === id); if (profile) openRecord(profile); }} /> : <div className="nm-info"><section><h3>Use Case</h3><p className="nm-info-description">{item.description}</p></section><section><h3>Ownership &amp; scope</h3><dl className="nm-info-facts">{[["Control Unit", item.unit], ["Location", item.location], ["Custodian", item.custodian], ["Published revision", item.deployed === null ? "Not published" : `v${item.deployed}`]].map(([label, value]) => <div key={label}><dt>{label}</dt><dd>{value}</dd></div>)}</dl></section></div>}
      {item.kind === "Profile" && <section><h3>Guardrails</h3><ul className="nm-live-refs">{item.refs.map(id => <li key={id}>{state.entities.find(e => e.id === id)?.name ?? id}<small>{id}</small></li>)}</ul></section>}
      <BackendObservation value={observations[item.id]} />
      {item.sourcePending ? <p className="nm-callout">Source is pending Tech selection. No backend resource has been created.</p> : item.provider !== "F5" && <DraftSyncStatus job={job} binding={binding} />}
      {binding && <div className="nm-callout"><p>{item.provider ?? "NeMo"} resource: {binding.f5?.scannerId ?? binding.f5?.projectId ?? binding.policyId ?? binding.guardrailId ?? "Awaiting release"}</p>{binding.f5?.versionId && <p>Evaluated version: {binding.f5.versionId}</p>}<p>Published version: {binding.publishedVersion ?? binding.version ?? "None"}</p>{binding.publishedRefs && <p>Approved policy versions: {Object.values(binding.publishedRefs).map(ref => `${ref.policyId}@${ref.policyVersion}`).join(", ")}</p>}{binding.released && <p>Configuration saved in {item.provider ?? "NeMo"}. Application traffic integration is configured separately.</p>}</div>}
      {job && <div className="nm-callout" role="status"><p>{item.provider ?? "NeMo"} operation: {job.phase} · {job.inflight ? "outcome pending verification" : job.status}</p>{job.message && <p className="nm-connection-error">{job.message}</p>}{(job.canResume ?? job.actor === actor.id) && (job.status === "uncertain" || job.status === "failed" || job.inflight) && <div className="space-y-2">{(item.provider === "F5" && job.phase.endsWith("-create") || job.phase === "sync-profile-save" && !binding?.guardrailId) && <label>Remote resource ID<Input value={remoteId} onChange={event => setRemoteId(event.target.value)} placeholder="Exact resource ID from the source backend" /></label>}<Button disabled={busy} onClick={() => void execute({ type: "reconcile", id: item.id, ...(remoteId.trim() ? { remoteId: remoteId.trim() } : {}) })}>Reconcile with {item.provider ?? "NeMo"}</Button></div>}</div>}
      <div className="flex flex-wrap gap-2">
        {actor.role === "User" && (!pending || canCorrect) && ["DRAFT", "TEST READY", "TEST FAILED", "TEST PASSED"].includes(item.status) && <Button variant="outline" disabled={busy} onClick={() => setForm("edit")}>Edit requirements</Button>}
        {actor.role === "User" && !pending && item.status === "DEPLOYED" && <Button disabled={busy} onClick={() => setForm("revise")}>Create revision</Button>}
        {actor.role === "User" && !pending && (item.kind === "Guardrail" && item.status === "TEST PASSED" || item.kind === "Profile" && item.status === "DRAFT") && <Button disabled={busy} onClick={() => void action("request")}>Request sign-off</Button>}
        {actor.role === "User" && !pending && ["TEST READY", "TEST FAILED", "TEST PASSED", "SIGNOFF REQUESTED", "SIGNED OFF"].includes(item.status) && <Button variant="outline" disabled={busy} onClick={() => void action("withdraw")}>Withdraw</Button>}
        {actor.role === "User Admin" && item.status === "SIGNOFF REQUESTED" && <Button disabled={busy} onClick={() => void action("approve")}>Approve revision</Button>}
        {actor.role === "IT Admin" && !pending && item.status === "SIGNED OFF" && <Button disabled={busy} onClick={() => void action("deploy")}>Release to {item.provider ?? "NeMo"}</Button>}
      </div>
      {actor.role === "User Admin" && item.status === "SIGNOFF REQUESTED" && <div className="space-y-2"><label>Reason for rejection<Textarea value={reason} onChange={e => setReason(e.target.value)} /></label><Button variant="outline" disabled={busy || !reason.trim()} onClick={() => void action("reject")}>Reject</Button></div>}
    </section>
    {actor.role === "IT Admin" && item.kind === "Guardrail" && (!pending || canCorrect) && ["DRAFT", "TEST FAILED"].includes(item.status) && <section className="nm-card nm-padding nm-live-panel"><h3>Implementation</h3><label className="nm-select">Source<select aria-label="Source" value={implementationSource} disabled={busy || !item.sourcePending} onChange={event => setSource(event.target.value as "NeMo" | "F5" | "")}><option value="" disabled>Select source…</option>{[...new Set([...(snapshot.sources ?? ["NeMo"]), ...(!item.sourcePending ? [item.provider ?? "NeMo"] : [])])].map(value => <option key={value} value={value}>{value}</option>)}</select></label>{!item.sourcePending && <p className="nm-muted">The assigned source is fixed for this request and its revisions.</p>}<UnifiedConfigForm config={config} sources={[]} onSources={() => {}} onChange={setConfig} /><p className="nm-muted">{implementationSource === "F5" ? "F5 executes keywords, regex and GenAI instructions. Custom content is the detection instruction for F5 GenAI. Version names use letters, numbers, underscores or hyphens." : "Keywords and regex are executed by NeMo. Custom configuration must be a complete NeMo Policy JSON definition with acceptance tests."}</p><Button disabled={busy || !implementationSource} onClick={() => void action("implement")}>Save implementation</Button></section>}
    {actor.role === "IT Admin" && item.kind === "Guardrail" && !pending && ["TEST READY", "TEST FAILED", "TEST PASSED"].includes(item.status) && <section className="nm-card nm-padding nm-live-panel"><h3>Evaluate in {item.provider ?? "NeMo"}</h3><label>Dataset name<Input value={dataset} onChange={e => setDataset(e.target.value)} /></label>{(item.provider === "F5" || item.config?.scannerType !== "custom") ? <><p>Upload a JSON array or enter cases below. Each case needs input, expected (allow/block) and phase (input/output). Include a blocking case for each configured direction.</p><label className="nm-file-picker"><span className="nm-file-picker-button">Choose file</span><span className="nm-file-picker-name">{datasetFile || "No file selected"}</span><input aria-label="Upload acceptance dataset" type="file" accept=".json,application/json" onChange={async event => { const file = event.target.files?.[0]; if (!file) return; if (file.size > 1_000_000) { setError("Dataset must be smaller than 1 MB."); return; } setCases(await file.text()); setDataset(file.name); setDatasetFile(file.name); }} /></label><Textarea aria-label="Acceptance cases JSON" rows={9} value={cases} placeholder={'[{"input":"secret","expected":"block","phase":"input"}]'} onChange={e => setCases(e.target.value)} /></> : <p>The acceptance tests embedded in the Policy definition will run.</p>}<Button disabled={busy} onClick={() => { try { void execute({ type: "evaluate", id: item.id, dataset, cases: item.provider !== "F5" && item.config?.scannerType === "custom" ? [] : JSON.parse(cases) }); } catch { setError("Enter a valid JSON array of acceptance cases."); } }}>Run evaluation</Button></section>}
    <TestResultsReview key={item.id} item={item} allowMockResults={false} /></div>
    : <><LiveRecordList key={`${kind}:${view}`} items={rows} kind={kind} view={view} role={actor.role} title={pageTitle} onOpen={setSelected} onCreate={() => setForm("create")} renderStatus={e => <LiveStatus item={e} />} renderBackend={e => <><BackendObservation value={observations[e.id]} />{e.sourcePending ? <p className="nm-muted">Awaiting Tech source selection</p> : e.provider !== "F5" ? <DraftSyncStatus job={snapshot.jobs[e.id]} binding={snapshot.bindings[`${e.id}@${e.version}`]} /> : <p className="nm-muted">F5 workflow</p>}</>} />{view === "signoff" && actor.role === "User Admin" && <OperationHistory state={state} kind={kind} controlUnit={actor.unit} actor={actor.name} onOpen={setSelected} />}</>}
  </NmgrShell>;
}

function LiveStatus({ item }: { item: Entity }) {
  const tone = ["DEPLOYED", "SIGNED OFF", "TEST PASSED"].includes(item.status) ? "good" : item.status === "TEST FAILED" ? "bad" : item.status === "SIGNOFF REQUESTED" ? "warning" : "";
  return <span className={`nm-badge ${tone}`}>{item.status === "DEPLOYED" ? `Released to ${item.provider ?? "NeMo"}` : item.status.toLowerCase().replace(/\b\w/g, letter => letter.toUpperCase())}</span>;
}

function BackendObservation({ value }: { value?: ResourceObservation | undefined }) {
  if (!value) return <span className="nm-muted">Not queried</span>;
  return <div className="nm-live-observation"><p className="nm-connection-error">{value.message}</p>{value.remoteVersion && <small>Remote version: {value.remoteVersion}</small>}<small className="block">Checked: {new Date(value.checkedAt).toLocaleString()}</small></div>;
}

function DraftSyncStatus({ job, binding }: { job?: NmgrJob | undefined; binding?: NmgrBinding | undefined }) {
  const status = job?.purpose === "draft-sync" ? job.inflight ? "outcome needs verification" : job.status === "done" ? "synchronized" : job.status === "uncertain" ? "outcome needs verification" : job.status === "failed" ? job.canCorrect ? "rejected; correct the draft or reconcile" : "failed; reconcile required" : "pending" : binding?.draftSyncedAt ? "synchronized" : "not synchronized";
  return <div className="nm-live-draft-sync"><p>NeMo draft sync: {status}</p>{binding?.draftSyncedAt && <small>Confirmed: {new Date(binding.draftSyncedAt).toLocaleString()}</small>}</div>;
}
