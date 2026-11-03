import type { Entity } from "../src/features/nmgr/model";
import type { NmgrBinding, NmgrRemote } from "./nmgr";
import type { F5Remote } from "./f5-client";
import { StoreError } from "./marketplace-db";
import { reportFailure } from "./diagnostics";

export type ResourceObservation = { id: string; revision: number; checkedAt: string; status: "local_only" | "available" | "changed" | "missing" | "unavailable" | "source_changed"; message: string; remoteVersion?: string };
// Observations are returned to this user only, never saved as approval or evaluation evidence.
export async function observeResource(e: Entity, binding: NmgrBinding | undefined, revision: number, nemo: NmgrRemote, f5?: F5Remote): Promise<ResourceObservation> {
  const result = (status: ResourceObservation["status"], message: string, remoteVersion?: string): ResourceObservation => ({ id: e.id, revision, checkedAt: new Date().toISOString(), status, message, ...(remoteVersion === undefined ? {} : { remoteVersion }) });
  const changed = (version?: string) => result("changed", "Backend version or binding differs; review required", version);
  try {
    if (e.provider === "F5") {
      if (!f5 || e.sourceInstanceId !== f5.sourceId || binding?.f5 && binding.f5.sourceId !== f5.sourceId) return result("source_changed", "Restore the original F5 connection before querying");
      const b = binding?.f5;
      const id = e.kind === "Guardrail" ? b?.scannerId : b?.projectId;
      if (!id) return result("local_only", "No backend resource linked to this revision");
      if (e.kind === "Guardrail") {
        const scanner = (await f5.request(`/scanners/${encodeURIComponent(id)}${b?.versionId ? `?version=${encodeURIComponent(b.versionId)}` : ""}`, "GET"))?.scanner;
        if (scanner?.id !== id || typeof scanner.versionMeta?.id !== "string") throw new Error("Invalid scanner response");
        const version = scanner.versionMeta.id;
        if (b?.versionId && version !== b.versionId || binding?.released && scanner.versionMeta.published !== true) return changed(version);
        return result("available", "Backend resource readable", version);
      }
      const project = (await f5.request(`/projects/${encodeURIComponent(id)}`, "GET"))?.project;
      if (project?.id !== id || !Array.isArray(project.config?.scanners)) throw new Error("Invalid project response");
      const refs = Object.values(binding?.publishedRefs ?? {}).map(ref => ref.f5);
      if (refs.some(ref => !ref || project.config.scanners.filter((s: any) => s.id === ref.id).length !== 1 || !project.config.scanners.some((s: any) => Object.entries(ref).every(([key, value]) => s[key] === value)))) return changed();
      return result("available", "Backend resource readable");
    }
    const id = e.kind === "Guardrail" ? binding?.policyId : binding?.guardrailId;
    if (!id) return result("local_only", "No backend resource linked to this revision");
    if (e.kind === "Guardrail") {
      const policy = await nemo.request(`/policies/${encodeURIComponent(id)}/definition`, "GET");
      if (policy?.definition?.metadata?.id !== id || !Number.isSafeInteger(policy.revision)) throw new Error("Invalid policy response");
      const version = String(policy.revision);
      if (binding?.revision !== undefined && policy.revision !== binding.revision || binding?.released && policy.published_version !== binding.publishedVersion) return changed(version);
      return result("available", "Backend resource readable", version);
    }
    const profile = await nemo.request(`/guardrails/${encodeURIComponent(id)}`, "GET");
    if (profile?.id !== id || !Number.isSafeInteger(profile.draftRevision)) throw new Error("Invalid guardrail response");
    const version = String(profile.draftRevision);
    if (binding?.draftRevision !== undefined && profile.draftRevision !== binding.draftRevision) return changed(version);
    if (binding?.released && (!Array.isArray(profile.versions) || !profile.versions.some((v: any) => v.version === binding.version && v.status === "ready"))) return changed(version);
    return result("available", "Backend resource readable", version);
  } catch (error) {
    if (error instanceof StoreError && error.status === 404) return result("missing", "Not found in backend");
    const failure = reportFailure(error, e.provider === "F5" ? "f5" : "nemo", "resource.observe", "Query failed; check permissions, connection and backend compatibility");
    return result("unavailable", `[${failure.code}] ${failure.message} Check: ${failure.settings.join(", ")}. Reference: ${failure.requestId}${failure.details ? `\n${JSON.stringify(failure.details, null, 2)}` : ""}`);
  }
}
