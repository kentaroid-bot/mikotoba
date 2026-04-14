"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useConvexAuth, useMutation, useQuery } from "convex/react";
import { useAuth, useUser } from "@clerk/nextjs";
import { api } from "../../../convex/_generated/api";
import type { Id } from "../../../convex/_generated/dataModel";
import { useUiStrings } from "./useUiStrings";
import LocaleToggle from "./LocaleToggle";

const JST_OFFSET_MS = 9 * 60 * 60 * 1000;

const getMemberBubbleToneClass = (createdAt: number) => {
  const hour = new Date(createdAt + JST_OFFSET_MS).getUTCHours();

  if (hour >= 6 && hour < 7) {
    return "bg-gradient-to-r from-violet-200 to-orange-200 text-slate-900";
  }
  if (hour >= 7 && hour < 11) {
    return "bg-gradient-to-r from-orange-200 to-sky-200 text-slate-900";
  }
  if (hour >= 11 && hour < 16) {
    return "bg-gradient-to-r from-sky-200 to-amber-200 text-slate-900";
  }
  if (hour >= 16 && hour < 19) {
    return "bg-gradient-to-r from-orange-200 to-violet-200 text-slate-900";
  }
  return "bg-gradient-to-r from-indigo-800 to-slate-900 text-slate-100";
};

const getFacilitatorTextToneClass = (createdAt: number) => {
  const hour = new Date(createdAt + JST_OFFSET_MS).getUTCHours();

  if (hour >= 6 && hour < 7) {
    return "text-violet-700";
  }
  if (hour >= 7 && hour < 11) {
    return "text-sky-700";
  }
  if (hour >= 11 && hour < 16) {
    return "text-cyan-700";
  }
  if (hour >= 16 && hour < 19) {
    return "text-violet-700";
  }
  return "text-slate-900";
};

export default function ChatClient() {
  const { isLoaded, isSignedIn, userId } = useAuth();
  const { isLoaded: isUserLoaded, user } = useUser();
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
    if (profile === undefined) {
      return;
    }
    const shouldSyncAvatar =
      Boolean(user?.imageUrl) && profile?.imageUrl !== user?.imageUrl;

    if (
      !isLoaded ||
      !isUserLoaded ||
      !isSignedIn ||
      isConvexLoading ||
      !isConvexAuthenticated ||
      (!shouldSyncAvatar && profile !== null) ||
      ensuringProfileRef.current
    ) {
      return;
    }
    ensuringProfileRef.current = true;
    void ensureProfile({
      imageUrl: user?.imageUrl,
      username: user?.username ?? undefined,
    })
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
    isUserLoaded,
    isSignedIn,
    isConvexLoading,
    isConvexAuthenticated,
    profile,
    user?.imageUrl,
    user?.username,
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
  const facilitatorDisplayName =
    activeGroup?.facilitator?.displayName?.trim() ||
    t("guardian_default_name", "AIヒーロー");

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
        authorImageUrl: user?.imageUrl,
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

      <header className="bg-white/70 backdrop-blur-lg fixed top-0 left-0 w-full z-[60] shadow-sm shadow-blue-900/5">
        <div className="flex justify-between items-center px-4 sm:px-6 h-16 w-full max-w-[var(--app-max-w)] mx-auto gap-2">
          <div className="flex items-center gap-2.5 min-w-0 pr-2">
            <LocaleToggle />
            <div className="leading-none min-w-0">
              <h1 className="text-lg sm:text-xl font-extrabold text-primary tracking-tighter font-headline whitespace-nowrap">
                {t("title", "みこと書き")}
              </h1>
              <p className="hidden text-[11px] text-on-surface-variant mt-1 sm:block">
                {t("subtitle", "1日3回、出来事や思いを記してください。")}
              </p>
            </div>
          </div>
          <div className="w-[8.25rem] max-w-[8.25rem] shrink-0 sm:w-full sm:max-w-xs">
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
              className="w-full rounded-full bg-white/90 px-3 py-2 text-xs sm:text-sm font-headline font-semibold text-primary shadow-sm"
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

      <main className="pt-20 safe-chat-main max-w-[var(--app-max-w)] mx-auto px-4 min-h-[100dvh] flex flex-col">
        <section className="mb-8 p-5 bg-surface-container-lowest rounded-xl shadow-sm relative overflow-hidden">
          <div className="absolute inset-y-0 left-0 w-1.5 bg-primary" />
          <div className="mb-2.5">
            <p className="inline-flex items-center rounded-full bg-primary/5 px-3 py-1 font-label text-[10px] text-primary">
              {t("post_window", "投稿時間: 6:00 - 22:00")}
            </p>
          </div>
          <div className="flex flex-wrap items-end justify-between gap-x-4 gap-y-2">
            <h2 className="font-headline font-bold text-primary text-lg">
              <span className="text-secondary">
                {tf(
                  "daily_remaining_tpl",
                  "今日の残り投稿: {remaining} 回",
                  { remaining: remainingPosts }
                )}
              </span>
            </h2>
            <p className="font-headline font-bold text-sm text-on-surface-variant">
              {t("max_chars", "1回につき200文字以内")}
            </p>
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

        <div className="flex-1 space-y-6 overflow-y-auto safe-chat-list">
          {ordered.map((message) => {
            const isGuardian = message.authorRole === "guardian";
            const isMine =
              !isGuardian && Boolean(userId) && message.authorUserId === userId;
            const isRightAligned = isGuardian || !isMine;
            const facilitatorToneClass = getFacilitatorTextToneClass(message.createdAt);
            const messageAvatarUrl = message.authorImageUrl?.trim();
            const avatarFallbackInitial =
              message.authorName
                .replace(/^@+/, "")
                .trim()
                .slice(0, 1) || "?";
            return (
              <div
                key={message._id}
                className={
                  isRightAligned
                    ? "flex flex-col items-end max-w-[90%] self-end"
                    : "flex flex-col items-start max-w-[85%]"
                }
              >
                <div
                  className={
                    isRightAligned
                      ? "flex items-center gap-2 mb-2 mr-2"
                      : "flex items-center gap-2 mb-2 ml-2"
                  }
                >
                  <span
                    className={
                      isGuardian
                        ? `font-label text-[10px] font-bold uppercase ${facilitatorToneClass}`
                        : "font-label text-[10px] font-bold text-on-surface-variant uppercase"
                    }
                  >
                    {message.authorName}
                  </span>
                  {!isGuardian && (
                    messageAvatarUrl ? (
                      <img
                        className="w-5 h-5 rounded-full object-cover border border-surface-container-high"
                        alt="投稿者アバター"
                        src={messageAvatarUrl}
                      />
                    ) : (
                      <span className="inline-flex h-5 w-5 items-center justify-center rounded-full border border-surface-container-high bg-surface-container text-[10px] font-bold text-on-surface-variant">
                        {avatarFallbackInitial}
                      </span>
                    )
                  )}
                </div>
                <div
                  className={
                    isGuardian
                      ? facilitatorToneClass
                      : isRightAligned
                        ? `${getMemberBubbleToneClass(message.createdAt)} p-4 rounded-xl rounded-br-sm`
                        : `${getMemberBubbleToneClass(message.createdAt)} p-4 rounded-xl rounded-bl-sm`
                  }
                >
                  <p className="text-sm leading-relaxed">{message.text}</p>
                  {isGuardian ? (
                    <div className="mt-3 flex justify-end">
                      <button
                        onClick={() => void handleToggleGuardianLike(message._id)}
                        disabled={likePendingMessageId === message._id}
                        className={`inline-flex items-center gap-1 rounded-full bg-white/35 px-3 py-1 text-xs font-bold ${facilitatorToneClass} disabled:opacity-50`}
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
                    <div className={isRightAligned ? "mt-3 flex justify-end" : "mt-3"}>
                      <div className="inline-flex items-center gap-1 bg-secondary px-3 py-1 rounded-full shadow-lg shadow-secondary/30">
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
                  {tf("loading_guardian", "{name}が確認中...", {
                    name: facilitatorDisplayName,
                  })}
                </span>
              </div>
            </div>
          )}
        </div>
        {sendError && (
          <p className="mt-4 text-sm text-secondary">{sendError}</p>
        )}

        <div className="fixed chat-composer-wrap left-1/2 -translate-x-1/2 w-full max-w-[var(--app-max-w)] px-4 z-[50]">
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
              className="bg-secondary text-white min-h-11 min-w-11 p-3 rounded-full flex items-center justify-center hover:scale-105 active:scale-95 transition-all shadow-lg shadow-secondary/30 disabled:opacity-40 disabled:cursor-not-allowed"
              onClick={handleSend}
              disabled={!profile || !activeGroup || !isUserLoaded || remainingCount <= 0}
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
