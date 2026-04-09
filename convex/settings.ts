import { mutationGeneric as mutation, queryGeneric as query } from "convex/server";
import { v } from "convex/values";

const DEFAULT_DAILY_LIMIT = 3;
const MIN_DAILY_LIMIT = 1;
const MAX_DAILY_LIMIT = 10;

export const get = query({
  args: {},
  handler: async (ctx) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) {
      return { dailyPostLimit: DEFAULT_DAILY_LIMIT };
    }

    const profile = await ctx.db
      .query("profiles")
      .withIndex("by_user", (q) => q.eq("userId", identity.subject))
      .first();
    if (!profile?.activeGroupId) {
      return { dailyPostLimit: DEFAULT_DAILY_LIMIT };
    }

    const settings = await ctx.db
      .query("settings")
      .withIndex("by_group_updatedAt", (q) => q.eq("groupId", profile.activeGroupId))
      .order("desc")
      .first();
    if (!settings) {
      return { dailyPostLimit: DEFAULT_DAILY_LIMIT };
    }
    return { dailyPostLimit: settings.dailyPostLimit };
  },
});

export const setDailyLimit = mutation({
  args: { dailyPostLimit: v.number() },
  handler: async (ctx, args) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) {
      throw new Error("Unauthorized");
    }

    const profile = await ctx.db
      .query("profiles")
      .withIndex("by_user", (q) => q.eq("userId", identity.subject))
      .first();
    if (!profile?.activeGroupId) {
      throw new Error("Active group is required.");
    }

    const membership = await ctx.db
      .query("memberships")
      .withIndex("by_group", (q) => q.eq("groupId", profile.activeGroupId))
      .filter((q) => q.eq(q.field("userId"), identity.subject))
      .first();
    if (!membership || membership.role !== "admin") {
      throw new Error("Only admins can update daily post limits.");
    }

    const dailyPostLimit = Math.floor(args.dailyPostLimit);
    if (dailyPostLimit < MIN_DAILY_LIMIT || dailyPostLimit > MAX_DAILY_LIMIT) {
      throw new Error(
        `Daily post limit must be between ${MIN_DAILY_LIMIT} and ${MAX_DAILY_LIMIT}.`
      );
    }

    const now = Date.now();
    const existing = await ctx.db
      .query("settings")
      .withIndex("by_group_updatedAt", (q) => q.eq("groupId", profile.activeGroupId))
      .order("desc")
      .first();
    if (existing) {
      await ctx.db.patch(existing._id, {
        dailyPostLimit,
        updatedAt: now,
      });
      return existing._id;
    }
    return await ctx.db.insert("settings", {
      groupId: profile.activeGroupId,
      dailyPostLimit,
      updatedAt: now,
    });
  },
});
