import { mutation, query } from "./_generated/server";
import { v } from "convex/values";
import { liveEvent } from "./schema";

const KEEP_MS = 24 * 60 * 60 * 1000; // live events are disposable; Postgres is the record

/** Server-only: Next.js calls this with LIVE_PUBLISH_SECRET (also set on the Convex deployment). */
export const publish = mutation({
  args: { secret: v.string(), event: v.object(liveEvent) },
  handler: async (ctx, { secret, event }) => {
    const expected = process.env.LIVE_PUBLISH_SECRET;
    if (!expected || secret !== expected) throw new Error("Unauthorized");
    const at = Date.now();
    await ctx.db.insert("live", { ...event, at });
    // ponytail: prune a few old rows per write; a scheduled cleanup if traffic grows
    for (const old of await ctx.db.query("live").withIndex("by_time", (q) => q.lt("at", at - KEEP_MS)).take(20)) {
      await ctx.db.delete(old._id);
    }
  },
});

/** Newest events for one session (the dashboard refetches its own data when these change). */
export const forSession = query({
  args: { sessionId: v.string() },
  handler: (ctx, { sessionId }) =>
    ctx.db.query("live").withIndex("by_session", (q) => q.eq("sessionId", sessionId)).order("desc").take(10),
});

/** Newest events anywhere: what the parent's live page shows while the cartoon plays. */
export const latest = query({
  args: {},
  handler: (ctx) => ctx.db.query("live").withIndex("by_time").order("desc").take(10),
});
