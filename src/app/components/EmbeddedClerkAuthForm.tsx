"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import type { FormEvent } from "react";
import { useSignIn, useSignUp } from "@clerk/nextjs/legacy";
import { useUiStrings } from "./useUiStrings";

type AuthMode = "signIn" | "signUp";
type SignUpIdentifierMode = "emailOnly" | "usernameOrEmail";
type AuthVerificationMode = "clientTrustEmailCode" | "mfaEmailCode";

type EmbeddedClerkAuthFormProps = {
  defaultMode?: AuthMode;
  signUpIdentifierMode?: SignUpIdentifierMode;
  completeRedirectUrl?: string;
  className?: string;
  switchStyle?: "link" | "tabs";
};

type ClerkApiError = {
  errors?: Array<{
    longMessage?: string;
    message?: string;
  }>;
};

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

const normalizeErrorMessage = (message: string) =>
  message.trim().replace(/\s+/g, " ").toLowerCase();

const localizeKnownAuthError = (
  message: string,
  t: (key: string, fallback: string) => string
) => {
  const normalized = normalizeErrorMessage(message);
  if (normalized === "passwords must be 8 characters or more.") {
    return t(
      "error_password_min_length",
      "パスワードは8文字以上で入力してください。"
    );
  }
  if (normalized === "that username is taken. please try another.") {
    return t(
      "error_username_taken",
      "そのユーザー名はすでに使われています。別のIDをお試しください。"
    );
  }
  return message;
};

const toErrorMessage = (
  error: unknown,
  fallback: string,
  t: (key: string, fallback: string) => string
) => {
  const maybeApiError = error as ClerkApiError;
  const clerkMessage = maybeApiError?.errors?.find(
    (item) => item.longMessage || item.message
  );
  if (clerkMessage?.longMessage) {
    return localizeKnownAuthError(clerkMessage.longMessage, t);
  }
  if (clerkMessage?.message) {
    return localizeKnownAuthError(clerkMessage.message, t);
  }
  if (error instanceof Error && error.message.trim()) {
    return localizeKnownAuthError(error.message, t);
  }
  return fallback;
};

export default function EmbeddedClerkAuthForm({
  defaultMode = "signIn",
  signUpIdentifierMode = "emailOnly",
  completeRedirectUrl = "/",
  className,
  switchStyle = "link",
}: EmbeddedClerkAuthFormProps) {
  const router = useRouter();
  const { isLoaded: isSignInLoaded, signIn, setActive } = useSignIn();
  const { isLoaded: isSignUpLoaded, signUp } = useSignUp();
  const [mode, setMode] = useState<AuthMode>(defaultMode);

  const [signInIdentifier, setSignInIdentifier] = useState("");
  const [signInPassword, setSignInPassword] = useState("");
  const [signUpIdentifier, setSignUpIdentifier] = useState("");
  const [signUpPassword, setSignUpPassword] = useState("");
  const [verificationMode, setVerificationMode] =
    useState<AuthVerificationMode | null>(null);
  const [verificationCode, setVerificationCode] = useState("");

  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const { t } = useUiStrings("sign_in");

  const isLoaded = isSignInLoaded && isSignUpLoaded;
  const isSignUpEmailOnly = signUpIdentifierMode === "emailOnly";
  const signUpIdentifierLabel = isSignUpEmailOnly
    ? "E-mail"
    : "Username (or E-mail)";

  const isBusy = !isLoaded || isSubmitting;

  const primaryActionLabel = mode === "signIn" ? "SIGN IN" : "SIGN UP";
  const showTabs = switchStyle === "tabs";
  const showLink = switchStyle === "link";
  const switchLinkHref = mode === "signIn" ? "/signup" : "/signin";
  const switchLinkLabel = mode === "signIn" ? "SIGN UP" : "SIGN IN";
  const isVerifyingSignIn = mode === "signIn" && verificationMode !== null;

  const setSessionAndRedirect = async (sessionId: string | null) => {
    if (!sessionId) {
      throw new Error("ログインセッションの確立に失敗しました。");
    }
    if (!setActive) {
      throw new Error("認証の初期化が完了していません。");
    }
    await setActive({ session: sessionId });
    router.replace(completeRedirectUrl);
  };

  const handlePasswordSignIn = async () => {
    if (!isLoaded || !signIn) return;
    const identifier = signInIdentifier.trim();
    if (!identifier || !signInPassword) {
      setError(
        t("error_missing_credentials", "IDとパスワードを入力してください。")
      );
      return;
    }

    const result = await signIn.create({
      identifier,
      password: signInPassword,
    });

    if (result.status === "complete") {
      await setSessionAndRedirect(result.createdSessionId);
      return;
    }

    if (
      result.status === "needs_client_trust" ||
      result.status === "needs_second_factor"
    ) {
      const emailCodeFactor = result.supportedSecondFactors?.find(
        (factor) => factor.strategy === "email_code"
      );

      if (!emailCodeFactor) {
        throw new Error(
          "追加認証が必要ですが、メールコード認証を開始できませんでした。Clerkの認証設定を確認してください。"
        );
      }

      await signIn.prepareSecondFactor({
        strategy: "email_code",
        emailAddressId: emailCodeFactor.emailAddressId,
      });
      setVerificationMode(
        result.status === "needs_client_trust"
          ? "clientTrustEmailCode"
          : "mfaEmailCode"
      );
      setVerificationCode("");
      setError(
        "確認コードを送信しました。メールに届いたコードを入力してください。"
      );
      return;
    }

    throw new Error(
      "追加認証が必要です。メールコードで確認するか、別の認証方法をお試しください。"
    );
  };

  const handleVerificationSubmit = async () => {
    if (!isLoaded || !signIn || !verificationMode) return;
    const code = verificationCode.trim();
    if (!code) {
      setError("確認コードを入力してください。");
      return;
    }

    const result = await signIn.attemptSecondFactor({
      strategy: "email_code",
      code,
    });

    if (result.status === "complete") {
      await setSessionAndRedirect(result.createdSessionId);
      return;
    }

    throw new Error(
      "確認が完了しませんでした。コードを確認して再度お試しください。"
    );
  };

  const handlePasswordSignUp = async () => {
    if (!isLoaded || !signUp) return;
    const identifier = signUpIdentifier.trim();
    if (!identifier || !signUpPassword) {
      setError(t("error_required_fields", "必要項目を入力してください。"));
      return;
    }

    const params: Record<string, string> = {
      password: signUpPassword,
    };

    if (isSignUpEmailOnly) {
      if (!EMAIL_RE.test(identifier)) {
        setError("有効なE-mailを入力してください。");
        return;
      }
      params.emailAddress = identifier;
    } else if (EMAIL_RE.test(identifier)) {
      params.emailAddress = identifier;
    } else {
      params.username = identifier;
    }

    const result = await signUp.create(params);

    if (result.status === "complete") {
      await setSessionAndRedirect(result.createdSessionId);
      return;
    }

    throw new Error(
      "確認ステップが必要です。Clerkのメール確認設定を確認してください。"
    );
  };


  const handlePrimarySubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setError(null);
    setIsSubmitting(true);
    try {
      if (mode === "signIn") {
        if (verificationMode) {
          await handleVerificationSubmit();
        } else {
          await handlePasswordSignIn();
        }
      } else {
        await handlePasswordSignUp();
      }
    } catch (err) {
      setError(
        toErrorMessage(
          err,
          "認証に失敗しました。入力内容を確認して再度お試しください。",
          t
        )
      );
    } finally {
      setIsSubmitting(false);
    }
  };


  return (
    <div className={className}>
      {showTabs ? (
        <div className="mb-4 grid grid-cols-2 gap-2 rounded-full bg-surface-container-low p-1">
          <button
            type="button"
            onClick={() => {
              setMode("signIn");
              setVerificationMode(null);
              setVerificationCode("");
              setError(null);
            }}
            className={`rounded-full px-4 py-2 text-xs font-label uppercase transition ${
              mode === "signIn"
                ? "bg-primary text-white"
                : "text-on-surface-variant hover:text-on-surface"
            }`}
            disabled={isBusy}
          >
            Sign in
          </button>
          <button
            type="button"
            onClick={() => {
              setMode("signUp");
              setVerificationMode(null);
              setVerificationCode("");
              setError(null);
            }}
            className={`rounded-full px-4 py-2 text-xs font-label uppercase transition ${
              mode === "signUp"
                ? "bg-primary text-white"
                : "text-on-surface-variant hover:text-on-surface"
            }`}
            disabled={isBusy}
          >
            Sign up
          </button>
        </div>
      ) : null}

      <form onSubmit={handlePrimarySubmit} className="space-y-3">
        {isVerifyingSignIn ? (
          <>
            <label className="block text-xs text-on-surface-variant">
              Verification code
              <input
                type="text"
                inputMode="numeric"
                autoComplete="one-time-code"
                value={verificationCode}
                onChange={(event) => setVerificationCode(event.target.value)}
                className="mt-1 w-full rounded-xl bg-white/80 px-4 py-2 text-sm text-on-surface outline-none ring-1 ring-black/5 focus:ring-2 focus:ring-primary/40"
                placeholder="123456"
                disabled={isBusy}
              />
            </label>
            <button
              type="button"
              onClick={() => {
                setVerificationMode(null);
                setVerificationCode("");
                setError(null);
              }}
              className="text-xs font-label uppercase text-primary underline underline-offset-4 hover:opacity-80"
              disabled={isBusy}
            >
              Change ID
            </button>
          </>
        ) : mode === "signIn" ? (
          <>
            <label className="block text-xs text-on-surface-variant">
              Username (or E-mail)
              <input
                type="text"
                autoComplete="username"
                value={signInIdentifier}
                onChange={(event) => setSignInIdentifier(event.target.value)}
                className="mt-1 w-full rounded-xl bg-white/80 px-4 py-2 text-sm text-on-surface outline-none ring-1 ring-black/5 focus:ring-2 focus:ring-primary/40"
                placeholder="you@example.com"
                disabled={isBusy}
              />
            </label>
            <label className="block text-xs text-on-surface-variant">
              Password
              <input
                type="password"
                autoComplete="current-password"
                value={signInPassword}
                onChange={(event) => setSignInPassword(event.target.value)}
                className="mt-1 w-full rounded-xl bg-white/80 px-4 py-2 text-sm text-on-surface outline-none ring-1 ring-black/5 focus:ring-2 focus:ring-primary/40"
                placeholder="********"
                disabled={isBusy}
              />
            </label>
          </>
        ) : (
          <>
            <label className="block text-xs text-on-surface-variant">
              {signUpIdentifierLabel}
              <input
                type={isSignUpEmailOnly ? "email" : "text"}
                autoComplete={isSignUpEmailOnly ? "email" : "username"}
                value={signUpIdentifier}
                onChange={(event) => setSignUpIdentifier(event.target.value)}
                className="mt-1 w-full rounded-xl bg-white/80 px-4 py-2 text-sm text-on-surface outline-none ring-1 ring-black/5 focus:ring-2 focus:ring-primary/40"
                placeholder={
                  isSignUpEmailOnly ? "you@example.com" : "username or e-mail"
                }
                disabled={isBusy}
              />
            </label>
            <label className="block text-xs text-on-surface-variant">
              Password
              <input
                type="password"
                autoComplete="new-password"
                value={signUpPassword}
                onChange={(event) => setSignUpPassword(event.target.value)}
                className="mt-1 w-full rounded-xl bg-white/80 px-4 py-2 text-sm text-on-surface outline-none ring-1 ring-black/5 focus:ring-2 focus:ring-primary/40"
                placeholder="********"
                disabled={isBusy}
              />
            </label>
          </>
        )}

        <button
          type="submit"
          disabled={isBusy}
          className="w-full rounded-full bg-secondary px-4 py-2 font-label text-xs uppercase text-white transition hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-40"
        >
          {isSubmitting
            ? "Processing..."
            : isVerifyingSignIn
              ? "VERIFY"
              : primaryActionLabel}
        </button>
      </form>


      {showLink ? (
        <div className="mt-5 text-center">
          <Link
            href={switchLinkHref}
            className="text-xs font-label uppercase text-primary underline underline-offset-4 hover:opacity-80"
          >
            {switchLinkLabel}
          </Link>
        </div>
      ) : null}

      {error ? <p className="mt-4 text-sm text-secondary">{error}</p> : null}
    </div>
  );
}
