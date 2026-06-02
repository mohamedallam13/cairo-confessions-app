import { createFileRoute, Link } from "@tanstack/react-router";
import { Library, Mail } from "lucide-react";

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

import logoIcon from "../assets/logo-icon.png";

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
      className="flex flex-col items-center justify-between"
      style={{ minHeight: "100svh", padding: "0 20px" }}
    >
      {/* Top spacer */}
      <div />

      {/* Hero — logo + brand name + tagline */}
      <section className="flex flex-col items-center text-center gap-5">
        <div className="flex flex-col items-center gap-3">
          <img src={logoIcon} alt="Cairo Confessions" className="h-20 w-auto opacity-90" />
          <div className="flex flex-col items-center gap-0.5">
            <span
              className="font-display text-[1.1rem] uppercase tracking-[0.3em] text-cc-off/80 font-semibold"
            >
              Cairo Confessions
            </span>
          </div>
        </div>

        <h1 className="font-display text-[2.6rem] leading-[1.05] uppercase tracking-tight text-cc-off mt-2">
          What Cairo<br />
          <span style={{ color: "var(--phase-accent, #04C9F4)", transition: "color 2.5s ease" }}>can't say</span><br />
          out loud.
        </h1>

        <p className="text-cc-off/40 text-[13.5px] leading-[1.75] max-w-[260px] font-light">
          A safe, anonymous space for confessions from across Egypt. No name. No judgment.
        </p>
      </section>

      {/* Actions */}
      <section className="w-full max-w-lg space-y-3 pb-10">
        <Link
          to="/confess-here"
          className="group flex items-center gap-4 w-full px-6 py-5 transition-all active:scale-[0.98]"
          style={{
            background: `linear-gradient(135deg, var(--phase-card-tint, rgba(4,201,244,0.10)), rgba(15,18,20,0.70))`,
            border: "1px solid var(--phase-card-border, rgba(4,201,244,0.35))",
            backdropFilter: "blur(12px)",
            borderRadius: "16px",
            transition: "background 2.5s ease, border-color 2.5s ease",
          }}
        >
          <div
            className="grid place-items-center w-10 h-10 rounded-full shrink-0"
            style={{
              background: "rgba(var(--phase-accent-rgb, 4,201,244), 0.15)",
              transition: "background 2.5s ease",
            }}
          >
            <TypingBubbleIcon size={18} color="var(--phase-accent, #04C9F4)" />
          </div>
          <div className="flex-1 text-left">
            <div className="text-cc-off text-[15px] font-semibold leading-tight">Submit a confession</div>
            <div className="text-cc-off/35 text-[12px] mt-0.5">Anonymous · Takes 2 minutes</div>
          </div>
          <div className="text-cc-off/20 group-hover:text-cc-off/50 transition-colors text-lg">›</div>
        </Link>

        <Link
          to="/track"
          search={{ t: undefined, recover: undefined }}
          className="group flex items-center gap-4 w-full px-6 py-5 transition-all active:scale-[0.98]"
          style={{
            background: `linear-gradient(135deg, var(--phase-card-tint, rgba(4,201,244,0.10)), rgba(15,18,20,0.70))`,
            border: "1px solid rgba(255,255,255,0.12)",
            borderRadius: "16px",
            backdropFilter: "blur(12px)",
            transition: "background 2.5s ease, border-color 2.5s ease",
          }}
        >
          <div className="grid place-items-center w-10 h-10 rounded-full shrink-0" style={{ background: "rgba(255,255,255,0.08)" }}>
            <Library size={17} strokeWidth={1.8} className="text-cc-off/50" />
          </div>
          <div className="flex-1 text-left">
            <div className="text-cc-off/80 text-[15px] font-semibold leading-tight">My Space</div>
            <div className="text-cc-off/30 text-[12px] mt-0.5">See your confession status and messages</div>
          </div>
          <div className="text-cc-off/15 group-hover:text-cc-off/40 transition-colors text-lg">›</div>
        </Link>

        <Link
          to="/reach"
          search={{ threadId: undefined, ref: undefined, body: undefined }}
          className="group flex items-center gap-4 w-full px-6 py-5 transition-all active:scale-[0.98]"
          style={{
            background: `linear-gradient(135deg, var(--phase-card-tint, rgba(4,201,244,0.10)), rgba(15,18,20,0.70))`,
            border: "1px solid rgba(255,255,255,0.12)",
            borderRadius: "16px",
            backdropFilter: "blur(12px)",
            transition: "background 2.5s ease, border-color 2.5s ease",
          }}
        >
          <div className="grid place-items-center w-10 h-10 rounded-full shrink-0" style={{ background: "rgba(255,255,255,0.08)" }}>
            <Mail size={16} strokeWidth={1.8} className="text-cc-off/50" />
          </div>
          <div className="flex-1 text-left">
            <div className="text-cc-off/80 text-[15px] font-semibold leading-tight">Reach Out</div>
            <div className="text-cc-off/30 text-[12px] mt-0.5">Send a kind, anonymous message</div>
          </div>
          <div className="text-cc-off/15 group-hover:text-cc-off/40 transition-colors text-lg">›</div>
        </Link>

        <div className="text-center pt-2">
          <div className="text-cc-off/15 text-[10px] uppercase tracking-[0.28em]">Cairo · Since 2013</div>
        </div>
      </section>
    </div>
  );
}
