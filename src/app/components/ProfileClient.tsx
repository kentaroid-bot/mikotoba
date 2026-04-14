"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useAction, useConvexAuth, useMutation, useQuery } from "convex/react";
import { useAuth, useClerk, useUser } from "@clerk/nextjs";
import { api } from "../../../convex/_generated/api";
import type { Id } from "../../../convex/_generated/dataModel";
import { useUiStrings } from "./useUiStrings";
import LocaleToggle from "./LocaleToggle";

const FACILITATOR_PRESET_OPTIONS = [
  {
    value: "encouraging",
    labelKey: "facilitator_preset_encouraging",
    fallbackLabel: "励まし型",
  },
  {
    value: "watcher",
    labelKey: "facilitator_preset_watcher",
    fallbackLabel: "見守り型",
  },
  {
    value: "facilitator",
    labelKey: "facilitator_preset_facilitator",
    fallbackLabel: "進行役型",
  },
  {
    value: "disciplined",
    labelKey: "facilitator_preset_disciplined",
    fallbackLabel: "規律型",
  },
] as const;

type FacilitatorPreset = (typeof FACILITATOR_PRESET_OPTIONS)[number]["value"];

export default function ProfileClient() {
  const { isLoaded, isSignedIn, userId } = useAuth();
  const clerk = useClerk();
  const { user } = useUser();
  const { t } = useUiStrings("profile");
  const { isLoading: isConvexLoading, isAuthenticated: isConvexAuthenticated } =
    useConvexAuth();
  const profile = useQuery(api.profile.getMy);
  const settings = useQuery(api.settings.get);
  const ensureProfile = useMutation(api.profile.ensureMyProfile);
  const activeGroup = useQuery(api.groups.getActive);
  const groups = useQuery(api.groups.listMine);
  const managedGroups = useQuery(api.groups.listManaged);
  const groupRole = useQuery(
    api.groups.getMyRole,
    activeGroup ? { groupId: activeGroup._id } : "skip"
  );
  const groupMembers = useQuery(
    api.groups.listMembers,
    activeGroup ? { groupId: activeGroup._id } : "skip"
  );
  const dailyStatus = useQuery(
    api.messages.getDailyStatus,
    activeGroup ? { groupId: activeGroup._id } : "skip"
  );
  const createGroup = useMutation(api.groups.create);
  const renameGroup = useMutation(api.groups.updateName);
  const updateGroupDescription = useMutation(api.groups.updateDescription);
  const updateFacilitator = useMutation(api.groups.updateFacilitator);
  const transferAdmin = useMutation(api.groups.transferAdmin);
  const setActiveGroup = useMutation(api.profile.setActiveGroup);
  const updateMyProfile = useMutation(api.profile.updateMy);
  const syncGroupAvatarsFromClerk = useAction(api.profile.syncGroupAvatarsFromClerk);
  const createInvite = useMutation(api.invites.create);
  const setDailyLimit = useMutation(api.settings.setDailyLimit);
  const createCost = useQuery(api.groups.getCreateCost);
  const createEligibility = useQuery(api.groups.getCreateEligibility);

  const [nameInput, setNameInput] = useState("");
  const [guardianIdInput, setGuardianIdInput] = useState("");
  const [classLabelInput, setClassLabelInput] = useState("");
  const [mottoInput, setMottoInput] = useState("");
  const [groupName, setGroupName] = useState("");
  const [renameGroupName, setRenameGroupName] = useState("");
  const [groupDescriptionInput, setGroupDescriptionInput] = useState("");
  const [facilitatorEnabled, setFacilitatorEnabled] = useState(false);
  const [facilitatorNameInput, setFacilitatorNameInput] = useState("AIヒーロー");
  const [facilitatorPresetInput, setFacilitatorPresetInput] =
    useState<FacilitatorPreset>("encouraging");
  const [facilitatorGenderInput, setFacilitatorGenderInput] = useState("");
  const [facilitatorAgeInput, setFacilitatorAgeInput] = useState("");
  const [facilitatorFirstPersonInput, setFacilitatorFirstPersonInput] = useState("わたし");
  const [facilitatorToneInput, setFacilitatorToneInput] = useState("バランス");
  const [facilitatorBioInput, setFacilitatorBioInput] = useState("");
  const [facilitatorPreviewMessage, setFacilitatorPreviewMessage] = useState("");
  const [isGeneratingFacilitatorPreview, setIsGeneratingFacilitatorPreview] =
    useState(false);
  const [facilitatorPreviewError, setFacilitatorPreviewError] = useState<string | null>(
    null
  );
  const [delegateTargetUserId, setDelegateTargetUserId] = useState("");
  const [inviteToken, setInviteToken] = useState<string | null>(null);
  const [inviteMaxUses, setInviteMaxUses] = useState("5");
  const [dailyLimitInput, setDailyLimitInput] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [isSigningOut, setIsSigningOut] = useState(false);
  const [profileError, setProfileError] = useState<string | null>(null);
  const [profileSaved, setProfileSaved] = useState(false);
  const [isSavingProfile, setIsSavingProfile] = useState(false);
  const ensuringProfileRef = useRef(false);
  const profileHydratedRef = useRef(false);
  const avatarSyncGroupRef = useRef<string | null>(null);
  const displayGuardianId = profile?.guardianId
    ? profile.guardianId.startsWith("@")
      ? profile.guardianId
      : `@${profile.guardianId}`
    : "--";
  const activeGroupId = activeGroup?._id;
  const activeGroupName = activeGroup?.name ?? "";

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

  useEffect(() => {
    if (!profile || profileHydratedRef.current) return;
    setNameInput(profile.name);
    setGuardianIdInput(profile.guardianId);
    setClassLabelInput(profile.classLabel);
    setMottoInput(profile.motto);
    profileHydratedRef.current = true;
  }, [profile]);

  useEffect(() => {
    setRenameGroupName(activeGroup?.name ?? "");
  }, [activeGroup?._id, activeGroup?.name]);

  useEffect(() => {
    setGroupDescriptionInput(activeGroup?.description ?? "");
  }, [activeGroup?._id, activeGroup?.description]);

  useEffect(() => {
    const facilitator = activeGroup?.facilitator;
    if (!facilitator) {
      setFacilitatorEnabled(false);
      setFacilitatorNameInput("AIヒーロー");
      setFacilitatorPresetInput("encouraging");
      setFacilitatorGenderInput("");
      setFacilitatorAgeInput("");
      setFacilitatorFirstPersonInput("わたし");
      setFacilitatorToneInput("バランス");
      setFacilitatorBioInput("");
      return;
    }

    setFacilitatorEnabled(Boolean(facilitator.isActive));
    setFacilitatorNameInput(facilitator.displayName || "AIヒーロー");
    setFacilitatorPresetInput(facilitator.preset ?? "encouraging");
    setFacilitatorGenderInput(facilitator.gender ?? "");
    setFacilitatorAgeInput(
      typeof facilitator.age === "number" ? String(facilitator.age) : ""
    );
    setFacilitatorFirstPersonInput(facilitator.firstPerson || "わたし");
    setFacilitatorToneInput(facilitator.tone || "バランス");
    setFacilitatorBioInput(facilitator.customBio ?? "");
  }, [activeGroup?._id, activeGroup?.facilitator]);

  useEffect(() => {
    if (!groupMembers?.length || !userId) {
      setDelegateTargetUserId("");
      return;
    }
    const firstCandidate = groupMembers.find(
      (member) => member.userId !== userId && member.role !== "admin"
    );
    setDelegateTargetUserId(firstCandidate?.userId ?? "");
  }, [groupMembers, userId]);

  useEffect(() => {
    if (!activeGroup?._id || groupRole !== "admin") {
      avatarSyncGroupRef.current = null;
      return;
    }
    if (avatarSyncGroupRef.current === activeGroup._id) {
      return;
    }
    avatarSyncGroupRef.current = activeGroup._id;
    void syncGroupAvatarsFromClerk({ groupId: activeGroup._id }).catch((error) => {
      console.error(error);
    });
  }, [activeGroup?._id, groupRole, syncGroupAvatarsFromClerk]);

  const inviteUrl = useMemo(() => {
    if (!inviteToken || typeof window === "undefined") return null;
    return `${window.location.origin}/invite/${inviteToken}`;
  }, [inviteToken]);

  const delegateCandidates = useMemo(
    () =>
      (groupMembers ?? []).filter(
        (member) => member.userId !== userId && member.role !== "admin"
      ),
    [groupMembers, userId]
  );
  const hasManagedGroups = (managedGroups?.length ?? 0) > 0;
  const dailyLimitMin = 1;
  const dailyLimitMax = 10;
  const isCreateLockedByEmail =
    createEligibility !== undefined && !createEligibility.hasEmail;

  useEffect(() => {
    if (!activeGroupId || groupRole !== "admin") return;
    setDailyLimitInput(String(settings?.dailyPostLimit ?? 3));
  }, [activeGroupId, groupRole, settings?.dailyPostLimit]);

  useEffect(() => {
    if (!activeGroupId || groupRole !== "admin") {
      setFacilitatorPreviewMessage("");
      setFacilitatorPreviewError(null);
      return;
    }

    const abortController = new AbortController();
    const timer = setTimeout(() => {
      const parsedAge = facilitatorAgeInput.trim()
        ? Number.parseInt(facilitatorAgeInput, 10)
        : undefined;

      setIsGeneratingFacilitatorPreview(true);
      setFacilitatorPreviewError(null);

      void fetch("/api/guardian/preview", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        signal: abortController.signal,
        body: JSON.stringify({
          groupName: activeGroupName,
          groupDescription: groupDescriptionInput,
          facilitator: {
            isActive: facilitatorEnabled,
            displayName: facilitatorNameInput,
            preset: facilitatorPresetInput,
            gender: facilitatorGenderInput,
            age: Number.isFinite(parsedAge) ? parsedAge : undefined,
            firstPerson: facilitatorFirstPersonInput,
            tone: facilitatorToneInput,
            customBio: facilitatorBioInput,
          },
        }),
      })
        .then(async (response) => {
          if (!response.ok) {
            const detail = await response.text();
            throw new Error(detail || "preview_failed");
          }
          const data = (await response.json()) as { sample?: string };
          const sample = String(data.sample ?? "").trim();
          if (!sample) {
            throw new Error("empty_preview");
          }
          setFacilitatorPreviewMessage(sample);
        })
        .catch((err: unknown) => {
          if (
            typeof err === "object" &&
            err !== null &&
            "name" in err &&
            err.name === "AbortError"
          ) {
            return;
          }
          setFacilitatorPreviewError(
            t("error_preview", "口調サンプルを生成できませんでした。")
          );
        })
        .finally(() => {
          if (!abortController.signal.aborted) {
            setIsGeneratingFacilitatorPreview(false);
          }
        });
    }, 450);

    return () => {
      clearTimeout(timer);
      abortController.abort();
    };
  }, [
    activeGroupId,
    activeGroupName,
    groupRole,
    groupDescriptionInput,
    facilitatorEnabled,
    facilitatorNameInput,
    facilitatorPresetInput,
    facilitatorGenderInput,
    facilitatorAgeInput,
    facilitatorFirstPersonInput,
    facilitatorToneInput,
    facilitatorBioInput,
    t,
  ]);

  const handleCreateGroup = async () => {
    if (!groupName.trim()) return;
    if (isCreateLockedByEmail) {
      setError(
        t(
          "error_group_create_email_required",
          "グループ作成にはメールアドレス登録が必要です。"
        )
      );
      return;
    }
    setError(null);
    try {
      await createGroup({ name: groupName.trim() });
      setGroupName("");
    } catch (err) {
      if (
        err instanceof Error &&
        err.message === "EMAIL_REQUIRED_FOR_GROUP_CREATE"
      ) {
        setError(
          t(
            "error_group_create_email_required",
            "グループ作成にはメールアドレス登録が必要です。"
          )
        );
        return;
      }
      setError(
        err instanceof Error ? err.message : t("error_create", "作成に失敗しました。")
      );
    }
  };

  const handleCreateInvite = async () => {
    if (!activeGroup) return;
    setError(null);
    try {
      const parsedMaxUses = Number.parseInt(inviteMaxUses, 10);
      const result = await createInvite({
        groupId: activeGroup._id,
        maxUses: Number.isFinite(parsedMaxUses) ? parsedMaxUses : undefined,
      });
      setInviteToken(result.token);
    } catch (err) {
      setError(
        err instanceof Error ? err.message : t("error_invite_create", "招待作成に失敗しました。")
      );
    }
  };

  const handleSwitchGroup = async (groupId: Id<"groups">) => {
    setError(null);
    try {
      await setActiveGroup({ groupId });
    } catch (err) {
      setError(
        err instanceof Error ? err.message : t("error_group_switch", "グループ切り替えに失敗しました。")
      );
    }
  };

  const handleSaveDailyLimit = async () => {
    if (!activeGroup || groupRole !== "admin") return;
    setError(null);
    try {
      const parsed = Number.parseInt(
        dailyLimitInput || String(settings?.dailyPostLimit ?? 3),
        10
      );
      const safe = Number.isFinite(parsed)
        ? Math.min(dailyLimitMax, Math.max(dailyLimitMin, parsed))
        : settings?.dailyPostLimit ?? 3;
      await setDailyLimit({ dailyPostLimit: safe });
      setDailyLimitInput(String(safe));
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : t("error_daily_limit_update", "投稿上限の更新に失敗しました。")
      );
    }
  };

  const adjustDailyLimitInput = (delta: number) => {
    const current = Number.parseInt(
      dailyLimitInput || String(settings?.dailyPostLimit ?? 3),
      10
    );
    const base = Number.isFinite(current) ? current : 3;
    const next = Math.min(dailyLimitMax, Math.max(dailyLimitMin, base + delta));
    setDailyLimitInput(String(next));
  };

  const handleRenameGroup = async () => {
    if (!activeGroup || groupRole !== "admin") return;
    setError(null);
    try {
      await renameGroup({
        groupId: activeGroup._id,
        name: renameGroupName,
      });
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : t("error_group_rename", "グループ名の変更に失敗しました。")
      );
    }
  };

  const handleTransferAdmin = async () => {
    if (!activeGroup || groupRole !== "admin" || !delegateTargetUserId) return;
    setError(null);
    try {
      await transferAdmin({
        groupId: activeGroup._id,
        targetUserId: delegateTargetUserId,
      });
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : t("error_transfer_admin", "管理権限の委譲に失敗しました。")
      );
    }
  };

  const handleSaveGroupDescription = async () => {
    if (!activeGroup || groupRole !== "admin") return;
    setError(null);
    try {
      await updateGroupDescription({
        groupId: activeGroup._id,
        description: groupDescriptionInput,
      });
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : t("error_group_description_update", "グループ説明の更新に失敗しました。")
      );
    }
  };

  const handleSaveFacilitator = async () => {
    if (!activeGroup || groupRole !== "admin") return;
    setError(null);
    try {
      const parsedAge = facilitatorAgeInput.trim()
        ? Number.parseInt(facilitatorAgeInput, 10)
        : undefined;
      await updateFacilitator({
        groupId: activeGroup._id,
        isActive: facilitatorEnabled,
        displayName: facilitatorNameInput,
        preset: facilitatorPresetInput,
        gender: facilitatorGenderInput,
        age: Number.isFinite(parsedAge) ? parsedAge : undefined,
        firstPerson: facilitatorFirstPersonInput,
        tone: facilitatorToneInput,
        customBio: facilitatorBioInput,
      });
    } catch (err) {
      setError(
        err instanceof Error ? err.message : t("error_ai_settings_update", "AI設定の更新に失敗しました。")
      );
    }
  };

  const handleSaveProfile = async () => {
    if (!profile) return;
    setProfileSaved(false);
    setProfileError(null);
    setIsSavingProfile(true);
    try {
      await updateMyProfile({
        name: nameInput,
        classLabel: classLabelInput,
        guardianId: guardianIdInput,
        motto: mottoInput,
      });
      setProfileSaved(true);
    } catch (err) {
      setProfileError(
        err instanceof Error
          ? err.message
          : t("error_profile_update", "プロフィール更新に失敗しました。")
      );
    } finally {
      setIsSavingProfile(false);
    }
  };

  return (
    <div className="min-h-screen bg-surface text-on-surface">
      <div className="fixed inset-0 -z-10">
        <div className="absolute -top-16 left-1/2 h-64 w-64 -translate-x-1/2 rounded-full bg-secondary/10 blur-3xl" />
        <div className="absolute bottom-0 right-0 h-72 w-72 rounded-full bg-primary/10 blur-3xl" />
      </div>

      <header className="fixed top-0 left-0 w-full z-[60] bg-white/70 backdrop-blur-lg shadow-sm shadow-blue-900/5">
        <div className="flex justify-between items-center px-4 sm:px-6 h-16 w-full max-w-[var(--app-max-w)] mx-auto gap-2">
          <div className="flex items-center gap-2.5 min-w-0 pr-2">
            <LocaleToggle />
            <div className="min-w-0">
              <h1 className="text-lg sm:text-xl font-extrabold text-primary tracking-tighter font-headline whitespace-nowrap">
                {t("title", "身支度")}
              </h1>
              <p className="hidden text-[11px] text-on-surface-variant sm:block">
                {t("subtitle", "心地よい交流を支えるための準備をここで行います。")}
              </p>
            </div>
          </div>
          <div className="w-[8.25rem] max-w-[8.25rem] shrink-0 sm:w-full sm:max-w-xs">
            <label className="sr-only" htmlFor="profile-group-select">
              {t("select_group_sr", "チャットを選択")}
            </label>
            <select
              id="profile-group-select"
              value={activeGroup?._id ?? ""}
              onChange={(event) => {
                const selectedGroupId = event.target.value as Id<"groups">;
                if (!selectedGroupId || selectedGroupId === activeGroup?._id) return;
                void handleSwitchGroup(selectedGroupId);
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
        <section className="bg-surface-container-lowest rounded-2xl p-6 shadow-sm relative overflow-hidden">
          <div className="absolute -top-24 -right-16 w-60 h-60 rounded-full bg-gradient-to-br from-primary/20 to-secondary/10 blur-2xl" />
          <div className="flex flex-col md:flex-row gap-6 md:items-center">
            <div className="flex items-center gap-4">
              {user?.imageUrl ? (
                <img
                  className="w-16 h-16 rounded-full object-cover"
                  alt="Student avatar"
                  src={user.imageUrl}
                />
              ) : (
                <div className="w-16 h-16 rounded-full bg-surface-container-low flex items-center justify-center text-primary font-headline font-bold text-xl">
                  {profile?.name?.trim()?.charAt(0) ?? "?"}
                </div>
              )}
              <div>
                <h2 className="text-2xl font-extrabold text-primary font-headline">
                  {profile?.name ?? "--"}
                </h2>
                <p className="text-lg font-bold text-primary font-headline mt-1 leading-tight">
                  {displayGuardianId}
                </p>
                <p className="text-sm text-on-surface-variant">
                  {profile?.classLabel ?? "--"}
                </p>
                <button
                  type="button"
                  onClick={async () => {
                    if (isSigningOut) return;
                    setIsSigningOut(true);
                    try {
                      await clerk.signOut({ redirectUrl: "/signin" });
                    } finally {
                      setIsSigningOut(false);
                    }
                  }}
                  className="mt-2 inline-flex rounded-full border border-primary/20 bg-white/90 px-3 py-1 text-[10px] font-headline font-semibold tracking-wide text-primary"
                  disabled={isSigningOut}
                >
                  {isSigningOut
                    ? t("signing_out", "サインアウト中...")
                    : t("sign_out", "サインアウト")}
                </button>
              </div>
            </div>
            <div className="flex-1 grid grid-cols-2 gap-4">
              <div className="bg-surface-container-low p-4 rounded-xl">
                <p className="font-label text-xs uppercase text-on-surface-variant">
                  {t("points_title", "徳ポイント")}
                </p>
                <p className="text-2xl font-extrabold text-primary mt-2">
                  {profile?.points ?? "--"}
                </p>
              </div>
              <div className="bg-surface-container-low p-4 rounded-xl">
                <p className="font-label text-xs uppercase text-on-surface-variant">
                  {t("post_count_title", "投稿回数")}
                </p>
                <p className="text-2xl font-extrabold text-primary mt-2">
                  {dailyStatus ? `${dailyStatus.used}/${dailyStatus.limit}` : "--"}
                </p>
              </div>
            </div>
          </div>
        </section>

        <section className="mt-8 grid grid-cols-1 md:grid-cols-2 gap-6">
          <div className="bg-surface-container-low p-6 rounded-2xl shadow-sm">
            <div>
              <h3 className="font-headline text-lg font-bold text-primary">
                {t("weekly_title", "今週の軌跡")}
              </h3>
            </div>
            <div className="mt-4 space-y-3 text-sm text-on-surface-variant">
              <div className="flex justify-between">
                <span>{t("weekly_positive", "ポジティブ投稿")}</span>
                <span className="font-semibold text-primary">
                  {profile?.weeklyStats.positive ?? "--"}
                </span>
              </div>
              <div className="flex justify-between">
                <span>{t("weekly_announcement", "重要連絡共有")}</span>
                <span className="font-semibold text-primary">
                  {profile?.weeklyStats.announcements ?? "--"}
                </span>
              </div>
              <div className="flex justify-between">
                <span>{t("weekly_ai_follow", "AIフォロー")}</span>
                <span className="font-semibold text-primary">
                  {profile?.weeklyStats.aiFollows ?? "--"}
                </span>
              </div>
            </div>
          </div>

          <div className="bg-surface-container-low p-6 rounded-2xl shadow-sm relative overflow-hidden">
            <div className="absolute -bottom-10 -right-8 w-40 h-40 rounded-full bg-tertiary-fixed-dim/20 blur-2xl" />
            <div>
              <h3 className="font-headline text-lg font-bold text-primary">
                {t("message_title", "メッセージ")}
              </h3>
            </div>
            <p className="text-sm text-on-surface-variant mt-4">
              {profile?.motto ?? "--"}
            </p>
          </div>
        </section>

        <section className="mt-8 bg-surface-container-low p-6 rounded-2xl shadow-sm">
          <div>
            <h3 className="font-headline text-lg font-bold text-primary">
              {t("edit_title", "プロフィール編集")}
            </h3>
          </div>
          <div className="mt-4 grid grid-cols-1 md:grid-cols-2 gap-4">
            <label className="flex flex-col gap-2 text-sm">
              <span className="text-on-surface-variant">
                {t("edit_name_label", "名前")}
              </span>
              <input
                value={nameInput}
                onChange={(event) => setNameInput(event.target.value)}
                className="rounded-xl px-4 py-2 bg-white/80"
                maxLength={40}
              />
            </label>
            <label className="flex flex-col gap-2 text-sm">
              <span className="text-on-surface-variant">
                {t("edit_guardian_id_label", "Guardian ID")}
              </span>
              <input
                value={guardianIdInput}
                onChange={(event) => setGuardianIdInput(event.target.value)}
                className="rounded-xl px-4 py-2 bg-white/80"
                maxLength={64}
                placeholder={t("edit_guardian_id_placeholder", "kotonoha")}
              />
            </label>
            <label className="flex flex-col gap-2 text-sm">
              <span className="text-on-surface-variant">
                {t("edit_class_label", "所属")}
              </span>
              <input
                value={classLabelInput}
                onChange={(event) => setClassLabelInput(event.target.value)}
                className="rounded-xl px-4 py-2 bg-white/80"
                maxLength={40}
              />
            </label>
            <label className="flex flex-col gap-2 text-sm md:col-span-2">
              <span className="text-on-surface-variant">
                {t("edit_message_label", "メッセージ")}
              </span>
              <textarea
                value={mottoInput}
                onChange={(event) => setMottoInput(event.target.value)}
                className="rounded-xl px-4 py-2 bg-white/80 resize-y"
                maxLength={200}
                rows={3}
              />
            </label>
          </div>
          <div className="mt-4 flex items-center gap-3">
            <button
              onClick={handleSaveProfile}
              disabled={isSavingProfile || !profile}
              className="bg-primary text-white px-4 py-2 rounded-full font-label text-xs uppercase disabled:opacity-40"
            >
              {isSavingProfile
                ? t("saving_profile", "保存中...")
                : t("save_profile", "プロフィールを保存")}
            </button>
            {profileSaved && (
              <p className="text-sm text-secondary">
                {t("saved_profile", "プロフィールを更新しました。")}
              </p>
            )}
          </div>
          {profileError && <p className="mt-2 text-sm text-secondary">{profileError}</p>}
        </section>

        {hasManagedGroups ? (
          <section className="mt-10 bg-surface-container-lowest rounded-2xl p-6 shadow-sm">
          <div>
            <h3 className="font-headline text-lg font-bold text-primary">
              {t("groups_title", "グループ管理")}
            </h3>
          </div>

          <div className="mt-4 space-y-4">
            <div className="bg-surface-container-low p-4 rounded-xl">
              <p className="font-label text-xs uppercase text-on-surface-variant">
                {t("group_manage_select_title", "管理するチャット名（プルダウン）")}
              </p>
              {groups?.length ? (
                <div className="mt-3 space-y-2">
                  <select
                    value={activeGroup?._id ?? ""}
                    onChange={(event) => {
                      const selectedGroupId = event.target.value as Id<"groups">;
                      if (!selectedGroupId || selectedGroupId === activeGroup?._id) return;
                      void handleSwitchGroup(selectedGroupId);
                    }}
                    className="w-full rounded-xl px-4 py-2 bg-white/80 text-sm"
                  >
                    {groups.map((group) =>
                      group ? (
                        <option key={group._id} value={group._id}>
                          {group.name}
                        </option>
                      ) : null
                    )}
                  </select>
                  <p className="text-xs text-on-surface-variant">
                    {t("group_manage_select_hint", "管理対象のチャットを選択してください。")}
                  </p>
                </div>
              ) : (
                <p className="mt-2 text-sm text-on-surface-variant">
                  {t("group_manage_no_joined_group", "まだ参加しているチャットがありません。")}
                </p>
              )}
            </div>

            <div className="bg-surface-container-low p-4 rounded-xl">
              <p className="font-label text-xs uppercase text-on-surface-variant">
                {t("group_rename_title", "グループ名変更")}
              </p>
              {activeGroup && groupRole === "admin" ? (
                <div className="mt-3 flex flex-col md:flex-row gap-3">
                  <input
                    value={renameGroupName}
                    onChange={(event) => setRenameGroupName(event.target.value)}
                    maxLength={60}
                    className="flex-1 rounded-full px-4 py-2 bg-white/80 text-sm"
                  />
                  <button
                    onClick={handleRenameGroup}
                    className="bg-primary text-white px-4 py-2 rounded-full font-label text-xs uppercase"
                  >
                    {t("common_change", "変更")}
                  </button>
                </div>
              ) : (
                <p className="mt-2 text-sm text-on-surface-variant">
                  {t("group_rename_admin_only", "グループ名は管理者のみ変更できます。")}
                </p>
              )}
            </div>

            <div className="bg-surface-container-low p-4 rounded-xl">
              <p className="font-label text-xs uppercase text-on-surface-variant">
                {t("group_description_title", "グループ説明")}
              </p>
              {activeGroup && groupRole === "admin" ? (
                <div className="mt-3 space-y-3">
                  <textarea
                    value={groupDescriptionInput}
                    onChange={(event) => setGroupDescriptionInput(event.target.value)}
                    maxLength={500}
                    rows={4}
                    placeholder={t(
                      "group_description_placeholder",
                      "例: 中学2年のクラス連絡用。提出物・持ち物・集合連絡を共有する目的。"
                    )}
                    className="w-full rounded-xl px-4 py-3 bg-white/80 text-sm resize-y"
                  />
                  <div className="flex items-center justify-between">
                    <span className="text-xs text-on-surface-variant">
                      {t(
                        "group_description_help",
                        "AIヒーローのコメント・抽出・要約の参考に使用されます。"
                      )}
                    </span>
                    <button
                      onClick={handleSaveGroupDescription}
                      className="bg-primary text-white px-4 py-2 rounded-full font-label text-xs uppercase"
                    >
                      {t("common_save", "保存")}
                    </button>
                  </div>
                </div>
              ) : (
                <p className="mt-2 text-sm text-on-surface-variant">
                  {t("group_description_admin_only", "グループ説明は管理者のみ変更できます。")}
                </p>
              )}
            </div>

            <div className="bg-surface-container-low p-4 rounded-xl">
              <p className="font-label text-xs uppercase text-on-surface-variant">
                {t("facilitator_title", "AIファシリテーター設定")}
              </p>
              {activeGroup && groupRole === "admin" ? (
                <div className="mt-3 space-y-4">
                  <label className="flex items-center justify-between gap-3 rounded-xl bg-white/70 px-4 py-3">
                    <span className="text-sm text-on-surface-variant">
                      {t("facilitator_enable_label", "このチャットでAIファシリテーターを有効化")}
                    </span>
                    <input
                      type="checkbox"
                      checked={facilitatorEnabled}
                      onChange={(event) => setFacilitatorEnabled(event.target.checked)}
                      className="h-4 w-4"
                    />
                  </label>

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                    <label className="flex flex-col gap-2 text-sm">
                      <span className="text-on-surface-variant">
                        {t("facilitator_name_label", "名前")}
                      </span>
                      <input
                        value={facilitatorNameInput}
                        onChange={(event) => setFacilitatorNameInput(event.target.value)}
                        maxLength={20}
                        className="rounded-xl px-4 py-2 bg-white/80"
                        placeholder={t("facilitator_name_placeholder", "例: ルフィ先生")}
                      />
                    </label>
                    <label className="flex flex-col gap-2 text-sm">
                      <span className="text-on-surface-variant">
                        {t("facilitator_preset_label", "性格プリセット")}
                      </span>
                      <select
                        value={facilitatorPresetInput}
                        onChange={(event) =>
                          setFacilitatorPresetInput(event.target.value as FacilitatorPreset)
                        }
                        className="rounded-xl px-4 py-2 bg-white/80"
                      >
                        {FACILITATOR_PRESET_OPTIONS.map((option) => (
                          <option key={option.value} value={option.value}>
                            {t(option.labelKey, option.fallbackLabel)}
                          </option>
                        ))}
                      </select>
                    </label>
                    <label className="flex flex-col gap-2 text-sm">
                      <span className="text-on-surface-variant">
                        {t("facilitator_gender_label", "性別（任意）")}
                      </span>
                      <input
                        value={facilitatorGenderInput}
                        onChange={(event) => setFacilitatorGenderInput(event.target.value)}
                        maxLength={20}
                        className="rounded-xl px-4 py-2 bg-white/80"
                        placeholder={t(
                          "facilitator_gender_placeholder",
                          "例: 男性 / 女性 / 未設定"
                        )}
                      />
                    </label>
                    <label className="flex flex-col gap-2 text-sm">
                      <span className="text-on-surface-variant">
                        {t("facilitator_age_label", "年齢（任意）")}
                      </span>
                      <input
                        value={facilitatorAgeInput}
                        onChange={(event) => setFacilitatorAgeInput(event.target.value)}
                        type="number"
                        min={0}
                        max={120}
                        className="rounded-xl px-4 py-2 bg-white/80"
                        placeholder={t("facilitator_age_placeholder", "例: 28")}
                      />
                    </label>
                    <label className="flex flex-col gap-2 text-sm">
                      <span className="text-on-surface-variant">
                        {t("facilitator_first_person_label", "一人称（任意）")}
                      </span>
                      <input
                        value={facilitatorFirstPersonInput}
                        onChange={(event) =>
                          setFacilitatorFirstPersonInput(event.target.value)
                        }
                        maxLength={10}
                        className="rounded-xl px-4 py-2 bg-white/80"
                        placeholder={t("facilitator_first_person_placeholder", "例: わたし")}
                      />
                    </label>
                    <label className="flex flex-col gap-2 text-sm">
                      <span className="text-on-surface-variant">
                        {t("facilitator_tone_label", "話し方（任意）")}
                      </span>
                      <input
                        value={facilitatorToneInput}
                        onChange={(event) => setFacilitatorToneInput(event.target.value)}
                        maxLength={20}
                        className="rounded-xl px-4 py-2 bg-white/80"
                        placeholder={t("facilitator_tone_placeholder", "例: 丁寧 / フランク")}
                      />
                    </label>
                  </div>

                  <label className="flex flex-col gap-2 text-sm">
                    <span className="text-on-surface-variant">
                      {t("facilitator_bio_label", "補足キャラ設定（任意）")}
                    </span>
                    <textarea
                      value={facilitatorBioInput}
                      onChange={(event) => setFacilitatorBioInput(event.target.value)}
                      maxLength={100}
                      rows={3}
                      className="rounded-xl px-4 py-2 bg-white/80 resize-y"
                      placeholder={t(
                        "facilitator_bio_placeholder",
                        "例: 体育会系で短く背中を押す。連絡事項は明確に伝える。"
                      )}
                    />
                  </label>

                  <div className="rounded-xl bg-white/70 px-4 py-3 text-sm text-on-surface-variant">
                    <p className="font-semibold text-primary">
                      {t("facilitator_preview_title", "口調サンプル")}
                    </p>
                    <p className="mt-2 text-sm">
                      {isGeneratingFacilitatorPreview
                        ? t("facilitator_preview_loading", "管理AIがサンプルを作成中...")
                        : facilitatorPreviewMessage ||
                          t("facilitator_preview_empty", "設定を入力するとここに表示されます。")}
                    </p>
                    {facilitatorPreviewError ? (
                      <p className="mt-2 text-xs text-secondary">
                        {facilitatorPreviewError}
                      </p>
                    ) : null}
                  </div>

                  <div className="flex items-center justify-between">
                    <span className="text-xs text-on-surface-variant">
                      {t(
                        "facilitator_hint",
                        "設定はこのチャット専用です。ルール判定を優先し、口調のみ反映します。"
                      )}
                    </span>
                    <button
                      onClick={handleSaveFacilitator}
                      className="bg-primary text-white px-4 py-2 rounded-full font-label text-xs uppercase"
                    >
                      {t("common_save", "保存")}
                    </button>
                  </div>
                </div>
              ) : (
                <p className="mt-2 text-sm text-on-surface-variant">
                  {t(
                    "facilitator_admin_only",
                    "AIファシリテーター設定は管理者のみ変更できます。"
                  )}
                </p>
              )}
            </div>

            <div className="bg-surface-container-low p-4 rounded-xl">
              <p className="font-label text-xs uppercase text-on-surface-variant">
                {t("daily_limit_title", "日次投稿上限")}
              </p>
              {activeGroup && groupRole === "admin" ? (
                <div className="mt-3 flex flex-col md:flex-row md:items-center gap-3">
                  <div className="inline-flex items-center rounded-full bg-white/80 p-1 shadow-sm w-fit">
                    <button
                      type="button"
                      onClick={() => adjustDailyLimitInput(-1)}
                      className="h-10 w-10 rounded-full text-primary text-base font-bold"
                      aria-label={t("daily_limit_decrease", "投稿上限を1減らす")}
                    >
                      -
                    </button>
                    <input
                      value={dailyLimitInput}
                      onChange={(event) => {
                        const digits = event.target.value.replace(/[^\d]/g, "");
                        if (!digits) {
                          setDailyLimitInput("");
                          return;
                        }
                        const parsed = Number.parseInt(digits, 10);
                        const clamped = Math.min(
                          dailyLimitMax,
                          Math.max(dailyLimitMin, parsed)
                        );
                        setDailyLimitInput(String(clamped));
                      }}
                      type="text"
                      inputMode="numeric"
                      pattern="[0-9]*"
                      className="w-14 bg-transparent text-center text-sm font-semibold text-primary focus:outline-none"
                    />
                    <button
                      type="button"
                      onClick={() => adjustDailyLimitInput(1)}
                      className="h-10 w-10 rounded-full text-primary text-base font-bold"
                      aria-label={t("daily_limit_increase", "投稿上限を1増やす")}
                    >
                      +
                    </button>
                  </div>
                  <button
                    onClick={handleSaveDailyLimit}
                    className="bg-primary text-white px-4 py-2 rounded-full font-label text-xs uppercase"
                  >
                    {t("common_save", "保存")}
                  </button>
                </div>
              ) : (
                <p className="mt-2 text-sm text-on-surface-variant">
                  {t("daily_limit_readonly_prefix", "現在の上限")}:{" "}
                  {settings?.dailyPostLimit ?? 3}{" "}
                  {t("daily_limit_readonly_suffix", "回/日（変更は管理者のみ）")}
                </p>
              )}
            </div>

            <div className="bg-surface-container-low p-4 rounded-xl">
              <p className="font-label text-xs uppercase text-on-surface-variant">
                {t("invite_title", "招待リンク")}
              </p>
              {activeGroup && groupRole === "admin" ? (
                <div className="mt-3 space-y-3">
                  <div className="flex items-center gap-3">
                    <label className="text-xs text-on-surface-variant">
                      {t("invite_max_uses_label", "利用回数")}
                    </label>
                    <input
                      value={inviteMaxUses}
                      onChange={(event) => setInviteMaxUses(event.target.value)}
                      type="number"
                      min={1}
                      max={100}
                      className="w-28 rounded-full px-4 py-2 bg-white/80 text-sm"
                    />
                  </div>
                  <button
                    onClick={handleCreateInvite}
                    className="bg-primary text-white px-4 py-2 rounded-full font-label text-xs uppercase"
                  >
                    {t("invite_create_button", "招待リンクを発行")}
                  </button>
                  {inviteUrl && (
                    <div className="text-sm text-on-surface-variant break-all">
                      {inviteUrl}
                      {t("invite_created_suffix_prefix", "（最大")} {inviteMaxUses || 1}{" "}
                      {t("invite_created_suffix_suffix", "回）")}
                    </div>
                  )}
                </div>
              ) : (
                <p className="mt-2 text-sm text-on-surface-variant">
                  {t("invite_admin_only", "招待リンクは管理者のみ発行できます。")}
                </p>
              )}
            </div>

            <div className="bg-surface-container-low p-4 rounded-xl">
              <p className="font-label text-xs uppercase text-on-surface-variant">
                {t("members_title", "グループメンバー")}
              </p>
              {activeGroup ? (
                groupMembers?.length ? (
                  <div className="mt-3 max-h-36 overflow-y-auto pr-1">
                    <div className="grid grid-cols-3 gap-2">
                      {groupMembers.map((member) => (
                        <div
                          key={member.userId}
                          className="rounded-lg bg-white/80 px-2 py-2 text-xs text-center text-on-surface-variant truncate"
                          title={`${member.name} (${member.guardianId})`}
                        >
                          {member.name}
                        </div>
                      ))}
                    </div>
                  </div>
                ) : (
                  <p className="mt-2 text-sm text-on-surface-variant">
                    {t("members_empty", "メンバーがまだいません。")}
                  </p>
                )
              ) : (
                <p className="mt-2 text-sm text-on-surface-variant">
                  {t("members_select_group", "グループを選択するとメンバーが表示されます。")}
                </p>
              )}
            </div>

            <div className="bg-surface-container-low p-4 rounded-xl">
              <p className="font-label text-xs uppercase text-on-surface-variant">
                {t("transfer_admin_title", "管理権限の委譲")}
              </p>
              {activeGroup && groupRole === "admin" ? (
                <div className="mt-3 space-y-3">
                  {delegateCandidates.length > 0 ? (
                    <>
                      <select
                        value={delegateTargetUserId}
                        onChange={(event) => setDelegateTargetUserId(event.target.value)}
                        className="w-full rounded-xl px-4 py-2 bg-white/80 text-sm"
                      >
                        {delegateCandidates.map((member) => (
                          <option key={member.userId} value={member.userId}>
                            {member.name} ({member.guardianId})
                          </option>
                        ))}
                      </select>
                      <button
                        onClick={handleTransferAdmin}
                        className="bg-secondary text-white px-4 py-2 rounded-full font-label text-xs uppercase"
                      >
                        {t("transfer_admin_button", "このユーザーに委譲")}
                      </button>
                    </>
                  ) : (
                    <p className="text-sm text-on-surface-variant">
                      {t("transfer_admin_no_candidate", "委譲可能なメンバーがいません。")}
                    </p>
                  )}
                </div>
              ) : (
                <p className="mt-2 text-sm text-on-surface-variant">
                  {t("transfer_admin_admin_only", "管理権限の委譲は管理者のみ実行できます。")}
                </p>
              )}
            </div>

          </div>
          </section>
        ) : null}

        <section className="mt-10 bg-surface-container-lowest rounded-2xl p-6 shadow-sm">
          <div className="bg-surface-container-low p-4 rounded-xl">
            <p className="font-label text-xs uppercase text-on-surface-variant">
              {t("create_group_title", "新しいグループを作成")}
            </p>
            <div className="mt-3 flex flex-col md:flex-row gap-3">
              <input
                value={groupName}
                onChange={(event) => setGroupName(event.target.value)}
                placeholder={t("create_group_placeholder", "例: 3年B組 チャット")}
                className="flex-1 rounded-full px-4 py-2 bg-white/80 text-sm"
                disabled={isCreateLockedByEmail}
              />
              <button
                onClick={handleCreateGroup}
                disabled={isCreateLockedByEmail}
                className="bg-secondary text-white px-4 py-2 rounded-full font-label text-xs uppercase disabled:cursor-not-allowed disabled:opacity-40"
              >
                {t("create_group_button_prefix", "作成（")}
                {createCost?.cost ?? 200}
                {t("create_group_button_suffix", "徳消費）")}
              </button>
            </div>
            <p className="mt-2 text-xs text-on-surface-variant">
              {isCreateLockedByEmail
                ? t(
                    "create_group_email_required_hint",
                    "メールアドレスを登録すると新しいグループを作成できます。"
                  )
                : t("create_group_hint", "一定量の徳ポイントを保有していると作成できます。")}
            </p>
            {error && <p className="mt-3 text-sm text-secondary">{error}</p>}
          </div>
        </section>
      </main>
    </div>
  );
}
