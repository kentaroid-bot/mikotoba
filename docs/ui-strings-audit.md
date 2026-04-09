# UI Strings Audit

最終更新: 2026-04-09

## 方針
- `convex/uiStrings.ts` の `uiStrings` テーブルを正とし、`page + key + locale` で管理。
- 画面側は `useUiStrings(page)` でDBから取得。
- 文字列が未登録でもフォールバック表示するため、段階的に移行可能。

## 抽出結果
- `src/app/components/ChatClient.tsx`
  - 状態: DB化済み（主要ラベル、エラーメッセージ、プレースホルダ、ハート関連、徳単位）
- `src/app/components/AnnouncementsClient.tsx`
  - 状態: DB化済み（ヘッダ、説明、期限/重要度接頭辞、サマリー、CTA）
- `src/app/components/DiaryClient.tsx`
  - 状態: DB化済み（ヘッダ、日付文言、注記、温度ラベル、単位）
- `src/app/components/ProfileClient.tsx`
  - 状態: DB化済み（ヘッダ、カード、フォーム内ラベル、プレースホルダ、操作ボタン、エラーメッセージ）
- `src/app/components/BottomNav.tsx`
  - 状態: DB化済み（下部ナビ4ラベル）
- `src/app/invite/[token]/page.tsx`
  - 状態: DB化済み（招待文言、ボタン、エラー）
- `src/app/sign-in/[[...sign-in]]/page.tsx`
  - 状態: DB化済み（タイトル、説明）
- `src/app/sign-up/[[...sign-up]]/page.tsx`
  - 状態: DB化済み（タイトル、説明）

## 非対象（UI文言テーブル化の対象外）
- `src/app/api/**`
  - 理由: AIプロンプト/判定ロジック文言のため、UI文言とは別管理。
- `src/app/layout.tsx` の `metadata.title/description`
  - 理由: Next.js metadataはサーバー定義であり、今回のクライアントUI文字列とは別管理。
