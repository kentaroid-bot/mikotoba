"use client";

import { useEffect, useMemo, useRef, useState, type ChangeEvent } from "react";
import { useAction, useConvexAuth, useMutation, useQuery } from "convex/react";
import { useAuth, useClerk, useReverification, useUser } from "@clerk/nextjs";
import { isReverificationCancelledError } from "@clerk/nextjs/errors";
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
const MAX_AVATAR_FILE_SIZE_BYTES = 5 * 1024 * 1024;

type FacilitatorPreset = (typeof FACILITATOR_PRESET_OPTIONS)[number]["value"];

type ClerkApiErrorLike = {
  message?: string;
  errors?: Array<{
    longMessage?: string;
    message?: string;
  }>;
};

const getClerkErrorMessage = (error: unknown, fallback: string) => {
  if (!error || typeof error !== "object") {
    return fallback;
  }
  const clerkError = error as ClerkApiErrorLike;
  const firstError = clerkError.errors?.[0];
  if (typeof firstError?.longMessage === "string" && firstError.longMessage.trim()) {
    return firstError.longMessage.trim();
  }
  if (typeof firstError?.message === "string" && firstError.message.trim()) {
    return firstError.message.trim();
  }
  if (typeof clerkError.message === "string" && clerkError.message.trim()) {
    return clerkError.message.trim();
  }
  return fallback;
};

export default function ProfileClient() {
  const { isLoaded, isSignedIn, userId } = useAuth();
  const clerk = useClerk();
  const { user } = useUser();
  const { t, tf } = useUiStrings("profile");
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
  const syncMyEmailFromClerk = useAction(api.profile.syncMyEmailFromClerk);
  const createInvite = useMutation(api.invites.create);
  const setDailyLimit = useMutation(api.settings.setDailyLimit);
  const setAnnouncementDefaultDueDays = useMutation(
    api.settings.setAnnouncementDefaultDueDays
  );
  const createCost = useQuery(api.groups.getCreateCost);
  const createEligibility = useQuery(api.groups.getCreateEligibility);
  const createEmailAddressWithReverification = useReverification(
    async (email: string) => {
      if (!user) throw new Error("Unauthorized");
      return await user.createEmailAddress({ email });
    }
  );
  const setPrimaryEmailAddressWithReverification = useReverification(
    async (emailAddressId: string) => {
      if (!user) throw new Error("Unauthorized");
      return await user.update({ primaryEmailAddressId: emailAddressId });
    }
  );
  const deleteEmailAddressWithReverification = useReverification(
    async (deletable: { destroy: () => Promise<void> }) => {
      await deletable.destroy();
    }
  );
  const setProfileImageWithReverification = useReverification(
    async (file: File) => {
      if (!user) throw new Error("Unauthorized");
      await user.setProfileImage({ file });
      return await user.reload();
    }
  );

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
  const [announcementDefaultDueDaysInput, setAnnouncementDefaultDueDaysInput] =
    useState("");
  const [error, setError] = useState<string | null>(null);
  const [isSigningOut, setIsSigningOut] = useState(false);
  const [profileError, setProfileError] = useState<string | null>(null);
  const [profileSaved, setProfileSaved] = useState(false);
  const [isSavingProfile, setIsSavingProfile] = useState(false);
  const [emailInput, setEmailInput] = useState("");
  const [emailVerificationCode, setEmailVerificationCode] = useState("");
  const [pendingEmailAddressId, setPendingEmailAddressId] = useState<string | null>(null);
  const [pendingEmailAddressValue, setPendingEmailAddressValue] = useState("");
  const [emailSuccess, setEmailSuccess] = useState<string | null>(null);
  const [emailError, setEmailError] = useState<string | null>(null);
  const [isEmailBusy, setIsEmailBusy] = useState(false);
  const [avatarSuccess, setAvatarSuccess] = useState<string | null>(null);
  const [avatarError, setAvatarError] = useState<string | null>(null);
  const [isAvatarBusy, setIsAvatarBusy] = useState(false);
  const ensuringProfileRef = useRef(false);
  const profileHydratedRef = useRef(false);
  const avatarSyncGroupRef = useRef<string | null>(null);
  const avatarFileInputRef = useRef<HTMLInputElement | null>(null);
  const emailSyncSignatureRef = useRef<string>("");
  const displayGuardianId = profile?.guardianId
    ? profile.guardianId.startsWith("@")
      ? profile.guardianId
      : `@${profile.guardianId}`
    : "--";
  const activeGroupId = activeGroup?._id;
  const activeGroupName = activeGroup?.name ?? "";
  const sortedEmailAddresses = useMemo(() => {
    if (!user) return [];
    const primaryEmailAddressId = user.primaryEmailAddressId;
    return [...user.emailAddresses].sort((left, right) => {
      if (left.id === primaryEmailAddressId) return -1;
      if (right.id === primaryEmailAddressId) return 1;
      const leftIsVerified = left.verification?.status === "verified";
      const rightIsVerified = right.verification?.status === "verified";
      if (leftIsVerified !== rightIsVerified) {
        return leftIsVerified ? -1 : 1;
      }
      return left.emailAddress.localeCompare(right.emailAddress);
    });
  }, [user]);
  const emailSyncSignature = useMemo(() => {
    if (!user) return "";
    const detail = [...user.emailAddresses]
      .map(
        (emailAddress) =>
          `${emailAddress.id}:${emailAddress.verification?.status ?? "unknown"}`
      )
      .sort()
      .join("|");
    return `${user.id}:${user.primaryEmailAddressId ?? "none"}:${detail}`;
  }, [user]);

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

  useEffect(() => {
    if (!isLoaded || !isSignedIn || !user || !profile) return;
    if (!emailSyncSignature) return;
    if (emailSyncSignatureRef.current === emailSyncSignature) return;
    emailSyncSignatureRef.current = emailSyncSignature;
    void syncMyEmailFromClerk({}).catch((err) => {
      console.error(err);
    });
  }, [
    emailSyncSignature,
    isLoaded,
    isSignedIn,
    profile,
    syncMyEmailFromClerk,
    user,
  ]);

  useEffect(() => {
    if (!pendingEmailAddressId || !user) return;
    const pendingEmail = user.emailAddresses.find(
      (emailAddress) => emailAddress.id === pendingEmailAddressId
    );
    if (!pendingEmail) {
      setPendingEmailAddressId(null);
      setPendingEmailAddressValue("");
      setEmailVerificationCode("");
      return;
    }
    if (pendingEmail.verification?.status === "verified") {
      setPendingEmailAddressId(null);
      setPendingEmailAddressValue("");
      setEmailVerificationCode("");
    }
  }, [pendingEmailAddressId, user]);

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
  const announcementDefaultDueDaysMin = 1;
  const announcementDefaultDueDaysMax = 30;
  const isCreateLockedByEmail =
    createEligibility !== undefined && !createEligibility.hasEmail;

  useEffect(() => {
    if (!activeGroupId || groupRole !== "admin") return;
    setDailyLimitInput(String(settings?.dailyPostLimit ?? 3));
    setAnnouncementDefaultDueDaysInput(
      String(settings?.announcementDefaultDueDays ?? 3)
    );
  }, [
    activeGroupId,
    groupRole,
    settings?.dailyPostLimit,
    settings?.announcementDefaultDueDays,
  ]);

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

  const handleSaveAnnouncementDefaultDueDays = async () => {
    if (!activeGroup || groupRole !== "admin") return;
    setError(null);
    try {
      const parsed = Number.parseInt(
        announcementDefaultDueDaysInput ||
          String(settings?.announcementDefaultDueDays ?? 3),
        10
      );
      const safe = Number.isFinite(parsed)
        ? Math.min(
            announcementDefaultDueDaysMax,
            Math.max(announcementDefaultDueDaysMin, parsed)
          )
        : settings?.announcementDefaultDueDays ?? 3;
      await setAnnouncementDefaultDueDays({ announcementDefaultDueDays: safe });
      setAnnouncementDefaultDueDaysInput(String(safe));
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : t("error_announcement_due_days_update", "連絡事項期限設定の更新に失敗しました。")
      );
    }
  };

  const adjustAnnouncementDefaultDueDaysInput = (delta: number) => {
    const current = Number.parseInt(
      announcementDefaultDueDaysInput ||
        String(settings?.announcementDefaultDueDays ?? 3),
      10
    );
    const base = Number.isFinite(current) ? current : 3;
    const next = Math.min(
      announcementDefaultDueDaysMax,
      Math.max(announcementDefaultDueDaysMin, base + delta)
    );
    setAnnouncementDefaultDueDaysInput(String(next));
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

  const handleAvatarFileChange = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file || !user) return;

    if (!file.type.startsWith("image/")) {
      setAvatarSuccess(null);
      setAvatarError(
        t("avatar_error_invalid_type", "画像ファイル（jpg/png/webp など）を選択してください。")
      );
      return;
    }
    if (file.size > MAX_AVATAR_FILE_SIZE_BYTES) {
      setAvatarSuccess(null);
      setAvatarError(
        t("avatar_error_too_large", "画像サイズは5MB以下にしてください。")
      );
      return;
    }

    setIsAvatarBusy(true);
    setAvatarError(null);
    setAvatarSuccess(null);
    try {
      const updatedUser = await setProfileImageWithReverification(file);
      await ensureProfile({
        imageUrl: updatedUser.imageUrl,
        username: updatedUser.username ?? undefined,
      });
      setAvatarSuccess(
        t("avatar_success_updated", "プロフィール画像を更新しました。")
      );
    } catch (err) {
      if (isReverificationCancelledError(err)) {
        setAvatarError(
          t(
            "avatar_error_reverification_cancelled",
            "本人確認がキャンセルされました。もう一度お試しください。"
          )
        );
      } else {
        setAvatarError(
          getClerkErrorMessage(
            err,
            t("avatar_error_update", "プロフィール画像の更新に失敗しました。")
          )
        );
      }
    } finally {
      setIsAvatarBusy(false);
    }
  };

  const handleAddEmailAddress = async () => {
    if (!user) return;
    const nextEmail = emailInput.trim();
    if (!nextEmail) {
      setEmailError(
        t("email_error_required", "メールアドレスを入力してください。")
      );
      return;
    }

    setIsEmailBusy(true);
    setEmailError(null);
    setEmailSuccess(null);
    try {
      const created = await createEmailAddressWithReverification(nextEmail);
      await created.prepareVerification({ strategy: "email_code" });
      await user.reload();
      setPendingEmailAddressId(created.id);
      setPendingEmailAddressValue(created.emailAddress);
      setEmailVerificationCode("");
      setEmailInput("");
      setEmailSuccess(
        t(
          "email_success_code_sent",
          "確認コードを送信しました。メールを確認してください。"
        )
      );
    } catch (err) {
      if (isReverificationCancelledError(err)) {
        setEmailError(
          t(
            "email_error_reverification_cancelled",
            "本人確認がキャンセルされました。もう一度お試しください。"
          )
        );
        return;
      }
      setEmailError(
        getClerkErrorMessage(
          err,
          t("email_error_action", "メールアドレス操作に失敗しました。")
        )
      );
    } finally {
      setIsEmailBusy(false);
    }
  };

  const handleVerifyPendingEmail = async () => {
    if (!user || !pendingEmailAddressId) return;
    const code = emailVerificationCode.trim();
    if (!code) {
      setEmailError(
        t("email_error_verify_code_required", "確認コードを入力してください。")
      );
      return;
    }

    setIsEmailBusy(true);
    setEmailError(null);
    setEmailSuccess(null);
    try {
      const currentUser = await user.reload();
      const targetEmailAddress = currentUser.emailAddresses.find(
        (emailAddress) => emailAddress.id === pendingEmailAddressId
      );
      if (!targetEmailAddress) {
        throw new Error(
          t("email_error_action", "メールアドレス操作に失敗しました。")
        );
      }
      await targetEmailAddress.attemptVerification({ code });
      await user.reload();
      await syncMyEmailFromClerk({});
      setPendingEmailAddressId(null);
      setPendingEmailAddressValue("");
      setEmailVerificationCode("");
      setEmailSuccess(
        t("email_success_verified", "メールアドレスを確認しました。")
      );
    } catch (err) {
      setEmailError(
        getClerkErrorMessage(
          err,
          t("email_error_action", "メールアドレス操作に失敗しました。")
        )
      );
    } finally {
      setIsEmailBusy(false);
    }
  };

  const handleResendEmailCode = async (emailAddressId: string) => {
    if (!user) return;
    setIsEmailBusy(true);
    setEmailError(null);
    setEmailSuccess(null);
    try {
      const currentUser = await user.reload();
      const targetEmailAddress = currentUser.emailAddresses.find(
        (emailAddress) => emailAddress.id === emailAddressId
      );
      if (!targetEmailAddress) {
        throw new Error(
          t("email_error_action", "メールアドレス操作に失敗しました。")
        );
      }
      await targetEmailAddress.prepareVerification({ strategy: "email_code" });
      setPendingEmailAddressId(targetEmailAddress.id);
      setPendingEmailAddressValue(targetEmailAddress.emailAddress);
      setEmailVerificationCode("");
      setEmailSuccess(
        t(
          "email_success_code_sent",
          "確認コードを送信しました。メールを確認してください。"
        )
      );
    } catch (err) {
      setEmailError(
        getClerkErrorMessage(
          err,
          t("email_error_action", "メールアドレス操作に失敗しました。")
        )
      );
    } finally {
      setIsEmailBusy(false);
    }
  };

  const handleSetPrimaryEmailAddress = async (emailAddressId: string) => {
    if (!user) return;
    setIsEmailBusy(true);
    setEmailError(null);
    setEmailSuccess(null);
    try {
      const currentUser = await user.reload();
      const targetEmailAddress = currentUser.emailAddresses.find(
        (emailAddress) => emailAddress.id === emailAddressId
      );
      if (!targetEmailAddress || targetEmailAddress.verification?.status !== "verified") {
        throw new Error(
          t("email_error_primary_requires_verified", "確認済みメールのみ主メールに設定できます。")
        );
      }
      await setPrimaryEmailAddressWithReverification(emailAddressId);
      await user.reload();
      await syncMyEmailFromClerk({});
      setEmailSuccess(
        t("email_success_primary_updated", "主メールアドレスを更新しました。")
      );
    } catch (err) {
      if (isReverificationCancelledError(err)) {
        setEmailError(
          t(
            "email_error_reverification_cancelled",
            "本人確認がキャンセルされました。もう一度お試しください。"
          )
        );
        return;
      }
      setEmailError(
        getClerkErrorMessage(
          err,
          t("email_error_action", "メールアドレス操作に失敗しました。")
        )
      );
    } finally {
      setIsEmailBusy(false);
    }
  };

  const handleDeleteEmailAddress = async (emailAddressId: string) => {
    if (!user) return;
    const targetEmailAddress = user.emailAddresses.find(
      (emailAddress) => emailAddress.id === emailAddressId
    );
    if (!targetEmailAddress) return;

    const shouldDelete = window.confirm(
      tf("email_delete_confirm_tpl", "{email} を削除しますか？", {
        email: targetEmailAddress.emailAddress,
      })
    );
    if (!shouldDelete) return;

    setIsEmailBusy(true);
    setEmailError(null);
    setEmailSuccess(null);
    try {
      const currentUser = await user.reload();
      if (currentUser.primaryEmailAddressId === emailAddressId) {
        throw new Error(
          t("email_error_cannot_delete_primary", "主メールアドレスは削除できません。")
        );
      }
      const deletable = currentUser.emailAddresses.find(
        (emailAddress) => emailAddress.id === emailAddressId
      );
      if (!deletable) {
        throw new Error(
          t("email_error_action", "メールアドレス操作に失敗しました。")
        );
      }
      await deleteEmailAddressWithReverification(deletable);
      await user.reload();
      await syncMyEmailFromClerk({});
      if (pendingEmailAddressId === emailAddressId) {
        setPendingEmailAddressId(null);
        setPendingEmailAddressValue("");
        setEmailVerificationCode("");
      }
      setEmailSuccess(
        t("email_success_deleted", "メールアドレスを削除しました。")
      );
    } catch (err) {
      if (isReverificationCancelledError(err)) {
        setEmailError(
          t(
            "email_error_reverification_cancelled",
            "本人確認がキャンセルされました。もう一度お試しください。"
          )
        );
        return;
      }
      setEmailError(
        getClerkErrorMessage(
          err,
          t("email_error_action", "メールアドレス操作に失敗しました。")
        )
      );
    } finally {
      setIsEmailBusy(false);
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
                <div className="mt-2">
                  <input
                    ref={avatarFileInputRef}
                    type="file"
                    accept="image/*"
                    className="hidden"
                    onChange={(event) => {
                      void handleAvatarFileChange(event);
                    }}
                  />
                  <button
                    type="button"
                    onClick={() => avatarFileInputRef.current?.click()}
                    className="inline-flex rounded-full border border-primary/20 bg-white/90 px-3 py-1 text-[10px] font-headline font-semibold tracking-wide text-primary disabled:cursor-not-allowed disabled:opacity-40"
                    disabled={isAvatarBusy || !user}
                  >
                    {isAvatarBusy
                      ? t("avatar_updating", "画像を更新中...")
                      : t("avatar_change", "画像を変更")}
                  </button>
                  {avatarSuccess ? (
                    <p className="mt-2 text-xs text-primary">{avatarSuccess}</p>
                  ) : null}
                  {avatarError ? (
                    <p className="mt-2 text-xs text-secondary">{avatarError}</p>
                  ) : null}
                </div>
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

        <section className="mt-8 bg-surface-container-low p-6 rounded-2xl shadow-sm">
          <div>
            <h3 className="font-headline text-lg font-bold text-primary">
              {t("email_section_title", "メールアドレス管理")}
            </h3>
          </div>
          <p className="mt-2 text-sm text-on-surface-variant">
            {isCreateLockedByEmail
              ? t(
                  "email_section_subtitle_locked",
                  "メールアドレスを確認すると新しいグループを作成できます。"
                )
              : t(
                  "email_section_subtitle_unlocked",
                  "主メールアドレスが確認済みのため、グループ作成機能が有効です。"
                )}
          </p>

          <div className="mt-4 space-y-3">
            {sortedEmailAddresses.length > 0 ? (
              sortedEmailAddresses.map((emailAddress) => {
                const isPrimary = user?.primaryEmailAddressId === emailAddress.id;
                const isVerified = emailAddress.verification?.status === "verified";
                const isPending = pendingEmailAddressId === emailAddress.id;
                return (
                  <div
                    key={emailAddress.id}
                    className="rounded-xl bg-white/80 px-4 py-3"
                  >
                    <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
                      <div className="min-w-0">
                        <p className="truncate text-sm font-semibold text-on-surface">
                          {emailAddress.emailAddress}
                        </p>
                        <div className="mt-1 flex flex-wrap gap-2">
                          {isPrimary ? (
                            <span className="rounded-full bg-primary/10 px-2 py-0.5 text-[10px] font-label uppercase text-primary">
                              {t("email_primary_badge", "PRIMARY")}
                            </span>
                          ) : null}
                          <span
                            className={`rounded-full px-2 py-0.5 text-[10px] font-label uppercase ${
                              isVerified
                                ? "bg-secondary/10 text-secondary"
                                : "bg-tertiary-fixed/20 text-on-surface-variant"
                            }`}
                          >
                            {isVerified
                              ? t("email_verified_badge", "VERIFIED")
                              : t("email_unverified_badge", "UNVERIFIED")}
                          </span>
                        </div>
                      </div>
                      <div className="flex flex-wrap gap-2">
                        {!isPrimary && isVerified ? (
                          <button
                            type="button"
                            onClick={() => void handleSetPrimaryEmailAddress(emailAddress.id)}
                            disabled={isEmailBusy}
                            className="rounded-full bg-primary px-3 py-1.5 text-[10px] font-label uppercase text-white disabled:opacity-40"
                          >
                            {t("email_set_primary_button", "主メールにする")}
                          </button>
                        ) : null}
                        {!isVerified ? (
                          <button
                            type="button"
                            onClick={() => void handleResendEmailCode(emailAddress.id)}
                            disabled={isEmailBusy}
                            className="rounded-full border border-primary/30 bg-white px-3 py-1.5 text-[10px] font-label uppercase text-primary disabled:opacity-40"
                          >
                            {t("email_resend_button", "確認コード送信")}
                          </button>
                        ) : null}
                        {!isPrimary ? (
                          <button
                            type="button"
                            onClick={() => void handleDeleteEmailAddress(emailAddress.id)}
                            disabled={isEmailBusy}
                            className="rounded-full border border-secondary/40 bg-white px-3 py-1.5 text-[10px] font-label uppercase text-secondary disabled:opacity-40"
                          >
                            {t("email_delete_button", "削除")}
                          </button>
                        ) : null}
                      </div>
                    </div>

                    {isPending ? (
                      <div className="mt-3 flex flex-col gap-2 md:flex-row">
                        <input
                          value={emailVerificationCode}
                          onChange={(event) =>
                            setEmailVerificationCode(event.target.value.replace(/\s+/g, ""))
                          }
                          maxLength={12}
                          className="flex-1 rounded-xl bg-white px-4 py-2 text-sm"
                          placeholder={t(
                            "email_verify_code_placeholder",
                            "確認コード（例: 123456）"
                          )}
                          disabled={isEmailBusy}
                        />
                        <button
                          type="button"
                          onClick={() => void handleVerifyPendingEmail()}
                          disabled={isEmailBusy}
                          className="rounded-full bg-secondary px-4 py-2 text-xs font-label uppercase text-white disabled:opacity-40"
                        >
                          {t("email_verify_button", "コード確認")}
                        </button>
                      </div>
                    ) : null}
                  </div>
                );
              })
            ) : (
              <p className="text-sm text-on-surface-variant">
                {t("email_none", "登録済みメールアドレスはありません。")}
              </p>
            )}
          </div>

          <div className="mt-4 flex flex-col gap-3 md:flex-row">
            <input
              type="email"
              value={emailInput}
              onChange={(event) => setEmailInput(event.target.value)}
              placeholder={t("email_add_placeholder", "example@mail.com")}
              className="flex-1 rounded-xl bg-white/80 px-4 py-2 text-sm"
              disabled={isEmailBusy}
            />
            <button
              type="button"
              onClick={() => void handleAddEmailAddress()}
              disabled={isEmailBusy}
              className="rounded-full bg-primary px-4 py-2 text-xs font-label uppercase text-white disabled:opacity-40"
            >
              {t("email_add_button", "メールを追加")}
            </button>
          </div>

          {pendingEmailAddressId ? (
            <p className="mt-2 text-xs text-on-surface-variant">
              {tf(
                "email_pending_notice_tpl",
                "{email} 宛に確認コードを送信済みです。",
                { email: pendingEmailAddressValue || "--" }
              )}
            </p>
          ) : null}
          {emailSuccess ? (
            <p className="mt-2 text-sm text-secondary">{emailSuccess}</p>
          ) : null}
          {emailError ? (
            <p className="mt-2 text-sm text-secondary">{emailError}</p>
          ) : null}
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
                {t("announcement_due_days_title", "日時なし連絡の期限日数")}
              </p>
              {activeGroup && groupRole === "admin" ? (
                <div className="mt-3 flex flex-col md:flex-row md:items-center gap-3">
                  <div className="inline-flex items-center rounded-full bg-white/80 p-1 shadow-sm w-fit">
                    <button
                      type="button"
                      onClick={() => adjustAnnouncementDefaultDueDaysInput(-1)}
                      className="h-10 w-10 rounded-full text-primary text-base font-bold"
                      aria-label={t(
                        "announcement_due_days_decrease",
                        "連絡事項期限日数を1減らす"
                      )}
                    >
                      -
                    </button>
                    <input
                      value={announcementDefaultDueDaysInput}
                      onChange={(event) => {
                        const digits = event.target.value.replace(/[^\d]/g, "");
                        if (!digits) {
                          setAnnouncementDefaultDueDaysInput("");
                          return;
                        }
                        const parsed = Number.parseInt(digits, 10);
                        const clamped = Math.min(
                          announcementDefaultDueDaysMax,
                          Math.max(announcementDefaultDueDaysMin, parsed)
                        );
                        setAnnouncementDefaultDueDaysInput(String(clamped));
                      }}
                      type="text"
                      inputMode="numeric"
                      pattern="[0-9]*"
                      className="w-14 bg-transparent text-center text-sm font-semibold text-primary focus:outline-none"
                    />
                    <button
                      type="button"
                      onClick={() => adjustAnnouncementDefaultDueDaysInput(1)}
                      className="h-10 w-10 rounded-full text-primary text-base font-bold"
                      aria-label={t(
                        "announcement_due_days_increase",
                        "連絡事項期限日数を1増やす"
                      )}
                    >
                      +
                    </button>
                  </div>
                  <button
                    onClick={handleSaveAnnouncementDefaultDueDays}
                    className="bg-primary text-white px-4 py-2 rounded-full font-label text-xs uppercase"
                  >
                    {t("common_save", "保存")}
                  </button>
                </div>
              ) : (
                <p className="mt-2 text-sm text-on-surface-variant">
                  {t("announcement_due_days_readonly_prefix", "現在の設定")}:{" "}
                  {settings?.announcementDefaultDueDays ?? 3}{" "}
                  {t("announcement_due_days_readonly_suffix", "日後（変更は管理者のみ）")}
                </p>
              )}
              <p className="mt-2 text-xs text-on-surface-variant">
                {t(
                  "announcement_due_days_hint",
                  "AIが日時を抽出できない連絡事項は、この日数後の18:00（JST）を期限にします。"
                )}
              </p>
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
