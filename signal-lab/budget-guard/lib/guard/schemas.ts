import { z } from "zod";

// Input validation for the dashboard API routes (was app/(product)/app/actions.ts).

const id = z.string().trim().regex(/^[A-Za-z0-9_-]{1,100}$/, "IDs may contain letters, digits, - and _");
const idList = z
  .string()
  .transform((s) => s.split(/[\s,]+/).filter(Boolean))
  .pipe(z.array(id).max(20));

export const targetSchema = z.discriminatedUnion("provider", [
  z.object({ provider: z.literal("vercel"), teamId: id, projectIds: idList.pipe(z.array(id).min(1, "Pick at least one project to pause")) }),
  z.object({ provider: z.literal("openai"), projectId: id }),
  z.object({ provider: z.literal("anthropic"), workspaceId: id, keepKeyIds: idList }),
]);

export const addSchema = z.object({
  label: z.string().trim().min(1).max(60),
  token: z.string().trim().min(4).max(500),
  budgetUsd: z.coerce.number().positive().max(1_000_000),
});

export const connIdSchema = z.string().regex(/^conn_[a-f0-9]{16}$/);

export const connOpSchema = z.discriminatedUnion("op", [
  z.object({ op: z.literal("check") }),
  z.object({ op: z.literal("test-stop") }),
  z.object({ op: z.literal("mode"), mode: z.enum(["test", "off"]) }),
  z.object({ op: z.literal("confirm"), action: z.enum(["arm-live", "stop-now"]), challenge: z.string().max(2000), typed: z.string().max(200) }),
  z.object({ op: z.literal("webhook-secret"), remove: z.boolean().optional(), secret: z.string().max(500).optional() }),
  // R3-03: "Stop on Vercel's 100% alert". Turning it on needs the same signed challenge + typed label
  // as arming live (challenge action "vercel-limit-on"); turning it off (the safe side) needs nothing.
  z.object({ op: z.literal("vercel-limit"), enabled: z.boolean(), challenge: z.string().max(2000).optional(), typed: z.string().max(200).optional() }),
]);

export const slackSchema = z.discriminatedUnion("op", [
  z.object({ op: z.literal("save"), url: z.string().max(500) }),
  z.object({ op: z.literal("remove") }),
  z.object({ op: z.literal("test") }),
]);
