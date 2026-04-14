"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import type { FormEvent } from "react";
import { useSignIn, useSignUp } from "@clerk/nextjs/legacy";

type AuthMode = "signIn" | "signUp";
type SignUpIdentifierMode = "emailOnly" | "usernameOrEmail";

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

const toErrorMessage = (error: unknown, fallback: string) => {
  const maybeApiError = error as ClerkApiError;
  const clerkMessage = maybeApiError?.errors?.find(
    (item) => item.longMessage || item.message
  );
  if (clerkMessage?.longMessage) return clerkMessage.longMessage;
  if (clerkMessage?.message) return clerkMessage.message;
  if (error instanceof Error && error.message.trim()) return error.message;
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

  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

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
      setError("IDとパスワードを入力してください。");
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

    throw new Error(
      "追加認証が必要です。Googleで続行するか、別の認証方法をお試しください。"
    );
  };

  const handlePasswordSignUp = async () => {
    if (!isLoaded || !signUp) return;
    const identifier = signUpIdentifier.trim();
    if (!identifier || !signUpPassword) {
      setError("必要項目を入力してください。");
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
      "確認ステップが必要です。Googleで続行するか、設定を確認してください。"
    );
  };

  const handleGoogle = async () => {
    if (!isLoaded) return;
    if (mode === "signIn" && signIn) {
      await signIn.authenticateWithRedirect({
        strategy: "oauth_google",
        redirectUrl: "/sso-callback",
        redirectUrlComplete: completeRedirectUrl,
      });
      return;
    }
    if (mode === "signUp" && signUp) {
      await signUp.authenticateWithRedirect({
        strategy: "oauth_google",
        redirectUrl: "/sso-callback",
        redirectUrlComplete: completeRedirectUrl,
      });
    }
  };

  const handlePrimarySubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setError(null);
    setIsSubmitting(true);
    try {
      if (mode === "signIn") {
        await handlePasswordSignIn();
      } else {
        await handlePasswordSignUp();
      }
    } catch (err) {
      setError(
        toErrorMessage(err, "認証に失敗しました。入力内容を確認して再度お試しください。")
      );
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleGoogleSubmit = async () => {
    setError(null);
    setIsSubmitting(true);
    try {
      await handleGoogle();
    } catch (err) {
      setError(
        toErrorMessage(err, "Google認証に失敗しました。時間をおいて再度お試しください。")
      );
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
        {mode === "signIn" ? (
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
          {isSubmitting ? "Processing..." : primaryActionLabel}
        </button>
      </form>

      <div className="my-4 text-center text-xs tracking-wide text-on-surface-variant">
        ----- or -----
      </div>

      <button
        type="button"
        onClick={handleGoogleSubmit}
        disabled={isBusy}
        className="flex w-full items-center justify-center gap-2 rounded-full border border-outline/30 bg-white px-4 py-2 text-xs font-label uppercase text-on-surface transition hover:bg-surface-container-low disabled:cursor-not-allowed disabled:opacity-40"
      >
        CONTINUE WITH GOOGLE
      </button>

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
