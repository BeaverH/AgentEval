import { z } from "zod";
import { unifiedConfigSchema } from "../src/features/business-demo/evaluation";
import { connectionSettingsSchema } from "./nmgr-connection-config";

export const draftSchema = z.object({
  id: z.string().regex(/^[a-z][a-z0-9-]{2,63}$/), kind: z.enum(["Guardrail", "Profile"]),
  name: z.string().trim().min(1).max(100), description: z.string().trim().min(1).max(2000),
  location: z.string().trim().min(1).max(100), mandatory: z.boolean(), refs: z.array(z.string()).max(128),
  attributes: z.object({ bu: z.string().max(100), agent: z.string().max(100), data: z.string().max(100) }).strict(),
  threshold: z.number().min(0).max(100), provider: z.enum(["NeMo", "F5"]).optional(),
}).strict();
export const caseSchema = z.object({ input: z.string().min(1).max(8000), expected: z.enum(["allow", "block"]), phase: z.enum(["input", "output"]).default("input") }).strict();
const envelope = { requestId: z.string().uuid(), expectedRevision: z.number().int().nonnegative() };
export const commandSchema = z.discriminatedUnion("type", [
  z.object({ ...envelope, type: z.enum(["create", "edit", "revise"]), draft: draftSchema }).strict(),
  z.object({ ...envelope, type: z.literal("action"), id: z.string(), action: z.enum(["implement", "request", "approve", "reject", "withdraw", "deploy"]), reason: z.string().max(2000).optional(), config: unifiedConfigSchema.strict().optional(), provider: z.enum(["NeMo", "F5"]).optional() }).strict(),
  z.object({ ...envelope, type: z.literal("evaluate"), id: z.string(), dataset: z.string().min(1).max(160), cases: z.array(caseSchema).max(500) }).strict(),
  z.object({ ...envelope, type: z.enum(["advance", "reconcile"]), id: z.string(), remoteId: z.string().uuid().optional() }).strict(),
]);
export const connectionTestSchema = z.object({
  target: z.enum(["nemoUrl", "nemoToken", "databaseUrl", "f5Url", "f5Token"]),
  settings: connectionSettingsSchema.optional(),
}).strict();
