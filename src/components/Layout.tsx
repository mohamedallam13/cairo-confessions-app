import { useEffect, useState, useRef } from "react";
import { Link, Outlet, useLocation, useRouter } from "@tanstack/react-router";
import { Library, Mail, ChevronLeft } from "lucide-react";
import { getIngestingRefs, getOrCreateAnonId, isNewIdentity, detectBrowser, getMyRefs, adoptSession } from "../lib/anonIdentity";
import { redeemRecoveryToken } from "../lib/recoveryToken";
import { PHASES, type Phase, getPhaseOverride, setPhaseOverride } from "../hooks/useTimePhase";

// ─── Identity reveal modal ───────────────────────────────────────────────────

function IdentityRevealModal({ anonId, onDone }: { anonId: string; onDone: () => void }) {
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
          <p className="text-[10px] uppercase tracking-[0.28em] text-cc-off/30">You are now</p>
          <p
            className="font-display text-[1.4rem] uppercase tracking-[0.12em]"
            style={{ color: "var(--phase-accent,#04C9F4)" }}
          >
            {anonId}
          </p>
        </div>

        <p className="text-cc-off/45 text-[13px] leading-[1.8]">
          Anonymous. Safe. Yours.<br />
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
          That's me
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

function extractToken(input: string): string | null {
  const trimmed = input.trim();
  try {
    const url = new URL(trimmed.includes("://") ? trimmed : `https://x.cc/${trimmed}`);
    const t = url.searchParams.get("t");
    if (t) return t;
  } catch { /* not a URL */ }
  if (/^[A-Za-z0-9_-]{8,}$/.test(trimmed)) return trimmed;
  return null;
}

// ─── Session conflict modal ───────────────────────────────────────────────────

function SessionConflictModal({
  caseType,
  incomingAnonId,
  incomingBrowser,
  localAnonId,
  onDismiss,
  onImported,
}: {
  caseType: "case1" | "case3";
  incomingAnonId: string;
  incomingBrowser: string | null;
  localAnonId: string;
  onDismiss: () => void;
  onImported: () => void;
}) {
  const [step, setStep]       = useState<"prompt" | "instructions" | "import">("prompt");
  const [linkInput, setLink]  = useState("");
  const [refInput, setRef]    = useState("");
  const [loading, setLoading] = useState(false);
  const [err, setErr]         = useState("");

  async function doImport() {
    setErr("");
    const token = extractToken(linkInput);
    const ref   = refInput.trim().toUpperCase();
    if (!token) { setErr("Paste a valid transfer link."); return; }
    if (!/^[A-Z0-9]{8}$/.test(ref)) { setErr("Reference number must be 8 characters."); return; }

    setLoading(true);
    let res: { ok: boolean; anonId?: string; refNums?: unknown[]; error?: string };
    try {
      const timeout = new Promise<never>((_, reject) =>
        setTimeout(() => reject(new Error("timeout")), 35000)
      );
      res = await Promise.race([
        (redeemRecoveryToken as unknown as (opts: { data: { recoveryToken: string; refNum: string } }) => Promise<typeof res>)({ data: { recoveryToken: token, refNum: ref } } as never),
        timeout,
      ]);
    } catch {
      setLoading(false);
      setErr("Something went wrong. Try again.");
      return;
    }
    setLoading(false);

    if (!res.ok) {
      const msg = res.error === "expired"       ? "This link has expired. Ask for a new one."
                : res.error === "wrong_ref"     ? "That reference number doesn't match this session."
                : res.error === "invalid_token" ? "This link is invalid or has already been used."
                : "Something went wrong. Try again.";
      setErr(msg);
      return;
    }

    const refNums = (res.refNums ?? []).map((r: unknown) =>
      typeof r === "string" ? r : (r as { refNum: string }).refNum
    );
    adoptSession(res.anonId!, refNums);
    onImported();
  }

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
        {step === "prompt" && (
          <>
            <div className="space-y-2">
              <p className="font-display text-[1rem] uppercase tracking-[0.14em]" style={{ color: "var(--phase-accent,#04C9F4)" }}>
                {incomingAnonId}
              </p>
              <p className="text-cc-off/70 text-[14px] leading-[1.7]">
                was here{fromLabel}.
              </p>
              <p className="text-cc-off text-[16px] font-semibold">Is that you?</p>
              {caseType === "case3" && (
                <p className="text-cc-off/35 text-[12px]">You're currently <span className="font-display" style={{ color: "rgba(var(--phase-accent-rgb,4,201,244),0.6)" }}>{localAnonId}</span>.</p>
              )}
            </div>
            <div className="flex flex-col gap-2">
              <button
                onClick={() => setStep("import")}
                className="w-full py-3 font-display text-[11px] uppercase tracking-[0.18em] rounded-xl transition-all active:scale-95"
                style={{ background: "linear-gradient(135deg, var(--phase-accent,#04C9F4), rgba(var(--phase-accent-rgb,4,201,244),0.75))", color: "#050606" }}
              >
                Yes — I have a transfer link
              </button>
              <button
                onClick={() => setStep("instructions")}
                className="w-full py-3 text-[11px] uppercase tracking-[0.14em] rounded-xl text-cc-off/60 hover:text-cc-off/80 transition-colors"
                style={{ border: "1px solid rgba(255,255,255,0.08)" }}
              >
                Yes — I need to get one
              </button>
              <button
                onClick={onDismiss}
                className="w-full py-2 text-[10px] uppercase tracking-[0.14em] text-cc-off/25 hover:text-cc-off/50 transition-colors"
              >
                {caseType === "case1" ? "Start fresh" : "Keep mine"}
              </button>
            </div>
          </>
        )}

        {step === "instructions" && (
          <>
            <div className="space-y-2">
              <p className="font-display text-[1rem] uppercase tracking-[0.14em]" style={{ color: "var(--phase-accent,#04C9F4)" }}>
                Get your transfer link
              </p>
              <p className="text-cc-off/60 text-[13px] leading-[1.8]">
                On the original browser{incomingBrowser ? ` (${incomingBrowser})` : ""}, open your Mine tab and tap <span className="text-cc-off font-semibold">Get transfer link</span>. Copy the link it gives you, then come back here.
              </p>
              <p className="text-cc-off/30 text-[11px] leading-[1.6]">
                The link expires in 15 minutes.
              </p>
            </div>
            <div className="flex flex-col gap-2">
              <button
                onClick={() => setStep("import")}
                className="w-full py-3 font-display text-[11px] uppercase tracking-[0.18em] rounded-xl transition-all active:scale-95"
                style={{ background: "linear-gradient(135deg, var(--phase-accent,#04C9F4), rgba(var(--phase-accent-rgb,4,201,244),0.75))", color: "#050606" }}
              >
                I have the link →
              </button>
              <button
                onClick={() => setStep("prompt")}
                className="w-full py-2 text-[10px] uppercase tracking-[0.14em] text-cc-off/25 hover:text-cc-off/50 transition-colors"
              >
                ← Back
              </button>
            </div>
          </>
        )}

        {step === "import" && (
          <>
            <div className="space-y-1.5">
              <h2 className="font-display text-[1rem] uppercase tracking-[0.16em] text-cc-off">Transfer your session</h2>
              <p className="text-cc-off/40 text-[12px] leading-[1.7]">
                Go to your original browser, tap "Get transfer link", and paste it below. Then enter one of your reference numbers.
              </p>
            </div>
            <div className="space-y-3">
              <div className="space-y-1.5">
                <label className="text-[10px] uppercase tracking-[0.18em] text-cc-off/30">Transfer link</label>
                <input
                  value={linkInput}
                  onChange={(e) => { setLink(e.target.value); setErr(""); }}
                  placeholder="Paste your transfer link here"
                  className="w-full bg-transparent px-4 py-3 rounded-xl text-cc-off/80 placeholder:text-cc-off/20 text-[13px] focus:outline-none"
                  style={{ border: "1px solid rgba(255,255,255,0.12)", background: "rgba(255,255,255,0.04)" }}
                />
              </div>
              <div className="space-y-1.5">
                <label className="text-[10px] uppercase tracking-[0.18em] text-cc-off/30">Reference number</label>
                <input
                  value={refInput}
                  onChange={(e) => { setRef(e.target.value.toUpperCase()); setErr(""); }}
                  onKeyDown={(e) => e.key === "Enter" && doImport()}
                  placeholder="e.g. AB12CD34"
                  maxLength={8}
                  className="w-full bg-transparent px-4 py-3 rounded-xl text-cc-off font-display uppercase tracking-widest placeholder:text-cc-off/20 text-[14px] focus:outline-none"
                  style={{ border: "1px solid rgba(255,255,255,0.12)", background: "rgba(255,255,255,0.04)" }}
                />
              </div>
            </div>
            {err && <p className="text-[11px]" style={{ color: "rgba(220,80,80,0.8)" }}>{err}</p>}
            <div className="flex gap-3">
              <button
                onClick={doImport}
                disabled={loading}
                className="flex-1 py-3 font-display text-[11px] uppercase tracking-[0.18em] rounded-xl transition-all active:scale-95 disabled:opacity-40"
                style={{ background: "linear-gradient(135deg, var(--phase-accent,#04C9F4), rgba(var(--phase-accent-rgb,4,201,244),0.75))", color: "#050606" }}
              >
                {loading ? "Verifying…" : "Import session"}
              </button>
              <button
                onClick={() => setStep("prompt")}
                disabled={loading}
                className="px-5 py-3 text-[11px] uppercase tracking-[0.14em] rounded-xl text-cc-off/40 hover:text-cc-off/70 transition-colors disabled:opacity-30"
                style={{ border: "1px solid rgba(255,255,255,0.08)" }}
              >
                Back
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}

const PHASE_ORDER: Phase[] = ["dawn", "morning", "midday", "sunset", "dusk", "night"];

function PhasePicker({ currentPhase }: { currentPhase: Phase }) {
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
        <span className="text-[8px] uppercase tracking-[0.2em] text-cc-off/25">Mood</span>
      <button
        onClick={() => setOpen((o) => !o)}
        className="flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[9.5px] uppercase tracking-[0.16em] transition-all active:scale-95"
        style={{
          background: `rgba(${accent}, 0.12)`,
          border: `1px solid rgba(${accent}, 0.25)`,
          color: `rgba(${accent}, 0.85)`,
        }}
      >
        <span
          className="w-1.5 h-1.5 rounded-full"
          style={{ background: `rgba(${accent}, 0.9)` }}
        />
        {override ? PHASES[override].label : `Auto · ${PHASES[currentPhase].label}`}
      </button>
      </div>

      {open && (
        <>
          <div className="fixed inset-0 z-40" onClick={() => setOpen(false)} />
          <div
            className="absolute right-0 top-full mt-2 z-50 rounded-xl overflow-hidden py-1 min-w-[120px]"
            style={{ background: "rgba(10,12,15,0.96)", border: "1px solid rgba(255,255,255,0.12)", backdropFilter: "blur(16px)" }}
          >
            <button
              onClick={() => select(null)}
              className="w-full flex items-center gap-2.5 px-3.5 py-2.5 text-[11px] uppercase tracking-[0.14em] transition-colors hover:bg-white/5 text-left"
              style={{ color: !override ? "rgba(242,242,242,0.85)" : "rgba(242,242,242,0.35)" }}
            >
              <span className="w-2 h-2 rounded-full" style={{ background: "rgba(255,255,255,0.25)" }} />
              Auto · {PHASES[currentPhase].label}
              {!override && <span className="ml-auto text-[8px] opacity-50">✓</span>}
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
                {override === p && <span className="ml-auto text-[8px] opacity-60">✓</span>}
              </button>
            ))}
          </div>
        </>
      )}
    </div>
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

const TOP_LEVEL = new Set(["/", "/track", "/confess-here", "/reach", "/login"]);

function pageTitle(pathname: string): string {
  if (pathname === "/track") return "My Confessions";
  if (pathname === "/confess-here") return "Say something";
  if (pathname === "/reach") return "Reach a confessor";
  if (pathname === "/login") return "Sign in";
  return "";
}

export default function Layout() {
  const { pathname, searchStr } = useLocation();
  const router = useRouter();
  const isTopLevel = TOP_LEVEL.has(pathname);
  const { phase, tokens } = useTimePhase(searchStr);
  const [hasIngesting, setHasIngesting] = useState(false);

  // ── Identity reveal — only on /track, only when a new ID was just created ──
  const [showIdentityReveal, setShowIdentityReveal] = useState(false);
  useEffect(() => {
    if (pathname !== "/track") return;
    if (isNewIdentity()) {
      // ID doesn't exist yet — it'll be created when we call getOrCreateAnonId below
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

  function handleConflictImported() {
    setSessionConflict(null);
    stripSessionParams();
    // Navigate to track to show imported session
    router.navigate({ to: "/track", search: { t: undefined } });
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

      {showIdentityReveal && !sessionConflict && (
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
          onImported={handleConflictImported}
        />
      )}

      <CairoBackground phase={phase} />

      {/* Header — hidden on landing page */}
      {!isHome && (
        <header
          className="sticky top-0 z-40"
          style={{
            background: "rgba(6,8,9,0.60)",
            backdropFilter: "blur(20px)",
            borderBottom: "1px solid rgba(255,255,255,0.08)",
          }}
        >
          <div className="max-w-lg mx-auto px-5 h-16 flex items-center justify-between">
            {isTopLevel && pathname !== "/" ? (
              <>
                <Link to="/" className="flex items-center">
                  <img src={logoIcon} alt="Cairo Confessions" className="h-10 w-auto opacity-90 hover:opacity-100 transition-opacity" />
                </Link>
                <PhasePicker currentPhase={phase} />
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
                  {pageTitle(pathname)}
                </motion.div>
                <PhasePicker currentPhase={phase} />
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
      {!isHome && <nav className="fixed bottom-6 left-1/2 -translate-x-1/2 z-50 w-[min(440px,calc(100%-32px))]">

        <div
          className="relative grid py-2"
          style={{
            gridTemplateColumns: "1fr 72px 1fr",
            background: "rgba(15,18,20,0.85)",
            backdropFilter: "blur(24px)",
            border: "1.5px solid var(--phase-nav-border, rgba(255,255,255,0.12))",
            borderRadius: "9999px",
            boxShadow: `0 24px 48px -12px rgba(0,0,0,0.7), inset 0 1px 0 rgba(255,255,255,0.08)`,
            transition: "border-color 2.5s ease",
          }}
        >
          <LayoutGroup>
            {/* Mine */}
            <div className="flex items-center justify-center">
              <Link
                to="/track"
                search={{ t: undefined }}
                className="relative flex flex-col items-center justify-center gap-1.5 px-5 py-1.5 rounded-full"
                style={{
                  color: pathname === "/track" ? `var(--phase-accent, #04C9F4)` : "rgba(242,242,242,0.28)",
                  transition: "color 2.5s ease",
                }}
              >
                <AnimatePresence>
                  {pathname === "/track" && (
                    <motion.div
                      layoutId="pill-indicator"
                      className="absolute inset-0 rounded-full"
                      style={{ background: "rgba(var(--phase-accent-rgb, 4,201,244), 0.13)" }}
                      initial={{ opacity: 0, y: 0 }}
                      animate={{ opacity: 1, y: 0 }}
                      exit={{ opacity: 0, y: -48 }}
                      transition={{ duration: 0.4, ease: [0.16, 1, 0.3, 1] }}
                    />
                  )}
                </AnimatePresence>
                <div className="relative z-10">
                  <Library size={19} strokeWidth={pathname === "/track" ? 2.2 : 1.6} />
                  {hasIngesting && pathname !== "/track" && (
                    <div className="absolute -top-1 -right-1 w-2 h-2 rounded-full bg-red-500" />
                  )}
                </div>
                <span className="text-[8.5px] font-bold uppercase tracking-[0.18em] relative z-10">Mine</span>
              </Link>
            </div>

            {/* Confess — center, inside the pill */}
            <div className="relative flex items-center justify-center">
              <AnimatePresence>
                {pathname === "/confess-here" && (
                  <motion.div
                    layoutId="pill-indicator"
                    className="absolute inset-0 rounded-full"
                    style={{ background: "rgba(var(--phase-accent-rgb,4,201,244),0.13)" }}
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    exit={{ opacity: 0, y: -48 }}
                    transition={{ duration: 0.4, ease: [0.16, 1, 0.3, 1] }}
                  />
                )}
              </AnimatePresence>
              <Link
                to="/confess-here"
                className="relative z-10 flex items-center justify-center w-[64px] h-[64px] active:scale-95 transition-transform"
                style={{
                  background: pathname === "/confess-here"
                    ? `linear-gradient(135deg, var(--phase-accent,#04C9F4) 0%, rgba(var(--phase-accent-rgb,4,201,244),0.75) 100%)`
                    : `rgba(255,255,255,0.06)`,
                  borderRadius: "9999px",
                  border: pathname === "/confess-here" ? "none" : "1px solid rgba(255,255,255,0.10)",
                  boxShadow: pathname === "/confess-here"
                    ? `0 6px 20px -4px var(--phase-glow,rgba(4,201,244,0.45))`
                    : "none",
                  transition: "background 0.4s ease, box-shadow 0.4s ease",
                }}
                aria-label="Confess"
              >
                <TypingBubbleIcon size={26} color={pathname === "/confess-here" ? "#050606" : `rgba(var(--phase-accent-rgb,4,201,244),0.5)`} />
              </Link>
            </div>

            {/* Reach Out */}
            <div className="flex items-center justify-center">
              <Link
                to="/reach"
                search={{ threadId: undefined, ref: undefined, body: undefined }}
                className="relative flex flex-col items-center justify-center gap-1.5 px-5 py-1.5 rounded-full"
                style={{
                  color: pathname === "/reach" ? `var(--phase-accent, #04C9F4)` : "rgba(242,242,242,0.28)",
                  transition: "color 2.5s ease",
                }}
              >
                <AnimatePresence>
                  {pathname === "/reach" && (
                    <motion.div
                      layoutId="pill-indicator"
                      className="absolute inset-0 rounded-full"
                      style={{ background: "rgba(var(--phase-accent-rgb, 4,201,244), 0.13)" }}
                      initial={{ opacity: 0, y: 0 }}
                      animate={{ opacity: 1, y: 0 }}
                      exit={{ opacity: 0, y: -48 }}
                      transition={{ duration: 0.4, ease: [0.16, 1, 0.3, 1] }}
                    />
                  )}
                </AnimatePresence>
                <Mail size={19} strokeWidth={pathname === "/reach" ? 2.2 : 1.6} className="relative z-10" />
                <span className="text-[8.5px] font-bold uppercase tracking-[0.18em] relative z-10">Reach Out</span>
              </Link>
            </div>
          </LayoutGroup>
        </div>
      </nav>}
    </div>
  );
}
