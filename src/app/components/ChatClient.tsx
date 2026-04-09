"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useConvexAuth, useMutation, useQuery } from "convex/react";
import { useAuth, useUser } from "@clerk/nextjs";
import { api } from "../../../convex/_generated/api";
import type { Id } from "../../../convex/_generated/dataModel";
import { useUiStrings } from "./useUiStrings";

export default function ChatClient() {
  const { isLoaded, isSignedIn } = useAuth();
  const { user } = useUser();
  const { t, tf } = useUiStrings("chat");
  const { isLoading: isConvexLoading, isAuthenticated: isConvexAuthenticated } =
    useConvexAuth();
  const [text, setText] = useState("");
  const [sendError, setSendError] = useState<string | null>(null);
  const [likePendingMessageId, setLikePendingMessageId] =
    useState<Id<"messages"> | null>(null);
  const profile = useQuery(api.profile.getMy);
  const ensureProfile = useMutation(api.profile.ensureMyProfile);
  const activeGroup = useQuery(api.groups.getActive);
  const groups = useQuery(api.groups.listMine);
  const messages = useQuery(
    api.messages.list,
    activeGroup ? { groupId: activeGroup._id, limit: 40 } : "skip"
  );
  const dailyStatus = useQuery(
    api.messages.getDailyStatus,
    activeGroup ? { groupId: activeGroup._id } : "skip"
  );
  const guardianPreference = useQuery(
    api.messages.getGuardianPreferenceContext,
    activeGroup ? { groupId: activeGroup._id } : "skip"
  );
  const send = useMutation(api.messages.send);
  const awardPoints = useMutation(api.messages.awardPoints);
  const sendGuardian = useMutation(api.messages.sendGuardian);
  const toggleGuardianLike = useMutation(api.messages.toggleGuardianLike);
  const setActiveGroup = useMutation(api.profile.setActiveGroup);
  const seededRef = useRef(false);
  const ensuringProfileRef = useRef(false);

  useEffect(() => {
    if (
      !isLoaded ||
      !isSignedIn ||
      isConvexLoading ||
      !isConvexAuthenticated ||
      profile !== null ||
      ensuringProfileRef.current
    ) {
      return;
    }
    ensuringProfileRef.current = true;
    void ensureProfile()
      .catch((err) => {
        if (!(err instanceof Error) || err.message !== "Unauthorized") {
          console.error(err);
        }
      })
      .finally(() => {
        ensuringProfileRef.current = false;
      });
  }, [
    isLoaded,
    isSignedIn,
    isConvexLoading,
    isConvexAuthenticated,
    profile,
    ensureProfile,
  ]);

  useEffect(() => {
    if (!seededRef.current && messages && messages.length === 0) {
      seededRef.current = true;
    }
  }, [messages]);

  const remainingPosts = useMemo(() => {
    if (!dailyStatus) return "-";
    return `${dailyStatus.remaining}`;
  }, [dailyStatus]);

  const remainingCount = useMemo(() => {
    if (!dailyStatus) return 0;
    return dailyStatus.remaining;
  }, [dailyStatus]);

  const ordered = useMemo(() => {
    if (!messages) return [];
    return [...messages].reverse();
  }, [messages]);

  const handleSend = async () => {
    const trimmed = text.trim();
    if (!trimmed || !activeGroup) return;
    if (trimmed.length > 200) return;
    if (remainingCount <= 0) {
      setSendError(
        t("error_daily_limit", "今日の投稿回数上限に達しました。")
      );
      return;
    }

    try {
      setSendError(null);
      const messageId = await send({
        groupId: activeGroup._id,
        text: trimmed,
      });
      const awardResponse = await fetch("/api/guardian/award", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          text: trimmed,
          groupDescription: activeGroup.description ?? "",
          preference: guardianPreference ?? undefined,
          facilitator: activeGroup.facilitator ?? undefined,
        }),
      });
      if (awardResponse.ok) {
        const data = (await awardResponse.json()) as {
          sentiment: "positive" | "neutral" | "negative" | "spam";
          isAnnouncement: boolean;
          announcementText: string;
          bugyoResponse: string;
          points: number;
        };
        const aiFollowed = data.bugyoResponse.trim().length > 0;
        await awardPoints({
          messageId,
          points: data.points,
          sentiment: data.sentiment,
          isAnnouncement: data.isAnnouncement,
          aiFollowed,
        });
        if (aiFollowed) {
          await sendGuardian({
            groupId: activeGroup._id,
            text: data.bugyoResponse.trim(),
          });
        }
      }
      setText("");
    } catch (err) {
      setSendError(
        err instanceof Error ? err.message : t("error_send", "送信に失敗しました。")
      );
    }
  };

  const handleSwitchGroup = async (groupId: Id<"groups">) => {
    setSendError(null);
    try {
      await setActiveGroup({ groupId });
    } catch (err) {
      setSendError(
        err instanceof Error
          ? err.message
          : t("error_switch", "チャットの切り替えに失敗しました。")
      );
    }
  };

  const handleToggleGuardianLike = async (messageId: Id<"messages">) => {
    if (!activeGroup || likePendingMessageId === messageId) return;
    try {
      setLikePendingMessageId(messageId);
      setSendError(null);
      await toggleGuardianLike({
        groupId: activeGroup._id,
        messageId,
      });
    } catch (err) {
      setSendError(
        err instanceof Error ? err.message : t("error_like", "ハートの更新に失敗しました。")
      );
    } finally {
      setLikePendingMessageId(null);
    }
  };

  return (
    <div className="min-h-screen bg-surface text-on-surface">
      <div className="fixed inset-0 -z-10">
        <div className="absolute -top-28 -right-20 h-64 w-64 rounded-full bg-primary/10 blur-3xl" />
        <div className="absolute bottom-0 -left-16 h-80 w-80 rounded-full bg-secondary/10 blur-3xl" />
      </div>

      <header className="bg-white/70 backdrop-blur-lg fixed top-0 left-0 w-full z-50 shadow-sm shadow-blue-900/5">
        <div className="flex justify-between items-center px-6 h-16 w-full max-w-5xl mx-auto">
          <div className="flex items-center gap-2.5">
            <span className="chat-logo-mark" aria-hidden>
              三
            </span>
            <div className="leading-none">
              <h1 className="text-xl font-extrabold text-primary tracking-tighter font-headline">
                {t("title", "みこと書き")}
              </h1>
              <p className="text-[11px] text-on-surface-variant mt-1">
                {t("subtitle", "1日3回、出来事や思いを記してください。")}
              </p>
            </div>
          </div>
          <div className="w-full max-w-xs">
            <label className="sr-only" htmlFor="chat-group-select">
              {t("select_group_sr", "チャットを選択")}
            </label>
            <select
              id="chat-group-select"
              value={activeGroup?._id ?? ""}
              onChange={(event) => {
                const groupId = event.target.value as Id<"groups">;
                if (!groupId || groupId === activeGroup?._id) return;
                void handleSwitchGroup(groupId);
              }}
              className="w-full rounded-full bg-white/90 px-4 py-2 text-sm font-headline font-semibold text-primary shadow-sm"
            >
              {groups?.length ? (
                groups.map((group) =>
                  group ? (
                    <option key={group._id} value={group._id}>
                      {group.name}
                    </option>
                  ) : null
                )
              ) : (
                <option value="">{t("group_unjoined", "グループ未参加")}</option>
              )}
            </select>
          </div>
        </div>
      </header>

      <main className="pt-20 pb-32 max-w-2xl mx-auto px-4 min-h-screen flex flex-col">
        <section className="mb-8 p-5 bg-surface-container-lowest rounded-xl shadow-sm relative overflow-hidden">
          <div className="absolute inset-y-0 left-0 w-1.5 bg-primary" />
          <div className="flex justify-between items-center gap-4">
            <div>
              <p className="font-label text-[10px] uppercase text-on-surface-variant mb-1">
                {t("status_report", "Status Report")}
              </p>
              <h2 className="font-headline font-bold text-primary text-lg">
                <span className="text-secondary">
                  {tf(
                    "daily_remaining_tpl",
                    "今日の残り投稿: {remaining} 回",
                    { remaining: remainingPosts }
                  )}
                </span>
              </h2>
            </div>
            <div className="text-right">
              <span className="font-label text-xs text-on-surface-variant block">
                {t("limit_label", "LIMIT")}
              </span>
              <span className="font-headline font-bold text-sm">
                {t("max_chars", "1回につき200文字以内")}
              </span>
            </div>
          </div>
        </section>

        {!activeGroup && (
          <div className="bg-surface-container-lowest rounded-2xl p-6 shadow-sm text-sm text-on-surface-variant">
            <p className="font-headline text-lg text-primary mb-2">
              {t("not_joined_title", "まだグループに参加していません")}
            </p>
            <p>
              {t(
                "not_joined_desc",
                "管理者からの招待リンクを開いて参加するか、プロフィール画面から新しいグループを作成してください。"
              )}
            </p>
          </div>
        )}

        <div className="flex-1 space-y-6 overflow-y-auto pb-32">
          {ordered.map((message) => {
            const isGuardian = message.authorRole === "guardian";
            return (
              <div
                key={message._id}
                className={
                  isGuardian
                    ? "flex flex-col items-end max-w-[90%] self-end"
                    : "flex flex-col items-start max-w-[85%]"
                }
              >
                <div
                  className={
                    isGuardian
                      ? "flex items-center gap-2 mb-2 mr-2"
                      : "flex items-center gap-2 mb-2 ml-2"
                  }
                >
                  <span
                    className={
                      isGuardian
                        ? "font-label text-[10px] font-bold text-primary uppercase"
                        : "font-label text-[10px] font-bold text-on-surface-variant uppercase"
                    }
                  >
                    {message.authorName}
                  </span>
                  {!isGuardian && (
                    <img
                      className="w-5 h-5 rounded-full object-cover border border-surface-container-high"
                      alt="投稿者アバター"
                      src={
                        user?.imageUrl ??
                        "https://images.unsplash.com/photo-1527980965255-d3b416303d12?auto=format&fit=crop&w=120&q=80"
                      }
                    />
                  )}
                </div>
                <div
                  className={
                    isGuardian
                      ? "bg-primary-container text-on-primary p-4 rounded-xl rounded-br-sm shadow-md"
                      : "bg-surface-container-high text-on-surface p-4 rounded-xl rounded-bl-sm"
                  }
                >
                  <p className="text-sm leading-relaxed">{message.text}</p>
                  {isGuardian ? (
                    <div className="mt-3 flex justify-end">
                      <button
                        onClick={() => void handleToggleGuardianLike(message._id)}
                        disabled={likePendingMessageId === message._id}
                        className="inline-flex items-center gap-1 rounded-full bg-white/35 px-3 py-1 text-xs font-bold text-primary disabled:opacity-50"
                        aria-label={t("like_aria", "AIファシリテーターの発言にハート")}
                        title={t("like_title", "この発言を次回の口調参考にする")}
                      >
                        <span
                          className="material-symbols-outlined text-sm leading-none"
                          style={{ fontVariationSettings: "'FILL' 1" }}
                        >
                          {message.likedByMe ? "favorite" : "favorite_border"}
                        </span>
                        <span>{message.likeCount ?? 0}</span>
                      </button>
                    </div>
                  ) : null}
                  {typeof message.pointsAwarded === "number" &&
                  message.pointsAwarded !== 0 ? (
                    <div className="inline-flex items-center gap-1 bg-secondary px-3 py-1 rounded-full shadow-lg shadow-secondary/30 mt-3">
                      <span
                        className="material-symbols-outlined text-white text-xs"
                        style={{ fontVariationSettings: "'FILL' 1" }}
                      >
                        star
                      </span>
                        <span className="font-label text-xs font-bold text-white">
                          {message.pointsAwarded > 0 ? "+" : ""}
                        {message.pointsAwarded}
                        {t("point_suffix", "徳")}
                        </span>
                      </div>
                  ) : null}
                </div>
              </div>
            );
          })}

          {!messages && activeGroup && (
            <div className="flex justify-center py-4">
              <div className="flex flex-col items-center gap-2">
                <div className="w-32 h-1 bg-surface-container-high rounded-full overflow-hidden">
                  <div className="h-full bg-gradient-to-r from-secondary to-tertiary-fixed-dim w-1/2 guardian-progress" />
                </div>
                <span className="font-label text-[10px] text-on-surface-variant uppercase">
                  {t("loading_guardian", "ルフィが確認中...")}
                </span>
              </div>
            </div>
          )}
        </div>
        {sendError && (
          <p className="mt-4 text-sm text-secondary">{sendError}</p>
        )}

        <div className="fixed bottom-24 left-1/2 -translate-x-1/2 w-full max-w-2xl px-4 z-40">
          <div className="bg-white/80 backdrop-blur-xl rounded-[2rem] p-3 shadow-2xl shadow-primary/10 flex items-end gap-3">
            <div className="flex-1 relative">
              <textarea
                className="w-full bg-transparent border-none focus:ring-0 text-sm py-2 px-4 resize-none max-h-32 min-h-[44px]"
                placeholder={t("compose_placeholder", "想いを言葉にしよう...")}
                rows={1}
                value={text}
                onChange={(event) => setText(event.target.value)}
                disabled={!activeGroup}
              />
              <div className="absolute right-4 bottom-2">
                <span className="font-label text-[10px] text-on-surface-variant">
                  {text.length}/200
                </span>
              </div>
            </div>
            <button
              className="bg-secondary text-white p-3 rounded-full flex items-center justify-center hover:scale-105 active:scale-95 transition-all shadow-lg shadow-secondary/30 disabled:opacity-40 disabled:cursor-not-allowed"
              onClick={handleSend}
              disabled={!profile || !activeGroup || remainingCount <= 0}
            >
              <span
                className="material-symbols-outlined font-bold"
                style={{ fontVariationSettings: "'FILL' 1" }}
              >
                send
              </span>
            </button>
          </div>
        </div>
      </main>
    </div>
  );
}
