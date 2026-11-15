import { mutation, query } from "./_generated/server";
import { v } from "convex/values";
import { planFields } from "./schema";

/** Server-only (LIVE_PUBLISH_SECRET): change part of a learner's plan. Fields left out stay as they are. */
export const set = mutation({
  args: { secret: v.string(), learnerKey: v.string(), ...planFields },
  handler: async (ctx, { secret, learnerKey, ...patch }) => {
    const expected = process.env.LIVE_PUBLISH_SECRET;
    if (!expected || secret !== expected) throw new Error("Unauthorized");
    const row = await ctx.db.query("plan").withIndex("by_learner", (q) => q.eq("learnerKey", learnerKey)).unique();
    const updatedAt = Date.now();
    if (row) await ctx.db.patch(row._id, { ...patch, updatedAt });
    else await ctx.db.insert("plan", { learnerKey, ...patch, updatedAt });
  },
});

/** The kid view subscribes to this. Nothing private: a language code and three focus levels. */
export const get = query({
  args: { learnerKey: v.string() },
  handler: (ctx, { learnerKey }) =>
    ctx.db.query("plan").withIndex("by_learner", (q) => q.eq("learnerKey", learnerKey)).unique(),
});
