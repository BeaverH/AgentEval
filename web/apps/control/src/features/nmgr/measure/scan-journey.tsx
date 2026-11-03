import { useLayoutEffect, useState, type ReactNode } from "react";
import { ArrowLeft, ArrowRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog,
  DialogContent,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import type { Role } from "../model";
import { actorNames } from "../workbench";
import {
  agents,
  policyHits,
  eventEvidence,
  type MeasureState,
  type PolicyEvent,
} from "./measure-data";
import { reportEvent } from "./measure-store";
import {
  AgentIdentity,
  MeasureCard,
  Pager,
  StatusBadge,
  utc,
} from "./measure-shared";
import {
  mockScans,
  mockGuardrails,
  mockCounts,
  filterMockScans,
  scanDecision,
  type ScanDecision,
} from "./scan-journey-data";
import {
  validScanLocation,
  type ScanLocation,
  type ScanPage,
} from "./scan-navigation";
import { useScanNavigation } from "./use-scan-navigation";
import "./scan-journey.css";

const titles: Record<ScanPage, string> = {
  overview: "Scan Overview",
  guardrails: "All Guardrails",
  guardrail: "Guardrail Scans",
  policy: "Guardrail Policy Scans",
  agents: "All Agents",
  agent: "Agent Scans",
  scan: "View Scan",
  feedback: "Enhancement Feedback",
};
const decisionColumns = ["Passed Scans", "Blocked Scans", "Modified Scans"];
const decisionTone = (label: string) =>
  label.startsWith("Passed")
    ? "passed"
    : label.startsWith("Blocked")
      ? "blocked"
      : undefined;
const counts = (records: PolicyEvent[]) => {
  const c = mockCounts(records);
  return [c.Passed, c.Blocked, c.Modified];
};

function resetDocumentScroll() {
  const scrollRoot = document.scrollingElement ?? document.documentElement;
  scrollRoot.scrollTop = 0;
  scrollRoot.scrollLeft = 0;
}

function Table({
  title,
  headers,
  rows,
  aside,
  page: controlledPage,
  onPage,
}: {
  title: string;
  headers: string[];
  rows: ReactNode[][];
  aside?: ReactNode;
  page?: number | undefined;
  onPage?: ((page: number) => void) | undefined;
}) {
  const [page, setPage] = useState(1);
  const current = Math.min(
    controlledPage ?? page,
    Math.max(1, Math.ceil(rows.length / 10)),
  );
  return (
    <MeasureCard title={title} aside={aside}>
      <div className="nm-scroll">
        <table>
          <thead>
            <tr>
              {headers.map((h) => (
                <th scope="col" key={h} data-decision={decisionTone(h)}>
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.slice((current - 1) * 10, current * 10).map((row, i) => (
              <tr key={i}>
                {row.map((cell, n) => (
                  <td key={n} data-decision={decisionTone(headers[n] ?? "")}>
                    {cell}
                  </td>
                ))}
              </tr>
            ))}
            {!rows.length && (
              <tr>
                <td colSpan={headers.length} className="nm-scan-empty">
                  No matching example scans.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
      <Pager
        page={current}
        count={rows.length}
        size={10}
        onPage={(next) => {
          if (onPage) onPage(next);
          else setPage(next);
          resetDocumentScroll();
        }}
      />
    </MeasureCard>
  );
}
const link = (label: string, action: () => void) => (
  <button className="nm-link" onClick={action}>
    {label}
  </button>
);

export function ScanJourney({
  state,
  role,
  change,
  error,
  clearError,
}: {
  state: MeasureState;
  role: Role;
  change: (update: (current: MeasureState) => MeasureState) => boolean;
  error: string;
  clearError: () => void;
}) {
  const navigation = useScanNavigation();
  const { route, previous } = navigation;
  const { decision, query } = route;
  useLayoutEffect(resetDocumentScroll, [
    route.view,
    route.guardrail,
    route.policy,
    route.agent,
    route.event,
  ]);
  const setDecision = (value: ScanDecision) =>
    navigation.go({ decision: value, listPage: 1, eventPage: 1 }, true);
  const setQuery = (value: string) =>
    navigation.go({ query: value, listPage: 1, eventPage: 1 }, true);
  const [category, setCategory] = useState<
    "false-positive" | "false-negative" | "common"
  >("false-positive");
  const [description, setDescription] = useState(""),
    [notice, setNotice] = useState("");
  const [confirm, setConfirm] = useState(false);
  useLayoutEffect(() => setConfirm(false), [route.view, route.guardrail]);
  const all = filterMockScans(mockScans, decision);
  const selectedEvent = mockScans.find((e) => e.id === route.event);
  const alreadyReported =
    !!selectedEvent &&
    (selectedEvent.reported ||
      state.reports.some((report) => report.eventId === selectedEvent.id));
  const selectedAgent = agents.find(
    (a) => a.id === (selectedEvent?.agentId ?? route.agent),
  );
  const selectedPolicy = policyHits.find(
    (p) => p.id === (selectedEvent?.policyId ?? route.policy),
  );
  const suspended =
    state.suspendedGuardrails?.includes(route.guardrail) ?? false;
  function go(next: Partial<ScanLocation>, replace = false) {
    navigation.go(next, replace);
    setNotice("");
    clearError();
  }
  function back() {
    navigation.back();
    setNotice("");
    clearError();
  }
  useLayoutEffect(() => {
    if (route.view === "feedback")
      setCategory(alreadyReported ? "common" : "false-positive");
  }, [route.view, route.event, alreadyReported]);
  function eventsTable(records: PolicyEvent[]) {
    return (
      <Table
        key={`${route.view}-${route.policy}-${decision}`}
        title="Policy Scans"
        page={route.eventPage}
        onPage={(eventPage) => navigation.go({ eventPage }, true)}
        headers={[
          "Event #",
          "Timestamp · UTC",
          "Agent Info",
          "Decision",
          "Prompt excerpt",
        ]}
        rows={records.map((event) => {
          const agent = agents.find((a) => a.id === event.agentId)!;
          return [
            <button
              className="nm-link nm-scan-id"
              aria-label={`View scan ${event.id}`}
              onClick={() => go({ view: "scan", event: event.id })}
            >
              {event.id}
            </button>,
            utc(event.time),
            <span>
              {agent.name}
              <small>
                {agent.id} · {agent.bu} · {agent.poc}
              </small>
            </span>,
            <StatusBadge>{scanDecision(event)}</StatusBadge>,
            event.prompt,
          ];
        })}
      />
    );
  }
  function guardrailTable(overview: boolean) {
    const guards = mockGuardrails.filter(
      (name) =>
        !query.trim() ||
        name.toLowerCase().includes(query.trim().toLowerCase()),
    );
    const ranked = overview
      ? [...guards]
          .sort(
            (a, b) =>
              all.filter(
                (e) =>
                  policyHits.find((p) => p.id === e.policyId)?.guardrail === b,
              ).length -
              all.filter(
                (e) =>
                  policyHits.find((p) => p.id === e.policyId)?.guardrail === a,
              ).length,
          )
          .slice(0, 10)
      : guards;
    return (
      <Table
        key={`guards-${query}-${decision}`}
        title={overview ? "Top-10 Triggered Guardrails" : "Guardrail List"}
        page={overview ? undefined : route.listPage}
        onPage={
          overview ? undefined : (listPage) => navigation.go({ listPage }, true)
        }
        aside={
          overview ? (
            <Button
              variant="outline"
              size="sm"
              onClick={() =>
                go({ view: "guardrails", origin: "guardrails", listPage: 1 })
              }
            >
              All Guardrails
              <ArrowRight size={14} />
            </Button>
          ) : undefined
        }
        headers={[
          "Guardrail",
          "Profile Ref. Count",
          "Version",
          "Control Unit",
          ...decisionColumns,
        ]}
        rows={ranked.map((name) => {
          const policies = policyHits.filter((p) => p.guardrail === name);
          const records = all.filter((e) =>
            policies.some((p) => p.id === e.policyId),
          );
          return [
            link(name, () =>
              go({
                view: "guardrail",
                guardrail: name,
                agent: "",
                policy: "",
                event: "",
                source: "guardrail",
                origin: overview ? "overview" : "guardrails",
                eventPage: 1,
              }),
            ),
            "—",
            eventEvidence(
              mockScans.find((e) => policies.some((p) => p.id === e.policyId))!,
            ).guardrailVersion,
            "ISS",
            ...counts(records),
          ];
        })}
      />
    );
  }
  function agentTable(overview: boolean) {
    const matching = agents.filter(
      (agent) =>
        (!query.trim() ||
          `${agent.name} ${agent.id} ${agent.bu} ${agent.poc}`
            .toLowerCase()
            .includes(query.trim().toLowerCase())) &&
        (decision === "all" || all.some((e) => e.agentId === agent.id)),
    );
    return (
      <Table
        key={`agents-${query}-${decision}`}
        title={overview ? "High-Risk Agents" : "Agent List"}
        page={overview ? undefined : route.listPage}
        onPage={
          overview ? undefined : (listPage) => navigation.go({ listPage }, true)
        }
        aside={
          overview ? (
            <Button
              variant="outline"
              size="sm"
              onClick={() =>
                go({ view: "agents", origin: "agents", listPage: 1 })
              }
            >
              All Agents
              <ArrowRight size={14} />
            </Button>
          ) : undefined
        }
        headers={["Agent", "Agent ID", "BU / Custodian", ...decisionColumns]}
        rows={(overview ? matching.slice(0, 10) : matching).map((agent) => [
          link(agent.name, () =>
            go({
              view: "agent",
              agent: agent.id,
              policy: "",
              guardrail: "",
              event: "",
              source: "agent",
              origin: overview ? "overview" : "agents",
              eventPage: 1,
            }),
          ),
          agent.id,
          `${agent.bu} / ${agent.poc}`,
          ...counts(all.filter((e) => e.agentId === agent.id)),
        ])}
      />
    );
  }
  function report() {
    setCategory(alreadyReported ? "common" : "false-positive");
    setDescription("");
    go({ view: "feedback" });
  }
  function submit() {
    if (!selectedEvent) return;
    const saved = change((current) => {
      if (!description.trim()) throw new Error("Enter a feedback description.");
      if (category === "false-positive") {
        if (
          selectedEvent.reported ||
          current.reports.some((report) => report.eventId === selectedEvent.id)
        )
          throw new Error(
            "This scan already has a false-positive report. Choose Common Feedback to add a comment.",
          );
        return reportEvent(
          current,
          selectedEvent,
          actorNames[role],
          role,
          description,
        );
      }
      if (category !== "common")
        throw new Error("This category is unavailable for this example scan.");
      return {
        ...current,
        feedback: [
          {
            eventId: selectedEvent.id,
            category: "common",
            description: description.trim(),
            reporter: actorNames[role],
            time: new Date().toISOString(),
          },
          ...(current.feedback ?? []),
        ],
      };
    });
    if (saved) {
      back();
      setNotice("Feedback submitted.");
    }
  }
  if (!validScanLocation(route))
    return (
      <div className="nm-scan-journey">
        <h2>Scan unavailable</h2>
        <p>This link does not match an existing V2 mock example.</p>
        <Button
          onClick={() =>
            go({
              view: "overview",
              guardrail: "",
              policy: "",
              agent: "",
              event: "",
            })
          }
        >
          Back to Overview
        </Button>
      </div>
    );
  return (
    <div className="nm-scan-journey">
      <div className="nm-scan-page-head">
        <div>
          <p className="nm-muted">Measure / {titles[route.view]}</p>
          <h2>{titles[route.view]}</h2>
        </div>
        {route.view !== "overview" && (
          <Button variant="outline" size="sm" onClick={back}>
            <ArrowLeft size={14} />
            Back to{" "}
            {previous?.view === "overview"
              ? "Overview"
              : previous?.view === "policy"
                ? "Policy Scans"
                : titles[previous?.view ?? "overview"]}
          </Button>
        )}
      </div>
      {notice && (
        <p role="status" className="nm-inline-notice">
          {notice}
        </p>
      )}
      {error && !confirm && (
        <p role="alert" className="nm-inline-notice nm-inline-error">
          {error}
        </p>
      )}
      {route.view === "overview" && (
        <section className="nm-scan-metrics" aria-label="Scan Overview">
          {(
            [
              ["all", "Total Scans", mockScans.length],
              ["Passed", "Passed", mockCounts(mockScans).Passed],
              ["Blocked", "Blocked", mockCounts(mockScans).Blocked],
              ["Modified", "Modified", mockCounts(mockScans).Modified],
            ] as const
          ).map(([value, label, count]) => (
            <button
              key={value}
              aria-label={`${label} scans`}
              data-decision={decisionTone(label)}
              aria-pressed={decision === value}
              onClick={() => setDecision(value)}
            >
              <span>{label}</span>
              <strong>{count.toLocaleString("en-US")}</strong>
              <small>Existing V2 example scans</small>
            </button>
          ))}
        </section>
      )}
      {!["scan", "feedback"].includes(route.view) && (
        <div className="nm-scan-filters">
          <label className="nm-select">
            <span>Decision</span>
            <select
              aria-label="Decision"
              value={decision}
              onChange={(e) => setDecision(e.target.value as ScanDecision)}
            >
              {["all", "Passed", "Blocked", "Modified"].map((d) => (
                <option key={d} value={d}>
                  {d === "all" ? "All decisions" : d}
                </option>
              ))}
            </select>
          </label>
          {["overview", "guardrails", "agents"].includes(route.view) && (
            <Input
              aria-label="Search Measure"
              placeholder="Search existing examples…"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
            />
          )}
          {(decision !== "all" || query) && (
            <Button
              variant="ghost"
              size="sm"
              onClick={() => {
                navigation.go(
                  { decision: "all", query: "", listPage: 1, eventPage: 1 },
                  true,
                );
              }}
            >
              Reset filters
            </Button>
          )}
        </div>
      )}
      {route.view === "overview" && (
        <p className="nm-muted nm-scan-note">
          Existing mock scan examples. Unavailable Profile reference fields
          remain placeholders.
        </p>
      )}
      {["overview", "guardrails"].includes(route.view) &&
        guardrailTable(route.view === "overview")}
      {["overview", "agents"].includes(route.view) &&
        agentTable(route.view === "overview")}
      {route.view === "guardrail" && (
        <>
          <MeasureCard
            title="Guardrail Information"
            aside={
              <Button
                variant="outline"
                size="sm"
                onClick={() => setConfirm(true)}
              >
                {suspended ? "Resume Guardrail" : "Hang up Guardrail"}
              </Button>
            }
          >
            <div className="nm-padding">
              <strong>{route.guardrail}</strong>
              <p>
                {
                  policyHits.find((p) => p.guardrail === route.guardrail)
                    ?.guardDescription
                }
              </p>
              {suspended && (
                <p className="nm-badge warning">Hung up · Mock only</p>
              )}
            </div>
          </MeasureCard>
          <Table
            title="Policy Stats"
            headers={[
              "Policy",
              "Profile Ref. Count",
              "Total Scans",
              ...decisionColumns,
            ]}
            rows={policyHits
              .filter((p) => p.guardrail === route.guardrail)
              .map((policy) => {
                const records = all.filter((e) => e.policyId === policy.id);
                return [
                  link(policy.policy, () =>
                    go({ view: "policy", policy: policy.id, eventPage: 1 }),
                  ),
                  "—",
                  records.length,
                  ...counts(records),
                ];
              })}
          />
        </>
      )}
      {route.view === "policy" && selectedPolicy && (
        <>
          <MeasureCard title="Policy Information">
            <div className="nm-padding">
              <strong>
                {selectedPolicy.policy} · {selectedPolicy.guardrail}
              </strong>
              <p>{selectedPolicy.description}</p>
            </div>
          </MeasureCard>
          {route.source === "agent" && selectedAgent && (
            <MeasureCard title="Selected Agent">
              <div className="nm-padding">
                <AgentIdentity agent={selectedAgent} />
              </div>
            </MeasureCard>
          )}
          {eventsTable(
            all.filter(
              (e) =>
                e.policyId === selectedPolicy.id &&
                (route.source !== "agent" || e.agentId === route.agent),
            ),
          )}
        </>
      )}
      {route.view === "agent" && selectedAgent && (
        <>
          <MeasureCard title="Selected Agent">
            <div className="nm-padding">
              <AgentIdentity agent={selectedAgent} />
            </div>
          </MeasureCard>
          <Table
            title="Policies for this Agent"
            headers={["Policy / Guardrail", ...decisionColumns]}
            rows={policyHits.map((policy) => [
              <span>
                {link(policy.policy, () =>
                  go({ view: "policy", policy: policy.id, eventPage: 1 }),
                )}
                <small>{policy.guardrail}</small>
              </span>,
              ...counts(
                all.filter(
                  (e) =>
                    e.agentId === selectedAgent.id && e.policyId === policy.id,
                ),
              ),
            ])}
          />
        </>
      )}
      {route.view === "scan" &&
        selectedEvent &&
        selectedPolicy &&
        selectedAgent && (
          <>
            <div className="nm-scan-actions">
              <Button onClick={report}>Report</Button>
            </div>
            <MeasureCard title="Scan Details">
              <div className="nm-padding nm-scan-details">
                <strong className="nm-scan-id">{selectedEvent.id}</strong>
                <p>
                  {utc(selectedEvent.time)} · UTC ·{" "}
                  <StatusBadge>{scanDecision(selectedEvent)}</StatusBadge>
                </p>
                <h3>Prompt context</h3>
                <p>{selectedEvent.prompt}</p>
                {selectedEvent.action === "Transformed" && (
                  <>
                    <h3>Modified output</h3>
                    <p>{selectedEvent.response}</p>
                  </>
                )}
              </div>
            </MeasureCard>
            <MeasureCard title="Policy / Guardrail Info">
              <div className="nm-padding">
                <strong>
                  {selectedPolicy.policy} · {selectedPolicy.guardrail}
                </strong>
                <p>{selectedPolicy.description}</p>
                <small>
                  Policy version: {eventEvidence(selectedEvent).policyVersion} ·
                  Guardrail version:{" "}
                  {eventEvidence(selectedEvent).guardrailVersion}
                </small>
              </div>
            </MeasureCard>
            <div className="nm-scan-context">
              <MeasureCard title="Agent Info">
                <div className="nm-padding">
                  <AgentIdentity agent={selectedAgent} />
                </div>
              </MeasureCard>
              <MeasureCard title="Profile Info">
                <div className="nm-padding">
                  —<p className="nm-muted">Profile details placeholder</p>
                </div>
              </MeasureCard>
            </div>
          </>
        )}
      {route.view === "feedback" && selectedEvent && selectedPolicy && (
        <>
          <MeasureCard title="Event context">
            <div className="nm-padding">
              <strong className="nm-scan-id">{selectedEvent.id}</strong>
              <p>
                {utc(selectedEvent.time)} · {selectedPolicy.policy} ·{" "}
                <StatusBadge>{scanDecision(selectedEvent)}</StatusBadge>
              </p>
              <p>{selectedEvent.prompt}</p>
            </div>
          </MeasureCard>
          {alreadyReported && (
            <p className="nm-inline-notice">
              This scan already has a false-positive report. You can add Common
              Feedback.
            </p>
          )}
          <form
            className="nm-card nm-padding nm-scan-form"
            onSubmit={(e) => {
              e.preventDefault();
              submit();
            }}
          >
            <fieldset>
              <legend>Feedback category</legend>
              {(
                [
                  [
                    "false-positive",
                    "False-Positive Detection",
                    "Should pass but was blocked or modified.",
                  ],
                  [
                    "false-negative",
                    "False-Negative Miss",
                    "Should block but was passed.",
                  ],
                  [
                    "common",
                    "Common Feedback",
                    "Other feedback about this example scan.",
                  ],
                ] as const
              ).map(([value, title, hint]) => (
                <label key={value}>
                  <input
                    type="radio"
                    name="feedback-category"
                    value={value}
                    checked={category === value}
                    disabled={
                      value === "false-negative" ||
                      (value === "false-positive" && alreadyReported)
                    }
                    onChange={() => setCategory(value)}
                  />
                  <span>
                    {title}
                    <small>
                      {hint}
                      {value === "false-negative" &&
                        " No Passed example is available."}
                    </small>
                  </span>
                </label>
              ))}
            </fieldset>
            <label>
              Feedback description
              <Textarea
                required
                aria-label="Feedback description"
                value={description}
                maxLength={5000}
                onChange={(e) => setDescription(e.target.value)}
                placeholder="Describe the expected scan behavior…"
              />
            </label>
            <div className="nm-scan-actions">
              <Button type="button" variant="outline" onClick={back}>
                Cancel
              </Button>
              <Button type="submit">Submit feedback</Button>
            </div>
          </form>
        </>
      )}
      <Dialog open={confirm} onOpenChange={setConfirm}>
        <DialogContent className="nm-app nm-padding">
          <DialogTitle>
            {suspended ? "Resume Guardrail?" : "Hang up Guardrail?"}
          </DialogTitle>
          <DialogDescription>
            This changes only the V2 mock state for {route.guardrail}. Existing
            example scan history is preserved.
          </DialogDescription>
          {error && (
            <p role="alert" className="nm-inline-notice nm-inline-error">
              {error}
            </p>
          )}
          <div className="nm-scan-actions">
            <Button variant="outline" onClick={() => setConfirm(false)}>
              Cancel
            </Button>
            <Button
              onClick={() => {
                if (
                  change((current) => {
                    if (
                      route.view !== "guardrail" ||
                      !mockGuardrails.includes(route.guardrail)
                    )
                      throw new Error(
                        "Select an existing Guardrail before changing its status.",
                      );
                    return {
                      ...current,
                      suspendedGuardrails: [
                        ...(current.suspendedGuardrails ?? []).filter(
                          (name) => name !== route.guardrail,
                        ),
                        ...(suspended ? [] : [route.guardrail]),
                      ],
                    };
                  })
                )
                  setConfirm(false);
              }}
            >
              {suspended ? "Confirm resume" : "Confirm hang-up"}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
