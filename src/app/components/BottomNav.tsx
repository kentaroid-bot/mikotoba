"use client";

import Link from "next/link";
import { useUiStrings } from "./useUiStrings";
import LocaleToggle from "./LocaleToggle";

type NavKey = "chat" | "announcements" | "diary" | "profile";

type BottomNavProps = {
  active: NavKey;
};

const items: Array<{
  key: NavKey;
  icon: string;
  href: string;
}> = [
  { key: "chat", icon: "forum", href: "/" },
  {
    key: "announcements",
    icon: "notification_important",
    href: "/announcements",
  },
  { key: "diary", icon: "auto_stories", href: "/diary" },
  { key: "profile", icon: "person", href: "/profile" },
];

export default function BottomNav({ active }: BottomNavProps) {
  const { t } = useUiStrings("common_nav");

  return (
    <div className="fixed bottom-0 left-0 w-full z-50">
      <div className="absolute right-4 -top-10">
        <LocaleToggle />
      </div>
      <nav className="flex justify-around items-end px-4 pb-6 pt-2 bg-white/80 backdrop-blur-xl rounded-t-[2rem] shadow-[0_-10px_40px_rgba(0,0,0,0.08)]">
        {items.map((item) => {
          const isActive = item.key === active;
          return (
            <Link
              key={item.key}
              href={item.href}
              className={
                isActive
                  ? "flex flex-col items-center justify-center bg-secondary text-white rounded-2xl px-5 py-2 scale-110 -translate-y-2 shadow-lg shadow-secondary/30 transition-all"
                  : "flex flex-col items-center justify-center text-on-surface-variant px-4 py-2 hover:text-secondary transition-colors"
              }
            >
              <span
                className="material-symbols-outlined"
                style={isActive ? { fontVariationSettings: "'FILL' 1" } : undefined}
              >
                {item.icon}
              </span>
              <span className="font-label text-[10px] uppercase">
                {t(item.key, item.key)}
              </span>
            </Link>
          );
        })}
      </nav>
    </div>
  );
}
