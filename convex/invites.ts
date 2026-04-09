import { mutationGeneric as mutation, queryGeneric as query } from "convex/server";
import { v } from "convex/values";

const INVITE_TTL_DAYS = 7;
const DEFAULT_MAX_USES = 5;
const MIN_MAX_USES = 1;
const MAX_MAX_USES = 100;

const getExpiry = () => Date.now() + INVITE_TTL_DAYS * 24 * 60 * 60 * 1000;

export const create = mutation({
  args: { groupId: v.id("groups"), maxUses: v.optional(v.number()) },
  handler: async (ctx, args) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) throw new Error("Unauthorized");

    const membership = await ctx.db
      .query("memberships")
      .withIndex("by_group", (q) => q.eq("groupId", args.groupId))
      .filter((q) => q.eq(q.field("userId"), identity.subject))
      .first();
    if (!membership || membership.role !== "admin") {
      throw new Error("Only admins can create invites.");
    }

    const maxUses = Math.floor(args.maxUses ?? DEFAULT_MAX_USES);
    if (maxUses < MIN_MAX_USES || maxUses > MAX_MAX_USES) {
      throw new Error(
        `maxUses must be between ${MIN_MAX_USES} and ${MAX_MAX_USES}.`
      );
    }

    const token = crypto.randomUUID();
    const inviteId = await ctx.db.insert("invites", {
      groupId: args.groupId,
      token,
      createdBy: identity.subject,
      createdAt: Date.now(),
      expiresAt: getExpiry(),
      maxUses,
      usedCount: 0,
    });

    return { inviteId, token };
  },
});

export const getByToken = query({
  args: { token: v.string() },
  handler: async (ctx, args) => {
    const invite = await ctx.db
      .query("invites")
      .withIndex("by_token", (q) => q.eq("token", args.token))
      .first();
    if (!invite) return null;
    const group = await ctx.db.get(invite.groupId);
    return { invite, group };
  },
});

export const join = mutation({
  args: { token: v.string() },
  handler: async (ctx, args) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) throw new Error("Unauthorized");

    const invite = await ctx.db
      .query("invites")
      .withIndex("by_token", (q) => q.eq("token", args.token))
      .first();
    if (!invite) throw new Error("Invite not found");
    if (invite.expiresAt < Date.now()) throw new Error("Invite expired");
    if (invite.usedCount >= invite.maxUses) throw new Error("Invite already used");

    const existing = await ctx.db
      .query("memberships")
      .withIndex("by_group", (q) => q.eq("groupId", invite.groupId))
      .filter((q) => q.eq(q.field("userId"), identity.subject))
      .first();

    let didJoin = false;
    if (!existing) {
      await ctx.db.insert("memberships", {
        groupId: invite.groupId,
        userId: identity.subject,
        role: "member",
        joinedAt: Date.now(),
      });
      didJoin = true;
    }

    const profile = await ctx.db
      .query("profiles")
      .withIndex("by_user", (q) => q.eq("userId", identity.subject))
      .first();
    if (profile) {
      await ctx.db.patch(profile._id, { activeGroupId: invite.groupId });
    }

    if (didJoin) {
      await ctx.db.patch(invite._id, {
        usedCount: invite.usedCount + 1,
      });
    }

    return { groupId: invite.groupId };
  },
});
