import { auth } from "@clerk/nextjs/server";
import { NextResponse } from "next/server";

type FacilitatorPreset = "encouraging" | "watcher" | "facilitator" | "disciplined";

type PreviewBody = {
  groupName?: string;
  groupDescription?: string;
  facilitator?: {
    isActive?: boolean;
    displayName?: string;
    preset?: FacilitatorPreset;
    gender?: string;
    age?: number;
    firstPerson?: string;
    tone?: string;
    customBio?: string;
  };
};

const MODEL = "gemini-2.5-flash-lite";

const getPresetDescription = (preset: FacilitatorPreset) => {
  if (preset === "watcher") return "見守り型（傾聴・中立・クッション）";
  if (preset === "facilitator") return "進行役型（要点整理・次アクション提示）";
  if (preset === "disciplined") return "規律型（冷静・ルール遵守）";
  return "励まし型（ポジティブ・短文）";
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

  const body = (await request.json()) as PreviewBody;
  const facilitator = body.facilitator;
  const displayName = (facilitator?.displayName ?? "").trim() || "AIヒーロー";
  const preset = facilitator?.preset ?? "encouraging";
  const firstPerson = (facilitator?.firstPerson ?? "").trim() || "わたし";
  const tone = (facilitator?.tone ?? "").trim() || "バランス";
  const gender = (facilitator?.gender ?? "").trim() || "未設定";
  const age =
    typeof facilitator?.age === "number" && Number.isFinite(facilitator.age)
      ? String(Math.floor(facilitator.age))
      : "未設定";
  const customBio = (facilitator?.customBio ?? "").trim() || "なし";
  const groupName = (body.groupName ?? "").trim() || "未設定";
  const groupDescription = (body.groupDescription ?? "").trim() || "未設定";

  const prompt = `あなたは管理AIです。設定に基づいて、ファシリテーターの「実際の投稿口調サンプル」を1文だけ作成してください。

# 目的
- 管理画面プレビュー用の短いサンプル文を返す
- 設定一覧の説明ではなく、投稿の例文そのものを返す

# 入力設定
- 稼働: ${facilitator?.isActive ? "有効" : "無効"}
- 名前: ${displayName}
- 性格プリセット: ${getPresetDescription(preset)}
- 一人称: ${firstPerson}
- 話し方: ${tone}
- 性別: ${gender}
- 年齢: ${age}
- 補足設定: ${customBio}
- グループ名: ${groupName}
- グループ説明: ${groupDescription}

# 制約
- 日本語の自然な1文
- 10〜45文字程度
- 余計な前置き・箇条書き・説明は禁止
- 挨拶や声かけのような短文

# 出力形式
JSONのみで返す。コードフェンス禁止。
{
  "sample": "ここに1文"
}`;

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

  const rawText = data.candidates?.[0]?.content?.parts?.[0]?.text?.trim() ?? "";
  const match = rawText.match(/\{[\s\S]*\}/);
  if (!match) {
    return NextResponse.json(
      { error: "Gemini response did not contain JSON", raw: rawText },
      { status: 500 }
    );
  }

  const parsed = JSON.parse(match[0]) as { sample?: string };
  const sample = String(parsed.sample ?? "")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 80);
  if (!sample) {
    return NextResponse.json({ error: "Empty preview sample" }, { status: 500 });
  }

  return NextResponse.json({ sample });
}
