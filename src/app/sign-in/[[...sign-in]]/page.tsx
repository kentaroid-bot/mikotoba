"use client";

import { SignIn } from "@clerk/nextjs";
import { useUiStrings } from "../../components/useUiStrings";

export default function SignInPage() {
  const { t } = useUiStrings("sign_in");

  return (
    <div className="min-h-screen bg-surface text-on-surface flex items-center justify-center px-6">
      <div className="max-w-md w-full bg-surface-container-lowest rounded-3xl p-8 shadow-sm relative overflow-hidden">
        <div className="absolute -top-24 -right-12 w-48 h-48 rounded-full bg-primary/10 blur-2xl" />
        <h1 className="text-2xl font-extrabold text-primary font-headline mb-2">
          {t("title", "ことばむすび")}
        </h1>
        <p className="text-sm text-on-surface-variant mb-6">
          {t("subtitle", "日々の言葉や出来事を届けよう。")}
        </p>
        <SignIn
          appearance={{
            elements: {
              formButtonPrimary: "bg-secondary hover:bg-secondary",
            },
          }}
        />
      </div>
    </div>
  );
}
