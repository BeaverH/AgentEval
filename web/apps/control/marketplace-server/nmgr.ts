import { createHash } from "node:crypto";
import { z } from "zod";
import { addEntity, editEntity, reviseEntity, transition, type Entity, type State, type Role } from "../src/features/nmgr/model";
import { commandSchema, caseSchema } from "./nmgr-contract";
import { StoreError } from "./marketplace-db";
import { reportFailure } from "./diagnostics";
import { f5Evaluation, f5Step, type F5Binding, type F5Work } from "./nmgr-f5";
import type { F5Remote, F5ScannerRef } from "./f5-client";
import { observeResource } from "./nmgr-observation";
import { emptyNemoPolicy, nemoDraftStep } from "./nmgr-draft-sync";

export type NmgrActor = { id: string; name: string; role: Role; unit: string };
type PolicyBinding = { policyId: string; policyVersion: string; enabledRuleIds: string[]; enabledRails: string[]; f5?: F5ScannerRef };
export type NmgrBinding = { draftSyncedAt?: string; f5?: F5Binding; policyId?: string; revision?: number; publishedVersion?: string; ruleIds?: string[]; rails?: string[]; guardrailId?: string; draftRevision?: number; version?: string; publishedRefs?: Record<string, PolicyBinding>; released?: boolean };
export type NmgrJob = { canCorrect?: boolean; canResume?: boolean; purpose?: "draft-sync"; expectedRevision?: number; f5?: F5Work; actor: string; phase: string; status: "pending" | "failed" | "uncertain" | "done"; started: string; inflight?: boolean; message?: string; runId?: string; dataset?: string; definition?: any; profile?: any };
export type NmgrDocument = { revision: number; state: State; requests: Record<string, string>; jobs: Record<string, NmgrJob>; bindings: Record<string, NmgrBinding>; authors: Record<string, string>; requestors: Record<string, string> };
export interface NmgrPersistence {
  exclusive<T>(fn: () => Promise<T>): Promise<T>;
  readDocument<T>(id: string): Promise<T | undefined>;
  writeDocument(id: string, value: unknown): Promise<void>;
}
export interface NmgrRemote { request(path: string, method?: string, body?: unknown): Promise<any> }
function fail(status: number, message: string): never { throw new StoreError(status, message); }
const now = () => new Date().toISOString();
const empty = (): NmgrDocument => ({ revision: 0, state: { entities: [], audit: [] }, requests: {}, jobs: {}, bindings: {}, authors: {}, requestors: {} });
const scope = (entity: Entity, actor: NmgrActor) => actor.role === "IT Admin" || entity.unit === actor.unit;
const keyFor = (e: Entity) => `${e.id}@${e.version}`;
function subset(expected: any, actual: any): boolean {
  if (expected === null || typeof expected !== "object") return expected === actual;
  if (!actual || typeof actual !== "object") return false;
  if (Array.isArray(expected) && (!Array.isArray(actual) || expected.length !== actual.length)) return false;
  return Object.keys(expected).every(key => subset(expected[key], actual[key]));
}

export class NmgrService {
  constructor(private db: NmgrPersistence, private workspace: string, private f5?: F5Remote) {}
  private get documentId() { return `nmgr:${this.workspace}`; }
  private async load() { return await this.db.readDocument<NmgrDocument>(this.documentId) ?? empty(); }
  private async save(doc: NmgrDocument) { doc.revision++; await this.db.writeDocument(this.documentId, doc); }
  private view(doc: NmgrDocument, actor: NmgrActor) {
    const entities = doc.state.entities.filter(e => scope(e, actor)), ids = new Set(entities.map(e => e.id));
    return { revision: doc.revision, actor, sources: this.f5 ? ["NeMo", "F5"] : ["NeMo"], state: { entities, audit: doc.state.audit.filter(a => ids.has(a.entity)) },
      jobs: Object.fromEntries(Object.entries(doc.jobs).filter(([id]) => ids.has(id)).map(([id, job]) => [id, { ...job, canResume: job.purpose === "draft-sync" ? actor.role === "IT Admin" || actor.role === "User" && doc.authors[id] === actor.id : actor.role === "IT Admin" && job.actor === actor.id, definition: undefined, profile: undefined, f5: undefined }])),
      bindings: Object.fromEntries(Object.entries(doc.bindings).filter(([key]) => ids.has(key.split("@")[0]!))) };
  }
  async snapshot(actor: NmgrActor) { return this.db.exclusive(async () => this.view(await this.load(), actor)); }
  async resourceStatus(actor: NmgrActor, id: string, remote: NmgrRemote) {
    const view = await this.snapshot(actor);
    const entity = view.state.entities.find(e => e.id === id);
    if (!entity) fail(404, "Record not found.");
    return observeResource(entity, view.bindings[keyFor(entity)], view.revision, remote, this.f5);
  }
  async command(actor: NmgrActor, raw: unknown, remote: NmgrRemote) {
    const cmd = commandSchema.parse(raw);
    return this.db.exclusive(async () => {
      const doc = await this.load(), requestKey = `${actor.id}:${cmd.requestId}`, fingerprint = createHash("sha256").update(JSON.stringify(cmd)).digest("hex"), priorAudit = [...doc.state.audit];
      if (doc.requests[requestKey]) {
        if (doc.requests[requestKey] !== fingerprint) fail(409, "Idempotency key was already used for different content.");
        return this.view(doc, actor);
      }
      if (doc.revision !== cmd.expectedRevision) fail(409, "Workspace changed. Refresh and review before retrying.");
      const id = "draft" in cmd ? cmd.draft.id : cmd.id;
      let e = doc.state.entities.find(e => e.id === id && scope(e, actor));
      if (cmd.type !== "create" && !e) fail(404, "Record not found.");
      const job = doc.jobs[id];
      let syncAfterSave = false;
      if (cmd.type === "advance" || cmd.type === "reconcile") {
        if (!job || (job.purpose === "draft-sync" ? actor.role !== "IT Admin" && (actor.role !== "User" || doc.authors[id] !== actor.id) : actor.role !== "IT Admin" || job.actor !== actor.id)) fail(403, "Only the author or Tech can recover draft sync; other operations require the initiating Tech account.");
        if (job.status === "done") fail(409, "Operation is already complete.");
        if (cmd.type === "advance" && (job.inflight || job.status === "uncertain")) fail(409, "Remote outcome is uncertain. Reconcile before retrying.");
        if (cmd.type === "advance" && job.status === "failed") fail(409, "Resolve the error and reconcile before continuing.");
        doc.requests[requestKey] = fingerprint;
        await this.runJob(doc, e!, job, actor, remote, cmd.type === "reconcile", cmd.remoteId);
      } else {
        if (e?.provider === "F5" && e.sourceInstanceId !== this.f5?.sourceId) fail(409, "F5 source instance changed or is unavailable. Restore the original F5 configuration.");
        const correcting = job?.purpose === "draft-sync" && job.status === "failed" && job.canCorrect && !job.inflight && (cmd.type === "edit" || cmd.type === "action" && cmd.action === "implement");
        if (!correcting && job && (job.status === "pending" || job.status === "uncertain" || job.inflight || job.purpose === "draft-sync" && job.status !== "done")) fail(409, "Finish or reconcile the pending backend operation first.");
        if ("draft" in cmd) {
          if (actor.role !== "User") fail(403, "Only User can create or edit requirements.");
          if (cmd.type === "create" && doc.state.entities.some(e => e.id === id)) fail(409, "This record ID is already used.");
          if (e && doc.authors[e.id] !== actor.id) fail(403, "Only the original author can change this request.");
          if (e && cmd.draft.kind !== e.kind) fail(422, "Record type cannot change.");
          if (cmd.draft.provider !== undefined) fail(403, "Only Tech can select the source provider during implementation.");
          for (const ref of cmd.draft.refs) if (!doc.state.entities.some(g => g.id === ref && scope(g, actor))) fail(422, "Referenced Guardrail is outside this control unit.");
          const provider = e?.provider ?? (cmd.draft.kind === "Profile" ? doc.state.entities.find(g => g.id === cmd.draft.refs[0])?.provider ?? "NeMo" : "NeMo");
          const sourcePending = e ? e.sourcePending === true : cmd.draft.kind === "Guardrail";
          if (provider === "F5" && !this.f5) fail(503, "F5 is not configured.");
          if (cmd.draft.kind === "Profile") for (const ref of cmd.draft.refs) {
            const guard = doc.state.entities.find(g => g.id === ref)!;
            if (guard.sourcePending || (guard.provider ?? "NeMo") !== provider) fail(422, "Profile bindings must use the same Tech-assigned source provider.");
          }
          const item: Entity = { ...cmd.draft, provider, sourcePending, ...(provider === "F5" ? { sourceInstanceId: this.f5!.sourceId } : {}), unit: actor.unit, custodian: actor.name, approver: "Control Unit Approver", status: "DRAFT", version: 1, configurationRevision: 0, deployed: null, updated: now(), policies: [], deployedRefs: [], runs: [], mode: "Normal" };
          this.changeUnit(doc, actor.unit, state => cmd.type === "create" ? addEntity(state, item, actor.role) : cmd.type === "edit" ? editEntity(state, item, actor.role) : reviseEntity(state, item, actor.role, actor.name), item.provider);
          doc.authors[id] = actor.id;
          delete doc.jobs[id];
          if (provider === "F5") { if (cmd.type !== "revise") delete doc.bindings[`${id}@${e?.version ?? 1}`]; }
          else if (!sourcePending) { e = doc.state.entities.find(item => item.id === id)!; this.queueDraftSync(doc, e, actor); syncAfterSave = true; }
        } else if (cmd.type === "evaluate") {
          if (actor.role !== "IT Admin" || e!.kind !== "Guardrail" || !["TEST READY", "TEST FAILED", "TEST PASSED"].includes(e!.status)) fail(403, "Tech evaluation requires an implemented Guardrail.");
          // NeMo drafts retain identity within this business revision; evidence is
          // still tied to exact definition and configuration revisions.
          const priorBinding = doc.bindings[keyFor(e!)];
          const policyId = priorBinding?.policyId ?? `mp-${this.workspace}-${e!.id}-v${e!.version}`;
          if (e!.provider === "F5" && !this.f5) fail(503, "F5 is not configured.");
          const f5 = e!.provider === "F5" ? f5Evaluation(e!, cmd.cases, this.f5!.sourceId, cmd.requestId) : undefined;
          const definition = f5 ? undefined : policyDefinition(e!, policyId, cmd.cases);
          e!.status = "TEST READY";
          e!.configurationRevision = (e!.configurationRevision ?? 0) + 1;
          doc.bindings[keyFor(e!)] = f5?.binding ?? { ...priorBinding, policyId };
          doc.jobs[id] = { actor: actor.id, phase: f5 ? "f5-scanner-create" : "policy-save", status: "pending", started: now(), dataset: cmd.dataset, definition, ...(f5 ? { f5: f5.work } : { expectedRevision: priorBinding?.revision ?? 0 }) };
          this.audit(doc, e!, actor, "evaluation requested");
        } else if (cmd.type === "action") {
          if (cmd.provider !== undefined && (actor.role !== "IT Admin" || cmd.action !== "implement" || e!.kind !== "Guardrail")) fail(403, "Only Tech can select the source provider during Guardrail implementation.");
          if (cmd.action === "implement" && e!.kind === "Guardrail") {
            if (actor.role !== "IT Admin") fail(403, "Only Tech can implement a Guardrail.");
            if (e!.sourcePending && !cmd.provider) fail(422, "Select a source provider before saving implementation.");
            const provider = cmd.provider ?? e!.provider ?? "NeMo";
            if (!e!.sourcePending && provider !== (e!.provider ?? "NeMo")) fail(422, "The source provider cannot change after assignment. Create a separate request.");
            if (provider === "F5" && !this.f5) fail(503, "F5 is not configured.");
            e!.provider = provider;
            if (provider === "F5") e!.sourceInstanceId = this.f5!.sourceId;
          }
          if (["request", "withdraw"].includes(cmd.action) && doc.authors[id] !== actor.id) fail(403, "Only the original author can submit or withdraw this request.");
          if (cmd.action === "approve" && [doc.authors[id], doc.requestors[id]].includes(actor.id)) fail(403, "An independent approver is required.");
          if (cmd.action === "deploy") {
            if (job?.status === "failed") fail(409, "Reconcile this release or withdraw and create a new revision before starting another release.");
            if (actor.role !== "IT Admin" || e!.status !== "SIGNED OFF") fail(403, "Deployment requires Tech and an approved revision.");
            if (e!.kind === "Guardrail") {
              const binding = doc.bindings[keyFor(e!)], run = e!.runs[0];
              if (!(e!.provider === "F5" ? binding?.f5?.versionId : binding?.revision) || !run?.passed || run.version !== e!.version || run.configurationRevision !== e!.configurationRevision) fail(409, "Missing current backend evaluation evidence.");
              doc.jobs[id] = { actor: actor.id, phase: e!.provider === "F5" ? "f5-scanner-publish" : "policy-publish", status: "pending", started: now() };
            } else {
              const bindings = this.profileBindings(doc, e!, true);
              doc.bindings[keyFor(e!)] = { ...doc.bindings[keyFor(e!)], publishedRefs: Object.fromEntries(e!.refs.map((ref, i) => [ref, bindings[i]!])) };
              doc.jobs[id] = e!.provider === "F5" ? { actor: actor.id, phase: "f5-project-create", status: "pending", started: now(), f5: { name: `mp-${cmd.requestId}`, refs: bindings.map(b => b.f5!), cases: [], results: [], accessIndex: 0 } }
                : { actor: actor.id, phase: doc.bindings[keyFor(e!)]?.guardrailId ? "profile-check" : "profile-create", status: "pending", started: now(), profile: this.profileDraft(e!, bindings) };
            }
            this.audit(doc, e!, actor, "release requested");
          } else {
            if (e!.kind === "Profile" && cmd.action === "request") {
              const bindings = this.profileBindings(doc, e!);
              doc.bindings[keyFor(e!)] = { ...doc.bindings[keyFor(e!)], publishedRefs: Object.fromEntries(e!.refs.map((ref, i) => [ref, bindings[i]!])), ...(e!.provider === "F5" ? { f5: { sourceId: this.f5!.sourceId } } : {}) };
            }
            if (e!.kind === "Profile" && cmd.action === "approve") this.profileBindings(doc, e!, true);
            const previous = { deployed: e!.deployed, deployedAt: e!.deployedAt, deployedRefs: e!.deployedRefs };
            this.changeUnit(doc, e!.unit, state => transition(state, id, cmd.action, actor.role, { actorName: actor.name, ...(cmd.reason ? { reason: cmd.reason } : {}), ...(cmd.config ? { config: cmd.config } : {}), policies: [e!.description], provider: e!.provider ?? "NeMo" }), e!.provider);
            e = doc.state.entities.find(e => e.id === id)!;
            if (cmd.action === "implement") e.sourcePending = false;
            // Demo profiles activate on approval; live profiles require actual
            // compile, frozen-version tests and release, performed by Tech.
            if (e.kind === "Profile" && cmd.action === "approve") Object.assign(e, previous);
            if (cmd.action === "request") doc.requestors[id] = actor.id;
            if (["implement", "withdraw", "reject"].includes(cmd.action)) delete doc.jobs[id];
            if (e.provider !== "F5" && (cmd.action === "implement" || e.kind === "Profile" && cmd.action === "request")) { this.queueDraftSync(doc, e, actor, e.kind === "Profile"); syncAfterSave = true; }
          }
        }
        doc.requests[requestKey] = fingerprint;
      }
      const priorIds = new Set(priorAudit.map(a => a.id));
      doc.state.audit = [...doc.state.audit.filter(a => !priorIds.has(a.id)), ...priorAudit];
      await this.save(doc);
      if (syncAfterSave) {
        for (let step = 0; step < 2 && doc.jobs[id]?.status === "pending"; step++) await this.runJob(doc, doc.state.entities.find(item => item.id === id)!, doc.jobs[id]!, actor, remote, false);
      }
      return this.view(doc, actor);
    });
  }
  private profileDraft(e: Entity, bindings: PolicyBinding[]) { return { name: `MP ${this.workspace} ${e.id} v${e.version} ${e.name}`.slice(0, 160), draftConfig: { policyBindings: bindings }, runtimeProfile: "auto" }; }
  private queueDraftSync(doc: NmgrDocument, e: Entity, actor: NmgrActor, pinned = false) {
    const binding = doc.bindings[keyFor(e)] ??= {};
    delete binding.draftSyncedAt;
    const job: NmgrJob = { actor: actor.id, purpose: "draft-sync", phase: e.kind === "Guardrail" ? "sync-policy-save" : "sync-profile-save", status: "pending", started: now() };
    if (e.kind === "Guardrail") {
      binding.policyId ??= `mp-${this.workspace}-${e.id}-v${e.version}`;
      job.expectedRevision = binding.revision ?? 0;
      job.definition = e.config ? policyDefinition(e, binding.policyId, [], true) : emptyNemoPolicy(e, binding.policyId);
    } else { job.expectedRevision = binding.draftRevision ?? 0; job.profile = this.profileDraft(e, this.profileBindings(doc, e, pinned)); }
    doc.jobs[e.id] = job;
  }
  private async runJob(doc: NmgrDocument, e: Entity, job: NmgrJob, actor: NmgrActor, remote: NmgrRemote, recovering: boolean, remoteId?: string) {
    const unresolved = !!job.inflight || job.status === "uncertain";
    job.inflight = true; delete job.canCorrect; await this.save(doc);
    try {
      const binding = doc.bindings[keyFor(e)]!;
      if (e.provider === "F5") {
        if (!this.f5) fail(503, "F5 is not configured. Restore the connection before continuing.");
        if (await f5Step(e, binding, job, this.f5, recovering, remoteId) === "released") this.released(doc, e, job, binding);
      } else if (job.purpose === "draft-sync" || ["policy-save", "policy-read"].includes(job.phase)) await nemoDraftStep(e, binding, job, remote, recovering, unresolved, remoteId);
      else await this.step(doc, e, job, remote, recovering);
      job.inflight = false; delete job.message;
      if (job.status !== "done") job.status = "pending";
    } catch (error) {
      job.inflight = false;
      job.status = recovering && unresolved ? "uncertain" : error instanceof StoreError && error.status >= 400 && error.status < 500 ? "failed" : "uncertain";
      // Only an explicit validation rejection of the write permits a corrected
      // draft. Conflicts and unknown outcomes must still be reconciled first.
      if (job.status === "failed" && job.purpose === "draft-sync" && ["sync-policy-save", "sync-profile-save"].includes(job.phase) && error instanceof StoreError && [400, 422].includes(error.status)) {
        job.canCorrect = true; e.status = "DRAFT"; delete e.signedBy;
      }
      const failure = reportFailure(error, e.provider === "F5" ? "f5" : "nemo", `job.${job.phase}`, "Connection lost or incompatible backend response. Reconcile the remote result before retrying.");
      job.message = `[${failure.code}] ${failure.message} Check: ${failure.settings.join(", ")}. Reference: ${failure.requestId}${failure.details ? `\n${JSON.stringify(failure.details, null, 2)}` : ""}`;
      this.audit(doc, e, actor, `${job.phase}: ${job.status}`);
    }
    await this.save(doc);
  }
  private audit(doc: NmgrDocument, e: Entity, actor: NmgrActor, action: string) {
    e.updated = now();
    doc.state.audit.unshift({ id: crypto.randomUUID(), time: e.updated, entity: e.id, actor: actor.name, action });
  }
  private changeUnit(doc: NmgrDocument, unit: string, change: (state: State) => State, provider = "NeMo") {
    const included = (e: Entity) => e.unit === unit && (e.provider ?? "NeMo") === provider;
    const others = doc.state.entities.filter(e => !included(e));
    try {
      const changed = change({ ...doc.state, entities: doc.state.entities.filter(included) });
      doc.state = { ...changed, entities: [...changed.entities, ...others] };
    } catch (error) { if (error instanceof StoreError) throw error; fail(422, error instanceof Error ? error.message : "Invalid lifecycle change."); }
  }
  private profileBindings(doc: NmgrDocument, e: Entity, pinned = false) {
    // Re-run mandatory/jurisdiction and released-reference validation at release.
    if (e.provider === "F5" && !this.f5) fail(503, "F5 is not configured.");
    try { addEntity({ ...doc.state, entities: doc.state.entities.filter(g => g.id !== e.id && g.unit === e.unit && (g.provider ?? "NeMo") === (e.provider ?? "NeMo")) }, e); }
    catch (error) { fail(422, error instanceof Error ? error.message : "Invalid profile bindings."); }
    if (pinned) {
      const saved = doc.bindings[keyFor(e)]?.publishedRefs;
      if (!saved || e.refs.some(id => !saved[id]?.policyVersion)) fail(409, "Approved policy versions are missing. Withdraw and request approval again.");
      if (e.provider === "F5" && (doc.bindings[keyFor(e)]?.f5?.sourceId !== this.f5!.sourceId || e.refs.some(id => !saved[id]?.f5))) fail(409, "F5 source instance changed or approved Scanner versions are missing.");
      return e.refs.map(id => saved[id]!);
    }
    return e.refs.map(id => {
      const guardrail = doc.state.entities.find(g => g.id === id)!;
      const binding = doc.bindings[`${id}@${guardrail.deployed}`];
      if (e.provider === "F5") {
        if (!binding?.released || !binding.f5?.scannerId || !binding.f5.versionId || binding.f5.sourceId !== this.f5!.sourceId) fail(409, "Referenced Guardrails require a published version in this F5 source instance.");
        const version = guardrail.revisions?.[guardrail.deployed!] ?? guardrail;
        return { policyId: binding.f5.scannerId, policyVersion: binding.f5.versionId, enabledRuleIds: [], enabledRails: [], f5: { id: binding.f5.scannerId, version: binding.f5.versionId, direction: version.config!.direction, enabled: true as const, blocking: true as const, mode: "block" as const } };
      }
      if (!binding?.policyId || !binding.publishedVersion || !binding.released) fail(409, "Referenced Guardrails must have a published NeMo version.");
      if (!binding.ruleIds?.length || !binding.rails?.length) fail(409, "Published policy rules and directions are missing. Evaluate and publish a new revision.");
      return { policyId: binding.policyId!, policyVersion: binding.publishedVersion!, enabledRuleIds: binding.ruleIds, enabledRails: binding.rails };
    });
  }
  private async step(doc: NmgrDocument, e: Entity, job: NmgrJob, remote: NmgrRemote, recovering: boolean) {
    const b = doc.bindings[keyFor(e)]!, policy = `/policies/${b.policyId}/definition`, profile = `/guardrails/${b.guardrailId}`;
    const request = remote.request.bind(remote);
    const expect = (condition: unknown, message: string) => { if (!condition) fail(409, message); };
    const move = (phase: string) => { job.phase = phase; };
    if (job.phase === "policy-start") {
      const run = await request(`${policy}/test-runs${recovering ? "/latest" : ""}`, recovering ? "GET" : "POST", recovering ? undefined : {});
      expect(run?.id && run.policyId === b.policyId && run.revision === b.revision, "Matching policy test run not found. Check NeMo before continuing.");
      job.runId = run.id; move("policy-poll");
    } else if (job.phase === "policy-poll") {
      const run = await request(`${policy}/test-runs/${job.runId}`);
      expect(run.id === job.runId && run.policyId === b.policyId && run.revision === b.revision, "Policy test evidence does not match this revision.");
      if (["queued", "running"].includes(run.status)) return;
      this.recordRun(e, job, run);
      e.status = e.runs[0]!.passed ? "TEST PASSED" : "TEST FAILED";
      job.status = "done";
    } else if (job.phase === "policy-publish") {
      // NeMo publication is idempotent for the exact definition revision.
      const result = await request(`${policy}/publish`, "POST", { expectedRevision: b.revision });
      expect(result.id === b.policyId && typeof result.version === "string", "Unexpected published policy response.");
      b.publishedVersion = result.version; this.released(doc, e, job, b);
    } else if (job.phase === "profile-check") {
      const current = await request(profile);
      expect(current?.id === b.guardrailId && current.draftRevision === b.draftRevision && subset(job.profile, current), "NeMo Profile changed after approval. Reconcile the approved draft before release.");
      move("profile-start");
    } else if (job.phase === "profile-create") {
      let result;
      if (recovering) {
        const found = (await request("/guardrails")).items.filter((g: any) => g.name === job.profile.name);
        expect(found.length === 1 && subset(job.profile.draftConfig, found[0].draftConfig), "A unique matching NeMo profile was not found. Check NeMo before continuing.");
        result = found[0];
      } else result = await request("/guardrails", "POST", job.profile);
      expect(typeof result.id === "string" && Number.isSafeInteger(result.draftRevision), "Unexpected created profile response.");
      b.guardrailId = result.id; b.draftRevision = result.draftRevision; move("profile-start");
    } else if (job.phase === "profile-start" || job.phase === "profile-version-start") {
      const versionRun = job.phase === "profile-version-start";
      let run;
      if (recovering) {
        const rows = (await request(`/test-runs?guardrailId=${encodeURIComponent(b.guardrailId!)}`)).items;
        run = rows.find((r: any) => r.guardrailId === b.guardrailId && r.sourceDraftRevision === b.draftRevision && (versionRun ? r.subject === "version" && r.guardrailVersion === b.version : r.subject === "draft"));
      } else run = await request(`${profile}${versionRun ? `/versions/${b.version}` : ""}/test-runs`, "POST", { testModelRules: true });
      expect(run?.id && run.guardrailId === b.guardrailId && run.sourceDraftRevision === b.draftRevision, "Matching profile test run not found. Check NeMo before continuing.");
      job.runId = run.id; move(versionRun ? "profile-version-poll" : "profile-poll");
    } else if (job.phase === "profile-poll" || job.phase === "profile-version-poll") {
      const run = await request(`/test-runs/${job.runId}`), versionRun = job.phase === "profile-version-poll";
      expect(run.id === job.runId && run.guardrailId === b.guardrailId && run.sourceDraftRevision === b.draftRevision && run.testModelRules === true && (!versionRun || run.subject === "version" && run.guardrailVersion === b.version), "Profile test evidence does not match this revision.");
      if (["queued", "running"].includes(run.status)) return;
      this.recordRun(e, job, run);
      expect(e.runs[0]!.passed, "NeMo profile tests failed. Review the recorded results.");
      move(versionRun ? "profile-release" : "profile-publish");
    } else if (job.phase === "profile-publish") {
      // NeMo freezes at most one version for an unchanged source draft.
      const result = await request(`${profile}/publish`, "POST", { expectedDraftRevision: b.draftRevision });
      expect(result.guardrailId === b.guardrailId && typeof result.version === "string", "Unexpected profile publication response.");
      b.version = result.version; move("profile-version-start");
    } else if (job.phase === "profile-release") {
      const result = await request(`${profile}/versions/${b.version}/release`, "POST", {});
      expect(result.version === b.version && result.status === "ready", "NeMo version is not ready.");
      this.released(doc, e, job, b);
    } else fail(409, "Unknown pending operation.");
  }
  private recordRun(e: Entity, job: NmgrJob, run: any) {
    const results = z.array(z.object({ caseId: z.string(), passed: z.boolean(), actualDecision: z.string().optional(), reason: z.string().optional() }).passthrough()).parse(run.results);
    const complete = !job.definition || job.definition.tests.length === results.length && job.definition.tests.every((t: any) => results.some(r => r.caseId === t.id));
    const passed = run.status === "passed" && complete && results.length > 0 && results.every(r => r.passed);
    e.runs = [{ id: run.id, version: e.version, configurationRevision: e.configurationRevision ?? 0, base: e.deployed, dataset: job.dataset ?? `NeMo ${job.phase}`, passed, start: job.started, end: now(), cases: results.length, tester: "IT Admin", evidence: { source: "NeMo", status: run.status, results, failureReason: run.failureReason ?? null } }, ...e.runs.filter(r => r.id !== run.id)];
  }
  private released(doc: NmgrDocument, e: Entity, job: NmgrJob, b: NmgrBinding) {
    e.deployed = e.version; e.deployedAt = now(); e.deployedRefs = [...e.refs]; e.status = "DEPLOYED";
    b.released = true; job.status = "done";
    this.audit(doc, e, { id: job.actor, name: job.actor, role: "IT Admin", unit: e.unit }, `released to ${e.provider ?? "NeMo"}; application traffic integration managed separately`);
  }
}

function policyDefinition(e: Entity, id: string, cases: z.infer<typeof caseSchema>[], draftOnly = false) {
  const config = e.config!;
  if (config.scannerType === "custom") {
    let definition: any; try { definition = JSON.parse(config.content); } catch { fail(422, "Custom detection requires a NeMo Policy JSON definition; natural-language text is not executable."); }
    if (definition?.kind !== "Policy" || definition.schema_version !== 1 || !Array.isArray(definition.rules) || !definition.rules.length || !Array.isArray(definition.tests) || !draftOnly && !definition.tests.length) fail(422, "Provide a complete NeMo Policy definition with rules and required acceptance tests.");
    return { ...definition, metadata: { ...definition.metadata, id, name: e.name, description: e.description, version: "0" } };
  }
  const stages = config.direction === "both" ? ["input", "output"] : [config.direction === "request" ? "input" : "output"];
  if (!draftOnly && (cases.some(c => !stages.includes(c.phase)) || stages.some(s => !cases.some(c => c.phase === s && c.expected === "block")))) fail(422, "Include a blocking acceptance case for every configured direction; remove cases outside that direction.");
  return { schema_version: 1, kind: "Policy", metadata: { id, name: e.name, description: e.description, version: "0", tags: [{ namespace: "protection", value: "content_filters", label: "Content filters", source: "declared" }], safety_level: "balanced", output_delivery: "full_buffered" }, parameters: [],
    rules: [{ id: "control", name: e.name, description: e.description, stages, detector: { ref: config.scannerType === "keyword" ? "text/keyword" : "text/regex", version: "1.0.0", parameters: config.scannerType === "keyword" ? { detector_options: { terms: config.content.split(/[\n,]/).map(s => s.trim()).filter(Boolean) } } : { expression: config.content } }, on_match: { action: "block" }, risk_level: "medium", metadata: { taxonomy_ids: ["TALI-BUSINESS-POLICY"] } }],
    tests: cases.map((c, i) => ({ id: `case-${i + 1}`, name: `Case ${i + 1}`, description: "", phase: c.phase, content: c.input, expected_decision: c.expected, covered_rule_ids: c.expected === "block" ? ["control"] : [], kind: c.expected === "block" ? "rule_acceptance" : "scenario", scope: c.expected === "block" ? "rule" : "policy", required: true, group: "Marketplace acceptance", parameter_names: [] })), execution: { mode: "sequential", input: "previous_output", stop_on: "block" } };
}
