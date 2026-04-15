import { defineSchema, defineTable } from "convex/server";
import { v } from "convex/values";

export default defineSchema({
  messages: defineTable({
    text: v.string(),
    authorName: v.string(),
    authorUserId: v.optional(v.string()),
    authorImageUrl: v.optional(v.string()),
    authorRole: v.union(v.literal("student"), v.literal("guardian")),
    createdAt: v.number(),
    expiresAt: v.number(),
    pointsAwarded: v.optional(v.number()),
    heroProcessed: v.optional(v.boolean()),
    groupId: v.optional(v.id("groups")),
  }).index("by_createdAt", ["createdAt"]).index("by_group_createdAt", ["groupId", "createdAt"]),
  guardianLikes: defineTable({
    messageId: v.id("messages"),
    groupId: v.id("groups"),
    userId: v.string(),
    createdAt: v.number(),
  })
    .index("by_message", ["messageId"])
    .index("by_user_message", ["userId", "messageId"])
    .index("by_user_group_createdAt", ["userId", "groupId", "createdAt"]),
  announcements: defineTable({
    category: v.union(v.literal("持ち物"), v.literal("期限"), v.literal("伝達")),
    title: v.string(),
    detail: v.string(),
    dueAt: v.optional(v.number()),
    importance: v.optional(v.string()),
    createdAt: v.number(),
    groupId: v.optional(v.id("groups")),
  }).index("by_createdAt", ["createdAt"]).index("by_group_createdAt", ["groupId", "createdAt"]),
  taskCompletions: defineTable({
    groupId: v.id("groups"),
    announcementId: v.id("announcements"),
    userId: v.string(),
    reportText: v.string(),
    messageId: v.id("messages"),
    pointsAwarded: v.number(),
    createdAt: v.number(),
  })
    .index("by_announcement_user", ["announcementId", "userId"])
    .index("by_group_createdAt", ["groupId", "createdAt"])
    .index("by_user_group_createdAt", ["userId", "groupId", "createdAt"]),
  diaries: defineTable({
    date: v.string(),
    summary: v.string(),
    bullets: v.array(v.string()),
    stats: v.object({
      safety: v.number(),
      activity: v.number(),
      alerts: v.number(),
    }),
    createdAt: v.number(),
    groupId: v.optional(v.id("groups")),
  }).index("by_date", ["date"]).index("by_group_date", ["groupId", "date"]),
  profiles: defineTable({
    name: v.string(),
    classLabel: v.string(),
    number: v.number(),
    guardianId: v.string(),
    userId: v.optional(v.string()),
    email: v.optional(v.string()),
    imageUrl: v.optional(v.string()),
    points: v.number(),
    signupBonusGrantedAt: v.optional(v.number()),
    dailyPosts: v.number(),
    dailyLimit: v.number(),
    lastPostDate: v.optional(v.string()),
    activeGroupId: v.optional(v.id("groups")),
    weeklyStats: v.object({
      positive: v.number(),
      announcements: v.number(),
      aiFollows: v.number(),
    }),
    lastWeeklyResetDate: v.optional(v.string()),
    motto: v.string(),
  }).index("by_guardian", ["guardianId"]).index("by_user", ["userId"]),
  settings: defineTable({
    groupId: v.optional(v.id("groups")),
    dailyPostLimit: v.number(),
    announcementDefaultDueDays: v.optional(v.number()),
    updatedAt: v.number(),
  })
    .index("by_createdAt", ["updatedAt"])
    .index("by_group_updatedAt", ["groupId", "updatedAt"]),
  dailyPostUsage: defineTable({
    userId: v.string(),
    groupId: v.id("groups"),
    date: v.string(),
    count: v.number(),
    updatedAt: v.number(),
  })
    .index("by_user_group_date", ["userId", "groupId", "date"])
    .index("by_group_date", ["groupId", "date"]),
  groups: defineTable({
    name: v.string(),
    description: v.optional(v.string()),
    facilitator: v.optional(
      v.object({
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
      })
    ),
    createdAt: v.number(),
    createdBy: v.string(),
  }).index("by_createdAt", ["createdAt"]),
  memberships: defineTable({
    groupId: v.id("groups"),
    userId: v.string(),
    role: v.union(v.literal("admin"), v.literal("member")),
    joinedAt: v.number(),
  }).index("by_group", ["groupId"]).index("by_user", ["userId"]),
  invites: defineTable({
    groupId: v.id("groups"),
    token: v.string(),
    createdBy: v.string(),
    createdAt: v.number(),
    expiresAt: v.number(),
    maxUses: v.number(),
    usedCount: v.number(),
  }).index("by_token", ["token"]).index("by_group", ["groupId"]),
  uiStrings: defineTable({
    page: v.string(),
    key: v.string(),
    locale: v.string(),
    text: v.string(),
    updatedAt: v.number(),
  })
    .index("by_page_locale", ["page", "locale"])
    .index("by_page_key_locale", ["page", "key", "locale"]),
});
