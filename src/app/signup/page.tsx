"use client";

import EmbeddedClerkAuthForm from "../components/EmbeddedClerkAuthForm";
import LocaleToggle from "../components/LocaleToggle";
import { useUiStrings } from "../components/useUiStrings";

export default function SignUpAliasPage() {
  const { t } = useUiStrings("sign_in");

  return (
    <div className="min-h-[100dvh] bg-surface text-on-surface flex items-center justify-center px-4 pt-[calc(1rem+env(safe-area-inset-top))] pb-[calc(1.25rem+env(safe-area-inset-bottom))] overflow-y-auto">
      <div className="fixed left-4 top-[calc(0.75rem+env(safe-area-inset-top))] z-[70]">
        <LocaleToggle />
      </div>
      <div className="max-w-md w-full bg-surface-container-lowest rounded-3xl p-6 sm:p-8 shadow-sm relative overflow-hidden my-auto">
        <div className="absolute -top-24 -right-12 w-48 h-48 rounded-full bg-secondary/10 blur-2xl" />
        <h1 className="text-2xl font-extrabold text-primary font-headline mb-2">
          {t("title", "みことば")}
        </h1>
        <p className="text-sm text-on-surface-variant mb-6">
          {t("subtitle", "日々の言葉や出来事を届けよう。")}
        </p>
        <EmbeddedClerkAuthForm
          defaultMode="signUp"
          signUpIdentifierMode="emailOnly"
          completeRedirectUrl="/"
        />
      </div>
    </div>
  );
}
