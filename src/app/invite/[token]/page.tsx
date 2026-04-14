"use client";

import { useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { useAuth, useUser } from "@clerk/nextjs";
import { useMutation, useQuery } from "convex/react";
import { api } from "../../../../convex/_generated/api";
import EmbeddedClerkAuthForm from "../../components/EmbeddedClerkAuthForm";
import LocaleToggle from "../../components/LocaleToggle";
import { useUiStrings } from "../../components/useUiStrings";

export default function InvitePage() {
  const { t, tf } = useUiStrings("invite");
  const { isSignedIn } = useAuth();
  const { user } = useUser();
  const params = useParams();
  const token = params.token as string;
  const router = useRouter();
  const inviteInfo = useQuery(api.invites.getByToken, { token });
  const joinInvite = useMutation(api.invites.join);
  const ensureProfile = useMutation(api.profile.ensureMyProfile);
  const [status, setStatus] = useState<"idle" | "joining" | "error">("idle");
  const [error, setError] = useState<string | null>(null);

  const handleJoin = async () => {
    if (inviteInfo?.invite && inviteInfo.invite.expiresAt < Date.now()) {
      setStatus("error");
      setError(t("error_expired", "この招待リンクは期限切れです。"));
      return;
    }

    try {
      setStatus("joining");
      setError(null);
      await ensureProfile({
        imageUrl: user?.imageUrl,
        username: user?.username ?? undefined,
      });
      await joinInvite({ token });
      router.push("/");
    } catch (err) {
      setStatus("error");
      setError(err instanceof Error ? err.message : t("error_join", "参加に失敗しました。"));
    }
  };

  return (
    <div className="min-h-screen bg-surface text-on-surface flex items-center justify-center px-6">
      <div className="fixed left-4 top-[calc(0.75rem+env(safe-area-inset-top))] z-[70]">
        <LocaleToggle />
      </div>
      <div className="max-w-lg w-full bg-surface-container-lowest rounded-3xl p-8 shadow-sm relative overflow-hidden">
        <div className="absolute -top-20 -right-10 w-40 h-40 rounded-full bg-tertiary-fixed-dim/20 blur-2xl" />
        <h1 className="text-2xl font-extrabold text-primary font-headline mb-2">
          {t("title", "招待リンク")}
        </h1>
        <p className="text-sm text-on-surface-variant mb-6">
          {inviteInfo?.group?.name
            ? tf("join_group_tpl", "{groupName} に参加します。", {
                groupName: inviteInfo.group.name,
              })
            : t("loading", "招待情報を読み込み中...")}
        </p>

        {!isSignedIn ? (
          <div className="space-y-3">
            <p className="text-sm text-on-surface-variant">
              {t("sign_needed", "参加するにはサインインまたはサインアップしてください。")}
            </p>
            <EmbeddedClerkAuthForm
              defaultMode="signUp"
              signUpIdentifierMode="usernameOrEmail"
              completeRedirectUrl={`/invite/${token}`}
              switchStyle="tabs"
            />
          </div>
        ) : null}

        {isSignedIn ? (
          <button
            onClick={handleJoin}
            disabled={status === "joining"}
            className="bg-gradient-to-br from-primary to-primary-container text-white px-4 py-2 rounded-full font-label text-xs uppercase hover:scale-[1.02] transition-transform disabled:opacity-40"
          >
            {status === "joining" ? t("joining", "参加処理中...") : t("join", "このクラスに参加")}
          </button>
        ) : null}

        {error && <p className="mt-4 text-sm text-secondary">{error}</p>}
      </div>
    </div>
  );
}
