import { mutationGeneric as mutation, queryGeneric as query } from "convex/server";
import { v } from "convex/values";
import { internalMutation, internalQuery } from "./_generated/server";

export const latest = query({
  args: { groupId: v.id("groups") },
  handler: async (ctx, args) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) return null;
    const membership = await ctx.db
      .query("memberships")
      .withIndex("by_group", (q) => q.eq("groupId", args.groupId))
      .filter((q) => q.eq(q.field("userId"), identity.subject))
      .first();
    if (!membership) return null;

    const entries = await ctx.db
      .query("diaries")
      .withIndex("by_group_date", (q) => q.eq("groupId", args.groupId))
      .order("desc")
      .take(1);
    return entries[0] ?? null;
  },
});

export const byDate = query({
  args: { groupId: v.id("groups"), date: v.string() },
  handler: async (ctx, args) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) return null;
    const membership = await ctx.db
      .query("memberships")
      .withIndex("by_group", (q) => q.eq("groupId", args.groupId))
      .filter((q) => q.eq(q.field("userId"), identity.subject))
      .first();
    if (!membership) return null;

    return await ctx.db
      .query("diaries")
      .withIndex("by_group_date", (q) => q.eq("groupId", args.groupId))
      .filter((q) => q.eq(q.field("date"), args.date))
      .first();
  },
});

export const save = mutation({
  args: {
    groupId: v.id("groups"),
    date: v.string(),
    summary: v.string(),
    bullets: v.array(v.string()),
    stats: v.object({
      safety: v.number(),
      activity: v.number(),
      alerts: v.number(),
    }),
  },
  handler: async (ctx, args) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) throw new Error("Unauthorized");
    const membership = await ctx.db
      .query("memberships")
      .withIndex("by_group", (q) => q.eq("groupId", args.groupId))
      .filter((q) => q.eq(q.field("userId"), identity.subject))
      .first();
    if (!membership) throw new Error("Not a member of this group.");

    const existing = await ctx.db
      .query("diaries")
      .withIndex("by_group_date", (q) => q.eq("groupId", args.groupId))
      .filter((q) => q.eq(q.field("date"), args.date))
      .first();
    if (existing) {
      await ctx.db.patch(existing._id, {
        summary: args.summary,
        bullets: args.bullets,
        stats: args.stats,
        createdAt: Date.now(),
      });
      return existing._id;
    }
    return await ctx.db.insert("diaries", {
      groupId: args.groupId,
      date: args.date,
      summary: args.summary,
      bullets: args.bullets,
      stats: args.stats,
      createdAt: Date.now(),
    });
  },
});

export const byDateForAutomation = internalQuery({
  args: { groupId: v.id("groups"), date: v.string() },
  handler: async (ctx, args) => {
    return await ctx.db
      .query("diaries")
      .withIndex("by_group_date", (q) => q.eq("groupId", args.groupId))
      .filter((q) => q.eq(q.field("date"), args.date))
      .first();
  },
});

export const saveForAutomation = internalMutation({
  args: {
    groupId: v.id("groups"),
    date: v.string(),
    summary: v.string(),
    bullets: v.array(v.string()),
    stats: v.object({
      safety: v.number(),
      activity: v.number(),
      alerts: v.number(),
    }),
  },
  handler: async (ctx, args) => {
    const existing = await ctx.db
      .query("diaries")
      .withIndex("by_group_date", (q) => q.eq("groupId", args.groupId))
      .filter((q) => q.eq(q.field("date"), args.date))
      .first();
    if (existing) {
      await ctx.db.patch(existing._id, {
        summary: args.summary,
        bullets: args.bullets,
        stats: args.stats,
        createdAt: Date.now(),
      });
      return existing._id;
    }
    return await ctx.db.insert("diaries", {
      groupId: args.groupId,
      date: args.date,
      summary: args.summary,
      bullets: args.bullets,
      stats: args.stats,
      createdAt: Date.now(),
    });
  },
});
