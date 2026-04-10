import { mutationGeneric as mutation, queryGeneric as query } from "convex/server";
import { v } from "convex/values";
import type { Id } from "./_generated/dataModel";
import type { MutationCtx, QueryCtx } from "./_generated/server";
import { internalMutation, internalQuery } from "./_generated/server";

const DEFAULT_DAILY_LIMIT = 3;
const MAX_MESSAGE_LENGTH = 200;
const MAX_AWARD_POINTS = 10;
const MIN_AWARD_POINTS = -1;
const JST_OFFSET_MS = 9 * 60 * 60 * 1000;
const POST_START_HOUR_JST = 6;
const POST_END_HOUR_JST = 22;
const ONE_DAY_MS = 24 * 60 * 60 * 1000;
const DEFAULT_GUARDIAN_NAME = "AIヒーロー";

const getJstDateString = (timestampMs: number) => {
  const jst = new Date(timestampMs + JST_OFFSET_MS);
  return jst.toISOString().slice(0, 10);
};

const parseJstDateStringToTimestamp = (date: string) => {
  const [yearStr, monthStr, dayStr] = date.split("-");
  const year = Number(yearStr);
  const month = Number(monthStr);
  const day = Number(dayStr);
  if (!Number.isFinite(year) || !Number.isFinite(month) || !Number.isFinite(day)) {
    return null;
  }
  return Date.UTC(year, month - 1, day, 0, 0, 0, 0) - JST_OFFSET_MS;
};

const shouldResetWeeklyStats = (lastResetDate: string | undefined, today: string) => {
  if (!lastResetDate) return true;
  const last = parseJstDateStringToTimestamp(lastResetDate);
  const current = parseJstDateStringToTimestamp(today);
  if (last === null || current === null) return true;
  return current - last >= 7 * ONE_DAY_MS;
};

const getJstDate = (timestampMs: number) => new Date(timestampMs + JST_OFFSET_MS);

const getJstHour = (timestampMs: number) => getJstDate(timestampMs).getUTCHours();

const isPostingHour = (timestampMs: number) => {
  const hour = getJstHour(timestampMs);
  return hour >= POST_START_HOUR_JST && hour < POST_END_HOUR_JST;
};

const getJstPostingWindow = (timestampMs: number) => {
  const jst = getJstDate(timestampMs);
  const y = jst.getUTCFullYear();
  const m = jst.getUTCMonth();
  const d = jst.getUTCDate();
  const startAt = Date.UTC(y, m, d, POST_START_HOUR_JST, 0, 0, 0) - JST_OFFSET_MS;
  const endAt = Date.UTC(y, m, d, POST_END_HOUR_JST, 0, 0, 0) - JST_OFFSET_MS;
  return { startAt, endAt };
};

const getJstDayWindow = (timestampMs: number) => {
  const jst = getJstDate(timestampMs);
  const y = jst.getUTCFullYear();
  const m = jst.getUTCMonth();
  const d = jst.getUTCDate();
  const startAt = Date.UTC(y, m, d, 0, 0, 0, 0) - JST_OFFSET_MS;
  const endAt = Date.UTC(y, m, d + 1, 0, 0, 0, 0) - JST_OFFSET_MS;
  return { startAt, endAt };
};

const toDisplayGuardianId = (raw: string | undefined | null) => {
  const trimmed = raw?.trim();
  if (!trimmed) return null;
  return trimmed.startsWith("@") ? trimmed : `@${trimmed}`;
};

const toAuthorImageUrl = (raw: string | undefined | null) => {
  const trimmed = raw?.trim();
  return trimmed ? trimmed : undefined;
};

const sanitizeAuthorImageUrl = (raw: string | undefined) => {
  const trimmed = raw?.trim();
  if (!trimmed) return undefined;
  if (trimmed.length > 2048) return undefined;
  if (!trimmed.startsWith("https://") && !trimmed.startsWith("http://")) {
    return undefined;
  }
  return trimmed;
};

const pickPrimaryProfile = <T extends { _creationTime: number; imageUrl?: string }>(
  profiles: T[]
) => {
  if (profiles.length === 0) return null;
  return [...profiles].sort((a, b) => {
    const aHasImage = Boolean(toAuthorImageUrl(a.imageUrl));
    const bHasImage = Boolean(toAuthorImageUrl(b.imageUrl));
    if (aHasImage !== bHasImage) {
      return aHasImage ? -1 : 1;
    }
    return b._creationTime - a._creationTime;
  })[0];
};

const getGuardianNameForGroup = async (
  ctx: MutationCtx,
  groupId: Id<"groups">
) => {
  const group = await ctx.db.get(groupId);
  const name = group?.facilitator?.displayName?.trim();
  if (name) {
    return name;
  }
  return DEFAULT_GUARDIAN_NAME;
};

const getDailyLimitForGroup = async (
  ctx: QueryCtx | MutationCtx,
  groupId: Id<"groups">
) => {
  const settings = await ctx.db
    .query("settings")
    .withIndex("by_group_updatedAt", (q) => q.eq("groupId", groupId))
    .order("desc")
    .first();
  return settings?.dailyPostLimit ?? DEFAULT_DAILY_LIMIT;
};

const getUsageForDay = async (
  ctx: QueryCtx | MutationCtx,
  userId: string,
  groupId: Id<"groups">,
  date: string
) => {
  return await ctx.db
    .query("dailyPostUsage")
    .withIndex("by_user_group_date", (q) =>
      q.eq("userId", userId).eq("groupId", groupId).eq("date", date)
    )
    .first();
};

export const list = query({
  args: {
    groupId: v.id("groups"),
    limit: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) {
      return [];
    }
    const membership = await ctx.db
      .query("memberships")
      .withIndex("by_group", (q) => q.eq("groupId", args.groupId))
      .filter((q) => q.eq(q.field("userId"), identity.subject))
      .first();
    if (!membership) {
      return [];
    }

    const now = Date.now();
    const { startAt, endAt } = getJstDayWindow(now);
    const limit = args.limit ?? 30;
    const docs = await ctx.db
      .query("messages")
      .withIndex("by_group_createdAt", (q) => q.eq("groupId", args.groupId))
      .order("desc")
      .filter((q) =>
        q.and(
          q.gte(q.field("createdAt"), startAt),
          q.lt(q.field("createdAt"), endAt),
          q.gt(q.field("expiresAt"), now)
        )
      )
      .take(limit);

    const authorIds = Array.from(
      new Set(
        docs
          .map((doc) => doc.authorUserId)
          .filter((value): value is string => Boolean(value))
      )
    );

    const profilePairs = await Promise.all(
      authorIds.map(async (userId) => {
        const profiles = await ctx.db
          .query("profiles")
          .withIndex("by_user", (q) => q.eq("userId", userId))
          .collect();
        const profile = pickPrimaryProfile(profiles);
        return [
          userId,
          {
            authorName: toDisplayGuardianId(profile?.guardianId),
            authorImageUrl: toAuthorImageUrl(profile?.imageUrl),
          },
        ] as const;
      })
    );
    const authorMetaByUserId = new Map(profilePairs);
    const guardianLikePairs = await Promise.all(
      docs
        .filter((doc) => doc.authorRole === "guardian")
        .map(async (doc) => {
          const likes = await ctx.db
            .query("guardianLikes")
            .withIndex("by_message", (q) => q.eq("messageId", doc._id))
            .collect();
          return [
            doc._id,
            {
              likeCount: likes.length,
              likedByMe: likes.some((like) => like.userId === identity.subject),
            },
          ] as const;
        })
    );
    const guardianLikeByMessageId = new Map(guardianLikePairs);

    return docs.map((doc) => {
      const authorMeta = authorMetaByUserId.get(doc.authorUserId ?? "");
      return {
        ...doc,
        authorName: authorMeta?.authorName || doc.authorName,
        authorImageUrl: doc.authorImageUrl ?? authorMeta?.authorImageUrl,
        likeCount: guardianLikeByMessageId.get(doc._id)?.likeCount ?? 0,
        likedByMe: guardianLikeByMessageId.get(doc._id)?.likedByMe ?? false,
      };
    });
  },
});

export const send = mutation({
  args: {
    groupId: v.id("groups"),
    text: v.string(),
    authorImageUrl: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) {
      throw new Error("Unauthorized");
    }

    const text = args.text.trim();
    if (!text) {
      throw new Error("Message is empty.");
    }
    if (text.length > MAX_MESSAGE_LENGTH) {
      throw new Error(`Message must be ${MAX_MESSAGE_LENGTH} characters or fewer.`);
    }

    const now = Date.now();
    if (!isPostingHour(now)) {
      throw new Error("投稿可能時間は6:00〜22:00です。");
    }
    const { endAt: expiresAt } = getJstDayWindow(now);

    const membership = await ctx.db
      .query("memberships")
      .withIndex("by_group", (q) => q.eq("groupId", args.groupId))
      .filter((q) => q.eq(q.field("userId"), identity.subject))
      .first();
    if (!membership) {
      throw new Error("Not a member of this group.");
    }

    const profiles = await ctx.db
      .query("profiles")
      .withIndex("by_user", (q) => q.eq("userId", identity.subject))
      .collect();
    const profile = pickPrimaryProfile(profiles);
    if (!profile) {
      throw new Error("Profile not found.");
    }
    if (profile.points < 0) {
      throw new Error("徳ポイントがマイナスのため投稿できません。");
    }
    const authorName = toDisplayGuardianId(profile.guardianId) || identity.name || "未設定";
    const identityImageUrl = toAuthorImageUrl(identity.pictureUrl);
    const profileImageUrl = toAuthorImageUrl(profile.imageUrl);
    const clientImageUrl = sanitizeAuthorImageUrl(args.authorImageUrl);
    const freshestImageUrl = clientImageUrl ?? identityImageUrl;
    const authorImageUrl = freshestImageUrl ?? profileImageUrl;
    if (freshestImageUrl && profileImageUrl !== freshestImageUrl) {
      await Promise.all(
        profiles.map((existingProfile) =>
          ctx.db.patch(existingProfile._id, {
            imageUrl: freshestImageUrl,
          })
        )
      );
    }

    const dailyLimit = await getDailyLimitForGroup(ctx, args.groupId);
    const today = getJstDateString(now);
    const usage = await getUsageForDay(ctx, identity.subject, args.groupId, today);
    const currentPosts = usage?.count ?? 0;
    if (currentPosts >= dailyLimit) {
      throw new Error("Daily post limit reached.");
    }
    if (usage) {
      await ctx.db.patch(usage._id, {
        count: currentPosts + 1,
        updatedAt: now,
      });
    } else {
      await ctx.db.insert("dailyPostUsage", {
        userId: identity.subject,
        groupId: args.groupId,
        date: today,
        count: 1,
        updatedAt: now,
      });
    }

    const messageId = await ctx.db.insert("messages", {
      text,
      authorName,
      authorUserId: identity.subject,
      authorImageUrl,
      authorRole: "student",
      createdAt: now,
      expiresAt,
      groupId: args.groupId,
    });
    return messageId;
  },
});

export const sendGuardian = mutation({
  args: {
    groupId: v.id("groups"),
    text: v.string(),
  },
  handler: async (ctx, args) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) {
      throw new Error("Unauthorized");
    }

    const text = args.text.trim();
    if (!text) return null;
    if (text.length > 200) {
      throw new Error("Guardian response must be 200 characters or fewer.");
    }

    const membership = await ctx.db
      .query("memberships")
      .withIndex("by_group", (q) => q.eq("groupId", args.groupId))
      .filter((q) => q.eq(q.field("userId"), identity.subject))
      .first();
    if (!membership) {
      throw new Error("Not a member of this group.");
    }

    const now = Date.now();
    const { endAt: expiresAt } = getJstDayWindow(now);
    const authorName = await getGuardianNameForGroup(ctx, args.groupId);
    return await ctx.db.insert("messages", {
      text,
      authorName,
      authorRole: "guardian",
      createdAt: now,
      expiresAt,
      groupId: args.groupId,
    });
  },
});

export const sendGuardianForAutomation = internalMutation({
  args: {
    groupId: v.id("groups"),
    text: v.string(),
  },
  handler: async (ctx, args) => {
    const text = args.text.trim();
    if (!text) return null;
    const now = Date.now();
    const { endAt: expiresAt } = getJstDayWindow(now);
    const authorName = await getGuardianNameForGroup(ctx, args.groupId);
    return await ctx.db.insert("messages", {
      text,
      authorName,
      authorRole: "guardian",
      createdAt: now,
      expiresAt,
      groupId: args.groupId,
    });
  },
});

export const toggleGuardianLike = mutation({
  args: {
    groupId: v.id("groups"),
    messageId: v.id("messages"),
  },
  handler: async (ctx, args) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) {
      throw new Error("Unauthorized");
    }

    const membership = await ctx.db
      .query("memberships")
      .withIndex("by_group", (q) => q.eq("groupId", args.groupId))
      .filter((q) => q.eq(q.field("userId"), identity.subject))
      .first();
    if (!membership) {
      throw new Error("Not a member of this group.");
    }

    const message = await ctx.db.get(args.messageId);
    if (!message || message.groupId !== args.groupId) {
      throw new Error("Message not found in this group.");
    }
    if (message.authorRole !== "guardian") {
      throw new Error("AIファシリテーターの発言にのみハートできます。");
    }

    const existing = await ctx.db
      .query("guardianLikes")
      .withIndex("by_user_message", (q) => q.eq("userId", identity.subject))
      .filter((q) => q.eq(q.field("messageId"), args.messageId))
      .first();

    let liked = false;
    if (existing) {
      await ctx.db.delete(existing._id);
    } else {
      liked = true;
      await ctx.db.insert("guardianLikes", {
        messageId: args.messageId,
        groupId: args.groupId,
        userId: identity.subject,
        createdAt: Date.now(),
      });
    }

    const likeCount = (
      await ctx.db
        .query("guardianLikes")
        .withIndex("by_message", (q) => q.eq("messageId", args.messageId))
        .collect()
    ).length;

    return { liked, likeCount };
  },
});

export const getGuardianPreferenceContext = query({
  args: {
    groupId: v.id("groups"),
  },
  handler: async (ctx, args) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) {
      return { likedCount: 0, likedSamples: [] as string[] };
    }

    const membership = await ctx.db
      .query("memberships")
      .withIndex("by_group", (q) => q.eq("groupId", args.groupId))
      .filter((q) => q.eq(q.field("userId"), identity.subject))
      .first();
    if (!membership) {
      return { likedCount: 0, likedSamples: [] as string[] };
    }

    const likes = await ctx.db
      .query("guardianLikes")
      .withIndex("by_user_group_createdAt", (q) => q.eq("userId", identity.subject))
      .filter((q) => q.eq(q.field("groupId"), args.groupId))
      .order("desc")
      .take(20);

    if (likes.length === 0) {
      return { likedCount: 0, likedSamples: [] as string[] };
    }

    const likedMessages = await Promise.all(
      likes.map((like) => ctx.db.get(like.messageId))
    );
    const unique = new Set<string>();
    const likedSamples: string[] = [];

    for (const message of likedMessages) {
      if (!message || message.authorRole !== "guardian") continue;
      const text = message.text.trim();
      if (!text || unique.has(text)) continue;
      unique.add(text);
      likedSamples.push(text);
      if (likedSamples.length >= 5) break;
    }

    return {
      likedCount: likes.length,
      likedSamples,
    };
  },
});

export const getDailyStatus = query({
  args: {
    groupId: v.id("groups"),
  },
  handler: async (ctx, args) => {
    const now = Date.now();
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) {
      return {
        used: 0,
        limit: DEFAULT_DAILY_LIMIT,
        remaining: DEFAULT_DAILY_LIMIT,
      };
    }

    const membership = await ctx.db
      .query("memberships")
      .withIndex("by_group", (q) => q.eq("groupId", args.groupId))
      .filter((q) => q.eq(q.field("userId"), identity.subject))
      .first();
    if (!membership) {
      return {
        used: 0,
        limit: DEFAULT_DAILY_LIMIT,
        remaining: DEFAULT_DAILY_LIMIT,
      };
    }

    const today = getJstDateString(now);
    const usage = await getUsageForDay(ctx, identity.subject, args.groupId, today);
    const limit = await getDailyLimitForGroup(ctx, args.groupId);
    const used = usage?.count ?? 0;
    return {
      used,
      limit,
      remaining: isPostingHour(now) ? Math.max(limit - used, 0) : 0,
    };
  },
});

export const awardPoints = mutation({
  args: {
    messageId: v.id("messages"),
    points: v.number(),
    sentiment: v.optional(
      v.union(
        v.literal("positive"),
        v.literal("neutral"),
        v.literal("negative"),
        v.literal("spam")
      )
    ),
    isAnnouncement: v.optional(v.boolean()),
    aiFollowed: v.optional(v.boolean()),
  },
  handler: async (ctx, args) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) {
      throw new Error("Unauthorized");
    }

    const message = await ctx.db.get(args.messageId);
    if (!message) {
      throw new Error("Message not found.");
    }
    if (!message.groupId) {
      throw new Error("Message is not assigned to a group.");
    }
    if (message.authorUserId !== identity.subject) {
      throw new Error("You can only award points to your own message.");
    }
    if (typeof message.pointsAwarded === "number") {
      return message.pointsAwarded;
    }

    const membership = await ctx.db
      .query("memberships")
      .withIndex("by_group", (q) => q.eq("groupId", message.groupId))
      .filter((q) => q.eq(q.field("userId"), identity.subject))
      .first();
    if (!membership) {
      throw new Error("Not a member of this group.");
    }

    const profiles = await ctx.db
      .query("profiles")
      .withIndex("by_user", (q) => q.eq("userId", identity.subject))
      .collect();
    const profile = pickPrimaryProfile(profiles);
    if (!profile) {
      throw new Error("Profile not found.");
    }

    const points = Math.max(
      MIN_AWARD_POINTS,
      Math.min(MAX_AWARD_POINTS, Math.floor(Number(args.points) || 0))
    );

    await ctx.db.patch(args.messageId, { pointsAwarded: points, heroProcessed: true });
    const nextPoints = profile.points + points;
    const today = getJstDateString(Date.now());
    const resetNeeded = shouldResetWeeklyStats(profile.lastWeeklyResetDate, today);
    const baseStats = resetNeeded
      ? { positive: 0, announcements: 0, aiFollows: 0 }
      : profile.weeklyStats;
    const nextStats = {
      positive:
        baseStats.positive + (args.sentiment === "positive" ? 1 : 0),
      announcements:
        baseStats.announcements + (args.isAnnouncement ? 1 : 0),
      aiFollows:
        baseStats.aiFollows + (args.aiFollowed ? 1 : 0),
    };

    const nextResetDate = resetNeeded ? today : profile.lastWeeklyResetDate ?? today;
    await Promise.all(
      profiles.map((existingProfile) =>
        ctx.db.patch(existingProfile._id, {
          points: nextPoints,
          weeklyStats: nextStats,
          lastWeeklyResetDate: nextResetDate,
        })
      )
    );
    return points;
  },
});

export const cleanupExpired = mutation({
  args: {},
  handler: async () => {
    // Keep expired messages for audit/history. UI hides them after expiry.
    return { kept: true };
  },
});

export const listForSummary = internalQuery({
  args: {
    groupId: v.id("groups"),
    date: v.string(),
  },
  handler: async (ctx, args) => {
    const [yearStr, monthStr, dayStr] = args.date.split("-");
    const year = Number(yearStr);
    const month = Number(monthStr);
    const day = Number(dayStr);
    if (!Number.isFinite(year) || !Number.isFinite(month) || !Number.isFinite(day)) {
      return [];
    }

    const baseTimestamp =
      Date.UTC(year, month - 1, day, 12, 0, 0, 0) - JST_OFFSET_MS;
    const { startAt, endAt } = getJstPostingWindow(baseTimestamp);

    const docs = await ctx.db
      .query("messages")
      .withIndex("by_group_createdAt", (q) => q.eq("groupId", args.groupId))
      .order("asc")
      .filter((q) =>
        q.and(
          q.gte(q.field("createdAt"), startAt),
          q.lt(q.field("createdAt"), endAt),
          q.eq(q.field("authorRole"), "student")
        )
      )
      .collect();

    return docs.map((doc) => ({
      authorName: doc.authorName,
      authorRole: doc.authorRole,
      text: doc.text,
      createdAt: doc.createdAt,
    }));
  },
});

export const getLastActivityForAutomation = internalQuery({
  args: {
    groupId: v.id("groups"),
  },
  handler: async (ctx, args) => {
    const docs = await ctx.db
      .query("messages")
      .withIndex("by_group_createdAt", (q) => q.eq("groupId", args.groupId))
      .order("desc")
      .take(50);
    const lastStudentAt =
      docs.find((doc) => doc.authorRole === "student")?.createdAt ?? null;
    const lastGuardianAt =
      docs.find((doc) => doc.authorRole === "guardian")?.createdAt ?? null;
    return { lastStudentAt, lastGuardianAt };
  },
});
