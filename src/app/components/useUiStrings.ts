"use client";

import { useMemo } from "react";
import { useQuery } from "convex/react";
import { api } from "../../../convex/_generated/api";
import { type AppLocale, useLocale } from "./LocaleProvider";

type Vars = Record<string, string | number>;

const formatTemplate = (template: string, vars: Vars) =>
  template.replace(/\{([a-zA-Z0-9_]+)\}/g, (_, key: string) =>
    Object.prototype.hasOwnProperty.call(vars, key) ? String(vars[key]) : `{${key}}`
  );

export const useUiStrings = (page: string, localeOverride?: AppLocale) => {
  const { locale: activeLocale } = useLocale();
  const locale = localeOverride ?? activeLocale;
  const strings = useQuery(api.uiStrings.getByPage, { page, locale });

  return useMemo(() => {
    const t = (key: string, fallback: string) => strings?.[key] ?? fallback;
    const tf = (key: string, fallback: string, vars: Vars) =>
      formatTemplate(t(key, fallback), vars);
    return {
      t,
      tf,
      strings,
    };
  }, [strings]);
};
