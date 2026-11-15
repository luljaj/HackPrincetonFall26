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

export default defineSchema({
  live: defineTable({ ...liveEvent, at: v.number() })
    .index("by_session", ["sessionId", "at"])
    .index("by_time", ["at"]),
});
