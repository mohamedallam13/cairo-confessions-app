import { createContext, useContext, useState, useEffect, createElement, type ReactNode } from "react";
import { en } from "../locales/en";
import { ar } from "../locales/ar";

export type Lang = "en" | "ar";

type DeepRecord = { [k: string]: string | string[] | DeepRecord };

function getByPath(obj: DeepRecord, path: string): string {
  const parts = path.split(".");
  let cur: unknown = obj;
  for (const p of parts) {
    if (typeof cur !== "object" || cur === null || Array.isArray(cur)) return path;
    cur = (cur as DeepRecord)[p];
  }
  return typeof cur === "string" ? cur : path;
}

function getArrByPath(obj: DeepRecord, path: string): string[] {
  const parts = path.split(".");
  let cur: unknown = obj;
  for (const p of parts) {
    if (typeof cur !== "object" || cur === null || Array.isArray(cur)) return [];
    cur = (cur as DeepRecord)[p];
  }
  return Array.isArray(cur) ? (cur as string[]) : [];
}

interface LangContextValue {
  lang: Lang;
  setLang: (l: Lang) => void;
}

const LangContext = createContext<LangContextValue>({ lang: "en", setLang: () => {} });

export function LangProvider({ children }: { children: ReactNode }) {
  const [lang, setLangState] = useState<Lang>("en");

  useEffect(() => {
    const saved = localStorage.getItem("cc_lang") as Lang | null;
    if (saved === "ar" || saved === "en") setLangState(saved);
  }, []);

  useEffect(() => {
    document.documentElement.lang = lang;
    // Layout stays LTR — Arabic text renders naturally within its own flow
    document.documentElement.dir = "ltr";
  }, [lang]);

  function setLang(l: Lang) {
    localStorage.setItem("cc_lang", l);
    setLangState(l);
  }

  return createElement(LangContext.Provider, { value: { lang, setLang } }, children);
}

export function useTranslation() {
  const { lang, setLang } = useContext(LangContext);
  const strings = (lang === "ar" ? ar : en) as unknown as DeepRecord;

  function t(key: string): string {
    return getByPath(strings, key);
  }

  function ta(key: string): string[] {
    return getArrByPath(strings, key);
  }

  return { t, ta, lang, setLang };
}
