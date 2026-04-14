"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useConvexAuth, useMutation, useQuery } from "convex/react";
import { useAuth, useUser } from "@clerk/nextjs";
import { api } from "../../../convex/_generated/api";
import type { Id } from "../../../convex/_generated/dataModel";
import { useUiStrings } from "./useUiStrings";
import LocaleToggle from "./LocaleToggle";

export default function AnnouncementsClient() {
  const { isLoaded, isSignedIn } = useAuth();
  const { user } = useUser();
  const { t, tf } = useUiStrings("announcements");
  const { isLoading: isConvexLoading, isAuthenticated: isConvexAuthenticated } =
    useConvexAuth();
  const profile = useQuery(api.profile.getMy);
  const ensureProfile = useMutation(api.profile.ensureMyProfile);
  const activeGroup = useQuery(api.groups.getActive);
  const groups = useQuery(api.groups.listMine);
  const setActiveGroup = useMutation(api.profile.setActiveGroup);
  const groupRole = useQuery(
    api.groups.getMyRole,
    activeGroup ? { groupId: activeGroup._id } : "skip"
  );
  const announcements = useQuery(
    api.announcements.list,
    activeGroup ? { groupId: activeGroup._id } : "skip"
  );
  const completedAnnouncementIds = useQuery(
    api.announcements.listMyCompletionAnnouncementIds,
    activeGroup ? { groupId: activeGroup._id } : "skip"
  );
  const reportCompletion = useMutation(api.announcements.reportCompletion);
  const deleteAnnouncement = useMutation(api.announcements.closeUndated);
  const [selectedAnnouncementId, setSelectedAnnouncementId] = useState<
    Id<"announcements"> | ""
  >("");
  const [reportText, setReportText] = useState("");
  const [isSubmittingReport, setIsSubmittingReport] = useState(false);
  const [closingAnnouncementId, setClosingAnnouncementId] = useState<
    Id<"announcements"> | null
  >(null);
  const [reportError, setReportError] = useState<string | null>(null);
  const [reportSuccess, setReportSuccess] = useState<string | null>(null);
  const [closeError, setCloseError] = useState<string | null>(null);
  const [closeSuccess, setCloseSuccess] = useState<string | null>(null);
  const ensuringProfileRef = useRef(false);

  useEffect(() => {
    if (profile === undefined) {
      return;
    }
    const shouldSyncAvatar =
      Boolean(user?.imageUrl) && profile?.imageUrl !== user?.imageUrl;
    if (
      !isLoaded ||
      !isSignedIn ||
      isConvexLoading ||
      !isConvexAuthenticated ||
      (!shouldSyncAvatar && profile !== null) ||
      ensuringProfileRef.current
    ) {
      return;
    }
    ensuringProfileRef.current = true;
    void ensureProfile({ imageUrl: user?.imageUrl, username: user?.username ?? undefined })
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
    user?.imageUrl,
    user?.username,
    ensureProfile,
  ]);

  const handleSwitchGroup = async (groupId: Id<"groups">) => {
    try {
      await setActiveGroup({ groupId });
    } catch (err) {
      if (err instanceof Error) {
        console.error(err.message);
      } else {
        console.error(t("error_switch", "チャットの切り替えに失敗しました。"));
      }
    }
  };

  const completedSet = useMemo(
    () => new Set(completedAnnouncementIds ?? []),
    [completedAnnouncementIds]
  );

  const pendingAnnouncements = useMemo(
    () =>
      (announcements ?? []).filter(
        (item) => !completedSet.has(item._id)
      ),
    [announcements, completedSet]
  );
  const hasNoAnnouncements = Boolean(
    activeGroup && announcements && announcements.length === 0
  );

  useEffect(() => {
    if (!pendingAnnouncements.length) {
      if (selectedAnnouncementId) {
        setSelectedAnnouncementId("");
      }
      return;
    }
    if (
      !selectedAnnouncementId ||
      !pendingAnnouncements.some((item) => item._id === selectedAnnouncementId)
    ) {
      setSelectedAnnouncementId(pendingAnnouncements[0]?._id ?? "");
    }
  }, [pendingAnnouncements, selectedAnnouncementId]);

  const handleSubmitCompletion = async () => {
    if (!activeGroup) return;
    if (!selectedAnnouncementId) {
      setReportError(
        t("report_select_error", "連絡事項を選択してください。")
      );
      setReportSuccess(null);
      return;
    }

    const trimmed = reportText.trim();
    if (!trimmed) return;

    try {
      setIsSubmittingReport(true);
      setReportError(null);
      setReportSuccess(null);
      const result = await reportCompletion({
        groupId: activeGroup._id,
        announcementId: selectedAnnouncementId,
        reportText: trimmed,
        authorImageUrl: user?.imageUrl,
      });
      setReportText("");
      setReportSuccess(
        tf(
          "report_success_tpl",
          "完了報告を投稿しました（+{points}徳）。みこと書きに反映されます。",
          { points: result.pointsAwarded }
        )
      );
    } catch (err) {
      setReportError(
        err instanceof Error ? err.message : t("error_switch", "送信に失敗しました。")
      );
    } finally {
      setIsSubmittingReport(false);
    }
  };

  const handleDeleteAnnouncement = async (announcementId: Id<"announcements">) => {
    if (!activeGroup || groupRole !== "admin") return;
    try {
      setClosingAnnouncementId(announcementId);
      setCloseError(null);
      setCloseSuccess(null);
      await deleteAnnouncement({
        groupId: activeGroup._id,
        announcementId,
      });
      setCloseSuccess(t("close_success", "連絡事項を削除しました。"));
    } catch (err) {
      setCloseError(
        err instanceof Error
          ? err.message
          : t("close_error", "削除に失敗しました。")
      );
    } finally {
      setClosingAnnouncementId(null);
    }
  };

  return (
    <div className="min-h-screen bg-surface text-on-surface">
      <div className="fixed inset-0 -z-10">
        <div className="absolute -top-20 left-1/2 h-56 w-56 -translate-x-1/2 rounded-full bg-tertiary-fixed-dim/20 blur-3xl" />
        <div className="absolute bottom-0 right-0 h-72 w-72 rounded-full bg-primary/10 blur-3xl" />
      </div>

      <header className="fixed top-0 left-0 w-full z-[60] bg-white/70 backdrop-blur-lg shadow-sm shadow-blue-900/5">
        <div className="flex justify-between items-center px-4 sm:px-6 h-16 w-full max-w-[var(--app-max-w)] mx-auto gap-2">
          <div className="flex items-center gap-2.5 min-w-0 pr-2">
            <LocaleToggle />
            <div className="min-w-0">
              <h1 className="text-lg sm:text-xl font-extrabold text-primary tracking-tighter font-headline whitespace-nowrap">
                {t("title", "みちしるべ")}
              </h1>
              <p className="hidden text-[11px] text-on-surface-variant sm:block">
                {t("subtitle", "語り合った時間のなかから、忘れてはならない明日へ繋ぐべき種を見つけます。")}
              </p>
            </div>
          </div>
          <div className="w-[8.25rem] max-w-[8.25rem] shrink-0 sm:w-full sm:max-w-xs">
            <label className="sr-only" htmlFor="announcements-group-select">
              {t("select_group_sr", "チャットを選択")}
            </label>
            <select
              id="announcements-group-select"
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

      <main className="max-w-[var(--app-max-w)] mx-auto px-4 sm:px-6 pt-24 safe-page-bottom">
        {!hasNoAnnouncements ? (
          <section className="mb-8">
            <p className="text-on-surface-variant max-w-lg whitespace-pre-line">
              {t(
                "tasks_desc",
                "AIファシリテーターがチャットから重要な情報を抜き出しました。\nこれらを完了して「徳」を積みましょう。"
              )}
            </p>
          </section>
        ) : null}

        {!activeGroup && (
          <div className="bg-surface-container-lowest rounded-2xl p-6 shadow-sm text-sm text-on-surface-variant">
            <p>{t("no_group_desc", "グループに参加すると重要連絡が表示されます。")}</p>
          </div>
        )}

        {hasNoAnnouncements ? (
          <section className="bg-surface-container-low rounded-2xl p-8 shadow-sm border border-primary/10">
            <div className="flex flex-col items-center text-center gap-3">
              <span className="material-symbols-outlined text-primary text-4xl">
                notifications_off
              </span>
              <h3 className="font-headline text-xl font-bold text-primary">
                {t("empty_title", "連絡事項はありません")}
              </h3>
              <p className="text-sm text-on-surface-variant max-w-md">
                {t(
                  "empty_desc",
                  "新しい重要連絡が投稿されると、ここに表示されます。"
                )}
              </p>
            </div>
          </section>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            {announcements?.map((item) => (
              <div
                key={item._id}
                className="bg-surface-container-low p-6 rounded-xl space-y-4 hover:-translate-y-1 transition-transform shadow-sm hover:shadow-md"
              >
                <div className="flex items-center justify-between gap-2">
                  <div className="flex items-center gap-2 text-secondary">
                    <span className="material-symbols-outlined">
                      {item.category === "持ち物"
                        ? "inventory_2"
                        : item.category === "期限"
                          ? "event"
                          : "campaign"}
                    </span>
                    <h3 className="font-label font-bold text-sm uppercase">
                      {item.category}
                    </h3>
                  </div>
                  {completedSet.has(item._id) ? (
                    <span className="inline-flex items-center rounded-full bg-primary/10 px-2 py-1 text-[10px] font-label font-bold uppercase text-primary">
                      {t("report_done_badge", "報告済み")}
                    </span>
                  ) : null}
                </div>
                <p className="font-headline font-semibold text-lg">{item.title}</p>
                <p className="text-sm text-on-surface-variant">{item.detail}</p>
                {item.dueAt ? (
                  <span className="font-label text-xs uppercase text-on-surface-variant">
                    {t("due_prefix", "期限")}:{" "}
                    {new Date(item.dueAt).toLocaleString("ja-JP", {
                      month: "numeric",
                      day: "numeric",
                      hour: "2-digit",
                      minute: "2-digit",
                    })}
                  </span>
                ) : item.importance ? (
                  <span className="font-label text-xs uppercase text-on-surface-variant">
                    {t("importance_prefix", "重要度")}: {item.importance}
                  </span>
                ) : null}
                {groupRole === "admin" ? (
                  <div>
                    <button
                      type="button"
                      onClick={() => void handleDeleteAnnouncement(item._id)}
                      disabled={closingAnnouncementId === item._id}
                      className="rounded-full border border-primary/30 bg-white px-3 py-1 text-[10px] font-label font-bold uppercase text-primary hover:bg-primary/5 disabled:opacity-50"
                    >
                      {closingAnnouncementId === item._id
                        ? t("close_submitting", "処理中...")
                        : t("close_button", "削除")}
                    </button>
                  </div>
                ) : null}
              </div>
            ))}
          </div>
        )}

        <section className="mt-12">
          <div className="bg-surface-container-lowest rounded-2xl p-6 shadow-sm relative overflow-hidden">
            <div className="absolute top-0 right-0 w-40 h-40 bg-gradient-to-br from-primary to-primary-container opacity-20 rounded-full blur-2xl" />
            <h3 className="font-headline text-xl font-bold text-primary mt-2">
              {t("chance_title", "今日の徳ポイント獲得チャンス")}
            </h3>
            <p className="text-sm text-on-surface-variant mt-3">
              {t(
                "chance_desc",
                "任務を完了して報告すると、AIファシリテーターが追加の徳を付与します。完了報告は投稿回数を消費しません。"
              )}
            </p>

            <div className="mt-5 space-y-3">
              <label className="flex flex-col gap-2 text-sm">
                <span className="text-on-surface-variant">
                  {t("report_target_label", "報告対象")}
                </span>
                <select
                  value={selectedAnnouncementId}
                  onChange={(event) =>
                    setSelectedAnnouncementId(
                      event.target.value as Id<"announcements"> | ""
                    )
                  }
                  disabled={!pendingAnnouncements.length}
                  className="rounded-xl bg-white/90 px-3 py-2 text-sm text-on-surface disabled:opacity-60"
                >
                  {pendingAnnouncements.length ? (
                    pendingAnnouncements.map((item) => (
                      <option key={item._id} value={item._id}>
                        {item.title}
                      </option>
                    ))
                  ) : (
                    <option value="">
                      {t("report_no_tasks", "現在、報告できる連絡事項はありません。")}
                    </option>
                  )}
                </select>
              </label>

              <div className="relative">
                <textarea
                  className="w-full min-h-[96px] rounded-xl bg-white/90 px-3 py-3 text-sm text-on-surface resize-none disabled:opacity-60"
                  value={reportText}
                  onChange={(event) => setReportText(event.target.value)}
                  placeholder={t(
                    "report_placeholder",
                    "完了内容を入力してください（8文字以上）"
                  )}
                  maxLength={200}
                  disabled={!pendingAnnouncements.length || isSubmittingReport}
                />
                <span className="absolute right-3 bottom-2 text-[10px] font-label text-on-surface-variant">
                  {tf("report_char_count_tpl", "{count}/{max}", {
                    count: reportText.length,
                    max: 200,
                  })}
                </span>
              </div>

              <button
                onClick={() => void handleSubmitCompletion()}
                disabled={
                  !pendingAnnouncements.length ||
                  !selectedAnnouncementId ||
                  !reportText.trim() ||
                  isSubmittingReport
                }
                className="bg-gradient-to-br from-primary to-primary-container text-white px-4 py-2 rounded-full font-label text-xs uppercase hover:scale-[1.02] transition-transform relative disabled:opacity-50 disabled:hover:scale-100"
              >
                {isSubmittingReport
                  ? t("report_submitting", "送信中...")
                  : t("write_report", "完了報告を書く")}
                <span className="absolute left-4 bottom-0 h-0.5 w-8 bg-tertiary-fixed-dim" />
              </button>
            </div>

            {reportError ? (
              <p className="mt-3 text-sm text-secondary">{reportError}</p>
            ) : null}
            {reportSuccess ? (
              <p className="mt-3 text-sm text-primary">{reportSuccess}</p>
            ) : null}
            {closeError ? (
              <p className="mt-2 text-sm text-secondary">{closeError}</p>
            ) : null}
            {closeSuccess ? (
              <p className="mt-2 text-sm text-primary">{closeSuccess}</p>
            ) : null}
          </div>
        </section>
      </main>
    </div>
  );
}
