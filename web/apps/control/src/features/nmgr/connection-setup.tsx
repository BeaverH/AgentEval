import { useEffect, useState } from "react";
import { Settings2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { ConnectionField } from "./connection-field";
import { runtimeRequest } from "@/lib/runtime-request";
import "./connection-setup.css";

type Field =
  | "nemoUrl"
  | "nemoToken"
  | "databaseUrl"
  | "workspaceId"
  | "caPem"
  | "f5Url"
  | "f5Token"
  | "f5AdminIds";
type Option = "databaseTls" | "caMode" | "f5Mode" | "nemoTls";
type Probe = "nemoUrl" | "nemoToken" | "databaseUrl" | "f5Url" | "f5Token";
const probeFields: Record<Probe, Array<Field | Option>> = {
  nemoUrl: ["nemoUrl", "nemoTls", "caMode", "caPem"],
  nemoToken: ["nemoUrl", "nemoToken", "nemoTls", "caMode", "caPem"],
  databaseUrl: ["databaseUrl", "databaseTls", "caMode", "caPem"],
  f5Url: ["f5Url", "f5Token", "f5Mode", "caMode", "caPem"],
  f5Token: ["f5Url", "f5Token", "f5Mode", "caMode", "caPem"],
};
type Status = {
  saved?: boolean;
  configured?: Partial<Record<Field, boolean>>;
  connectionRevision?: string;
  manualConfiguration?: boolean;
  persistence?: string;
  advanced?: Partial<Record<Option, string>>;
};
const fields: Array<{ key: Field; label: string; hint: string }> = [
  {
    key: "nemoUrl",
    label: "NeMo URL",
    hint: "Controller API address ending in /api/v1. Enter a Token when changing this address.",
  },
  {
    key: "nemoToken",
    label: "NeMo Token",
    hint: "Business API token, without the Bearer prefix",
  },
  {
    key: "databaseUrl",
    label: "Database URL",
    hint: "PostgreSQL or MariaDB connection URL including credentials",
  },
  {
    key: "workspaceId",
    label: "Workspace ID",
    hint: "Default: uat. Use 1–24 lowercase letters, numbers or hyphens.",
  },
  {
    key: "caPem",
    label: "Trusted CA certificate",
    hint: "PEM certificate bundle for verified NeMo, F5 and database TLS connections.",
  },
  {
    key: "f5Url",
    label: "F5 URL",
    hint: "Optional HTTPS address ending in /backend/v1. Enter a Token when changing this address.",
  },
  {
    key: "f5Token",
    label: "F5 Token",
    hint: "F5 backend API token, without the Bearer prefix",
  },
  {
    key: "f5AdminIds",
    label: "F5 project admin IDs",
    hint: "Comma-separated F5 user IDs, when required by your token for project creation",
  },
];
const emptyValues: Record<Field, string> = {
  nemoUrl: "",
  nemoToken: "",
  databaseUrl: "",
  workspaceId: "",
  caPem: "",
  f5Url: "",
  f5Token: "",
  f5AdminIds: "",
};
const emptyOptions: Record<Option, string> = {
  nemoTls: "",
  databaseTls: "",
  caMode: "",
  f5Mode: "",
};

export function ConnectionSetup({
  initialError = "",
  onConnected,
  onRetry,
  onCancel,
  retryLabel = "Retry",
}: {
  initialError?: string;
  onConnected: () => void;
  onRetry: () => void;
  onCancel?: () => void;
  retryLabel?: string;
}) {
  const [status, setStatus] = useState<Status | null>(null),
    [loading, setLoading] = useState(true),
    [busy, setBusy] = useState(false);
  const [error, setError] = useState(initialError);
  const [testing, setTesting] = useState<Probe | null>(null);
  const [results, setResults] = useState<Partial<Record<Probe, { ok: boolean; message: string }>>>({});
  const [values, setValues] = useState(emptyValues),
    [options, setOptions] = useState(emptyOptions);
  useEffect(() => {
    let active = true;
    runtimeRequest<Status>("/api/nmgr/connection", { cache: "no-store" })
      .then((value) => {
        if (active) setStatus(value);
      })
      .catch((e) => {
        if (active && !initialError) setError(e.message);
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, []);
  async function apply(remove = false) {
    if (busy || testing) return;
    setBusy(true);
    setError("");
    try {
      await runtimeRequest<Status>("/api/nmgr/connection", {
        method: remove ? "DELETE" : "POST",
        headers: {
          "Content-Type": "application/json",
          ...(status?.connectionRevision
            ? { "X-Marketplace-Connection": status.connectionRevision }
            : {}),
        },
        ...(!remove
          ? {
              body: JSON.stringify(
                Object.fromEntries(
                  Object.entries({ ...values, ...options }).filter(
                    ([, value]) => !!value.trim(),
                  ),
                ),
              ),
            }
          : {}),
      });
      setValues(emptyValues);
      setOptions(emptyOptions);
      onConnected();
    } catch (e) {
      setError(
        e instanceof Error ? e.message : "Connection could not be saved.",
      );
    } finally {
      setBusy(false);
    }
  }
  async function test(target: Probe) {
    if (busy || testing) return;
    setTesting(target);
    setResults(current => ({ ...current, [target]: undefined }));
    try {
      const entered = { ...values, ...options };
      const result = await runtimeRequest<{ message: string; durationMs: number }>("/api/nmgr/connection/test", {
        method: "POST",
        headers: { "Content-Type": "application/json", ...(status?.connectionRevision ? { "X-Marketplace-Connection": status.connectionRevision } : {}) },
        body: JSON.stringify({ target, settings: Object.fromEntries(probeFields[target].filter(key => entered[key].trim()).map(key => [key, entered[key]])) }),
      });
      setResults(current => ({ ...current, [target]: { ok: true, message: `${result.message} (${result.durationMs} ms)` } }));
    } catch (error) {
      setResults(current => ({ ...current, [target]: { ok: false, message: error instanceof Error ? error.message : "Connection test failed." } }));
    } finally { setTesting(null); }
  }
  const disabled = busy || !!testing || loading || status?.manualConfiguration === false;
  const field = (key: Field) => {
    const definition = fields.find((item) => item.key === key)!;
    return (
      <ConnectionField
        key={key}
        field={key}
        label={definition.label}
        hint={definition.hint}
        value={values[key]}
        configured={status?.configured?.[key]}
        disabled={disabled}
        loading={loading}
        multiline={key === "caPem"}
        onChange={(value) => {
          setValues((current) => ({ ...current, [key]: value }));
          setResults({});
        }}
      >
        {key in probeFields && <div className="nm-connection-probe">
          <Button type="button" variant="outline" size="sm" disabled={disabled} onClick={() => void test(key as Probe)}>
            {testing === key ? "Testing…" : `Test ${definition.label}`}
          </Button>
          {results[key as Probe] && <pre role={results[key as Probe]!.ok ? "status" : "alert"} className={`nm-connection-result ${results[key as Probe]!.ok ? "is-success" : "is-error"}`}>
            {results[key as Probe]!.message}
          </pre>}
        </div>}
      </ConnectionField>
    );
  };
  const choice = (
    key: Option,
    label: string,
    choices: Array<[string, string]>,
  ) => (
    <label className="nm-connection-option">
      <span>{label}</span>
      <select
        aria-label={label}
        value={options[key]}
        disabled={disabled}
        onChange={(event) => {
          setOptions((current) => ({ ...current, [key]: event.target.value }));
          setResults({});
        }}
      >
        <option value="">
          Keep current ({status?.advanced?.[key] ?? "deployment default"})
        </option>
        {choices.map(([value, name]) => (
          <option key={value} value={value}>
            {name}
          </option>
        ))}
      </select>
    </label>
  );
  const caMode = options.caMode || status?.advanced?.caMode;
  const f5Mode = options.f5Mode || status?.advanced?.f5Mode;
  return (
    <main className="nm-app nm-live-login nm-connection-login">
      <section className="nm-card nm-padding nm-live-panel">
        <header className="nm-connection-title">
          <span>
            <Settings2 size={22} aria-hidden="true" />
          </span>
          <div>
            <h1>Marketplace V3</h1>
            <p className="nm-muted">Demo integration connection</p>
          </div>
        </header>
        {error && (
          <p role="alert" className="nm-callout nm-connection-error">
            {error}
          </p>
        )}
        <form
          className="nm-connection-form"
          onSubmit={(event) => {
            event.preventDefault();
            void apply();
          }}
          autoComplete="off"
        >
          {field("nemoUrl")}
          {choice("nemoTls", "NeMo certificate verification", [
            ["skip", "Skip verification (demo default)"],
            ["verify", "Verify certificate"],
          ])}
          {field("nemoToken")}
          {field("databaseUrl")}
          <details className="nm-connection-advanced">
            <summary>Advanced settings (optional)</summary>
            <div className="nm-connection-form">
              <p className="nm-muted">
                The three connection fields above are sufficient by default.
                Change these only for your environment or to repair deployment
                settings.
              </p>
              {field("workspaceId")}
              {choice("databaseTls", "Database TLS", [
                ["url", "Use database URL settings"],
                ["true", "Require verified TLS"],
              ])}
              {choice("caMode", "Trusted CA", [
                ["system", "Use built-in trusted certificates"],
                ["custom", "Add a trusted CA certificate"],
              ])}
              {caMode === "custom" && field("caPem")}
              {choice("f5Mode", "F5 integration", [
                ["disabled", "Disabled — NeMo only"],
                ["enabled", "Enabled"],
              ])}
              {f5Mode === "enabled" && (
                <>
                  {field("f5Url")}
                  {field("f5Token")}
                  {field("f5AdminIds")}
                </>
              )}
            </div>
          </details>
          <p className="nm-connection-note nm-muted">
            Saved for all users of this demo instance. Secret and YAML values
            are not overwritten.{" "}
            {status?.persistence === "persistent"
              ? "Persistent storage is enabled."
              : "To retain saved settings after this Pod is replaced, mount persistent connection storage."}
          </p>
          <div className="nm-actions">
            <Button type="submit" disabled={disabled}>
              {busy ? "Checking connection…" : "Save & connect"}
            </Button>
            <Button
              type="button"
              variant="outline"
              disabled={busy || !!testing}
              onClick={onRetry}
            >
              {retryLabel}
            </Button>
            {onCancel && (
              <Button
                type="button"
                variant="ghost"
                disabled={busy || !!testing}
                onClick={onCancel}
              >
                Cancel
              </Button>
            )}
          </div>
        </form>
        <div className="nm-connection-footer">
          {status?.saved && (
            <Button
              variant="ghost"
              disabled={disabled}
              onClick={() => void apply(true)}
            >
              Use deployment settings
            </Button>
          )}
          <a href="/v2/guardrails" className="underline">
            Open Mock workspace
          </a>
          <a href="/api/docs" className="underline">API documentation</a>
        </div>
      </section>
    </main>
  );
}
