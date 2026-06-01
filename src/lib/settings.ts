// CC settings: short-circuit forms when the profile is already complete.
// Toggleable from the in-app dashboard at /dashboard.
import { useEffect, useState } from "react";

export type CCSettings = {
  shortJoinTeamWhenComplete: boolean;
  shortEventApplyWhenComplete: boolean;
};

const KEY = "cc_settings_v1";
const DEFAULT: CCSettings = {
  shortJoinTeamWhenComplete: true,
  shortEventApplyWhenComplete: true,
};

type Listener = (s: CCSettings) => void;
const listeners = new Set<Listener>();

function read(): CCSettings {
  if (typeof window === "undefined") return DEFAULT;
  try {
    const raw = localStorage.getItem(KEY);
    return raw ? { ...DEFAULT, ...JSON.parse(raw) } : DEFAULT;
  } catch { return DEFAULT; }
}
function write(s: CCSettings) {
  if (typeof window === "undefined") return;
  localStorage.setItem(KEY, JSON.stringify(s));
  listeners.forEach((fn) => fn(s));
}

export function getSettings(): CCSettings { return read(); }
export function setSetting<K extends keyof CCSettings>(k: K, v: CCSettings[K]) {
  const cur = read();
  write({ ...cur, [k]: v });
}

export function useSettings(): CCSettings {
  const [s, setS] = useState<CCSettings>(() => read());
  useEffect(() => {
    const fn: Listener = (next) => setS(next);
    listeners.add(fn);
    return () => { listeners.delete(fn); };
  }, []);
  return s;
}
