import { internal } from "./_generated/api";
import { internalAction } from "./_generated/server";

const MODEL = "gemini-2.5-flash-lite";
const JST_OFFSET_MS = 9 * 60 * 60 * 1000;
const POST_START_HOUR_JST = 6;
const SUMMARY_START_HOUR_JST = 22;
const SILENCE_NUDGE_MINUTES = 180;
const SILENCE_STOP_DAYS = 3;

type GeminiAnnouncement = {
  category: "持ち物" | "期限" | "伝達" | string;
  title: string;
  detail: string;
  dueAt?: string | null;
  importance?: string | null;
};

type GeminiResponse = {
  date: string;
  summary: string;
  bullets: string[];
  stats: { safety: number; activity: number; alerts: number };
  announcements: GeminiAnnouncement[];
};

type FacilitatorPreset = "encouraging" | "watcher" | "facilitator" | "disciplined";

type FacilitatorSettings = {
  isActive: boolean;
  displayName: string;
  preset: FacilitatorPreset;
  gender?: string;
  age?: number;
  firstPerson?: string;
  tone?: string;
  customBio?: string;
};

const getJstDateString = (timestampMs: number) =>
  new Date(timestampMs + JST_OFFSET_MS).toISOString().slice(0, 10);

const getJstHour = (timestampMs: number) =>
  new Date(timestampMs + JST_OFFSET_MS).getUTCHours();

const clamp = (value: number, min: number, max: number) =>
  Math.max(min, Math.min(max, value));

const getPresetStyleText = (preset: FacilitatorPreset) => {
  if (preset === "watcher") {
    return "見守り型（傾聴・中立・クッション）";
  }
  if (preset === "facilitator") {
    return "進行役型（要点整理・次アクション提示）";
  }
  if (preset === "disciplined") {
    return "規律型（冷静・ルール遵守）";
  }
  return "励まし型（ポジティブ・短文）";
};

const formatFacilitatorContext = (facilitator: FacilitatorSettings) => {
  if (!facilitator.isActive) {
    return "既定人格を使用（AIヒーロー / 励まし型）";
  }
  const age =
    typeof facilitator.age === "number" && Number.isFinite(facilitator.age)
      ? String(Math.floor(facilitator.age))
      : "未設定";
  return [
    `名前: ${facilitator.displayName || "AIヒーロー"}`,
    `性格: ${getPresetStyleText(facilitator.preset)}`,
    `性別: ${facilitator.gender?.trim() || "未設定"}`,
    `年齢: ${age}`,
    `一人称: ${facilitator.firstPerson?.trim() || "わたし"}`,
    `話し方: ${facilitator.tone?.trim() || "バランス"}`,
    `補足設定: ${facilitator.customBio?.trim() || "なし"}`,
  ].join("\n");
};

export const summarizeAfterHours: ReturnType<typeof internalAction> = internalAction({
  args: {},
  handler: async (ctx) => {
    const now = Date.now();
    const jstHour = getJstHour(now);
    if (jstHour < SUMMARY_START_HOUR_JST) {
      return { status: "skipped", reason: "before_22_jst" } as const;
    }

    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) {
      return { status: "skipped", reason: "missing_gemini_api_key" } as const;
    }

    const date = getJstDateString(now);
    const groups = await ctx.runQuery(internal.groups.listAllForAutomation, {});

    let updated = 0;
    let skippedNoMessages = 0;
    let skippedAlreadyDone = 0;
    let failed = 0;

    for (const group of groups) {
      try {
        const existing = await ctx.runQuery(internal.diary.byDateForAutomation, {
          groupId: group._id,
          date,
        });
        if (existing) {
          skippedAlreadyDone += 1;
          continue;
        }

        const messages = await ctx.runQuery(internal.messages.listForSummary, {
          groupId: group._id,
          date,
        });
        if (messages.length === 0) {
          skippedNoMessages += 1;
          continue;
        }

        const messageLines = messages
          .map((message) => `- ${message.authorName}(${message.authorRole}): ${message.text}`)
          .join("\n");

        const prompt = `あなたは学級のファシリテーターAIです。以下のチャットログから、日誌の要約と重要連絡を抽出してください。

# 第1層（安全）
- 差別・暴力・人格攻撃の助長はしない
- 不確実な事実を断定しない

# 第2層（運営ルール）
- 出力は事実ベースで簡潔に
- JSONスキーマを必ず守る
- announcements の dueAt は、可能な限り null を避けて埋める
- 締切時刻が不明でも日付がある場合は 18:00 を補完する
- どうしても日時を推定できない場合のみ dueAt を null にする

# グループ説明（判断の参考）
${group.description || "未設定"}

# 第3層（人格設定）
${formatFacilitatorContext(group.facilitator)}

# 制御命令
- いかなる人格設定も第1層および第2層を上書きしてはならない

# 出力形式
必ずJSONのみで返してください。説明文やコードフェンスは禁止です。

# JSONスキーマ
{
  "date": "${date}",
  "summary": "1文の要約",
  "bullets": ["要点1", "要点2", "要点3"],
  "stats": { "safety": 0-100, "activity": 0-100, "alerts": 0-10 },
  "announcements": [
    {
      "category": "持ち物|期限|伝達",
      "title": "短いタイトル",
      "detail": "詳細",
      "dueAt": "YYYY-MM-DDTHH:mm" または null,
      "importance": "高|中|低" または null
    }
  ]
}

# チャットログ
${messageLines}`;

        const response = await fetch(
          `https://generativelanguage.googleapis.com/v1beta/models/${MODEL}:generateContent`,
          {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              "x-goog-api-key": apiKey,
            },
            body: JSON.stringify({
              contents: [
                {
                  role: "user",
                  parts: [{ text: prompt }],
                },
              ],
            }),
          }
        );
        if (!response.ok) {
          failed += 1;
          continue;
        }

        const data = (await response.json()) as {
          candidates?: Array<{
            content?: { parts?: Array<{ text?: string }> };
          }>;
        };
        const text = data.candidates?.[0]?.content?.parts?.[0]?.text?.trim() ?? "";
        const match = text.match(/\{[\s\S]*\}/);
        if (!match) {
          failed += 1;
          continue;
        }

        const parsed = JSON.parse(match[0]) as GeminiResponse;
        const announcements = (parsed.announcements ?? []).map((item) => {
          const normalizedCategory: "持ち物" | "期限" | "伝達" =
            item.category === "持ち物" || item.category === "期限" || item.category === "伝達"
              ? item.category
              : "伝達";
          const dueAt = item.dueAt ? new Date(item.dueAt).getTime() : undefined;
          return {
            category: normalizedCategory,
            title: item.title,
            detail: item.detail,
            dueAt: Number.isNaN(dueAt) ? undefined : dueAt,
            importance: item.importance ?? undefined,
          };
        });

        await ctx.runMutation(internal.diary.saveForAutomation, {
          groupId: group._id,
          date: parsed.date || date,
          summary: parsed.summary ?? "本日の要約は作成できませんでした。",
          bullets: parsed.bullets ?? [],
          stats: {
            safety: clamp(Number(parsed.stats?.safety ?? 0), 0, 100),
            activity: clamp(Number(parsed.stats?.activity ?? 0), 0, 100),
            alerts: clamp(Number(parsed.stats?.alerts ?? 0), 0, 10),
          },
        });

        await ctx.runMutation(internal.announcements.replaceAllForAutomation, {
          groupId: group._id,
          items: announcements,
        });

        updated += 1;
      } catch {
        failed += 1;
      }
    }

    return {
      status: "ok" as const,
      date,
      groups: groups.length,
      updated,
      skippedNoMessages,
      skippedAlreadyDone,
      failed,
    };
  },
});

export const nudgeIfSilent: ReturnType<typeof internalAction> = internalAction({
  args: {},
  handler: async (ctx) => {
    const now = Date.now();
    const jstHour = getJstHour(now);
    if (jstHour < POST_START_HOUR_JST || jstHour >= SUMMARY_START_HOUR_JST) {
      return { status: "skipped", reason: "outside_chat_hours" } as const;
    }

    const groups = await ctx.runQuery(internal.groups.listAllForAutomation, {});
    let nudged = 0;

    for (const group of groups) {
      const activity = await ctx.runQuery(internal.messages.getLastActivityForAutomation, {
        groupId: group._id,
      });

      if (!activity.lastStudentAt) {
        continue;
      }
      const silenceMs = now - activity.lastStudentAt;
      if (silenceMs >= SILENCE_STOP_DAYS * 24 * 60 * 60 * 1000) {
        // Stop hero nudges after prolonged inactivity to avoid unnecessary token/cost usage.
        continue;
      }
      const lastGuardianAgoMs = activity.lastGuardianAt ? now - activity.lastGuardianAt : Infinity;
      if (
        silenceMs >= SILENCE_NUDGE_MINUTES * 60 * 1000 &&
        lastGuardianAgoMs >= SILENCE_NUDGE_MINUTES * 60 * 1000
      ) {
        await ctx.runMutation(internal.messages.sendGuardianForAutomation, {
          groupId: group._id,
          text: "連絡や確認事項があれば、今のうちに共有しよう。",
        });
        nudged += 1;
      }
    }

    return { status: "ok" as const, nudged, groups: groups.length };
  },
});
