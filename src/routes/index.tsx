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
      className="flex flex-col"
      style={{ minHeight: "100svh", padding: "0 24px", paddingTop: "env(safe-area-inset-top)" }}
    >
      {/* Brand bar */}
      <div className="flex items-center justify-between pt-6 pb-4">
        <div className="flex items-center gap-3">
          <img src={logoIcon} alt="Cairo Confessions" className="h-10 w-auto opacity-90" />
          <div className="flex flex-col gap-0">
            <span className="font-display text-[1.05rem] uppercase tracking-[0.22em] text-cc-off/85 font-bold leading-tight">
              Cairo
            </span>
            <span className="font-display text-[1.05rem] uppercase tracking-[0.22em] text-cc-off/85 font-bold leading-tight">
              Confessions
            </span>
          </div>
        </div>

        <Link
          to="/track"
          search={{ t: undefined, recover: undefined }}
          className="flex items-center gap-2 px-3.5 py-2 rounded-xl transition-all active:scale-95"
          style={{ background: "rgba(255,255,255,0.05)", border: "1px solid rgba(255,255,255,0.10)" }}
        >
          <HouseHeart size={14} strokeWidth={1.7} style={{ color: "rgba(242,242,242,0.45)" }} />
          <span className="text-[10px] uppercase tracking-[0.18em] text-cc-off/45">My Space</span>
        </Link>
      </div>

      {/* Hero */}
      <section className="flex flex-col gap-5 py-4 flex-1 justify-center" style={{ maxHeight: "42vh" }}>
        <div className="relative">
          <div
            className="absolute -inset-10 rounded-full blur-3xl pointer-events-none"
            style={{ background: "radial-gradient(ellipse, rgba(var(--phase-accent-rgb,4,201,244),0.07) 0%, transparent 70%)", transition: "background 2.5s ease" }}
          />
          <h1 className="relative font-display text-[3rem] leading-[1.0] uppercase tracking-tight text-cc-off">
            What Cairo<br />
            <span style={{ color: "var(--phase-accent, #04C9F4)", transition: "color 2.5s ease" }}>can't say</span><br />
            out loud.
          </h1>
        </div>

        <p className="text-cc-off/35 text-[13px] leading-[1.8] max-w-[270px] font-light">
          Anonymous confessions from across Egypt.
          No name. No judgment. No trace.
        </p>
      </section>

      {/* Primary CTA */}
      <div className="py-4">
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

      {/* App sections grid */}
      <div className="grid grid-cols-3 gap-2.5 py-2">
        <Link
          to="/home"
          className="flex flex-col items-center gap-2 py-4 rounded-xl transition-all active:scale-[0.97]"
          style={{ background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.08)" }}
        >
          <BookOpen size={17} strokeWidth={1.6} style={{ color: "rgba(242,242,242,0.40)" }} />
          <span className="text-[9.5px] uppercase tracking-[0.14em] text-cc-off/35">Confessions</span>
        </Link>

        <Link
          to="/reach"
          search={{ threadId: undefined, ref: undefined, body: undefined, senderAnonId: undefined, new: undefined, serial: undefined }}
          className="flex flex-col items-center gap-2 py-4 rounded-xl transition-all active:scale-[0.97]"
          style={{ background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.08)" }}
        >
          <Mail size={17} strokeWidth={1.6} style={{ color: "rgba(242,242,242,0.40)" }} />
          <span className="text-[9.5px] uppercase tracking-[0.14em] text-cc-off/35">Messages</span>
        </Link>

        <Link
          to="/events"
          className="flex flex-col items-center gap-2 py-4 rounded-xl transition-all active:scale-[0.97]"
          style={{ background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.08)" }}
        >
          <Users size={17} strokeWidth={1.6} style={{ color: "rgba(242,242,242,0.40)" }} />
          <span className="text-[9.5px] uppercase tracking-[0.14em] text-cc-off/35">Community</span>
        </Link>
      </div>

      {/* Footer */}
      <div
        className="flex items-end justify-between py-6"
        style={{ paddingBottom: "calc(env(safe-area-inset-bottom, 0px) + 28px)" }}
      >
        <div className="space-y-0.5">
          <div className="font-arabic text-[1rem] leading-snug" style={{ color: "rgba(242,242,242,0.10)" }}>
            ما تقوله القاهرة
          </div>
          <div className="text-[9.5px] uppercase tracking-[0.26em] text-cc-off/15">Cairo · Since 2013</div>
        </div>
        <div className="text-[9px] uppercase tracking-[0.18em] text-cc-off/12 text-right leading-relaxed">
          Anonymous<br />& free forever
        </div>
      </div>
    </div>
  );
}
