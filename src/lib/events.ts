// Event registry + RSVP store. Client-only, localStorage-backed.
import { useEffect, useState } from "react";

export type CCEvent = {
  slug: string;
  d: string;
  m: string;
  year: string;
  title: string;
  where: string;
  address: string;
  blurb: string;
  longBlurb: string;
  img: string;
  tone: "cyan" | "slate" | "sage";
  price: number; // EGP
  capacity: number;
  doors: string;
  hosts: string[];
};

export const EVENTS: CCEvent[] = [
  {
    slug: "maadi-live",
    d: "14", m: "May", year: "2026",
    title: "Confessions Live · Maadi",
    where: "Garden, Maadi",
    address: "Address shared 24h before · Maadi Sarayat",
    blurb: "A candlelit night of read-aloud confessions. Bring nothing but yourself.",
    longBlurb:
      "Six anonymous confessions, read aloud by voices that aren't theirs. " +
      "A garden. Low light. No phones, no recordings. The room listens. That's the whole evening.",
    img: "https://images.unsplash.com/photo-1542816417-0983c9c9ad53?w=1200&q=70",
    tone: "cyan",
    price: 250,
    capacity: 28,
    doors: "8:00 PM · doors at 7:30",
    hosts: ["Layla", "Hassan"],
  },
  {
    slug: "letter-workshop",
    d: "22", m: "May", year: "2026",
    title: "Letter Workshop",
    where: "Downtown",
    address: "Atelier on Champollion · shared after booking",
    blurb: "Write to the person you never could. Burn it, send it, or keep it.",
    longBlurb:
      "Two hours, paper, ink, and one prompt: the letter you never sent. " +
      "We close with a quiet circle. You decide if it leaves the room.",
    img: "https://images.unsplash.com/photo-1455390582262-044cdead277a?w=1200&q=70",
    tone: "slate",
    price: 300,
    capacity: 16,
    doors: "6:30 PM",
    hosts: ["Mariam"],
  },
  {
    slug: "nile-whispers",
    d: "02", m: "Jun", year: "2026",
    title: "Whispers on the Nile",
    where: "Felucca, Zamalek",
    address: "Boarding point sent the morning of",
    blurb: "A boat. A microphone. The river keeps your secrets.",
    longBlurb:
      "Sunset on a felucca. An open mic for the things you'd only say to water. " +
      "Limited to one boat. We sail when we sail.",
    img: "https://images.unsplash.com/photo-1518684079-3c830dcef090?w=1200&q=70",
    tone: "sage",
    price: 400,
    capacity: 22,
    doors: "5:45 PM",
    hosts: ["Omar", "Nour"],
  },
  {
    slug: "coffee-confession",
    d: "09", m: "Jun", year: "2026",
    title: "Coffee + Confession",
    where: "Downtown café",
    address: "Café address shared on booking",
    blurb: "One stranger. One coffee. One thing you've never said.",
    longBlurb:
      "We pair you with one person you've never met. You each get one confession. " +
      "Forty minutes. The coffee is on us.",
    img: "https://images.unsplash.com/photo-1495474472287-4d71bcdd2085?w=1200&q=70",
    tone: "cyan",
    price: 150,
    capacity: 20,
    doors: "11:00 AM",
    hosts: ["CC pairing team"],
  },
  {
    slug: "sunset-sahel",
    d: "14", m: "Jul", year: "2026",
    title: "Sunset Sessions · Sahel",
    where: "North Coast",
    address: "Sidi Heneish · access details after booking",
    blurb: "Beach bonfire. The sea has been told worse.",
    longBlurb:
      "An overnight by the sea. Bonfire, slow music, slower conversations. " +
      "Bring a blanket. We'll bring everything else.",
    img: "https://images.unsplash.com/photo-1547150585-4ad19fe8f0db?w=1200&q=70",
    tone: "slate",
    price: 850,
    capacity: 30,
    doors: "Arrive between 5–7 PM",
    hosts: ["CC North"],
  },
  {
    slug: "listeners-circle",
    d: "28", m: "Jul", year: "2026",
    title: "Listeners' Circle",
    where: "Zamalek studio",
    address: "26th of July St · shared on booking",
    blurb: "An evening for those who want to be heard, not advised.",
    longBlurb:
      "Five trained listeners. Eight chairs. No advice, no fixing — just being heard. " +
      "A facilitated circle from CC's listener team.",
    img: "https://images.unsplash.com/photo-1511632765486-a01980e01a18?w=1200&q=70",
    tone: "sage",
    price: 200,
    capacity: 8,
    doors: "7:00 PM",
    hosts: ["CC listener team"],
  },
];

export function getEvent(slug: string): CCEvent | undefined {
  return EVENTS.find((e) => e.slug === slug);
}

// ---------- RSVP store ----------

export type RSVPStatus = "pending_payment" | "awaiting_approval" | "confirmed" | "rejected";

export type RSVP = {
  slug: string;
  email: string;
  status: RSVPStatus;
  method: "instapay" | "whatsapp" | null;
  proofName?: string;
  createdAt: string;
  updatedAt: string;
};

const KEY = "cc_rsvps_v1";
type Listener = (r: RSVP[]) => void;
const listeners = new Set<Listener>();

function read(): RSVP[] {
  if (typeof window === "undefined") return [];
  try { return JSON.parse(localStorage.getItem(KEY) || "[]") as RSVP[]; }
  catch { return []; }
}
function write(list: RSVP[]) {
  if (typeof window === "undefined") return;
  localStorage.setItem(KEY, JSON.stringify(list));
  listeners.forEach((fn) => fn(list));
}

export function startBooking(email: string, slug: string): RSVP {
  const list = read();
  const existing = list.find((r) => r.email === email && r.slug === slug);
  const now = new Date().toISOString();
  if (existing) {
    existing.status = existing.status === "confirmed" ? "confirmed" : "pending_payment";
    existing.updatedAt = now;
    write(list);
    return existing;
  }
  const r: RSVP = { slug, email, status: "pending_payment", method: null, createdAt: now, updatedAt: now };
  list.push(r);
  write(list);
  return r;
}

export function submitProof(email: string, slug: string, method: "instapay" | "whatsapp", proofName?: string) {
  const list = read();
  const r = list.find((x) => x.email === email && x.slug === slug);
  if (!r) return;
  r.method = method;
  r.status = "awaiting_approval";
  r.proofName = proofName;
  r.updatedAt = new Date().toISOString();
  write(list);
}

export function approve(email: string, slug: string) {
  const list = read();
  const r = list.find((x) => x.email === email && x.slug === slug);
  if (!r) return;
  r.status = "confirmed";
  r.updatedAt = new Date().toISOString();
  write(list);
}

export function useRSVPs(email: string | undefined) {
  const [rsvps, setRsvps] = useState<RSVP[]>(() => read());
  useEffect(() => {
    const fn: Listener = (r) => setRsvps(r);
    listeners.add(fn);
    return () => { listeners.delete(fn); };
  }, []);
  return email ? rsvps.filter((r) => r.email === email) : [];
}

export function useRSVP(email: string | undefined, slug: string) {
  const all = useRSVPs(email);
  return all.find((r) => r.slug === slug);
}
