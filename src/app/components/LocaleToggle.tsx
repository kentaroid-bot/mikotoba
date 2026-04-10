"use client";

import { useEffect, useRef, useState } from "react";
import { useLocale } from "./LocaleProvider";

const OPTIONS = [
  { value: "ja", label: "JA" },
  { value: "en", label: "EN" },
  { value: "zh", label: "ZH" },
  { value: "hi", label: "HI" },
  { value: "fr", label: "FR" },
] as const;

export default function LocaleToggle() {
  const { locale, setLocale } = useLocale();
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    const onPointerDown = (event: MouseEvent) => {
      if (!rootRef.current) return;
      if (!rootRef.current.contains(event.target as Node)) {
        setOpen(false);
      }
    };
    window.addEventListener("mousedown", onPointerDown);
    return () => window.removeEventListener("mousedown", onPointerDown);
  }, []);

  const active = OPTIONS.find((option) => option.value === locale) ?? OPTIONS[0];
  const selectable = OPTIONS.filter((option) => option.value !== locale);
  const bubbleClass =
    "h-9 w-9 rounded-full text-[10px] font-bold shadow-sm flex items-center justify-center";

  return (
    <div ref={rootRef} className="relative inline-flex shrink-0 z-[70]">
      {open ? (
        <div className="absolute top-full left-0 mt-2 flex flex-col gap-1.5">
          {selectable.map((option) => (
            <button
              key={option.value}
              type="button"
              onClick={() => {
                setLocale(option.value);
                setOpen(false);
              }}
              className={`${bubbleClass} border border-primary/20 bg-white text-primary`}
            >
              {option.label}
            </button>
          ))}
        </div>
      ) : null}
      <button
        type="button"
        onClick={() => setOpen((prev) => !prev)}
        className="rounded-full focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40"
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label="Change language"
      >
        <span className={`${bubbleClass} bg-primary text-white`}>{active.label}</span>
      </button>
    </div>
  );
}
