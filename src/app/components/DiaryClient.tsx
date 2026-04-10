"use client";

import { useEffect, useRef, useState } from "react";
import { useConvexAuth, useMutation, useQuery } from "convex/react";
import { useAuth, useUser } from "@clerk/nextjs";
import { api } from "../../../convex/_generated/api";
import type { Id } from "../../../convex/_generated/dataModel";
import { useUiStrings } from "./useUiStrings";
import LocaleToggle from "./LocaleToggle";

const addDaysToYmd = (ymd: string, delta: number) => {
  const [year, month, day] = ymd.split("-").map((value) => Number.parseInt(value, 10));
  const date = new Date(year, month - 1, day);
  date.setDate(date.getDate() + delta);
  const nextYear = date.getFullYear();
  const nextMonth = String(date.getMonth() + 1).padStart(2, "0");
  const nextDay = String(date.getDate()).padStart(2, "0");
  return `${nextYear}-${nextMonth}-${nextDay}`;
};

const toSlashDate = (ymd: string) => ymd.replace(/-/g, "/");

export default function DiaryClient() {
  const { isLoaded, isSignedIn } = useAuth();
  const { user } = useUser();
  const { t, tf } = useUiStrings("diary");
  const { isLoading: isConvexLoading, isAuthenticated: isConvexAuthenticated } =
    useConvexAuth();
  const profile = useQuery(api.profile.getMy);
  const ensureProfile = useMutation(api.profile.ensureMyProfile);
  const activeGroup = useQuery(api.groups.getActive);
  const groups = useQuery(api.groups.listMine);
  const setActiveGroup = useMutation(api.profile.setActiveGroup);
  const diary = useQuery(
    api.diary.latest,
    activeGroup ? { groupId: activeGroup._id } : "skip"
  );
  const [selectedDate, setSelectedDate] = useState("");
  const selectedDiary = useQuery(
    api.diary.byDate,
    activeGroup && selectedDate
      ? { groupId: activeGroup._id, date: selectedDate }
      : "skip"
  );
  const displayedDiary = selectedDate ? selectedDiary : diary;
  const latestDate = diary?.date ?? "";
  const activeDate = selectedDate || latestDate;
  const canMovePrev = Boolean(activeDate);
  const canMoveNext = Boolean(selectedDate && latestDate && selectedDate < latestDate);
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
    void ensureProfile({ imageUrl: user?.imageUrl })
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

  const handleMovePrevDate = () => {
    if (!activeDate) return;
    setSelectedDate(addDaysToYmd(activeDate, -1));
  };

  const handleMoveNextDate = () => {
    if (!selectedDate || !latestDate) return;
    const nextDate = addDaysToYmd(selectedDate, 1);
    if (nextDate >= latestDate) {
      setSelectedDate("");
      return;
    }
    setSelectedDate(nextDate);
  };

  return (
    <div className="min-h-screen bg-surface text-on-surface">
      <div className="fixed inset-0 -z-10">
        <div className="absolute top-10 right-10 h-60 w-60 rounded-full bg-primary/10 blur-3xl" />
        <div className="absolute bottom-0 left-0 h-72 w-72 rounded-full bg-tertiary-fixed-dim/20 blur-3xl" />
      </div>

      <header className="fixed top-0 left-0 w-full z-[60] bg-white/70 backdrop-blur-lg shadow-sm shadow-blue-900/5">
        <div className="flex justify-between items-center px-4 sm:px-6 h-16 w-full max-w-[var(--app-max-w)] mx-auto gap-2">
          <div className="flex items-center gap-2.5 min-w-0 pr-2">
            <LocaleToggle />
            <div className="min-w-0">
              <h1 className="text-lg sm:text-xl font-extrabold text-primary tracking-tighter font-headline whitespace-nowrap">
                {t("title", "日の結び")}
              </h1>
              <p className="hidden text-[11px] text-on-surface-variant sm:block">
                {t("subtitle", "みこと書きが更新されるその前に。想いを一束の記憶として留めます。")}
              </p>
            </div>
          </div>
          <div className="w-[8.25rem] max-w-[8.25rem] shrink-0 sm:w-full sm:max-w-xs">
            <label className="sr-only" htmlFor="diary-group-select">
              {t("select_group_sr", "チャットを選択")}
            </label>
            <select
              id="diary-group-select"
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
        <section className="mb-6">
          <div className="flex items-end justify-between flex-wrap gap-4">
            <div>
              <h2 className="text-3xl font-extrabold tracking-tight font-headline text-primary">
                {displayedDiary
                  ? tf("date_record_tpl", "{date} の記録", {
                      date: displayedDiary.date,
                    })
                  : selectedDate
                    ? tf("date_missing_tpl", "{date} の記録はありません", {
                        date: selectedDate,
                      })
                    : t("date_loading", "日付を読み込み中")}
              </h2>
            </div>
            <div className="flex items-center gap-3">
              <div className="bg-white/70 backdrop-blur-xl rounded-full px-4 py-2 flex items-center gap-2 shadow-sm">
                <button
                  type="button"
                  onClick={handleMovePrevDate}
                  disabled={!canMovePrev}
                  className="text-sm text-primary disabled:opacity-30"
                  aria-label="前日"
                >
                  ◀
                </button>
                <span className="min-w-[110px] text-center text-xs text-on-surface-variant">
                  {activeDate
                    ? toSlashDate(activeDate)
                    : t("date_loading", "日付を読み込み中")}
                </span>
                {canMoveNext ? (
                  <button
                    type="button"
                    onClick={handleMoveNextDate}
                    className="text-sm text-primary"
                    aria-label="翌日"
                  >
                    ▶
                  </button>
                ) : (
                  <span className="w-[1ch]" />
                )}
              </div>
            </div>
          </div>
          <p className="mt-3 text-sm text-on-surface-variant">
            {t(
              "auto_note",
              "要約は毎日23:55ごろに自動作成され、0:00にチャット表示がリセットされます。"
            )}
          </p>
        </section>

        {!activeGroup && (
          <div className="bg-surface-container-lowest rounded-2xl p-6 shadow-sm text-sm text-on-surface-variant">
            <p>{t("no_group_desc", "グループに参加すると日誌が表示されます。")}</p>
          </div>
        )}

        <section className="bg-surface-container-lowest rounded-2xl p-6 shadow-sm relative overflow-hidden">
          <div className="absolute -top-20 -right-10 w-64 h-64 rounded-full bg-gradient-to-br from-primary/20 to-secondary/10 blur-2xl" />
          <h3 className="text-2xl font-extrabold text-primary mt-2 font-headline">
            {displayedDiary?.summary ?? t("no_diary", "日誌がまだありません。")}
          </h3>
          <div className="mt-6 space-y-5 text-sm text-on-surface-variant leading-relaxed">
            {displayedDiary?.bullets?.map((bullet: string) => (
              <p key={bullet}>{bullet}</p>
            ))}
          </div>
        </section>

        <section className="mt-10">
          <div className="mb-4">
            <h3 className="text-xl font-extrabold tracking-tight font-headline text-primary">
              {t("emotion_title", "感情の温度")}
            </h3>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div className="bg-surface-container-low p-5 rounded-xl">
              <p className="font-label text-xs uppercase text-on-surface-variant">
                {t("safety_title", "安心感")}
              </p>
              <p className="text-2xl font-extrabold text-primary mt-2">
                {displayedDiary?.stats.safety ?? "--"}%
              </p>
              <p className="text-sm text-on-surface-variant mt-2">
                {t("safety_desc", "配慮のある言葉が増加")}
              </p>
            </div>
            <div className="bg-surface-container-low p-5 rounded-xl">
              <p className="font-label text-xs uppercase text-on-surface-variant">
                {t("activity_title", "活発さ")}
              </p>
              <p className="text-2xl font-extrabold text-primary mt-2">
                {displayedDiary?.stats.activity ?? "--"}%
              </p>
              <p className="text-sm text-on-surface-variant mt-2">
                {t("activity_desc", "質問・提案が中心")}
              </p>
            </div>
            <div className="bg-surface-container-low p-5 rounded-xl">
              <p className="font-label text-xs uppercase text-on-surface-variant">
                {t("alerts_title", "注意信号")}
              </p>
              <p className="text-2xl font-extrabold text-secondary mt-2">
                {displayedDiary?.stats.alerts ?? "--"}
                {t("alerts_suffix", "件")}
              </p>
              <p className="text-sm text-on-surface-variant mt-2">
                {t("alerts_desc", "早期ケアで解決済み")}
              </p>
            </div>
          </div>
        </section>
      </main>
    </div>
  );
}
