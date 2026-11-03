import { z } from "zod";
import { DeploymentError } from "./diagnostics";
import { createSecureContext } from "node:tls";

export const connectionSettingsSchema = z
  .object({
    nemoUrl: z.string().trim().max(2048).optional(),
    nemoToken: z.string().trim().max(4096).optional(),
    databaseUrl: z.string().trim().max(4096).optional(),
    workspaceId: z
      .string()
      .trim()
      .regex(/^[a-z0-9-]{1,24}$/)
      .optional(),
    databaseTls: z.enum(["url", "true"]).optional(),
    nemoTls: z.enum(["skip", "verify"]).optional(),
    caMode: z.enum(["system", "custom"]).optional(),
    caPem: z.string().trim().max(64_000).optional(),
    f5Mode: z.enum(["disabled", "enabled"]).optional(),
    f5Url: z.string().trim().max(2048).optional(),
    f5Token: z.string().trim().max(4096).optional(),
    f5AdminIds: z.string().trim().max(4096).optional(),
  })
  .strict();
export type ConnectionSettings = z.infer<typeof connectionSettingsSchema>;

export function connectionOrigin(request: Request, env: NodeJS.ProcessEnv) {
  const url = new URL(request.url),
    supplied = request.headers.get("origin");
  const configured =
    env.MARKETPLACE_V3_DEMO === "false"
      ? env.MARKETPLACE_PUBLIC_ORIGIN
      : undefined;
  const rejected = () =>
    new DeploymentError(
      "origin",
      "origin_mismatch",
      "Connection settings must be accessed from this Marketplace origin.",
      ["MARKETPLACE_PUBLIC_ORIGIN"],
      403,
    );
  if (request.headers.get("sec-fetch-site") === "cross-site") throw rejected();
  if (supplied) {
    let origin: URL;
    try {
      origin = new URL(supplied);
    } catch {
      throw rejected();
    }
    if (
      !/^https?:$/.test(origin.protocol) ||
      origin.origin !== supplied ||
      (configured ? supplied !== configured : origin.host !== url.host)
    )
      throw rejected();
  }
  return configured || supplied || url.origin;
}

export function connectionEnvironment(
  request: Request,
  env: NodeJS.ProcessEnv,
  overrides: ConnectionSettings = {},
): NodeJS.ProcessEnv {
  const mode = env.MARKETPLACE_V3_DEMO ?? "true";
  if (!["true", "false"].includes(mode))
    throw new DeploymentError(
      "runtime",
      "demo_mode_invalid",
      "MARKETPLACE_V3_DEMO must be true or false.",
      ["MARKETPLACE_V3_DEMO"],
    );
  const origin = connectionOrigin(request, env);
  if (mode === "false") return { ...env, MARKETPLACE_V3_DEMO: "false" };
  const effective: NodeJS.ProcessEnv = {
    ...env,
    MARKETPLACE_DATA_MODE: "live",
    MARKETPLACE_V3_DEMO: "true",
    MARKETPLACE_PUBLIC_ORIGIN: origin,
    MARKETPLACE_CRUD_ONLY: "false",
    MARKETPLACE_V2_LOCAL_ACCESS: "false",
    MARKETPLACE_NEMO_AUTH_MODE: "token",
    MARKETPLACE_NEMO_TLS: overrides.nemoTls || env.MARKETPLACE_NEMO_TLS || "skip",
  };
  if (!["skip", "verify"].includes(effective.MARKETPLACE_NEMO_TLS!))
    throw new DeploymentError("nemo", "nemo_tls_invalid", "Choose skip or verify for NeMo certificate verification.", ["MARKETPLACE_NEMO_TLS"], 422);
  // Default V3 does not use V1/V2 authoring, fixed actors or automatic browser tokens.
  for (const key of [
    "MARKETPLACE_DEMO_TOKEN",
    "GUARD_POLICY_AUTHORING_URL",
    "MARKETPLACE_F5_MOCK",
  ])
    delete effective[key];
  for (const key of ["GUARD_USERNAME", "GUARD_PASSWORD", "GUARD_PASSWORD_FILE"])
    delete effective[key];
  if (effective.GUARD_API_TOKEN !== undefined)
    delete effective.GUARD_API_TOKEN_FILE;
  if (overrides.nemoUrl) effective.GUARD_API_URL = overrides.nemoUrl;
  if (overrides.nemoToken) {
    effective.GUARD_API_TOKEN = overrides.nemoToken;
    effective.MARKETPLACE_NEMO_AUTH_MODE = "token";
    for (const key of [
      "GUARD_API_TOKEN_FILE",
      "GUARD_USERNAME",
      "GUARD_PASSWORD",
      "GUARD_PASSWORD_FILE",
    ])
      delete effective[key];
  }
  if (overrides.databaseUrl) {
    effective.MARKETPLACE_DATABASE_URL = overrides.databaseUrl;
    delete effective.MARKETPLACE_DATABASE_PASSWORD;
    delete effective.MARKETPLACE_DATABASE_PASSWORD_REQUIRED;
  }
  try {
    if (new URL(effective.MARKETPLACE_DATABASE_URL!).password) {
      delete effective.MARKETPLACE_DATABASE_PASSWORD;
      delete effective.MARKETPLACE_DATABASE_PASSWORD_REQUIRED;
    }
  } catch {
    /* The database validator reports malformed URLs without exposing them. */
  }
  if (overrides.workspaceId)
    effective.MARKETPLACE_WORKSPACE_ID = overrides.workspaceId;
  if (overrides.databaseTls === "true") effective.MARKETPLACE_DB_TLS = "true";
  if (overrides.databaseTls === "url") {
    delete effective.MARKETPLACE_DB_TLS;
    delete effective.MARKETPLACE_DB_CA_FILE;
  }
  if (overrides.caMode) {
    effective.MARKETPLACE_CONNECTION_CA_MODE = overrides.caMode;
    delete effective.MARKETPLACE_DB_CA_FILE;
    delete effective.MARKETPLACE_DB_CA_PEM;
    delete effective.MARKETPLACE_CONNECTION_CA_PEM;
    if (overrides.caMode === "custom") {
      try {
        if (!overrides.caPem?.includes("-----BEGIN CERTIFICATE-----"))
          throw new Error();
        createSecureContext({ ca: overrides.caPem });
      } catch {
        throw new DeploymentError(
          "runtime",
          "connection_ca_invalid",
          "Provide a valid trusted CA certificate bundle in Advanced settings.",
          ["caPem"],
          422,
        );
      }
      effective.MARKETPLACE_CONNECTION_CA_PEM = overrides.caPem;
      effective.MARKETPLACE_DB_CA_PEM = overrides.caPem;
    }
  }
  if (overrides.f5Mode === "disabled") {
    for (const key of [
      "MARKETPLACE_F5_ENABLED",
      "F5_API_URL",
      "F5_API_TOKEN",
      "F5_API_TOKEN_FILE",
      "F5_PROJECT_ADMIN_IDS",
    ])
      delete effective[key];
  } else {
    if (overrides.f5Mode === "enabled")
      effective.MARKETPLACE_F5_ENABLED = "true";
    if (overrides.f5Url) effective.F5_API_URL = overrides.f5Url;
    if (overrides.f5Token) {
      effective.F5_API_TOKEN = overrides.f5Token;
      delete effective.F5_API_TOKEN_FILE;
    }
    if (overrides.f5AdminIds)
      effective.F5_PROJECT_ADMIN_IDS = overrides.f5AdminIds;
  }
  return effective;
}
