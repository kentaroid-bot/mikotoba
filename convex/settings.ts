import { mutationGeneric as mutation, queryGeneric as query } from "convex/server";
import { v } from "convex/values";
import { internalQuery } from "./_generated/server";

const DEFAULT_DAILY_LIMIT = 3;
const MIN_DAILY_LIMIT = 1;
const MAX_DAILY_LIMIT = 10;
const DEFAULT_ANNOUNCEMENT_DEFAULT_DUE_DAYS = 3;
const MIN_ANNOUNCEMENT_DEFAULT_DUE_DAYS = 1;
const MAX_ANNOUNCEMENT_DEFAULT_DUE_DAYS = 30;

export const get = query({
  args: {},
  handler: async (ctx) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) {
      return {
        dailyPostLimit: DEFAULT_DAILY_LIMIT,
        announcementDefaultDueDays: DEFAULT_ANNOUNCEMENT_DEFAULT_DUE_DAYS,
      };
    }

    const profile = await ctx.db
      .query("profiles")
      .withIndex("by_user", (q) => q.eq("userId", identity.subject))
      .first();
    if (!profile?.activeGroupId) {
      return {
        dailyPostLimit: DEFAULT_DAILY_LIMIT,
        announcementDefaultDueDays: DEFAULT_ANNOUNCEMENT_DEFAULT_DUE_DAYS,
      };
    }

    const settings = await ctx.db
      .query("settings")
      .withIndex("by_group_updatedAt", (q) => q.eq("groupId", profile.activeGroupId))
      .order("desc")
      .first();
    if (!settings) {
      return {
        dailyPostLimit: DEFAULT_DAILY_LIMIT,
        announcementDefaultDueDays: DEFAULT_ANNOUNCEMENT_DEFAULT_DUE_DAYS,
      };
    }
    return {
      dailyPostLimit: settings.dailyPostLimit,
      announcementDefaultDueDays:
        settings.announcementDefaultDueDays ?? DEFAULT_ANNOUNCEMENT_DEFAULT_DUE_DAYS,
    };
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
      announcementDefaultDueDays: DEFAULT_ANNOUNCEMENT_DEFAULT_DUE_DAYS,
      updatedAt: now,
    });
  },
});

export const setAnnouncementDefaultDueDays = mutation({
  args: { announcementDefaultDueDays: v.number() },
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
      throw new Error("Only admins can update default due days.");
    }

    const announcementDefaultDueDays = Math.floor(args.announcementDefaultDueDays);
    if (
      announcementDefaultDueDays < MIN_ANNOUNCEMENT_DEFAULT_DUE_DAYS ||
      announcementDefaultDueDays > MAX_ANNOUNCEMENT_DEFAULT_DUE_DAYS
    ) {
      throw new Error(
        `Default due days must be between ${MIN_ANNOUNCEMENT_DEFAULT_DUE_DAYS} and ${MAX_ANNOUNCEMENT_DEFAULT_DUE_DAYS}.`
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
        announcementDefaultDueDays,
        updatedAt: now,
      });
      return existing._id;
    }
    return await ctx.db.insert("settings", {
      groupId: profile.activeGroupId,
      dailyPostLimit: DEFAULT_DAILY_LIMIT,
      announcementDefaultDueDays,
      updatedAt: now,
    });
  },
});

export const getForGroupForAutomation = internalQuery({
  args: {
    groupId: v.id("groups"),
  },
  handler: async (ctx, args) => {
    const settings = await ctx.db
      .query("settings")
      .withIndex("by_group_updatedAt", (q) => q.eq("groupId", args.groupId))
      .order("desc")
      .first();

    return {
      dailyPostLimit: settings?.dailyPostLimit ?? DEFAULT_DAILY_LIMIT,
      announcementDefaultDueDays:
        settings?.announcementDefaultDueDays ?? DEFAULT_ANNOUNCEMENT_DEFAULT_DUE_DAYS,
    };
  },
});
