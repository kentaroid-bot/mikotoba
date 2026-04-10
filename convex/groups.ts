import { mutationGeneric as mutation, queryGeneric as query } from "convex/server";
import { v } from "convex/values";
import { internalQuery } from "./_generated/server";

const GROUP_CREATE_COST = 200;
const MAX_GROUP_NAME_LENGTH = 60;
const MAX_GROUP_DESCRIPTION_LENGTH = 500;
const MAX_FACILITATOR_NAME_LENGTH = 20;
const MAX_FACILITATOR_GENDER_LENGTH = 20;
const MAX_FACILITATOR_FIRST_PERSON_LENGTH = 10;
const MAX_FACILITATOR_TONE_LENGTH = 20;
const MAX_FACILITATOR_BIO_LENGTH = 100;

type FacilitatorPreset = "encouraging" | "watcher" | "facilitator" | "disciplined";

const normalizeFacilitatorPreset = (preset: string): FacilitatorPreset => {
  if (
    preset === "encouraging" ||
    preset === "watcher" ||
    preset === "facilitator" ||
    preset === "disciplined"
  ) {
    return preset;
  }
  return "encouraging";
};

const toFacilitatorDefaults = () => ({
  isActive: false,
  displayName: "AIヒーロー",
  preset: "encouraging" as FacilitatorPreset,
  gender: "",
  age: undefined as number | undefined,
  firstPerson: "わたし",
  tone: "バランス",
  customBio: "",
});

const toDisplayGuardianId = (raw: string | undefined | null) => {
  const trimmed = raw?.trim();
  if (!trimmed) return null;
  return trimmed.startsWith("@") ? trimmed : `@${trimmed}`;
};

export const getActive = query({
  args: {},
  handler: async (ctx) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) return null;
    const profile = await ctx.db
      .query("profiles")
      .withIndex("by_user", (q) => q.eq("userId", identity.subject))
      .first();
    if (!profile?.activeGroupId) return null;
    return await ctx.db.get(profile.activeGroupId);
  },
});

export const create = mutation({
  args: { name: v.string() },
  handler: async (ctx, args) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) throw new Error("Unauthorized");
    const profile = await ctx.db
      .query("profiles")
      .withIndex("by_user", (q) => q.eq("userId", identity.subject))
      .first();
    if (!profile) throw new Error("Profile not found");
    if (profile.points < GROUP_CREATE_COST) {
      throw new Error("Not enough points to create a group.");
    }
    const name = args.name.trim();
    if (!name) throw new Error("グループ名を入力してください。");
    if (name.length > MAX_GROUP_NAME_LENGTH) {
      throw new Error(`グループ名は${MAX_GROUP_NAME_LENGTH}文字以内で入力してください。`);
    }

    const now = Date.now();
    const groupId = await ctx.db.insert("groups", {
      name,
      description: "",
      facilitator: toFacilitatorDefaults(),
      createdAt: now,
      createdBy: identity.subject,
    });

    await ctx.db.insert("memberships", {
      groupId,
      userId: identity.subject,
      role: "admin",
      joinedAt: now,
    });

    await ctx.db.patch(profile._id, {
      points: profile.points - GROUP_CREATE_COST,
      activeGroupId: groupId,
    });

    return groupId;
  },
});

export const listMine = query({
  args: {},
  handler: async (ctx) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) return [];
    const memberships = await ctx.db
      .query("memberships")
      .withIndex("by_user", (q) => q.eq("userId", identity.subject))
      .collect();
    const groups = await Promise.all(
      memberships.map((membership) => ctx.db.get(membership.groupId))
    );
    return groups.filter(Boolean);
  },
});

export const listManaged = query({
  args: {},
  handler: async (ctx) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) return [];

    const memberships = await ctx.db
      .query("memberships")
      .withIndex("by_user", (q) => q.eq("userId", identity.subject))
      .filter((q) => q.eq(q.field("role"), "admin"))
      .collect();

    const groups = await Promise.all(
      memberships.map((membership) => ctx.db.get(membership.groupId))
    );
    return groups.filter(Boolean);
  },
});

export const listAllForAutomation = internalQuery({
  args: {},
  handler: async (ctx) => {
    const groups = await ctx.db.query("groups").collect();
    return groups.map((group) => ({
      facilitator: {
        ...toFacilitatorDefaults(),
        ...(group.facilitator ?? {}),
        preset: normalizeFacilitatorPreset(group.facilitator?.preset ?? "encouraging"),
      },
      _id: group._id,
      name: group.name,
      description: group.description ?? "",
    }));
  },
});

export const listAllMemberUserIdsForAutomation = internalQuery({
  args: {},
  handler: async (ctx) => {
    const memberships = await ctx.db.query("memberships").collect();
    return Array.from(new Set(memberships.map((membership) => membership.userId)));
  },
});

export const getCreateCost = query({
  args: {},
  handler: async () => ({ cost: GROUP_CREATE_COST }),
});

export const getMyRole = query({
  args: { groupId: v.id("groups") },
  handler: async (ctx, args) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) return null;
    const membership = await ctx.db
      .query("memberships")
      .withIndex("by_group", (q) => q.eq("groupId", args.groupId))
      .filter((q) => q.eq(q.field("userId"), identity.subject))
      .first();
    return membership?.role ?? null;
  },
});

export const updateName = mutation({
  args: {
    groupId: v.id("groups"),
    name: v.string(),
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
      throw new Error("Only admins can rename groups.");
    }

    const name = args.name.trim();
    if (!name) throw new Error("グループ名を入力してください。");
    if (name.length > MAX_GROUP_NAME_LENGTH) {
      throw new Error(`グループ名は${MAX_GROUP_NAME_LENGTH}文字以内で入力してください。`);
    }

    await ctx.db.patch(args.groupId, { name });
    return args.groupId;
  },
});

export const updateDescription = mutation({
  args: {
    groupId: v.id("groups"),
    description: v.string(),
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
      throw new Error("Only admins can update group descriptions.");
    }

    const description = args.description.trim();
    if (description.length > MAX_GROUP_DESCRIPTION_LENGTH) {
      throw new Error(
        `グループ説明は${MAX_GROUP_DESCRIPTION_LENGTH}文字以内で入力してください。`
      );
    }

    await ctx.db.patch(args.groupId, { description });
    return args.groupId;
  },
});

export const updateFacilitator = mutation({
  args: {
    groupId: v.id("groups"),
    isActive: v.boolean(),
    displayName: v.string(),
    preset: v.union(
      v.literal("encouraging"),
      v.literal("watcher"),
      v.literal("facilitator"),
      v.literal("disciplined")
    ),
    gender: v.optional(v.string()),
    age: v.optional(v.number()),
    firstPerson: v.optional(v.string()),
    tone: v.optional(v.string()),
    customBio: v.optional(v.string()),
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
      throw new Error("Only admins can update facilitator settings.");
    }

    const displayName = args.displayName.trim();
    const gender = (args.gender ?? "").trim();
    const firstPerson = (args.firstPerson ?? "").trim();
    const tone = (args.tone ?? "").trim();
    const customBio = (args.customBio ?? "").trim();

    if (!displayName) {
      throw new Error("AIファシリテーター名を入力してください。");
    }
    if (displayName.length > MAX_FACILITATOR_NAME_LENGTH) {
      throw new Error(
        `AIファシリテーター名は${MAX_FACILITATOR_NAME_LENGTH}文字以内で入力してください。`
      );
    }
    if (gender.length > MAX_FACILITATOR_GENDER_LENGTH) {
      throw new Error(
        `性別は${MAX_FACILITATOR_GENDER_LENGTH}文字以内で入力してください。`
      );
    }
    if (firstPerson.length > MAX_FACILITATOR_FIRST_PERSON_LENGTH) {
      throw new Error(
        `一人称は${MAX_FACILITATOR_FIRST_PERSON_LENGTH}文字以内で入力してください。`
      );
    }
    if (tone.length > MAX_FACILITATOR_TONE_LENGTH) {
      throw new Error(
        `話し方は${MAX_FACILITATOR_TONE_LENGTH}文字以内で入力してください。`
      );
    }
    if (customBio.length > MAX_FACILITATOR_BIO_LENGTH) {
      throw new Error(
        `補足設定は${MAX_FACILITATOR_BIO_LENGTH}文字以内で入力してください。`
      );
    }

    const age =
      typeof args.age === "number" && Number.isFinite(args.age)
        ? Math.floor(args.age)
        : undefined;
    if (age !== undefined && (age < 0 || age > 120)) {
      throw new Error("年齢は0〜120の範囲で入力してください。");
    }

    await ctx.db.patch(args.groupId, {
      facilitator: {
        isActive: args.isActive,
        displayName,
        preset: normalizeFacilitatorPreset(args.preset),
        gender,
        age,
        firstPerson,
        tone,
        customBio,
      },
    });
    return args.groupId;
  },
});

export const listMembers = query({
  args: { groupId: v.id("groups") },
  handler: async (ctx, args) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) return [];

    const me = await ctx.db
      .query("memberships")
      .withIndex("by_group", (q) => q.eq("groupId", args.groupId))
      .filter((q) => q.eq(q.field("userId"), identity.subject))
      .first();
    if (!me) {
      return [];
    }

    const memberships = await ctx.db
      .query("memberships")
      .withIndex("by_group", (q) => q.eq("groupId", args.groupId))
      .collect();

    const members = await Promise.all(
      memberships.map(async (membership) => {
        const profile = await ctx.db
          .query("profiles")
          .withIndex("by_user", (q) => q.eq("userId", membership.userId))
          .first();
        return {
          userId: membership.userId,
          role: membership.role,
          joinedAt: membership.joinedAt,
          name: profile?.name ?? "未設定",
          guardianId: toDisplayGuardianId(profile?.guardianId) ?? "@unknown",
        };
      })
    );

    return members.sort((a, b) => {
      if (a.role !== b.role) return a.role === "admin" ? -1 : 1;
      return a.joinedAt - b.joinedAt;
    });
  },
});

export const transferAdmin = mutation({
  args: {
    groupId: v.id("groups"),
    targetUserId: v.string(),
  },
  handler: async (ctx, args) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) throw new Error("Unauthorized");
    if (identity.subject === args.targetUserId) {
      throw new Error("委譲先に自分自身は指定できません。");
    }

    const actorMembership = await ctx.db
      .query("memberships")
      .withIndex("by_group", (q) => q.eq("groupId", args.groupId))
      .filter((q) => q.eq(q.field("userId"), identity.subject))
      .first();
    if (!actorMembership || actorMembership.role !== "admin") {
      throw new Error("Only admins can transfer admin rights.");
    }

    const targetMembership = await ctx.db
      .query("memberships")
      .withIndex("by_group", (q) => q.eq("groupId", args.groupId))
      .filter((q) => q.eq(q.field("userId"), args.targetUserId))
      .first();
    if (!targetMembership) {
      throw new Error("委譲先ユーザーがグループに参加していません。");
    }
    if (targetMembership.role === "admin") {
      throw new Error("このユーザーはすでに管理者です。");
    }

    await ctx.db.patch(actorMembership._id, { role: "member" });
    await ctx.db.patch(targetMembership._id, { role: "admin" });
    return args.groupId;
  },
});
