// Simulated magic-link auth — client-only, localStorage-backed.
// Real magic-link wiring would replace requestMagicLink + verifyToken.
import { useEffect, useState } from "react";

const KEY = "cc_session_v1";

export type CCUser = {
  email: string;
  handle: string;
  joinedAt: string;
  // Legacy / convenience
  name?: string;
  phone?: string;
  city?: string;
  // Full gathering profile
  firstName?: string;
  lastName?: string;
  mobile?: string;
  facebook?: string;
  gender?: string;
  age?: string;
  district?: string;
  governorate?: string;
  country?: string;
  university?: string;
  major?: string;
  occupation?: string;
  company?: string;
  banned?: string;
  brief?: string;
  why?: string;
};

export function isProfileComplete(u: CCUser | null | undefined): boolean {
  if (!u) return false;
  const need = [u.firstName, u.lastName, u.mobile, u.gender, u.age, u.district, u.governorate, u.country, u.occupation, u.brief, u.why];
  if (!need.every((v) => typeof v === "string" && v.trim().length > 0)) return false;
  if ((u.brief ?? "").trim().length < 20) return false;
  if ((u.why ?? "").trim().length < 20) return false;
  const a = Number(u.age);
  if (!Number.isFinite(a) || a < 13 || a >= 100) return false;
  return true;
}

export function updateProfile(patch: Partial<Omit<CCUser, "email" | "joinedAt">>) {
  const cur = read();
  if (!cur) return;
  const next: CCUser = { ...cur, ...patch };
  write(next);
}

type Listener = (u: CCUser | null) => void;
const listeners = new Set<Listener>();

function read(): CCUser | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = localStorage.getItem(KEY);
    return raw ? (JSON.parse(raw) as CCUser) : null;
  } catch {
    return null;
  }
}

function write(u: CCUser | null) {
  if (typeof window === "undefined") return;
  if (u) localStorage.setItem(KEY, JSON.stringify(u));
  else localStorage.removeItem(KEY);
  listeners.forEach((fn) => fn(u));
}

// Pretend to send a magic link; returns a token we can "click" to verify.
export async function requestMagicLink(email: string): Promise<string> {
  await new Promise((r) => setTimeout(r, 700));
  const token = btoa(`${email}:${Date.now()}`);
  sessionStorage.setItem("cc_pending_magic", JSON.stringify({ email, token }));
  return token;
}

export async function verifyMagicLink(token: string): Promise<CCUser> {
  await new Promise((r) => setTimeout(r, 500));
  const raw = sessionStorage.getItem("cc_pending_magic");
  if (!raw) throw new Error("Link expired. Request a new one.");
  const { email, token: stored } = JSON.parse(raw) as { email: string; token: string };
  if (stored !== token) throw new Error("Invalid link.");
  sessionStorage.removeItem("cc_pending_magic");
  const handle = email.split("@")[0].replace(/[^a-z0-9]/gi, "") || "friend";
  const user: CCUser = { email, handle, joinedAt: new Date().toISOString() };
  write(user);
  return user;
}

export function signOut() {
  write(null);
}

export function useAuth() {
  const [user, setUser] = useState<CCUser | null>(() => read());
  useEffect(() => {
    const fn: Listener = (u) => setUser(u);
    listeners.add(fn);
    return () => { listeners.delete(fn); };
  }, []);
  return { user, signOut };
}
