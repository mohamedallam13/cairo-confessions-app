import { createFileRoute, Link } from "@tanstack/react-router";
import { HouseHeart, Mail, Users, BookOpen } from "lucide-react";
import logoIcon from "../assets/logo-icon.png";

function TypingBubbleIcon({ size = 18, color = "currentColor" }: { size?: number; color?: string }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
      <path
        d="M21 15C21 15.5304 20.7893 16.0391 20.4142 16.4142C20.0391 16.7893 19.5304 17 19 17H7L3 21V5C3 4.46957 3.21071 3.96086 3.58579 3.58579C3.96086 3.21071 4.46957 3 5 3H19C19.5304 3 20.0391 3.21071 20.4142 3.58579C20.7893 3.96086 21 4.46957 21 5V15Z"
        stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"
      />
      <circle cx="9" cy="10" r="1" fill={color} />
      <circle cx="12" cy="10" r="1" fill={color} />
      <circle cx="15" cy="10" r="1" fill={color} />
    </svg>
  );
}

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "Cairo Confessions" },
      { name: "description", content: "What Cairo can't say out loud." },
    ],
  }),
  component: Home,
});

function Home() {
  return (
    <div
      className="flex flex-col px-6"
      style={{ minHeight: "100svh", paddingTop: "env(safe-area-inset-top)" }}
    >
      {/* Top spacer — mood picker floats here from Layout */}
      <div className="h-32" />

      {/* Logo + Brand + My Space — centered hero identity */}
      <section className="flex flex-col items-center text-center gap-3 pt-4 pb-6">
        <div className="relative">
          <div
            className="absolute -inset-12 rounded-full blur-3xl pointer-events-none"
            style={{ background: "radial-gradient(ellipse, rgba(var(--phase-accent-rgb,4,201,244),0.08) 0%, transparent 70%)", transition: "background 2.5s ease" }}
          />
          <img src={logoIcon} alt="Cairo Confessions" className="relative h-16 w-auto opacity-90" />
        </div>

        <div className="flex flex-col items-center gap-0.5">
          <span className="font-display text-[1.25rem] uppercase tracking-[0.24em] text-cc-off/90 font-bold leading-tight">
            Cairo Confessions
          </span>
        </div>

        <Link
          to="/track"
          search={{ t: undefined, recover: undefined }}
          className="flex items-center gap-2 px-4 py-2 rounded-xl mt-1 transition-all active:scale-95"
          style={{ background: "rgba(255,255,255,0.07)", border: "1px solid rgba(255,255,255,0.13)" }}
        >
          <HouseHeart size={13} strokeWidth={1.7} style={{ color: "rgba(242,242,242,0.50)" }} />
          <span className="text-[10px] uppercase tracking-[0.18em] text-cc-off/50">My Space</span>
          <span className="text-cc-off/30 text-[12px]">→</span>
        </Link>
      </section>

      {/* Headline + description */}
      <section className="flex flex-col gap-3 mt-6">
        <h1 className="font-display text-[3rem] leading-[1.0] uppercase tracking-tight text-cc-off">
          What Cairo<br />
          <span style={{ color: "var(--phase-accent, #04C9F4)", transition: "color 2.5s ease" }}>can't say</span><br />
          out loud.
        </h1>
        <p className="text-cc-off/45 text-[13px] leading-[1.8] max-w-[270px] font-light">
          Anonymous confessions from across Egypt.
          No name. No judgment. No trace.
        </p>
      </section>

      {/* Primary CTA */}
      <div className="mt-6">
        <Link
          to="/confess-here"
          className="flex items-center justify-center gap-3 w-full py-4 rounded-2xl transition-all active:scale-[0.97]"
          style={{
            background: "linear-gradient(135deg, rgba(var(--phase-accent-rgb,4,201,244),0.22), rgba(var(--phase-accent-rgb,4,201,244),0.10))",
            border: "1px solid rgba(var(--phase-accent-rgb,4,201,244),0.40)",
            boxShadow: "0 0 28px rgba(var(--phase-accent-rgb,4,201,244),0.10)",
            transition: "background 2.5s ease, border-color 2.5s ease, box-shadow 2.5s ease",
          }}
        >
          <TypingBubbleIcon size={17} color="var(--phase-accent, #04C9F4)" />
          <span
            className="font-display text-[1.05rem] uppercase tracking-[0.18em] font-bold"
            style={{ color: "var(--phase-accent, #04C9F4)", transition: "color 2.5s ease" }}
          >
            Say something
          </span>
        </Link>
      </div>

      {/* Section grid */}
      <div className="grid grid-cols-3 gap-2.5 mt-3">
        <Link
          to="/home"
          className="flex flex-col items-center gap-2 py-4 rounded-xl transition-all active:scale-[0.97]"
          style={{ background: "rgba(255,255,255,0.08)", border: "1px solid rgba(255,255,255,0.13)" }}
        >
          <BookOpen size={17} strokeWidth={1.6} style={{ color: "rgba(242,242,242,0.55)" }} />
          <span className="text-[9.5px] uppercase tracking-[0.14em] text-cc-off/50">Confessions</span>
        </Link>

        <Link
          to="/reach"
          search={{ threadId: undefined, ref: undefined, body: undefined, senderAnonId: undefined, new: undefined, serial: undefined }}
          className="flex flex-col items-center gap-2 py-4 rounded-xl transition-all active:scale-[0.97]"
          style={{ background: "rgba(255,255,255,0.08)", border: "1px solid rgba(255,255,255,0.13)" }}
        >
          <Mail size={17} strokeWidth={1.6} style={{ color: "rgba(242,242,242,0.55)" }} />
          <span className="text-[9.5px] uppercase tracking-[0.14em] text-cc-off/50">Messages</span>
        </Link>

        <Link
          to="/events"
          className="flex flex-col items-center gap-2 py-4 rounded-xl transition-all active:scale-[0.97]"
          style={{ background: "rgba(255,255,255,0.08)", border: "1px solid rgba(255,255,255,0.13)" }}
        >
          <Users size={17} strokeWidth={1.6} style={{ color: "rgba(242,242,242,0.55)" }} />
          <span className="text-[9.5px] uppercase tracking-[0.14em] text-cc-off/50">Community</span>
        </Link>
      </div>

      {/* Spacer — pushes footer to bottom */}
      <div className="flex-1" />

      {/* Footer */}
      <div
        className="flex items-end justify-between py-6"
        style={{ paddingBottom: "calc(env(safe-area-inset-bottom, 0px) + 28px)" }}
      >
        <div className="space-y-1">
          <div className="font-arabic text-[1rem] leading-snug" style={{ color: "rgba(242,242,242,0.35)" }}>
            ما تقوله القاهرة
          </div>
          <div className="text-[9.5px] uppercase tracking-[0.26em]" style={{ color: "rgba(242,242,242,0.28)" }}>
            Cairo · Since 2013
          </div>
        </div>
        <div
          className="text-[9px] uppercase tracking-[0.18em] text-right leading-relaxed"
          style={{ color: "rgba(242,242,242,0.22)" }}
        >
          Anonymous<br />& free forever
        </div>
      </div>
    </div>
  );
}
