import { useEffect, useState, useRef } from "react";
import type React from "react";
import { Link, Outlet, useLocation, useRouter } from "@tanstack/react-router";
import { HouseHeart, Mail, ChevronLeft, ChevronRight, BookOpen, Users, UserCircle } from "lucide-react";
import { getIngestingRefs, getOrCreateAnonId, detectBrowser, getMyRefs } from "../lib/anonIdentity";
import { getThreads } from "../lib/reachOut";
import type { RemoteThread } from "../lib/reachOut";
import { PHASES, type Phase, getPhaseOverride, setPhaseOverride } from "../hooks/useTimePhase";
import { useTranslation } from "../lib/i18n";

// ─── Identity reveal modal ───────────────────────────────────────────────────

function IdentityRevealModal({ anonId, onDone }: { anonId: string; onDone: () => void }) {
  const { t } = useTranslation();
  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4"
      style={{ background: "rgba(0,0,0,0.80)", backdropFilter: "blur(8px)" }}
    >
      <div
        className="w-full max-w-lg rounded-2xl p-8 space-y-6 text-center"
        style={{ background: "rgba(12,15,18,0.97)", border: "1px solid rgba(255,255,255,0.10)" }}
      >
        <div className="space-y-2">
          <p className="text-[10px] uppercase tracking-[0.28em] text-cc-off/30">{t("layout.youAreNow")}</p>
          <p
            className="font-display text-[1.4rem] uppercase tracking-[0.12em]"
            style={{ color: "var(--phase-accent,#04C9F4)" }}
          >
            {anonId}
          </p>
        </div>

        <p className="text-cc-off/45 text-[13px] leading-[1.8]">
          {t("layout.anonymous")}<br />
          No name. No judgment. Just you.
        </p>

        <button
          onClick={onDone}
          className="w-full py-3.5 font-display text-[11px] uppercase tracking-[0.22em] rounded-xl transition-all active:scale-95"
          style={{
            background: "linear-gradient(135deg, var(--phase-accent,#04C9F4), rgba(var(--phase-accent-rgb,4,201,244),0.75))",
            color: "#050606",
          }}
        >
          →
        </button>
      </div>
    </div>
  );
}

// ─── Session URL helpers ──────────────────────────────────────────────────────

function injectSessionParams(anonId: string, browser: string) {
  const url = new URL(window.location.href);
  url.searchParams.set("sid", anonId);
  url.searchParams.set("sbr", encodeURIComponent(browser));
  history.replaceState(null, "", url.toString());
}

function stripSessionParams() {
  const url = new URL(window.location.href);
  url.searchParams.delete("sid");
  url.searchParams.delete("sbr");
  history.replaceState(null, "", url.toString());
}

// ─── Session conflict modal ───────────────────────────────────────────────────

function SessionConflictModal({
  caseType,
  incomingAnonId,
  incomingBrowser,
  localAnonId,
  onDismiss,
  onRecover,
}: {
  caseType: "case1" | "case3";
  incomingAnonId: string;
  incomingBrowser: string | null;
  localAnonId: string;
  onDismiss: () => void;
  onRecover: () => void;
}) {
  const { t } = useTranslation();
  const fromLabel = incomingBrowser ? ` from ${incomingBrowser}` : "";

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4"
      style={{ background: "rgba(0,0,0,0.65)", backdropFilter: "blur(6px)" }}
    >
      <div
        className="w-full max-w-lg rounded-2xl p-6 space-y-5"
        style={{ background: "rgba(12,15,18,0.97)", border: "1px solid rgba(255,255,255,0.10)" }}
      >
        <div className="space-y-2">
          <p className="font-display text-[1rem] uppercase tracking-[0.14em]" style={{ color: "var(--phase-accent,#04C9F4)" }}>
            {incomingAnonId}
          </p>
          <p className="text-cc-off/70 text-[14px] leading-[1.7]">
            was here{fromLabel}.
          </p>
          <p className="text-cc-off text-[16px] font-semibold">{t("layout.isThatYou")}</p>
          {caseType === "case3" && (
            <p className="text-cc-off/35 text-[12px]">You're currently <span className="font-display" style={{ color: "rgba(var(--phase-accent-rgb,4,201,244),0.6)" }}>{localAnonId}</span>.</p>
          )}
        </div>
        <div className="flex flex-col gap-2">
          <button
            onClick={onRecover}
            className="w-full py-3 font-display text-[11px] uppercase tracking-[0.18em] rounded-xl transition-all active:scale-95"
            style={{ background: "linear-gradient(135deg, var(--phase-accent,#04C9F4), rgba(var(--phase-accent-rgb,4,201,244),0.75))", color: "#050606" }}
          >
            {t("layout.recoverMySpace")}
          </button>
          <button
            onClick={onDismiss}
            className="w-full py-2 text-[10px] uppercase tracking-[0.14em] text-cc-off/25 hover:text-cc-off/50 transition-colors"
          >
            {caseType === "case1" ? t("layout.notMeStartFresh") : t("layout.notMeKeepMine")}
          </button>
        </div>
      </div>
    </div>
  );
}

const PHASE_ORDER: Phase[] = ["dawn", "morning", "midday", "sunset", "dusk", "night"];

function PhasePicker({ currentPhase }: { currentPhase: Phase }) {
  const { t } = useTranslation();
  const [override, setOverride] = useState<Phase | null>(null);
  const [open, setOpen] = useState(false);

  useEffect(() => {
    setOverride(getPhaseOverride());
    function onOverride() { setOverride(getPhaseOverride()); }
    window.addEventListener("cc:phase-override", onOverride);
    return () => window.removeEventListener("cc:phase-override", onOverride);
  }, []);

  function select(phase: Phase | null) {
    setPhaseOverride(phase);
    setOverride(phase);
    setOpen(false);
  }

  const displayPhase = override ?? currentPhase;
  const accent = PHASES[displayPhase].accentRgb;

  return (
    <div className="relative">
      <div className="flex items-center gap-2">
        <span className="text-[8px] uppercase tracking-[0.2em] text-cc-off/25">{t("layout.mood")}</span>
        <button
          onClick={() => setOpen((o) => !o)}
          className="flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[9.5px] uppercase tracking-[0.16em] transition-all active:scale-95"
          style={{ background: `rgba(${accent}, 0.12)`, border: `1px solid rgba(${accent}, 0.25)`, color: `rgba(${accent}, 0.85)` }}
        >
          <span className="w-1.5 h-1.5 rounded-full" style={{ background: `rgba(${accent}, 0.9)` }} />
          {override ? PHASES[override].label : `${t("layout.auto")} · ${PHASES[currentPhase].label}`}
        </button>
      </div>
      {open && (
        <>
          <div className="fixed inset-0 z-40" onClick={() => setOpen(false)} />
          <div
            className="absolute end-0 top-full mt-2 z-50 rounded-xl overflow-hidden py-1 min-w-[120px]"
            style={{ background: "rgba(10,12,15,0.96)", border: "1px solid rgba(255,255,255,0.12)", backdropFilter: "blur(16px)" }}
          >
            <button
              onClick={() => select(null)}
              className="w-full flex items-center gap-2.5 px-3.5 py-2.5 text-[11px] uppercase tracking-[0.14em] transition-colors hover:bg-white/5 text-left"
              style={{ color: !override ? "rgba(242,242,242,0.85)" : "rgba(242,242,242,0.35)" }}
            >
              <span className="w-2 h-2 rounded-full" style={{ background: "rgba(255,255,255,0.25)" }} />
              {t("layout.auto")} · {PHASES[currentPhase].label}
              {!override && <span className="ms-auto text-[8px] opacity-50">✓</span>}
            </button>
            <div className="mx-3 my-1 border-t border-white/8" />
            {PHASE_ORDER.map((p) => (
              <button
                key={p}
                onClick={() => select(p)}
                className="w-full flex items-center gap-2.5 px-3.5 py-2.5 text-[11px] uppercase tracking-[0.14em] transition-colors hover:bg-white/5 text-left"
                style={{ color: override === p ? `rgba(${PHASES[p].accentRgb}, 0.9)` : "rgba(242,242,242,0.45)" }}
              >
                <span className="w-2 h-2 rounded-full shrink-0" style={{ background: `rgba(${PHASES[p].accentRgb}, 0.8)` }} />
                {PHASES[p].label}
                {override === p && <span className="ms-auto text-[8px] opacity-60">✓</span>}
              </button>
            ))}
          </div>
        </>
      )}
    </div>
  );
}

function ProfileSheet({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { t, lang, setLang } = useTranslation();
  const anonId = typeof window !== "undefined" ? getOrCreateAnonId() : "";
  const [copied, setCopied] = useState(false);
  const { pathname } = useLocation();

  useEffect(() => { onClose(); }, [pathname]);

  function copyId() {
    navigator.clipboard.writeText(anonId);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  }

  return (
    <AnimatePresence>
      {open && (
        <>
          <motion.div
            className="fixed inset-0 z-50"
            style={{ background: "rgba(0,0,0,0.45)" }}
            initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            onClick={onClose}
          />
          <motion.div
            className="fixed bottom-0 left-0 right-0 z-50 max-w-lg mx-auto rounded-t-2xl"
            style={{ background: "rgba(8,10,13,0.98)", border: "1px solid rgba(255,255,255,0.10)", borderBottom: "none", backdropFilter: "blur(24px)" }}
            initial={{ y: "100%" }} animate={{ y: 0 }} exit={{ y: "100%" }}
            transition={{ type: "spring", damping: 32, stiffness: 320 }}
          >
            <div className="flex justify-center pt-3 pb-1">
              <div className="w-8 h-1 rounded-full" style={{ background: "rgba(255,255,255,0.15)" }} />
            </div>

            <div className="px-5 pb-10 pt-3 space-y-5">
              {/* Anon identity */}
              <div>
                <div className="text-[9px] uppercase tracking-[0.2em] text-cc-off/25 mb-2.5">{t("layout.anonIdentity")}</div>
                <div
                  className="flex items-center justify-between px-4 py-3 rounded-xl"
                  style={{ background: "rgba(255,255,255,0.05)", border: "1px solid rgba(255,255,255,0.09)" }}
                >
                  <div className="flex items-center gap-3">
                    <div
                      className="w-8 h-8 rounded-full flex items-center justify-center text-[13px] font-bold shrink-0"
                      style={{ background: "rgba(var(--phase-accent-rgb,4,201,244),0.15)", color: "var(--phase-accent,#04C9F4)" }}
                    >
                      {anonId.charAt(0)}
                    </div>
                    <span className="text-cc-off/80 text-[13px] font-medium">{anonId}</span>
                  </div>
                  <button
                    onClick={copyId}
                    className="text-[10px] uppercase tracking-[0.14em] transition-colors shrink-0"
                    style={{ color: copied ? "var(--phase-accent,#04C9F4)" : "rgba(242,242,242,0.3)" }}
                  >
                    {copied ? t("layout.copied") : t("layout.copy")}
                  </button>
                </div>
              </div>

              {/* Language toggle */}
              <div>
                <div className="text-[9px] uppercase tracking-[0.2em] text-cc-off/25 mb-2.5">{t("layout.language")}</div>
                <div className="flex gap-2">
                  {(["en", "ar"] as const).map((l) => (
                    <button
                      key={l}
                      onClick={() => setLang(l)}
                      className="flex-1 py-2 rounded-lg text-[11px] font-bold tracking-[0.08em] transition-all"
                      style={lang === l
                        ? { background: "rgba(var(--phase-accent-rgb,4,201,244),0.15)", border: "1px solid rgba(var(--phase-accent-rgb,4,201,244),0.30)", color: "var(--phase-accent,#04C9F4)" }
                        : { background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.08)", color: "rgba(242,242,242,0.35)" }
                      }
                    >
                      {l === "en" ? "English" : "العربية"}
                    </button>
                  ))}
                </div>
              </div>

              {/* Signed-in placeholder */}
              <div
                className="flex items-center justify-between px-4 py-3 rounded-xl"
                style={{ background: "rgba(255,255,255,0.025)", border: "1px solid rgba(255,255,255,0.06)", opacity: 0.45 }}
              >
                <div className="flex items-center gap-3">
                  <div
                    className="w-8 h-8 rounded-full flex items-center justify-center shrink-0"
                    style={{ background: "rgba(255,255,255,0.07)", border: "1px solid rgba(255,255,255,0.10)" }}
                  >
                    <UserCircle size={16} strokeWidth={1.5} style={{ color: "rgba(242,242,242,0.35)" }} />
                  </div>
                  <span className="text-cc-off/40 text-[13px]">{t("layout.signedInProfile")}</span>
                </div>
                <span className="text-[9px] uppercase tracking-[0.14em] text-cc-off/25">{t("layout.soon")}</span>
              </div>

              {/* Settings row */}
              <Link
                to="/profile"
                className="w-full flex items-center justify-between py-3 px-4 rounded-xl transition-all active:scale-[0.98]"
                style={{ background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.08)" }}
              >
                <span className="text-[12px] uppercase tracking-[0.14em] text-cc-off/50">{t("layout.settings")}</span>
                <ChevronRight size={14} strokeWidth={1.8} style={{ color: "rgba(242,242,242,0.25)" }} />
              </Link>
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
}

function TypingBubbleIcon({ size = 22, color = "currentColor" }: { size?: number; color?: string }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
      <path d="M21 15C21 15.5304 20.7893 16.0391 20.4142 16.4142C20.0391 16.7893 19.5304 17 19 17H7L3 21V5C3 4.46957 3.21071 3.96086 3.58579 3.58579C3.96086 3.21071 4.46957 3 5 3H19C19.5304 3 20.0391 3.21071 20.4142 3.58579C20.7893 3.96086 21 4.46957 21 5V15Z"
        stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
      <circle cx="9" cy="10" r="1" fill={color} />
      <circle cx="12" cy="10" r="1" fill={color} />
      <circle cx="15" cy="10" r="1" fill={color} />
    </svg>
  );
}
import { AnimatePresence, LayoutGroup, motion } from "framer-motion";
import logoIcon from "../assets/logo-icon.png";
import { useTimePhase } from "../hooks/useTimePhase";
import CairoBackground from "./CairoBackground";

const TOP_LEVEL = new Set(["/", "/track", "/confess-here", "/reach", "/login", "/home", "/events"]);

function pageTitle(pathname: string, t: (k: string) => string): string {
  if (pathname === "/track") return t("titles.mySpace");
  if (pathname === "/confess-here") return t("titles.saySomething");
  if (pathname === "/reach") return t("titles.reachConfessor");
  if (pathname === "/home") return t("titles.feed");
  if (pathname === "/events") return t("titles.community");
  if (pathname === "/login") return t("titles.signIn");
  if (pathname === "/profile") return t("titles.settings");
  return "";
}

function ComingSoonTab({ icon, label, to }: { icon: React.ReactNode; label: string; to: string }) {
  const { pathname } = useLocation();
  const isActive = pathname === to;
  return (
    <div className="flex items-center justify-center">
      <Link
        to={to as "/home" | "/events"}
        className="relative w-full h-full flex flex-col items-center justify-center gap-1"
        style={{ color: isActive ? `var(--phase-accent, #04C9F4)` : "rgba(242,242,242,0.28)", transition: "color 2.5s ease" }}
      >
        <AnimatePresence>
          {isActive && (
            <motion.div
              layoutId="pill-indicator"
              className="absolute"
              style={{ inset: "3px 3px", background: "rgba(var(--phase-accent-rgb, 4,201,244), 0.13)", borderRadius: "9999px" }}
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0, y: -48 }}
              transition={{ duration: 0.4, ease: [0.16, 1, 0.3, 1] }}
            />
          )}
        </AnimatePresence>
        <div className="relative z-10">{icon}</div>
        <span className="text-[7px] font-bold uppercase tracking-[0.08em] whitespace-nowrap relative z-10">{label}</span>
      </Link>
    </div>
  );
}

export default function Layout() {
  const { pathname, searchStr } = useLocation();
  const router = useRouter();
  const isTopLevel = TOP_LEVEL.has(pathname);
  const { phase, tokens } = useTimePhase(searchStr);
  const { t } = useTranslation();
  const [hasIngesting, setHasIngesting] = useState(false);
  const [reachUnread, setReachUnread] = useState(false);
  const [profileOpen, setProfileOpen] = useState(false);

  // Clear unread dot when entering /reach
  useEffect(() => {
    if (pathname !== "/reach") return;
    setReachUnread(false);
  }, [pathname]);

  // Re-check immediately when a thread is opened — clears dot if all are now read
  useEffect(() => {
    function onThreadSeen() {
      const anonId = getOrCreateAnonId();
      const threads = JSON.parse(localStorage.getItem("cc_reach_threads") ?? "[]") as Array<{
        id: string; anonId: string; lastActivity: string;
        messages: Array<{ from: string; sentAt: string }>;
      }>;
      const seen: Record<string, string> = JSON.parse(localStorage.getItem("cc_reach_thread_seen") ?? "{}");
      const stillUnread = threads.some((t) => {
        const perspective = t.anonId === anonId ? "sender" : "confessor";
        const others = t.messages.filter((m) => m.from !== perspective);
        const lastMsg = t.messages[t.messages.length - 1];
        const lastMsgSentAt = lastMsg?.sentAt ?? "";
        const lastMsgIsOwn = lastMsg?.from === perspective;
        const hasReactionActivity = !lastMsgIsOwn && t.lastActivity > lastMsgSentAt;
        if (others.length === 0 && !hasReactionActivity) return false;
        const s = seen[t.id];
        if (!s) return true;
        const lastOtherSentAt = others[others.length - 1]?.sentAt ?? "";
        return lastOtherSentAt > s || (!lastMsgIsOwn && t.lastActivity > s);
      });
      if (!stillUnread) setReachUnread(false);
    }
    window.addEventListener("cc:thread-seen", onThreadSeen);
    return () => window.removeEventListener("cc:thread-seen", onThreadSeen);
  }, []);

  // Always-on 60s poll — drives the unread dot on the nav
  useEffect(() => {
    const poll = async () => {
      try {
        const anonId = getOrCreateAnonId();
        if (!anonId) return;
        const threads = await (getThreads as unknown as (o: { data: { anonId: string } }) => Promise<RemoteThread[]>)({ data: { anonId } } as never);
        const seen: Record<string, string> = JSON.parse(localStorage.getItem("cc_reach_thread_seen") ?? "{}");

        // One-time seed: only runs if the key has NEVER been written (first ever load).
        // Sets all existing threads as "seen right now" so old history doesn't trigger the dot.
        // After this, cursor ONLY advances when user opens a thread.
        if (localStorage.getItem("cc_reach_thread_seen") === null) {
          const now = new Date().toISOString();
          const seed: Record<string, string> = {};
          threads.forEach((t) => { seed[t.id] = now; });
          localStorage.setItem("cc_reach_thread_seen", JSON.stringify(seed));
          setReachUnread(false);
          return;
        }

        // Unread: other-party message OR reaction arrived after thread was last opened
        const hasNew = threads.some((t) => {
          const myRole = t.senderAnonId === anonId ? "sender" : "confessor";
          const otherRole = myRole === "sender" ? "confessor" : "sender";
          const otherMsgs = t.messages.filter((m) => m.fromRole === otherRole);
          const lastMsg = t.messages[t.messages.length - 1];
          const lastMsgSentAt = lastMsg?.sentAt ?? "";
          const lastMsgIsOwn = lastMsg?.fromRole === myRole;
          const hasReactionActivity = !lastMsgIsOwn && t.lastActivity > lastMsgSentAt;
          if (otherMsgs.length === 0 && !hasReactionActivity) return false;
          const s = seen[t.id];
          if (!s) return true;
          const lastOtherSentAt = otherMsgs[otherMsgs.length - 1]?.sentAt ?? "";
          return lastOtherSentAt > s || (!lastMsgIsOwn && t.lastActivity > s);
        });
        setReachUnread(hasNew);
      } catch {}
    };
    poll();
    const id = setInterval(poll, 60_000);
    window.addEventListener("cc:reaction", poll);
    return () => {
      clearInterval(id);
      window.removeEventListener("cc:reaction", poll);
    };
  }, []);

  // ── Splash screen — PWA only ──
  // Splash is rendered in SSR HTML (RootShell) so it shows on first paint.
  // Here we just fade it out after the animation completes.
  useEffect(() => {
    const el = document.getElementById("pwa-splash");
    if (!el || el.style.display === "none") return;
    const t = setTimeout(() => {
      el.style.opacity = "0";
      el.style.pointerEvents = "none";
      setTimeout(() => el.remove(), 650);
    }, 1600);
    return () => clearTimeout(t);
  }, []);

  // ── Identity reveal — show on /track until user explicitly dismisses ──
  const [showIdentityReveal, setShowIdentityReveal] = useState(false);
  const [importInProgress, setImportInProgress] = useState(() => {
    if (typeof window === "undefined") return false;
    const p = new URLSearchParams(window.location.search);
    return !!(p.get("t") || p.get("recover") === "1");
  });

  useEffect(() => {
    function onStart() { setImportInProgress(true); }
    function onDone()  { setImportInProgress(false); }
    window.addEventListener("cc:import-start", onStart);
    window.addEventListener("cc:import-done",  onDone);
    return () => {
      window.removeEventListener("cc:import-start", onStart);
      window.removeEventListener("cc:import-done",  onDone);
    };
  }, []);

  useEffect(() => {
    if (pathname !== "/track") return;
    if (!localStorage.getItem("cc_identity_introduced")) {
      setShowIdentityReveal(true);
    }
  }, [pathname]);

  // Also trigger reveal after "Remove my data" resets identity on the same route
  useEffect(() => {
    function onIdentityReset() {
      if (pathname === "/track") setShowIdentityReveal(true);
    }
    window.addEventListener("cc:identity-reset", onIdentityReset);
    return () => window.removeEventListener("cc:identity-reset", onIdentityReset);
  }, [pathname]);

  function handleIdentityDone() {
    localStorage.setItem("cc_identity_introduced", "1");
    setShowIdentityReveal(false);
  }

  // ── Session URL injection + conflict detection ──
  const [sessionConflict, setSessionConflict] = useState<"case1" | "case3" | null>(null);
  const [incomingAnonId, setIncomingAnonId]   = useState("");
  const [incomingBrowser, setIncomingBrowser] = useState<string | null>(null);
  const conflictChecked = useRef(false);

  // Inject ?sid= on every navigation to keep it current
  // Deferred so it never runs during TanStack Router's navigation cycle
  useEffect(() => {
    const id = setTimeout(() => {
      const anonId  = getOrCreateAnonId();
      const browser = detectBrowser();
      injectSessionParams(anonId, browser);
    }, 0);
    return () => clearTimeout(id);
  }, [pathname]);

  // Detect conflict once on initial load
  useEffect(() => {
    if (conflictChecked.current) return;
    conflictChecked.current = true;

    const urlParams   = new URLSearchParams(window.location.search);
    const urlAnonId   = urlParams.get("sid");
    const urlBrowser  = urlParams.get("sbr") ? decodeURIComponent(urlParams.get("sbr")!) : null;
    const localAnonId = localStorage.getItem("cc_anon_id");

    if (!urlAnonId || urlAnonId === localAnonId) return;

    setIncomingAnonId(urlAnonId);
    setIncomingBrowser(urlBrowser);
    const isEmpty = !localAnonId || getMyRefs().length === 0;
    setSessionConflict(isEmpty ? "case1" : "case3");
  }, []);

  function handleConflictDismiss() {
    setSessionConflict(null);
    // Re-inject with local session
    const anonId  = getOrCreateAnonId();
    const browser = detectBrowser();
    injectSessionParams(anonId, browser);
  }

  useEffect(() => {
    function check() { setHasIngesting(getIngestingRefs().length > 0); }
    if (pathname === "/track") {
      setHasIngesting(false);
    } else {
      check();
    }
    window.addEventListener("storage", check);
    window.addEventListener("cc:ingesting", check);
    return () => {
      window.removeEventListener("storage", check);
      window.removeEventListener("cc:ingesting", check);
    };
  }, [pathname]);

  // Inject phase tokens as CSS custom properties
  useEffect(() => {
    const root = document.documentElement;
    root.style.setProperty("--phase-accent", tokens.accent);
    root.style.setProperty("--phase-accent-rgb", tokens.accentRgb);
    root.style.setProperty("--phase-glow", tokens.glowColor);
    root.style.setProperty("--phase-nav-border", tokens.navBorder);
    root.style.setProperty("--phase-card-tint", tokens.cardTint);
    root.style.setProperty("--phase-card-border", tokens.cardBorder);
    root.setAttribute("data-phase", phase);
  }, [phase, tokens]);

  const isHome = pathname === "/";

  const localAnonId = typeof window !== "undefined" ? getOrCreateAnonId() : "";

  return (
    <div className="min-h-screen flex flex-col" style={{ position: "relative" }}>

      {showIdentityReveal && !sessionConflict && !importInProgress && (
        <IdentityRevealModal
          anonId={localAnonId}
          onDone={handleIdentityDone}
        />
      )}

      {sessionConflict && (
        <SessionConflictModal
          caseType={sessionConflict}
          incomingAnonId={incomingAnonId}
          incomingBrowser={incomingBrowser}
          localAnonId={localAnonId}
          onDismiss={handleConflictDismiss}
          onRecover={() => {
            setImportInProgress(true);
            setSessionConflict(null);
            router.navigate({ to: "/track", search: { t: undefined, recover: "1" } });
          }}
        />
      )}

      <CairoBackground phase={phase} />
      <ProfileSheet open={profileOpen} onClose={() => setProfileOpen(false)} />

      {/* Mood picker floats top-right on landing page (header hidden there) */}
      {isHome && (
        <div
          className="fixed right-5 z-30"
          style={{ top: "calc(env(safe-area-inset-top, 0px) + 16px)" }}
        >
          <PhasePicker currentPhase={phase} />
        </div>
      )}

      {/* Header — hidden on landing page */}
      {!isHome && (
        <header
          className="sticky top-0 z-40"
          style={{
            background: "rgba(6,8,9,0.60)",
            backdropFilter: "blur(20px)",
            borderBottom: "1px solid rgba(255,255,255,0.08)",
            paddingTop: "env(safe-area-inset-top)",
          }}
        >
          <div className="max-w-lg mx-auto px-5 h-16 flex items-center justify-between">
            {isTopLevel && pathname !== "/" ? (
              <>
                <Link to="/" className="flex items-center">
                  <img src={logoIcon} alt="Cairo Confessions" className="h-10 w-auto opacity-90 hover:opacity-100 transition-opacity" />
                </Link>
                <div className="flex items-center gap-2">
                  <PhasePicker currentPhase={phase} />
                  <button
                    onClick={() => setProfileOpen(true)}
                    className="flex items-center justify-center w-9 h-9 rounded-full transition-all active:scale-90"
                    style={{ color: "rgba(242,242,242,0.45)" }}
                  >
                    <UserCircle size={22} strokeWidth={1.5} />
                  </button>
                </div>
              </>
            ) : (
              <>
                <button
                  onClick={() => router.history.back()}
                  className="flex items-center gap-1.5 text-cc-off/40 hover:text-cc-off/80 transition-colors text-[11px] uppercase tracking-[0.2em]"
                >
                  <ChevronLeft size={16} strokeWidth={1.8} />
                  Back
                </button>
                <motion.div
                  key={pathname}
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  className="text-[11px] uppercase tracking-[0.22em] text-cc-off/30"
                >
                  {pageTitle(pathname, t)}
                </motion.div>
                <div className="flex items-center gap-2">
                  <PhasePicker currentPhase={phase} />
                  <button
                    onClick={() => setProfileOpen(true)}
                    className="flex items-center justify-center w-9 h-9 rounded-full transition-all active:scale-90"
                    style={{ color: "rgba(242,242,242,0.45)" }}
                  >
                    <UserCircle size={22} strokeWidth={1.5} />
                  </button>
                </div>
              </>
            )}
          </div>
        </header>
      )}

      {/* Main */}
      <main className={`flex-1 overflow-x-hidden ${isHome ? "" : "pb-32"}`} style={{ position: "relative", zIndex: 1 }}>
        <div className={`max-w-lg mx-auto px-5 ${isHome ? "" : "pt-8"}`}>
          <AnimatePresence mode="sync" initial={false}>
            <motion.div
              key={pathname}
              initial={{ opacity: 1, y: 16 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.35, ease: [0.16, 1, 0.3, 1] }}
            >
              <Outlet />
            </motion.div>
          </AnimatePresence>
        </div>
      </main>

      {/* Bottom nav — hidden on landing page */}
      {!isHome && <nav className="fixed left-1/2 -translate-x-1/2 z-50 w-[min(440px,calc(100%-32px))]" style={{ bottom: "calc(env(safe-area-inset-bottom, 0px) + 24px)" }}>
        {/* Outer wrapper — tall enough for confess button to poke out */}
        <div className="relative" style={{ height: "64px" }}>

          {/* Nav pill — same height as confess button (64px) */}
          <div
            className="absolute overflow-hidden"
            style={{
              inset: "0",
              background: "rgba(15,18,20,0.85)",
              backdropFilter: "blur(24px)",
              border: "1.5px solid var(--phase-nav-border, rgba(255,255,255,0.12))",
              borderRadius: "9999px",
              boxShadow: `0 24px 48px -12px rgba(0,0,0,0.7), inset 0 1px 0 rgba(255,255,255,0.08)`,
              transition: "border-color 2.5s ease",
            }}
          >
            <LayoutGroup>
              <div className="grid h-full" style={{ gridTemplateColumns: "1fr 1fr 72px 1fr 1fr", padding: "0 6px" }}>

                {/* Home */}
                <ComingSoonTab icon={<BookOpen size={19} strokeWidth={1.6} />} label={t("nav.confessions")} to="/home" />

                {/* My Space */}
                <div className="flex items-center justify-center">
                  <Link
                    to="/track"
                    search={{ t: undefined, recover: undefined }}
                    className="relative w-full h-full flex flex-col items-center justify-center gap-1"
                    style={{ color: pathname === "/track" ? `var(--phase-accent, #04C9F4)` : "rgba(242,242,242,0.28)", transition: "color 2.5s ease" }}
                  >
                    <AnimatePresence>
                      {pathname === "/track" && (
                        <motion.div
                          layoutId="pill-indicator"
                          className="absolute"
                          style={{ inset: "3px 3px", background: "rgba(var(--phase-accent-rgb, 4,201,244), 0.13)", borderRadius: "9999px" }}
                          initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0, y: -48 }}
                          transition={{ duration: 0.4, ease: [0.16, 1, 0.3, 1] }}
                        />
                      )}
                    </AnimatePresence>
                    <div className="relative z-10">
                      <HouseHeart size={19} strokeWidth={pathname === "/track" ? 2.2 : 1.6} />
                      {hasIngesting && pathname !== "/track" && (
                        <div className="absolute -top-1 -right-1 w-2 h-2 rounded-full bg-red-500" />
                      )}
                    </div>
                    <span className="text-[7px] font-bold uppercase tracking-[0.08em] whitespace-nowrap relative z-10">{t("nav.mySpace")}</span>
                  </Link>
                </div>

                {/* Confess spacer */}
                <div />

                {/* Community */}
                <ComingSoonTab icon={<Users size={19} strokeWidth={1.6} />} label={t("nav.community")} to="/events" />

                {/* Reach Out */}
                <div className="flex items-center justify-center">
                  <Link
                    to="/reach"
                    search={{ threadId: undefined, ref: undefined, body: undefined, senderAnonId: undefined, new: undefined, serial: undefined }}
                    className="relative w-full h-full flex flex-col items-center justify-center gap-1"
                    style={{ color: pathname === "/reach" ? `var(--phase-accent, #04C9F4)` : "rgba(242,242,242,0.28)", transition: "color 2.5s ease" }}
                  >
                    <AnimatePresence>
                      {pathname === "/reach" && (
                        <motion.div
                          layoutId="pill-indicator"
                          className="absolute"
                          style={{ inset: "3px 3px", background: "rgba(var(--phase-accent-rgb, 4,201,244), 0.13)", borderRadius: "9999px" }}
                          initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0, y: -48 }}
                          transition={{ duration: 0.4, ease: [0.16, 1, 0.3, 1] }}
                        />
                      )}
                    </AnimatePresence>
                    <div className="relative z-10">
                      <Mail size={19} strokeWidth={pathname === "/reach" ? 2.2 : 1.6} />
                      {reachUnread && pathname !== "/reach" && (
                        <div className="absolute w-2 h-2 rounded-full bg-red-500" style={{ top: -2, right: -3 }} />
                      )}
                    </div>
                    <span className="text-[7px] font-bold uppercase tracking-[0.08em] whitespace-nowrap relative z-10">{t("nav.messages")}</span>
                  </Link>
                </div>

              </div>
            </LayoutGroup>
          </div>

          {/* Confess button — sits on top, unclipped */}
          <div className="absolute left-1/2 -translate-x-1/2 top-0 h-full flex items-center justify-center" style={{ width: "72px", zIndex: 10 }}>
            <Link
              to="/confess-here"
              className="flex items-center justify-center w-[70px] h-[70px] active:scale-95 transition-transform"
              style={{
                background: pathname === "/confess-here"
                  ? `linear-gradient(135deg, var(--phase-accent,#04C9F4) 0%, rgba(var(--phase-accent-rgb,4,201,244),0.75) 100%)`
                  : `rgba(255,255,255,0.06)`,
                borderRadius: "9999px",
                border: pathname === "/confess-here" ? "none" : "1.5px solid rgba(255,255,255,0.25)",
                boxShadow: pathname === "/confess-here"
                  ? `0 6px 20px -4px var(--phase-glow,rgba(4,201,244,0.45))`
                  : "none",
                backdropFilter: pathname !== "/confess-here" ? "blur(20px)" : "none",
                transition: "background 0.4s ease, box-shadow 0.4s ease",
              }}
              aria-label="Confess"
            >
              <TypingBubbleIcon size={26} color={pathname === "/confess-here" ? "#050606" : `rgba(var(--phase-accent-rgb,4,201,244),0.5)`} />
            </Link>
          </div>

        </div>
      </nav>}
    </div>
  );
}
