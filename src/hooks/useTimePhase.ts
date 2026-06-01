import { useState, useEffect } from "react";

export type Phase = "dawn" | "morning" | "midday" | "sunset" | "dusk" | "night";

export interface PhaseTokens {
  photo: string;
  // CSS filter applied to the photo to simulate time-of-day lighting
  photoFilter: string;
  accent: string;
  accentRgb: string;
  // Gradient overlay on top of photo — atmospheric, not a flat color
  overlayGradient: string;
  navBorder: string;
  glowColor: string;
  // Card tint for primary action card
  cardTint: string;
  cardBorder: string;
  label: string;
}

export const PHASES: Record<Phase, PhaseTokens> = {
  dawn: {
    photo: "/assets/cairo/dawn.jpg",
    photoFilter: "brightness(0.60) sepia(0.3) saturate(1.4) hue-rotate(-10deg)",
    accent: "#E8A87C",
    accentRgb: "232,168,124",
    overlayGradient: "linear-gradient(to top, rgba(10,4,0,0.90) 0%, rgba(160,70,20,0.55) 55%, rgba(200,100,30,0.35) 100%)",
    navBorder: "rgba(232,168,124,0.22)",
    glowColor: "rgba(232,168,124,0.45)",
    cardTint: "rgba(232,168,124,0.10)",
    cardBorder: "rgba(232,168,124,0.28)",
    label: "Dawn",
  },
  morning: {
    photo: "/assets/cairo/morning.jpg",
    photoFilter: "brightness(0.65) saturate(1.2) sepia(0.1)",
    accent: "#F4C842",
    accentRgb: "244,200,66",
    overlayGradient: "linear-gradient(to top, rgba(5,4,0,0.90) 0%, rgba(140,100,0,0.55) 55%, rgba(180,140,0,0.35) 100%)",
    navBorder: "rgba(244,200,66,0.20)",
    glowColor: "rgba(244,200,66,0.45)",
    cardTint: "rgba(244,200,66,0.08)",
    cardBorder: "rgba(244,200,66,0.25)",
    label: "Morning",
  },
  midday: {
    photo: "/assets/cairo/midday.jpg",
    photoFilter: "brightness(0.65) saturate(0.9) contrast(1.05)",
    accent: "#7DC6E2",
    accentRgb: "125,198,226",
    overlayGradient: "linear-gradient(to top, rgba(0,5,15,0.90) 0%, rgba(10,60,120,0.55) 55%, rgba(20,90,160,0.35) 100%)",
    navBorder: "rgba(125,198,226,0.18)",
    glowColor: "rgba(125,198,226,0.40)",
    cardTint: "rgba(125,198,226,0.08)",
    cardBorder: "rgba(125,198,226,0.22)",
    label: "Midday",
  },
  sunset: {
    photo: "/assets/cairo/sunset.jpg",
    photoFilter: "brightness(0.60) sepia(0.4) saturate(1.6) hue-rotate(-8deg)",
    accent: "#E8703A",
    accentRgb: "232,112,58",
    overlayGradient: "linear-gradient(to top, rgba(12,2,0,0.90) 0%, rgba(180,55,5,0.58) 55%, rgba(220,80,10,0.38) 100%)",
    navBorder: "rgba(232,112,58,0.22)",
    glowColor: "rgba(232,112,58,0.50)",
    cardTint: "rgba(232,112,58,0.10)",
    cardBorder: "rgba(232,112,58,0.28)",
    label: "Sunset",
  },
  dusk: {
    photo: "/assets/cairo/dusk.jpg",
    photoFilter: "brightness(0.50) saturate(0.9) contrast(1.1)",
    accent: "#8B6BAE",
    accentRgb: "139,107,174",
    overlayGradient: "linear-gradient(to top, rgba(4,0,12,0.92) 0%, rgba(70,20,120,0.58) 55%, rgba(100,30,160,0.38) 100%)",
    navBorder: "rgba(139,107,174,0.22)",
    glowColor: "rgba(139,107,174,0.50)",
    cardTint: "rgba(139,107,174,0.10)",
    cardBorder: "rgba(139,107,174,0.25)",
    label: "Dusk",
  },
  night: {
    photo: "/assets/cairo/night.jpg",
    photoFilter: "brightness(0.55) saturate(1.1) contrast(1.1)",
    accent: "#04C9F4",
    accentRgb: "4,201,244",
    overlayGradient: "linear-gradient(to top, rgba(0,3,8,0.92) 0%, rgba(2,25,55,0.58) 55%, rgba(3,35,75,0.38) 100%)",
    navBorder: "rgba(255,255,255,0.12)",
    glowColor: "rgba(4,201,244,0.45)",
    cardTint: "rgba(4,201,244,0.10)",
    cardBorder: "rgba(4,201,244,0.25)",
    label: "Night",
  },
};

function getCairoHour(): number {
  return parseInt(new Date().toLocaleString("en-US", { timeZone: "Africa/Cairo", hour: "numeric", hour12: false }), 10);
}

// hour → phase
function hourToPhase(hour: number): Phase {
  if (hour >= 4 && hour < 7) return "dawn";
  if (hour >= 7 && hour < 11) return "morning";
  if (hour >= 11 && hour < 15) return "midday";
  if (hour >= 15 && hour < 20) return "sunset";
  if (hour >= 20 && hour < 22) return "dusk";
  return "night";
}

const PHASE_ORDER: Phase[] = ["dawn", "morning", "midday", "sunset", "dusk", "night"];

function getDevPhase(): Phase | null {
  if (typeof window === "undefined") return null;
  const params = new URLSearchParams(window.location.search);
  const p = params.get("phase");
  if (p === "real") {
    sessionStorage.removeItem("cc-forced-phase");
    return null;
  }
  if (p && PHASES[p as Phase]) {
    sessionStorage.setItem("cc-forced-phase", p);
    return p as Phase;
  }
  const stored = sessionStorage.getItem("cc-forced-phase") as Phase | null;
  if (stored && PHASES[stored]) return stored;
  return null;
}

function isCycleMode(): boolean {
  if (typeof window === "undefined") return false;
  return new URLSearchParams(window.location.search).has("cycle");
}

function getCyclePhase(): Phase {
  // 24s full cycle — each phase lasts 4s
  const elapsed = (Date.now() / 1000) % 24;
  const idx = Math.floor(elapsed / 4);
  return PHASE_ORDER[idx % PHASE_ORDER.length];
}

const LS_OVERRIDE = "cc_phase_override";

export function getPhaseOverride(): Phase | null {
  if (typeof window === "undefined") return null;
  const v = localStorage.getItem(LS_OVERRIDE) as Phase | null;
  return v && PHASES[v] ? v : null;
}

export function setPhaseOverride(phase: Phase | null): void {
  if (typeof window === "undefined") return;
  if (phase) localStorage.setItem(LS_OVERRIDE, phase);
  else localStorage.removeItem(LS_OVERRIDE);
  window.dispatchEvent(new CustomEvent("cc:phase-override"));
}

function resolvePhase(): Phase {
  if (typeof window !== "undefined" && new URLSearchParams(window.location.search).has("cycle")) return getCyclePhase();
  const dev = getDevPhase();
  if (dev) return dev;
  const override = getPhaseOverride();
  if (override) return override;
  return hourToPhase(getCairoHour());
}

export function useTimePhase(searchStr?: string) {
  const [phase, setPhase] = useState<Phase>(() => hourToPhase(getCairoHour()));

  useEffect(() => {
    setPhase(resolvePhase());
  }, [searchStr]);

  useEffect(() => {
    const interval = isCycleMode() ? 500 : 60_000;
    const id = setInterval(() => setPhase(resolvePhase()), interval);
    return () => clearInterval(id);
  }, []);

  // React to manual override changes
  useEffect(() => {
    function onOverride() { setPhase(resolvePhase()); }
    window.addEventListener("cc:phase-override", onOverride);
    return () => window.removeEventListener("cc:phase-override", onOverride);
  }, []);

  return { phase, tokens: PHASES[phase] };
}
