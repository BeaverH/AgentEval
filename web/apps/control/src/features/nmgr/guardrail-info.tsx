import { ChevronRight } from "lucide-react";
import type { Entity, State } from "./model";

export function GuardrailInfo({
  item,
  state,
  onProfile,
}: {
  item: Entity;
  state: State;
  onProfile: (id: string) => void;
}) {
  const profiles = state.entities.filter(
    (p) =>
      p.kind === "Profile" &&
      (p.refs.includes(item.id) || p.deployedRefs.includes(item.id)),
  );
  const versions = [
    ...new Set([
      item.version,
      ...(item.deployed === null ? [] : [item.deployed]),
      ...item.runs.map((run) => run.version),
      ...Object.keys(item.revisions ?? {}).map(Number),
    ]),
  ].sort((a, b) => b - a);
  return (
    <div className="nm-info">
      <section aria-label="Business intents">
        <h3>Business Intents</h3>
        <p className="nm-info-description">{item.description}</p>
      </section>
      <section aria-label="Ownership and scope">
        <h3>Ownership & scope</h3>
        <dl className="nm-info-facts">
          {[
            ["Control unit", item.unit],
            ["Custodian", item.custodian],
            ["Sign-off approver", item.approver],
            ["Mandatory", item.mandatory ? "Yes" : "No"],
            [
              "Target regions",
              item.location === "ALL" ? "All regions" : item.location,
            ],
            [
              "Last updated",
              new Date(item.updated).toLocaleString("en-GB", {
                timeZone: "Asia/Shanghai",
              }),
            ],
          ].map(([key, value]) => (
            <div key={key}>
              <dt>{key}</dt>
              <dd>{value}</dd>
            </div>
          ))}
        </dl>
      </section>
      <section aria-label="Requirement">
        <div className="nm-info-section-head">
          <h3>Requirement</h3>
          <span>{item.policies.length} policies</span>
        </div>
        {item.status === "DRAFT" ? (
          <p className="nm-muted">Technical configuration is pending.</p>
        ) : item.policies.length ? (
          <ol
            className={`nm-policy-list ${item.policies.length > 3 ? "nm-module-scroll" : ""}`}
            aria-label="Policies"
          >
            {item.policies.map((policy, i) => (
              <li key={i}>
                <span className="nm-policy-number">
                  {String(i + 1).padStart(2, "0")}
                </span>
                <div>
                  <h4>Policy {i + 1}</h4>
                  <p>{policy}</p>
                </div>
              </li>
            ))}
          </ol>
        ) : (
          <p className="nm-muted">No policies configured.</p>
        )}
        <dl className="nm-info-facts nm-config-meta">
          <div>
            <dt>Scanner</dt>
            <dd>
              {item.config
                ? { custom: "GenAI", regex: "Regex", keyword: "Keywords" }[
                    item.config.scannerType
                  ]
                : "Not specified"}
            </dd>
          </div>
          <div>
            <dt>Direction</dt>
            <dd>{item.config?.direction ?? "Not specified"}</dd>
          </div>
          <div>
            <dt>Configuration version</dt>
            <dd>{item.config?.versionName ?? `v${item.version}.0`}</dd>
          </div>
        </dl>
        <details className="nm-config-content">
          <summary>LLM prompt / matching content</summary>
          <p>
            {item.config?.content ||
              "No scanner prompt, regex pattern or keyword configuration has been saved."}
          </p>
        </details>
        {item.config?.versionDescription && (
          <p className="nm-muted">{item.config.versionDescription}</p>
        )}
      </section>
      <section aria-label="Used by Profiles">
        <div className="nm-info-section-head">
          <h3>Used by Profiles</h3>
          <span>{profiles.length}</span>
        </div>
        {profiles.length ? (
          <div
            className={`nm-profile-refs ${profiles.length > 3 ? "nm-module-scroll" : ""}`}
            aria-label="Profile references"
          >
            {profiles.map((profile) => (
              <button
                className="nm-profile-ref"
                key={profile.id}
                onClick={() => onProfile(profile.id)}
              >
                <span>
                  <strong>{profile.name}</strong>
                  <small>
                    {profile.deployed !== null &&
                    profile.deployedRefs.includes(item.id)
                      ? "Deployed reference"
                      : "Draft reference"}
                  </small>
                </span>
                <ChevronRight size={16} />
              </button>
            ))}
          </div>
        ) : (
          <p className="nm-muted">No Profile references this Guardrail.</p>
        )}
      </section>
      <section aria-label="Versions">
        <h3>Versions</h3>
        <div className="nm-version-list">
          {versions.map((v) => (
            <div key={v}>
              <strong>v{v}.0</strong>
              <span>
                {[
                  v === item.version && "Current revision",
                  v === item.deployed && "Deployed",
                ]
                  .filter(Boolean)
                  .join(" · ") || "Tested revision"}
              </span>
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}
