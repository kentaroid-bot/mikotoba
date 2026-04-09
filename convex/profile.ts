import { mutationGeneric as mutation, queryGeneric as query } from "convex/server";
import { v } from "convex/values";

const DEFAULT_DAILY_LIMIT = 3;

const getJstDateString = (timestampMs: number) => {
  const offsetMs = 9 * 60 * 60 * 1000;
  const jst = new Date(timestampMs + offsetMs);
  return jst.toISOString().slice(0, 10);
};

export const getMy = query({
  args: {},
  handler: async (ctx) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) return null;
    return await ctx.db
      .query("profiles")
      .withIndex("by_user", (q) => q.eq("userId", identity.subject))
      .first();
  },
});

export const ensureMyProfile = mutation({
  args: {},
  handler: async (ctx) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) throw new Error("Unauthorized");

    const existing = await ctx.db
      .query("profiles")
      .withIndex("by_user", (q) => q.eq("userId", identity.subject))
      .first();
    if (existing) return existing._id;

    return await ctx.db.insert("profiles", {
      name: identity.name ?? "未設定",
      classLabel: "3年B組",
      number: 21,
      guardianId: `Class-${identity.subject.slice(0, 6)}`,
      userId: identity.subject,
      email: identity.email,
      points: 1250,
      dailyPosts: 0,
      dailyLimit: DEFAULT_DAILY_LIMIT,
      lastPostDate: getJstDateString(Date.now()),
      weeklyStats: { positive: 0, announcements: 0, aiFollows: 0 },
      lastWeeklyResetDate: getJstDateString(Date.now()),
      motto:
        "短い言葉でも、相手を想う気持ちが伝わる。今日も一言、勇気を出してみよう。",
    });
  },
});

export const setActiveGroup = mutation({
  args: { groupId: v.id("groups") },
  handler: async (ctx, args) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) throw new Error("Unauthorized");
    const profile = await ctx.db
      .query("profiles")
      .withIndex("by_user", (q) => q.eq("userId", identity.subject))
      .first();
    if (!profile) throw new Error("Profile not found");

    const membership = await ctx.db
      .query("memberships")
      .withIndex("by_group", (q) => q.eq("groupId", args.groupId))
      .filter((q) => q.eq(q.field("userId"), identity.subject))
      .first();
    if (!membership) throw new Error("Not a member of this group.");

    await ctx.db.patch(profile._id, { activeGroupId: args.groupId });
    return profile._id;
  },
});

export const updateMy = mutation({
  args: {
    name: v.string(),
    classLabel: v.string(),
    guardianId: v.string(),
    motto: v.string(),
  },
  handler: async (ctx, args) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) throw new Error("Unauthorized");

    const profile = await ctx.db
      .query("profiles")
      .withIndex("by_user", (q) => q.eq("userId", identity.subject))
      .first();
    if (!profile) throw new Error("Profile not found");

    const name = args.name.trim();
    const classLabel = args.classLabel.trim();
    const guardianIdRaw = args.guardianId.trim();
    const motto = args.motto.trim();
    const guardianId = guardianIdRaw.startsWith("@")
      ? guardianIdRaw
      : `@${guardianIdRaw}`;

    if (!name) throw new Error("名前を入力してください。");
    if (name.length > 40) throw new Error("名前は40文字以内で入力してください。");

    if (!classLabel) throw new Error("所属を入力してください。");
    if (classLabel.length > 40)
      throw new Error("所属は40文字以内で入力してください。");

    if (!guardianIdRaw) throw new Error("Guardian IDを入力してください。");
    if (guardianId.length > 64)
      throw new Error("Guardian IDは64文字以内で入力してください。");
    if (/\s/.test(guardianId)) {
      throw new Error("Guardian IDに空白は使用できません。");
    }
    if (!motto) throw new Error("メッセージを入力してください。");
    if (motto.length > 200)
      throw new Error("メッセージは200文字以内で入力してください。");

    await ctx.db.patch(profile._id, {
      name,
      classLabel,
      guardianId,
      motto,
    });
    return profile._id;
  },
});

export const seed = mutation({
  args: {},
  handler: async (ctx) => {
    const existing = await ctx.db.query("profiles").first();
    if (existing) {
      return existing._id;
    }
    return await ctx.db.insert("profiles", {
      name: "朝倉 まな",
      classLabel: "3年B組",
      number: 21,
      guardianId: "Class-3B-21",
      points: 1250,
      dailyPosts: 2,
      dailyLimit: DEFAULT_DAILY_LIMIT,
      lastPostDate: getJstDateString(Date.now()),
      weeklyStats: { positive: 8, announcements: 4, aiFollows: 3 },
      lastWeeklyResetDate: getJstDateString(Date.now()),
      motto:
        "短い言葉でも、相手を想う気持ちが伝わる。今日も一言、勇気を出してみよう。",
    });
  },
});
