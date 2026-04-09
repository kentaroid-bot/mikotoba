"use client";

import { SignUp } from "@clerk/nextjs";
import { useUiStrings } from "../../components/useUiStrings";

export default function SignUpPage() {
  const { t } = useUiStrings("sign_up");

  return (
    <div className="min-h-screen bg-surface text-on-surface flex items-center justify-center px-6">
      <div className="max-w-md w-full bg-surface-container-lowest rounded-3xl p-8 shadow-sm relative overflow-hidden">
        <div className="absolute -top-24 -right-12 w-48 h-48 rounded-full bg-secondary/10 blur-2xl" />
        <h1 className="text-2xl font-extrabold text-primary font-headline mb-2">
          {t("title", "言の葉ガーディアン")}
        </h1>
        <p className="text-sm text-on-surface-variant mb-6">
          {t("subtitle", "Google またはメールで登録し、クラスの言葉を守りましょう。")}
        </p>
        <SignUp
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
