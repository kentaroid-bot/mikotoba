"use client";

import Link from "next/link";
import { useUiStrings } from "./useUiStrings";

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
    <div className="fixed bottom-0 left-0 w-full z-[30]">
      <nav className="bottom-nav-shell flex justify-around items-end px-3 pt-2 bg-white/88 backdrop-blur-md rounded-t-[2rem] shadow-[0_-6px_24px_rgba(0,0,0,0.08)]">
        {items.map((item) => {
          const isActive = item.key === active;
          return (
            <Link
              key={item.key}
              href={item.href}
              className={
                isActive
                  ? "flex min-h-11 min-w-[4.25rem] flex-col items-center justify-center bg-secondary text-white rounded-2xl px-4 py-2 scale-105 -translate-y-1 shadow-md shadow-secondary/20 transition-all"
                  : "flex min-h-11 min-w-[4.25rem] flex-col items-center justify-center text-on-surface-variant px-3 py-2 hover:text-secondary transition-colors"
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
