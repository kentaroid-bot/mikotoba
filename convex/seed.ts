import { mutationGeneric as mutation } from "convex/server";

export const demo = mutation({
  args: {},
  handler: async (ctx) => {
    const existing = await ctx.db.query("messages").first();
    if (existing) {
      return "already-seeded" as const;
    }

    const now = Date.now();
    const expiresAt = now + 24 * 60 * 60 * 1000;

    await ctx.db.insert("messages", {
      text: "これからの学習計画について、もっと具体的に目標を立てるべきだと感じています。特に苦手な分野に時間を割きたいです。",
      authorName: "A君",
      authorRole: "student",
      createdAt: now - 1000 * 60 * 12,
      expiresAt,
    });

    await ctx.db.insert("messages", {
      text: "それは素晴らしい意見だな！よし、徳を授けよう！",
      authorName: "AIルフィ",
      authorRole: "guardian",
      createdAt: now - 1000 * 60 * 10,
      expiresAt,
      pointsAwarded: 10,
    });

    await ctx.db.insert("messages", {
      text: "明日の英語の小テスト、範囲ってどこでしたっけ？",
      authorName: "ミナ",
      authorRole: "student",
      createdAt: now - 1000 * 60 * 5,
      expiresAt,
    });

    const announcementBase = now - 1000 * 60 * 60;
    await ctx.db.insert("announcements", {
      category: "持ち物",
      title: "明日の英語小テスト",
      detail: "英語ノート / 単語帳 / 赤シート",
      dueAt: announcementBase + 1000 * 60 * 60 * 18,
      createdAt: announcementBase,
    });

    await ctx.db.insert("announcements", {
      category: "期限",
      title: "数学プリント提出",
      detail: "教科書 p.42-45 を記入",
      dueAt: announcementBase + 1000 * 60 * 60 * 30,
      createdAt: announcementBase,
    });

    await ctx.db.insert("announcements", {
      category: "伝達",
      title: "体育館集合",
      detail: "明日の集会は 8:30 までに集合",
      importance: "高",
      createdAt: announcementBase,
    });

    await ctx.db.insert("diaries", {
      date: "2026-04-04",
      summary: "クラスの空気は落ち着いていて、前向きな議論が中心でした。",
      bullets: [
        "英語の小テストの範囲確認が多く、学習計画を共有する投稿が目立ちました。AIルフィは、具体的な目標の提案に徳ポイントを付与。",
        "明日の集会についての連絡を複数の生徒が共有。未読への配慮として、短い要点の投稿が推奨されました。",
        "感謝の言葉が多く、クラス内の心理的安全性が保たれていると判断されました。",
      ],
      stats: { safety: 92, activity: 78, alerts: 2 },
      createdAt: now - 1000 * 60 * 60 * 4,
    });

    return "seeded" as const;
  },
});
