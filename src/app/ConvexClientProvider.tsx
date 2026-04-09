"use client";

import { ConvexProviderWithClerk } from "convex/react-clerk";
import { ConvexReactClient } from "convex/react";
import { ReactNode, useMemo } from "react";
import { useAuth } from "@clerk/nextjs";
import { LocaleProvider } from "./components/LocaleProvider";

export default function ConvexClientProvider({
  children,
}: {
  children: ReactNode;
}) {
  const convex = useMemo(() => {
    if (!process.env.NEXT_PUBLIC_CONVEX_URL) {
      throw new Error("NEXT_PUBLIC_CONVEX_URL is not set");
    }
    return new ConvexReactClient(process.env.NEXT_PUBLIC_CONVEX_URL);
  }, []);

  return (
    <ConvexProviderWithClerk client={convex} useAuth={useAuth}>
      <LocaleProvider>{children}</LocaleProvider>
    </ConvexProviderWithClerk>
  );
}
