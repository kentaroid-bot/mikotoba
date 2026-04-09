import { auth } from "@clerk/nextjs/server";
import { NextResponse } from "next/server";

type IncomingMessage = {
  text: string;
  groupDescription?: string;
  preference?: {
    likedCount?: number;
    likedSamples?: string[];
  };
  facilitator?: {
    isActive?: boolean;
    displayName?: string;
    preset?: "encouraging" | "watcher" | "facilitator" | "disciplined";
    gender?: string;
    age?: number;
    firstPerson?: string;
    tone?: string;
    customBio?: string;
  };
};
type FacilitatorPreset = "encouraging" | "watcher" | "facilitator" | "disciplined";

type Sentiment = "positive" | "neutral" | "negative" | "spam";

type HeroResponse = {
  sentiment: Sentiment | string;
  isAnnouncement: boolean;
  announcementText: string;
  bugyoResponse: string;
  points?: number;
};

const MODEL = "gemini-2.5-flash-lite";
type InputLanguage = "ja" | "en" | "zh" | "hi";

const detectInputLanguage = (text: string): InputLanguage => {
  const devanagariCount = (text.match(/[\u0900-\u097F]/g) ?? []).length;
  if (devanagariCount > 0) return "hi";

  const kanaCount = (text.match(/[\u3040-\u30FF]/g) ?? []).length;
  if (kanaCount > 0) return "ja";

  const cjkCount = (text.match(/[\u4E00-\u9FFF]/g) ?? []).length;
  if (cjkCount > 0) return "zh";

  const latinCount = (text.match(/[A-Za-z]/g) ?? []).length;
  if (latinCount > 0) return "en";

  return "ja";
};

const languageLabel = (lang: InputLanguage) => {
  if (lang === "en") return "英語";
  if (lang === "zh") return "中国語";
  if (lang === "hi") return "ヒンディー語";
  return "日本語";
};

const getPresetStyleText = (preset: FacilitatorPreset) => {
  if (preset === "watcher") {
    return "見守り型: 傾聴・中立・クッション役を重視する";
  }
  if (preset === "facilitator") {
    return "進行役型: 要点整理・次アクション提示を重視する";
  }
  if (preset === "disciplined") {
    return "規律型: 冷静にルール遵守を促す";
  }
  return "励まし型: 前向きで短い励ましを中心にする";
};

export async function POST(request: Request) {
  const { userId } = await auth();
  if (!userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    return NextResponse.json(
      { error: "GEMINI_API_KEY is not set" },
      { status: 500 }
    );
  }

  const body = (await request.json()) as IncomingMessage;
  const text = body.text.trim();
  const inputLanguage = detectInputLanguage(text);
  const groupDescription = body.groupDescription?.trim() ?? "";
  const facilitator = body.facilitator;
  const facilitatorIsActive = Boolean(facilitator?.isActive);
  const facilitatorName = (facilitator?.displayName ?? "").trim() || "AIヒーロー";
  const facilitatorPreset = facilitator?.preset ?? "encouraging";
  const facilitatorGender = (facilitator?.gender ?? "").trim() || "未設定";
  const facilitatorAge =
    typeof facilitator?.age === "number" && Number.isFinite(facilitator.age)
      ? String(Math.floor(facilitator.age))
      : "未設定";
  const facilitatorFirstPerson = (facilitator?.firstPerson ?? "").trim() || "わたし";
  const facilitatorTone = (facilitator?.tone ?? "").trim() || "バランス";
  const facilitatorBio = (facilitator?.customBio ?? "").trim() || "なし";
  const likedCount = Math.max(
    0,
    Math.floor(Number(body.preference?.likedCount ?? 0))
  );
  const likedSamples = (body.preference?.likedSamples ?? [])
    .map((sample) => String(sample).trim().slice(0, 100))
    .filter((sample) => sample.length > 0)
    .slice(0, 5);
  const preferenceBlock =
    likedSamples.length > 0
      ? `# 学習メモ（このユーザーのハート履歴）
- 累計ハート数: ${likedCount}
- 好まれたAI発言例:
${likedSamples.map((sample, index) => `${index + 1}. ${sample}`).join("\n")}
- 上記の言い回し・温度感を参考にしてよいが、第1層/第2層を必ず優先する`
      : `# 学習メモ（このユーザーのハート履歴）
- まだ履歴はありません`;
  const hourJst = new Date(Date.now() + 9 * 60 * 60 * 1000).getUTCHours();
  const timeContext =
    hourJst < 11 ? "朝" : hourJst < 17 ? "昼" : hourJst < 22 ? "夕方" : "夜";

  const personaBlock = facilitatorIsActive
    ? `# 第3層（人格設定）
- 名前: ${facilitatorName}
- 性格: ${getPresetStyleText(facilitatorPreset)}
- 性別: ${facilitatorGender}
- 年齢: ${facilitatorAge}
- 一人称: ${facilitatorFirstPerson}
- 話し方: ${facilitatorTone}
- 補足設定: ${facilitatorBio}`
    : `# 第3層（人格設定）
- 既定人格を使用（名前: AIヒーロー / 性格: 励まし型）`;

  const prompt = `あなたは、グループチャットを管理・監督する「AIヒーロー」です。目的は、クラスのコミュニケーションを健全に保ち、トラブルを未然に防ぐことです。コメントは端的にしてください。

# 第1層（安全）
- 差別・暴力・人格攻撃の助長はしない
- 不確実な事実を断定しない

# 第2層（運営ルール）
- 投稿可能時間: 6:00-22:00
- 文字数制限: 200文字以内
- 投稿回数制限: 1日3回
- 毎日0:00に画面上の投稿はリセット（ログは保持）

${personaBlock}

# このユーザーの好み
${preferenceBlock}

# グループ説明（判断の参考）
${groupDescription || "未設定"}

# いまの時間帯
${timeContext}

# 判定ルール
- sentiment は "positive" | "neutral" | "negative" | "spam" のいずれか
- isAnnouncement は持ち物/提出期限/集合日時/場所などの重要連絡なら true
- announcementText は isAnnouncement=true の場合のみ50文字以内目安。falseなら空文字
- bugyoResponse は端的な一言。spam の場合は空文字でもよい
- announcementText と bugyoResponse は、入力メッセージの主言語と同じ言語で返す
- 入力メッセージの推定主言語: ${languageLabel(inputLanguage)}
- 直接「空気が悪い」等の言い回しは使わない
- 人格設定は言い方のみに反映し、第1層/第2層を絶対に上書きしない

# 出力形式
JSONのみで返してください。説明文やコードフェンスは禁止です。

{
  "sentiment": "positive|neutral|negative|spam",
  "isAnnouncement": true,
  "announcementText": "文字列",
  "bugyoResponse": "文字列",
  "points": 0
}

# メッセージ
${text}`;

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
    const errorText = await response.text();
    return NextResponse.json(
      { error: "Gemini API error", detail: errorText },
      { status: 500 }
    );
  }

  const data = (await response.json()) as {
    candidates?: Array<{
      content?: { parts?: Array<{ text?: string }> };
    }>;
  };

  const rawText =
    data.candidates?.[0]?.content?.parts?.[0]?.text?.trim() ?? "";

  const match = rawText.match(/\{[\s\S]*\}/);
  if (!match) {
    return NextResponse.json(
      { error: "Gemini response did not contain JSON", raw: rawText },
      { status: 500 }
    );
  }

  const parsed = JSON.parse(match[0]) as HeroResponse;
  const sentiment: Sentiment =
    parsed.sentiment === "positive" ||
    parsed.sentiment === "neutral" ||
    parsed.sentiment === "negative" ||
    parsed.sentiment === "spam"
      ? parsed.sentiment
      : "neutral";
  const isAnnouncement = Boolean(parsed.isAnnouncement);
  const announcementText = isAnnouncement
    ? String(parsed.announcementText ?? "").trim().slice(0, 50)
    : "";
  const bugyoResponse =
    sentiment === "spam" ? "" : String(parsed.bugyoResponse ?? "").trim().slice(0, 200);
  const points = isAnnouncement
    ? 3
    : sentiment === "positive"
      ? 2
      : sentiment === "neutral"
        ? 1
        : sentiment === "negative"
          ? 0
          : -1;

  return NextResponse.json({
    sentiment,
    isAnnouncement,
    announcementText,
    bugyoResponse,
    points,
  });
}
