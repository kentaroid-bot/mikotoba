import {
  actionGeneric as action,
  mutationGeneric as mutation,
  queryGeneric as query,
} from "convex/server";
import { v } from "convex/values";
import { api, internal } from "./_generated/api";
import { internalAction, internalMutation } from "./_generated/server";

const DEFAULT_DAILY_LIMIT = 3;
const SIGNUP_INITIAL_POINTS = 300;
const MAX_IMAGE_URL_LENGTH = 2048;

const getJstDateString = (timestampMs: number) => {
  const offsetMs = 9 * 60 * 60 * 1000;
  const jst = new Date(timestampMs + offsetMs);
  return jst.toISOString().slice(0, 10);
};

const sanitizeImageUrl = (raw: string | undefined | null) => {
  const trimmed = raw?.trim();
  if (!trimmed) return undefined;
  if (trimmed.length > MAX_IMAGE_URL_LENGTH) return undefined;
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
    const aHasImage = Boolean(sanitizeImageUrl(a.imageUrl));
    const bHasImage = Boolean(sanitizeImageUrl(b.imageUrl));
    if (aHasImage !== bHasImage) {
      return aHasImage ? -1 : 1;
    }
    return b._creationTime - a._creationTime;
  })[0];
};

const fetchClerkImageUrl = async (userId: string) => {
  const secretKey = process.env.CLERK_SECRET_KEY;
  if (!secretKey) return undefined;
  const response = await fetch(`https://api.clerk.com/v1/users/${encodeURIComponent(userId)}`, {
    headers: {
      Authorization: `Bearer ${secretKey}`,
      "Content-Type": "application/json",
    },
  });
  if (!response.ok) {
    return undefined;
  }
  const data = (await response.json()) as { image_url?: string };
  return sanitizeImageUrl(data.image_url);
};

export const getMy = query({
  args: {},
  handler: async (ctx) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) return null;
    const profiles = await ctx.db
      .query("profiles")
      .withIndex("by_user", (q) => q.eq("userId", identity.subject))
      .collect();
    return pickPrimaryProfile(profiles);
  },
});

export const ensureMyProfile = mutation({
  args: {
    imageUrl: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) throw new Error("Unauthorized");
    const identityImageUrl = sanitizeImageUrl(identity.pictureUrl);
    const clientImageUrl = sanitizeImageUrl(args.imageUrl);
    const pictureUrl = clientImageUrl ?? identityImageUrl;

    const existingProfiles = await ctx.db
      .query("profiles")
      .withIndex("by_user", (q) => q.eq("userId", identity.subject))
      .collect();
    if (existingProfiles.length > 0) {
      const existing = pickPrimaryProfile(existingProfiles) ?? existingProfiles[0];
      await Promise.all(
        existingProfiles.map(async (profile) => {
          const nextImage = pictureUrl ?? profile.imageUrl;
          const nextEmail = identity.email ?? profile.email;
          if (nextImage !== profile.imageUrl || nextEmail !== profile.email) {
            await ctx.db.patch(profile._id, {
              imageUrl: nextImage,
              email: nextEmail,
            });
          }
        })
      );
      return existing._id;
    }

    return await ctx.db.insert("profiles", {
      name: identity.name ?? "未設定",
      classLabel: "3年B組",
      number: 21,
      guardianId: `Class-${identity.subject.slice(0, 6)}`,
      userId: identity.subject,
      email: identity.email,
      imageUrl: pictureUrl,
      points: SIGNUP_INITIAL_POINTS,
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

export const setImageForUserIdInternal = internalMutation({
  args: {
    userId: v.string(),
    imageUrl: v.string(),
  },
  handler: async (ctx, args) => {
    const imageUrl = sanitizeImageUrl(args.imageUrl);
    if (!imageUrl) return { updatedProfiles: 0, updatedMessages: 0 };

    const profiles = await ctx.db
      .query("profiles")
      .withIndex("by_user", (q) => q.eq("userId", args.userId))
      .collect();

    let updatedProfiles = 0;
    for (const profile of profiles) {
      if (profile.imageUrl === imageUrl) continue;
      await ctx.db.patch(profile._id, { imageUrl });
      updatedProfiles += 1;
    }

    const messages = await ctx.db
      .query("messages")
      .filter((q) => q.eq(q.field("authorUserId"), args.userId))
      .collect();

    let updatedMessages = 0;
    for (const message of messages) {
      if (message.authorImageUrl === imageUrl) continue;
      await ctx.db.patch(message._id, { authorImageUrl: imageUrl });
      updatedMessages += 1;
    }

    return { updatedProfiles, updatedMessages };
  },
});

export const syncSingleAvatarFromClerkForAutomation: ReturnType<typeof internalAction> =
  internalAction({
  args: {
    userId: v.string(),
  },
  handler: async (ctx, args) => {
    const imageUrl = await fetchClerkImageUrl(args.userId);
    if (!imageUrl) {
      return { synced: false, reason: "image_not_found" as const };
    }
    const result: { updatedProfiles: number; updatedMessages: number } =
      await ctx.runMutation(internal.profile.setImageForUserIdInternal, {
        userId: args.userId,
        imageUrl,
      });
    return {
      synced: true,
      updatedProfiles: result.updatedProfiles,
      updatedMessages: result.updatedMessages,
    };
  },
  });

export const syncAllMemberAvatarsFromClerkForAutomation: ReturnType<
  typeof internalAction
> = internalAction({
  args: {},
  handler: async (ctx) => {
    const userIds: string[] = await ctx.runQuery(
      internal.groups.listAllMemberUserIdsForAutomation,
      {}
    );
    let syncedUsers = 0;
    let updatedProfiles = 0;
    let updatedMessages = 0;
    let skippedUsers = 0;

    for (const userId of userIds) {
      const imageUrl = await fetchClerkImageUrl(userId);
      if (!imageUrl) {
        skippedUsers += 1;
        continue;
      }
      const result: { updatedProfiles: number; updatedMessages: number } =
        await ctx.runMutation(internal.profile.setImageForUserIdInternal, {
          userId,
          imageUrl,
        });
      syncedUsers += 1;
      updatedProfiles += result.updatedProfiles;
      updatedMessages += result.updatedMessages;
    }

    return {
      totalUsers: userIds.length,
      syncedUsers,
      skippedUsers,
      updatedProfiles,
      updatedMessages,
    };
  },
});

export const syncGroupAvatarsFromClerk = action({
  args: {
    groupId: v.id("groups"),
  },
  handler: async (ctx, args) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) throw new Error("Unauthorized");

    const myRole = await ctx.runQuery(api.groups.getMyRole, {
      groupId: args.groupId,
    });
    if (myRole !== "admin") {
      throw new Error("Only admins can sync group avatars.");
    }

    const members = await ctx.runQuery(api.groups.listMembers, {
      groupId: args.groupId,
    });

    let synced = 0;
    for (const member of members) {
      const imageUrl = await fetchClerkImageUrl(member.userId);
      if (!imageUrl) continue;
      await ctx.runMutation(internal.profile.setImageForUserIdInternal, {
        userId: member.userId,
        imageUrl,
      });
      synced += 1;
    }

    return { synced };
  },
});

export const setActiveGroup = mutation({
  args: { groupId: v.id("groups") },
  handler: async (ctx, args) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) throw new Error("Unauthorized");
    const profiles = await ctx.db
      .query("profiles")
      .withIndex("by_user", (q) => q.eq("userId", identity.subject))
      .collect();
    const profile = pickPrimaryProfile(profiles);
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

    const profiles = await ctx.db
      .query("profiles")
      .withIndex("by_user", (q) => q.eq("userId", identity.subject))
      .collect();
    const profile = pickPrimaryProfile(profiles);
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
      points: SIGNUP_INITIAL_POINTS,
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
