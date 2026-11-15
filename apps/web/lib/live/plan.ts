import "server-only";
import { ConvexHttpClient } from "convex/browser";
import { z } from "zod";
import { api } from "../../convex/_generated/api";
import { FocusSchema, PLAN_LANGUAGES } from "../parent/preferences";
export { PLAN_LANGUAGES } from "../parent/preferences";

// The learning plan: what the parent wants the kid learning right now (learning-plan.md). Convex holds the
// live copy that the kid view subscribes to. setPlan is the one write path (API today, parent chat later).

export const PlanPatchSchema = z
  .strictObject({ language: z.enum(PLAN_LANGUAGES).optional(), focus: FocusSchema.optional() })
  .refine((p) => p.language !== undefined || p.focus !== undefined, "Nothing to change.");
export type PlanPatch = z.infer<typeof PlanPatchSchema>;

const LEARNER = "default"; // ponytail: one learner; pass a learner key once there are accounts
let client: ConvexHttpClient | null = null;
const convex = () => {
  const url = process.env.NEXT_PUBLIC_CONVEX_URL;
  return url ? (client ??= new ConvexHttpClient(url)) : null;
};

/** Change part of the plan. Returns false (does nothing) when Convex isn't configured. */
export async function setPlan(patch: PlanPatch): Promise<boolean> {
  const c = convex();
  const secret = process.env.LIVE_PUBLISH_SECRET;
  if (!c || !secret) return false;
  await c.mutation(api.plan.set, { secret, learnerKey: LEARNER, ...patch });
  return true;
}

export async function getPlan() {
  const row = await convex()?.query(api.plan.get, { learnerKey: LEARNER });
  return { language: row?.language ?? "", focus: row?.focus ?? null, updatedAt: row?.updatedAt ?? null };
}
