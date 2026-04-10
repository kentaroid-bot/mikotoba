import { mutationGeneric as mutation, queryGeneric as query } from "convex/server";
import { v } from "convex/values";
import { internalMutation } from "./_generated/server";

const JST_OFFSET_MS = 9 * 60 * 60 * 1000;
const POST_START_HOUR_JST = 6;
const POST_END_HOUR_JST = 22;
const ONE_DAY_MS = 24 * 60 * 60 * 1000;
const MAX_MESSAGE_LENGTH = 200;
const MIN_REPORT_LENGTH = 8;
const COMPLETION_REPORT_POINTS = 2;

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

export const list = query({
  args: { groupId: v.id("groups") },
  handler: async (ctx, args) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) return [];
    const membership = await ctx.db
      .query("memberships")
      .withIndex("by_group", (q) => q.eq("groupId", args.groupId))
      .filter((q) => q.eq(q.field("userId"), identity.subject))
      .first();
    if (!membership) return [];

    return await ctx.db
      .query("announcements")
      .withIndex("by_group_createdAt", (q) => q.eq("groupId", args.groupId))
      .order("desc")
      .collect();
  },
});

export const listMyCompletionAnnouncementIds = query({
  args: { groupId: v.id("groups") },
  handler: async (ctx, args) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) return [];

    const membership = await ctx.db
      .query("memberships")
      .withIndex("by_group", (q) => q.eq("groupId", args.groupId))
      .filter((q) => q.eq(q.field("userId"), identity.subject))
      .first();
    if (!membership) return [];

    const rows = await ctx.db
      .query("taskCompletions")
      .withIndex("by_user_group_createdAt", (q) =>
        q.eq("userId", identity.subject)
      )
      .filter((q) => q.eq(q.field("groupId"), args.groupId))
      .order("desc")
      .take(200);

    return Array.from(new Set(rows.map((row) => row.announcementId)));
  },
});

export const reportCompletion = mutation({
  args: {
    groupId: v.id("groups"),
    announcementId: v.id("announcements"),
    reportText: v.string(),
    authorImageUrl: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) throw new Error("Unauthorized");

    const now = Date.now();
    if (!isPostingHour(now)) {
      throw new Error("投稿可能時間は6:00〜22:00です。");
    }

    const membership = await ctx.db
      .query("memberships")
      .withIndex("by_group", (q) => q.eq("groupId", args.groupId))
      .filter((q) => q.eq(q.field("userId"), identity.subject))
      .first();
    if (!membership) throw new Error("Not a member of this group.");

    const announcement = await ctx.db.get(args.announcementId);
    if (!announcement || announcement.groupId !== args.groupId) {
      throw new Error("対象の連絡事項が見つかりません。");
    }

    const existingCompletion = await ctx.db
      .query("taskCompletions")
      .withIndex("by_announcement_user", (q) =>
        q.eq("announcementId", args.announcementId)
      )
      .filter((q) => q.eq(q.field("userId"), identity.subject))
      .first();
    if (existingCompletion) {
      throw new Error("この連絡事項の完了報告はすでに投稿済みです。");
    }

    const profiles = await ctx.db
      .query("profiles")
      .withIndex("by_user", (q) => q.eq("userId", identity.subject))
      .collect();
    const profile = pickPrimaryProfile(profiles);
    if (!profile) throw new Error("Profile not found.");
    if (profile.points < 0) {
      throw new Error("徳ポイントがマイナスのため投稿できません。");
    }

    const reportText = args.reportText.trim();
    if (reportText.length < MIN_REPORT_LENGTH) {
      throw new Error(`完了報告は${MIN_REPORT_LENGTH}文字以上で入力してください。`);
    }

    const shortTitle =
      announcement.title.length > 24
        ? `${announcement.title.slice(0, 24)}…`
        : announcement.title;
    const header = `【完了報告】${shortTitle}`;
    const maxReportLength = MAX_MESSAGE_LENGTH - header.length - 1;
    if (reportText.length > maxReportLength) {
      throw new Error(`完了報告は${maxReportLength}文字以内で入力してください。`);
    }
    const messageText = `${header}\n${reportText}`;
    const { endAt: expiresAt } = getJstDayWindow(now);
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

    const messageId = await ctx.db.insert("messages", {
      text: messageText,
      authorName,
      authorUserId: identity.subject,
      authorImageUrl,
      authorRole: "student",
      createdAt: now,
      expiresAt,
      pointsAwarded: COMPLETION_REPORT_POINTS,
      heroProcessed: true,
      groupId: args.groupId,
    });

    await ctx.db.insert("taskCompletions", {
      groupId: args.groupId,
      announcementId: args.announcementId,
      userId: identity.subject,
      reportText,
      messageId,
      pointsAwarded: COMPLETION_REPORT_POINTS,
      createdAt: now,
    });

    const today = getJstDateString(now);
    const resetNeeded = shouldResetWeeklyStats(profile.lastWeeklyResetDate, today);
    const baseStats = resetNeeded
      ? { positive: 0, announcements: 0, aiFollows: 0 }
      : profile.weeklyStats;
    const nextStats = {
      ...baseStats,
      announcements: baseStats.announcements + 1,
    };

    const nextPoints = profile.points + COMPLETION_REPORT_POINTS;
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

    return {
      messageId,
      pointsAwarded: COMPLETION_REPORT_POINTS,
    };
  },
});

export const closeUndated = mutation({
  args: {
    groupId: v.id("groups"),
    announcementId: v.id("announcements"),
  },
  handler: async (ctx, args) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) throw new Error("Unauthorized");

    const membership = await ctx.db
      .query("memberships")
      .withIndex("by_group", (q) => q.eq("groupId", args.groupId))
      .filter((q) => q.eq(q.field("userId"), identity.subject))
      .first();
    if (!membership || membership.role !== "admin") {
      throw new Error("Only admins can delete announcements.");
    }

    const announcement = await ctx.db.get(args.announcementId);
    if (!announcement || announcement.groupId !== args.groupId) {
      throw new Error("Announcement not found.");
    }

    const completions = await ctx.db
      .query("taskCompletions")
      .withIndex("by_announcement_user", (q) =>
        q.eq("announcementId", args.announcementId)
      )
      .collect();

    await Promise.all(completions.map((row) => ctx.db.delete(row._id)));
    await ctx.db.delete(args.announcementId);
    return { deleted: true };
  },
});

export const replaceAll = mutation({
  args: {
    groupId: v.id("groups"),
    items: v.array(
      v.object({
        category: v.union(
          v.literal("持ち物"),
          v.literal("期限"),
          v.literal("伝達")
        ),
        title: v.string(),
        detail: v.string(),
        dueAt: v.optional(v.number()),
        importance: v.optional(v.string()),
      })
    ),
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
      .query("announcements")
      .withIndex("by_group_createdAt", (q) => q.eq("groupId", args.groupId))
      .collect();
    await Promise.all(existing.map((item) => ctx.db.delete(item._id)));
    const now = Date.now();
    for (const item of args.items) {
      await ctx.db.insert("announcements", {
        ...item,
        createdAt: now,
        groupId: args.groupId,
      });
    }
  },
});

export const replaceAllForAutomation = internalMutation({
  args: {
    groupId: v.id("groups"),
    items: v.array(
      v.object({
        category: v.union(v.literal("持ち物"), v.literal("期限"), v.literal("伝達")),
        title: v.string(),
        detail: v.string(),
        dueAt: v.optional(v.number()),
        importance: v.optional(v.string()),
      })
    ),
  },
  handler: async (ctx, args) => {
    const existing = await ctx.db
      .query("announcements")
      .withIndex("by_group_createdAt", (q) => q.eq("groupId", args.groupId))
      .collect();
    await Promise.all(existing.map((item) => ctx.db.delete(item._id)));
    const now = Date.now();
    for (const item of args.items) {
      await ctx.db.insert("announcements", {
        ...item,
        createdAt: now,
        groupId: args.groupId,
      });
    }
  },
});
