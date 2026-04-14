import {
  actionGeneric as action,
  mutationGeneric as mutation,
  queryGeneric as query,
} from "convex/server";
import { v } from "convex/values";
import { api, internal } from "./_generated/api";
import type { Id } from "./_generated/dataModel";
import {
  internalAction,
  internalMutation,
  internalQuery,
  type MutationCtx,
} from "./_generated/server";

const DEFAULT_DAILY_LIMIT = 3;
const SIGNUP_INITIAL_POINTS = 300;
const MAX_IMAGE_URL_LENGTH = 2048;
const MAX_GUARDIAN_ID_LENGTH = 64;
const MIN_GUARDIAN_ID_LENGTH = 3;
const GUARDIAN_ID_PATTERN = /^[a-zA-Z0-9_-]+$/;
const GENERATED_GUARDIAN_PREFIX = "user_";
const GENERATED_GUARDIAN_SUFFIX_LENGTH = 10;
const CLERK_SYNC_MAX_RETRIES = 4;
const EMAIL_BACKFILL_DEFAULT_BATCH_SIZE = 200;
const EMAIL_BACKFILL_MAX_BATCH_SIZE = 500;
const EMAIL_BACKFILL_DEFAULT_MAX_PROFILES = 2000;
const EMAIL_BACKFILL_MAX_PROFILES = 20000;

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

const sanitizeEmail = (raw: string | undefined | null) => {
  const trimmed = raw?.trim();
  if (!trimmed) return undefined;
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

type ClerkUserDetails = {
  primary_email_address_id?: string | null;
  email_addresses?: Array<{
    id?: string | null;
    email_address?: string | null;
  }>;
};

const extractPrimaryEmailFromClerkUser = (data: ClerkUserDetails) => {
  const emails = data.email_addresses ?? [];
  if (data.primary_email_address_id) {
    const primary = emails.find(
      (item) => item.id === data.primary_email_address_id
    );
    const primaryEmail = sanitizeEmail(primary?.email_address);
    if (primaryEmail) return primaryEmail;
  }
  for (const item of emails) {
    const next = sanitizeEmail(item.email_address);
    if (next) return next;
  }
  return undefined;
};

const fetchClerkPrimaryEmail = async (userId: string) => {
  const secretKey = process.env.CLERK_SECRET_KEY;
  if (!secretKey) return undefined;
  const response = await fetch(
    `https://api.clerk.com/v1/users/${encodeURIComponent(userId)}`,
    {
      headers: {
        Authorization: `Bearer ${secretKey}`,
        "Content-Type": "application/json",
      },
    }
  );
  if (!response.ok) {
    return undefined;
  }
  const data = (await response.json()) as ClerkUserDetails;
  return extractPrimaryEmailFromClerkUser(data);
};

const normalizeGuardianId = (raw: string) => raw.trim().replace(/^@/, "");

const isGuardianIdFormatValid = (guardianId: string) => {
  if (!guardianId) return false;
  if (guardianId.length > MAX_GUARDIAN_ID_LENGTH) return false;
  if (guardianId.length < MIN_GUARDIAN_ID_LENGTH) return false;
  if (/\s/.test(guardianId)) return false;
  return GUARDIAN_ID_PATTERN.test(guardianId);
};

const assertGuardianIdFormat = (guardianId: string) => {
  if (!guardianId) {
    throw new Error("Guardian IDを入力してください。");
  }
  if (!isGuardianIdFormatValid(guardianId)) {
    if (guardianId.length > MAX_GUARDIAN_ID_LENGTH) {
      throw new Error(`Guardian IDは${MAX_GUARDIAN_ID_LENGTH}文字以内で入力してください。`);
    }
    if (guardianId.length < MIN_GUARDIAN_ID_LENGTH) {
      throw new Error(`Guardian IDは${MIN_GUARDIAN_ID_LENGTH}文字以上で入力してください。`);
    }
    if (/\s/.test(guardianId)) {
      throw new Error("Guardian IDに空白は使用できません。");
    }
    throw new Error("Guardian IDは英数字・_・-のみ使用できます。");
  }
};

const ensureGuardianIdIsUnique = async (
  ctx: MutationCtx,
  guardianId: string,
  excludeProfileId?: string
) => {
  const existing = await ctx.db
    .query("profiles")
    .withIndex("by_guardian", (q) => q.eq("guardianId", guardianId))
    .first();
  if (existing && existing._id !== excludeProfileId) {
    throw new Error("そのidはすでに使用されています。");
  }
};

const toGeneratedGuardianIdCandidate = () => {
  const random = Math.random()
    .toString(36)
    .replace(/[^a-z0-9]/gi, "")
    .slice(0, GENERATED_GUARDIAN_SUFFIX_LENGTH);
  const suffix = random.padEnd(GENERATED_GUARDIAN_SUFFIX_LENGTH, "0");
  return `${GENERATED_GUARDIAN_PREFIX}${suffix}`;
};

const generateUniqueGuardianId = async (ctx: MutationCtx) => {
  for (let attempt = 0; attempt < 64; attempt += 1) {
    const candidate = toGeneratedGuardianIdCandidate();
    const existing = await ctx.db
      .query("profiles")
      .withIndex("by_guardian", (q) => q.eq("guardianId", candidate))
      .first();
    if (!existing) return candidate;
  }
  throw new Error("Guardian IDの生成に失敗しました。時間をおいて再度お試しください。");
};

const parseClerkErrorMessage = (data: unknown) => {
  if (!data || typeof data !== "object") return "";
  const maybeErrors =
    "errors" in data && Array.isArray((data as { errors?: unknown[] }).errors)
      ? (data as { errors: Array<Record<string, unknown>> }).errors
      : [];
  for (const item of maybeErrors) {
    const longMessage = item.long_message;
    if (typeof longMessage === "string" && longMessage.trim()) {
      return longMessage.trim();
    }
    const message = item.message;
    if (typeof message === "string" && message.trim()) {
      return message.trim();
    }
  }
  return "";
};

class ClerkSyncError extends Error {
  code: "config_missing" | "not_found" | "taken" | "invalid" | "external_failure";
  status?: number;

  constructor(
    code: "config_missing" | "not_found" | "taken" | "invalid" | "external_failure",
    message: string,
    status?: number
  ) {
    super(message);
    this.name = "ClerkSyncError";
    this.code = code;
    this.status = status;
  }
}

const syncClerkUsername = async (userId: string, username: string) => {
  const secretKey = process.env.CLERK_SECRET_KEY;
  if (!secretKey) {
    throw new ClerkSyncError(
      "config_missing",
      "サーバー設定エラー: CLERK_SECRET_KEY が未設定です。"
    );
  }

  const response = await fetch(`https://api.clerk.com/v1/users/${encodeURIComponent(userId)}`, {
    method: "PATCH",
    headers: {
      Authorization: `Bearer ${secretKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ username }),
  });

  if (response.ok) return;

  let detail = "";
  try {
    detail = parseClerkErrorMessage(await response.json());
  } catch {
    detail = "";
  }
  const lower = detail.toLowerCase();
  if (response.status === 404) {
    throw new ClerkSyncError("not_found", `No user was found with id ${userId}`, 404);
  }
  if (response.status === 409 || lower.includes("taken") || lower.includes("already")) {
    throw new ClerkSyncError("taken", "そのidはすでに使用されています。", response.status);
  }
  if (
    lower.includes("username") ||
    lower.includes("invalid") ||
    lower.includes("character") ||
    lower.includes("length")
  ) {
    throw new ClerkSyncError(
      "invalid",
      `Guardian IDの形式が不正です。英数字・_・-の${MIN_GUARDIAN_ID_LENGTH}〜${MAX_GUARDIAN_ID_LENGTH}文字で入力してください。`
    );
  }
  const detailSuffix = detail ? ` (${detail})` : "";
  throw new ClerkSyncError(
    "external_failure",
    `ユーザー名の同期に失敗しました。時間をおいて再度お試しください。[status:${response.status}]${detailSuffix}`,
    response.status
  );
};

const enqueueClerkUsernameSync = async (
  ctx: MutationCtx,
  userId: string,
  guardianId: string
) => {
  await ctx.scheduler.runAfter(0, internal.profile.syncClerkUsernameInternal, {
    userId,
    guardianId,
    attempt: 0,
  });
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
    username: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) throw new Error("Unauthorized");
    const identityImageUrl = sanitizeImageUrl(identity.pictureUrl);
    const clientImageUrl = sanitizeImageUrl(args.imageUrl);
    const pictureUrl = clientImageUrl ?? identityImageUrl;
    let identityEmail = sanitizeEmail(identity.email);

    const existingProfiles = await ctx.db
      .query("profiles")
      .withIndex("by_user", (q) => q.eq("userId", identity.subject))
      .collect();
    const shouldResolveEmailFromClerk =
      !identityEmail &&
      existingProfiles.some((profile) => !sanitizeEmail(profile.email));
    if (shouldResolveEmailFromClerk) {
      identityEmail = await fetchClerkPrimaryEmail(identity.subject);
    }
    if (existingProfiles.length > 0) {
      const existing = pickPrimaryProfile(existingProfiles) ?? existingProfiles[0];
      await Promise.all(
        existingProfiles.map(async (profile) => {
          const nextImage = pictureUrl ?? profile.imageUrl;
          const nextEmail = identityEmail ?? profile.email;
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

    const requestedGuardianId = normalizeGuardianId(args.username ?? "");
    let guardianId = requestedGuardianId;
    if (guardianId) {
      assertGuardianIdFormat(guardianId);
      await ensureGuardianIdIsUnique(ctx, guardianId);
    } else {
      guardianId = await generateUniqueGuardianId(ctx);
    }

    const profileId = await ctx.db.insert("profiles", {
      name: identity.name ?? "未設定",
      classLabel: "3年B組",
      number: 21,
      guardianId,
      userId: identity.subject,
      email: identityEmail,
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

    await enqueueClerkUsernameSync(ctx, identity.subject, guardianId);
    return profileId;
  },
});

export const listProfilesForEmailBackfillInternal = internalQuery({
  args: {
    cursor: v.union(v.string(), v.null()),
    batchSize: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const rawBatchSize = Math.floor(args.batchSize ?? EMAIL_BACKFILL_DEFAULT_BATCH_SIZE);
    const batchSize = Math.min(EMAIL_BACKFILL_MAX_BATCH_SIZE, Math.max(1, rawBatchSize));
    const page = await ctx.db.query("profiles").paginate({
      cursor: args.cursor,
      numItems: batchSize,
    });
    return {
      page: page.page.map((profile) => ({
        _id: profile._id,
        userId: profile.userId,
        email: profile.email,
      })),
      continueCursor: page.continueCursor,
      isDone: page.isDone,
    };
  },
});

export const setEmailForProfileIdInternal = internalMutation({
  args: {
    profileId: v.id("profiles"),
    email: v.string(),
  },
  handler: async (ctx, args) => {
    const email = sanitizeEmail(args.email);
    if (!email) return { updated: false };
    const profile = await ctx.db.get(args.profileId);
    if (!profile) return { updated: false };
    if (sanitizeEmail(profile.email)) return { updated: false };
    await ctx.db.patch(args.profileId, { email });
    return { updated: true };
  },
});

export const backfillMissingEmailsFromClerkInternal: ReturnType<typeof internalAction> =
  internalAction({
    args: {
      batchSize: v.optional(v.number()),
      maxProfiles: v.optional(v.number()),
    },
    handler: async (ctx, args) => {
      const requestedMaxProfiles = Math.floor(
        args.maxProfiles ?? EMAIL_BACKFILL_DEFAULT_MAX_PROFILES
      );
      const maxProfiles = Math.min(
        EMAIL_BACKFILL_MAX_PROFILES,
        Math.max(1, requestedMaxProfiles)
      );
      const rawBatchSize = Math.floor(args.batchSize ?? EMAIL_BACKFILL_DEFAULT_BATCH_SIZE);
      const batchSize = Math.min(EMAIL_BACKFILL_MAX_BATCH_SIZE, Math.max(1, rawBatchSize));

      let cursor: string | null = null;
      let processed = 0;
      let updated = 0;
      let skippedHasEmail = 0;
      let skippedMissingUserId = 0;
      let skippedNoEmailInClerk = 0;
      let clerkLookupFailed = 0;

      while (processed < maxProfiles) {
        const pageResult: {
          page: Array<{ _id: Id<"profiles">; userId?: string; email?: string }>;
          continueCursor: string;
          isDone: boolean;
        } = await ctx.runQuery(internal.profile.listProfilesForEmailBackfillInternal, {
          cursor,
          batchSize,
        });

        if (pageResult.page.length === 0) break;
        for (const profile of pageResult.page) {
          if (processed >= maxProfiles) break;
          processed += 1;

          if (sanitizeEmail(profile.email)) {
            skippedHasEmail += 1;
            continue;
          }
          if (!profile.userId) {
            skippedMissingUserId += 1;
            continue;
          }

          let emailFromClerk: string | undefined;
          try {
            emailFromClerk = await fetchClerkPrimaryEmail(profile.userId);
          } catch {
            clerkLookupFailed += 1;
            continue;
          }

          if (!emailFromClerk) {
            skippedNoEmailInClerk += 1;
            continue;
          }

          const result: { updated: boolean } = await ctx.runMutation(
            internal.profile.setEmailForProfileIdInternal,
            {
              profileId: profile._id,
              email: emailFromClerk,
            }
          );
          if (result.updated) {
            updated += 1;
          }
        }

        if (pageResult.isDone) break;
        cursor = pageResult.continueCursor;
      }

      return {
        processed,
        updated,
        skippedHasEmail,
        skippedMissingUserId,
        skippedNoEmailInClerk,
        clerkLookupFailed,
        reachedMaxProfiles: processed >= maxProfiles,
      };
    },
  });

export const syncClerkUsernameInternal: ReturnType<typeof internalAction> = internalAction({
  args: {
    userId: v.string(),
    guardianId: v.string(),
    attempt: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const attempt = Math.max(0, Math.floor(args.attempt ?? 0));
    try {
      await syncClerkUsername(args.userId, args.guardianId);
      return { synced: true, attempt };
    } catch (error) {
      const clerkError =
        error instanceof ClerkSyncError
          ? error
          : new ClerkSyncError(
              "external_failure",
              error instanceof Error ? error.message : "unknown_error"
            );

      if (clerkError.code === "external_failure" && attempt < CLERK_SYNC_MAX_RETRIES) {
        const delayMs = Math.min(60_000, 1_000 * 2 ** attempt);
        await ctx.scheduler.runAfter(delayMs, internal.profile.syncClerkUsernameInternal, {
          userId: args.userId,
          guardianId: args.guardianId,
          attempt: attempt + 1,
        });
        return {
          synced: false,
          attempt,
          retryScheduled: true,
          code: clerkError.code,
          message: clerkError.message,
        };
      }

      console.error("syncClerkUsernameInternal failed", {
        userId: args.userId,
        guardianId: args.guardianId,
        attempt,
        code: clerkError.code,
        status: clerkError.status,
        message: clerkError.message,
      });
      return {
        synced: false,
        attempt,
        retryScheduled: false,
        code: clerkError.code,
        message: clerkError.message,
      };
    }
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
    const guardianId = normalizeGuardianId(args.guardianId);
    const motto = args.motto.trim();

    if (!name) throw new Error("名前を入力してください。");
    if (name.length > 40) throw new Error("名前は40文字以内で入力してください。");

    if (!classLabel) throw new Error("所属を入力してください。");
    if (classLabel.length > 40)
      throw new Error("所属は40文字以内で入力してください。");

    assertGuardianIdFormat(guardianId);
    await ensureGuardianIdIsUnique(ctx, guardianId, profile._id);

    if (!motto) throw new Error("メッセージを入力してください。");
    if (motto.length > 200)
      throw new Error("メッセージは200文字以内で入力してください。");

    await ctx.db.patch(profile._id, {
      name,
      classLabel,
      guardianId,
      motto,
    });

    if (guardianId !== profile.guardianId) {
      await enqueueClerkUsernameSync(ctx, identity.subject, guardianId);
    }
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

export const stripGuardianIdLeadingAtBatchInternal = internalMutation({
  args: {
    cursor: v.union(v.string(), v.null()),
    batchSize: v.optional(v.number()),
    syncAll: v.optional(v.boolean()),
  },
  handler: async (ctx, args) => {
    const rawBatchSize = Math.floor(args.batchSize ?? 200);
    const batchSize = Math.min(500, Math.max(1, rawBatchSize));
    const page = await ctx.db.query("profiles").paginate({
      cursor: args.cursor,
      numItems: batchSize,
    });

    let updated = 0;
    const syncCandidates: Array<{
      profileId: Id<"profiles">;
      userId: string;
      guardianId: string;
    }> = [];
    for (const profile of page.page) {
      const hasLeadingAt = profile.guardianId.startsWith("@");
      const rawGuardianId = hasLeadingAt
        ? profile.guardianId.slice(1)
        : profile.guardianId;
      let nextGuardianId = rawGuardianId;
      const isFormatValid = isGuardianIdFormatValid(rawGuardianId);
      const hasDuplicate = isFormatValid
        ? (
            await ctx.db
              .query("profiles")
              .withIndex("by_guardian", (q) => q.eq("guardianId", rawGuardianId))
              .collect()
          ).some((existing) => existing._id !== profile._id)
        : true;

      if (!isFormatValid || hasDuplicate) {
        nextGuardianId = await generateUniqueGuardianId(ctx);
      }

      if (nextGuardianId !== profile.guardianId) {
        await ctx.db.patch(profile._id, {
          guardianId: nextGuardianId,
        });
        updated += 1;
      }
      if (
        profile.userId &&
        nextGuardianId &&
        (nextGuardianId !== profile.guardianId || args.syncAll)
      ) {
        syncCandidates.push({
          profileId: profile._id,
          userId: profile.userId,
          guardianId: nextGuardianId,
        });
      }
    }

    return {
      scanned: page.page.length,
      updated,
      isDone: page.isDone,
      continueCursor: page.continueCursor,
      syncCandidates,
    };
  },
});

export const forceAssignGeneratedGuardianIdInternal = internalMutation({
  args: {
    profileId: v.id("profiles"),
  },
  handler: async (ctx, args) => {
    const profile = await ctx.db.get(args.profileId);
    if (!profile) throw new Error("Profile not found");

    const guardianId = await generateUniqueGuardianId(ctx);
    await ctx.db.patch(args.profileId, {
      guardianId,
    });

    return {
      userId: profile.userId ?? null,
      guardianId,
    };
  },
});

export const runGuardianIdLeadingAtCleanupInternal: ReturnType<typeof internalAction> =
  internalAction({
    args: {
      batchSize: v.optional(v.number()),
      syncAll: v.optional(v.boolean()),
    },
    handler: async (ctx, args) => {
      let cursor: string | null = null;
      let scanned = 0;
      let updated = 0;
      let syncedToClerk = 0;
      let clerkSyncErrors = 0;
      let fallbackReassigned = 0;
      const failedSyncs: Array<{
        userId: string;
        guardianId: string;
        reason: string;
      }> = [];

      while (true) {
        const batch: {
          scanned: number;
          updated: number;
          isDone: boolean;
          continueCursor: string;
          syncCandidates: Array<{
            profileId: Id<"profiles">;
            userId: string;
            guardianId: string;
          }>;
        } = await ctx.runMutation(internal.profile.stripGuardianIdLeadingAtBatchInternal, {
          cursor,
          batchSize: args.batchSize,
          syncAll: args.syncAll,
        });

        scanned += batch.scanned;
        updated += batch.updated;

        for (const candidate of batch.syncCandidates) {
          try {
            assertGuardianIdFormat(candidate.guardianId);
            await syncClerkUsername(candidate.userId, candidate.guardianId);
            syncedToClerk += 1;
          } catch (error) {
            const clerkError =
              error instanceof ClerkSyncError
                ? error
                : new ClerkSyncError(
                    "external_failure",
                    error instanceof Error ? error.message : "unknown_error"
                  );
            if (clerkError.code === "not_found") {
              clerkSyncErrors += 1;
              if (failedSyncs.length < 20) {
                failedSyncs.push({
                  userId: candidate.userId,
                  guardianId: candidate.guardianId,
                  reason: clerkError.message,
                });
              }
              continue;
            }
            try {
              const fallback: {
                userId: string | null;
                guardianId: string;
              } = await ctx.runMutation(internal.profile.forceAssignGeneratedGuardianIdInternal, {
                profileId: candidate.profileId,
              });

              if (fallback.userId) {
                await syncClerkUsername(fallback.userId, fallback.guardianId);
                syncedToClerk += 1;
                fallbackReassigned += 1;
                continue;
              }
            } catch (fallbackError) {
              clerkSyncErrors += 1;
              if (failedSyncs.length < 20) {
                failedSyncs.push({
                  userId: candidate.userId,
                  guardianId: candidate.guardianId,
                  reason:
                    fallbackError instanceof Error && fallbackError.message
                      ? fallbackError.message
                      : "fallback_sync_failed",
                });
              }
              continue;
            }

            clerkSyncErrors += 1;
            if (failedSyncs.length < 20) {
              failedSyncs.push({
                userId: candidate.userId,
                guardianId: candidate.guardianId,
                reason: clerkError.message,
              });
            }
          }
        }

        if (batch.isDone) break;
        cursor = batch.continueCursor;
      }

      return {
        scanned,
        updated,
        syncedToClerk,
        clerkSyncErrors,
        fallbackReassigned,
        failedSyncs,
      };
    },
  });
