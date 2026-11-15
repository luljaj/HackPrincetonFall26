import { defineSchema, defineTable } from "convex/server";
import { v } from "convex/values";

// Convex holds only live, short-lived events for the parent's "right now" view. Postgres (Tiger Cloud)
// stays the durable record. Nothing private goes here: no transcripts of what the child said, no answer
// guides, no drafts, no audio. Queries are readable by anyone with the deployment URL.
export const liveEvent = {
  sessionId: v.string(),
  kind: v.union(v.literal("lab_turn"), v.literal("session_updated")),
  // lab_turn: what Dora is doing at a pause
  spotId: v.optional(v.string()),
  stage: v.optional(v.string()),
  question: v.optional(v.string()),
  outcome: v.optional(v.string()), // correct | wrong | unclear | silent
  verdict: v.optional(v.string()), // pronunciation: good | close | retry | silent
  skill: v.optional(v.string()),
  language: v.optional(v.string()), // language being practised
  practiceWord: v.optional(v.string()),
  // session_updated: the pipeline saved a turn; the dashboard refetches its authorised view
  interactionId: v.optional(v.string()),
  turnNumber: v.optional(v.number()),
};

const level = v.union(v.literal("less"), v.literal("usual"), v.literal("more"));
export const planFields = {
  language: v.optional(v.string()), // language being practised: "" = off, else es | fr | de | zh | hi | ja
  focus: v.optional(v.record(v.string(), level)), // mastery category id → level
};

export default defineSchema({
  live: defineTable({ ...liveEvent, at: v.number() })
    .index("by_session", ["sessionId", "at"])
    .index("by_time", ["at"]),
  // The learning plan: what the parent wants right now. The kid view subscribes and applies a change
  // mid-run (language switches at the next line). One row per learner; only the server writes it.
  plan: defineTable({ learnerKey: v.string(), ...planFields, updatedAt: v.number() }).index("by_learner", ["learnerKey"]),
});
