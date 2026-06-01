import { createFileRoute, Link, useNavigate, useSearch } from "@tanstack/react-router";
import { useState } from "react";
import { ArrowRight, Mail, Check } from "lucide-react";
import { requestMagicLink, verifyMagicLink, useAuth } from "../lib/auth";

type Search = { redirect?: string };

export const Route = createFileRoute("/login")({
  validateSearch: (s: Record<string, unknown>): Search => ({
    redirect: typeof s.redirect === "string" ? s.redirect : undefined,
  }),
  head: () => ({
    meta: [
      { title: "Sign in — Cairo Confessions" },
      { name: "description", content: "Sign in with a magic link. We never ask for a password." },
    ],
  }),
  component: LoginPage,
});

function LoginPage() {
  const { redirect } = useSearch({ from: "/login" });
  const navigate = useNavigate();
  const { user } = useAuth();
  const [email, setEmail] = useState("");
  const [stage, setStage] = useState<"enter" | "sent" | "verifying" | "done">("enter");
  const [token, setToken] = useState("");
  const [err, setErr] = useState("");

  if (user && stage !== "done") {
    return (
      <div className="max-w-md mx-auto mt-10 bg-card border border-cc-line p-8">
        <div className="text-[10px] uppercase tracking-[0.2em] text-cc-mute">Already signed in</div>
        <h1 className="font-display text-3xl mt-2 text-cc-ink">@{user.handle}</h1>
        <p className="text-cc-mute mt-2 text-sm">{user.email}</p>
        <button
          onClick={() => navigate({ to: redirect || "/profile" })}
          className="mt-6 w-full bg-cc-near text-cc-off py-3 font-display uppercase tracking-[0.18em] text-sm"
        >
          Continue →
        </button>
      </div>
    );
  }

  async function send() {
    setErr("");
    if (!/.+@.+\..+/.test(email)) { setErr("That doesn't look like an email."); return; }
    const t = await requestMagicLink(email);
    setToken(t);
    setStage("sent");
  }

  async function verify() {
    setStage("verifying");
    try {
      await verifyMagicLink(token);
      setStage("done");
      setTimeout(() => navigate({ to: redirect || "/profile" }), 600);
    } catch (e) {
      setErr((e as Error).message);
      setStage("sent");
    }
  }

  return (
    <div className="max-w-md mx-auto mt-6">
      <div className="text-[10px] uppercase tracking-[0.22em] text-cc-mute">— Sign in</div>
      <h1 className="font-display text-4xl sm:text-5xl mt-2 text-cc-ink leading-[0.95] uppercase">
        Some things <br />you sign with a name.
      </h1>
      <p className="mt-4 text-cc-mute leading-relaxed">
        Confessions stay anonymous. But to attend events, save listeners, or pick up
        where you left off — we need to know it's you. No password. Just a link.
      </p>

      <div className="mt-8 bg-card border border-cc-line p-6 sm:p-7">
        {stage === "enter" && (
          <>
            <label className="text-[10px] font-semibold uppercase tracking-[0.2em] text-cc-mute">Email</label>
            <div className="mt-2 flex gap-2">
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && send()}
                placeholder="you@somewhere.eg"
                className="flex-1 px-4 py-3 bg-cc-off border border-cc-line focus:border-cc-cyan outline-none text-base"
              />
              <button onClick={send} className="bg-cc-near text-cc-off px-5 font-display uppercase tracking-[0.18em] text-sm hover:bg-cc-cyan hover:text-cc-near transition">
                Send link
              </button>
            </div>
            {err && <div className="mt-3 text-sm text-destructive">{err}</div>}
            <p className="mt-5 text-xs text-cc-mute leading-relaxed">
              We'll never post under your name. Your email stays inside CC.
            </p>
          </>
        )}

        {(stage === "sent" || stage === "verifying") && (
          <>
            <div className="grid place-items-center w-12 h-12 bg-cc-light-sage text-cc-green rounded-full">
              <Mail size={20} />
            </div>
            <h2 className="font-display text-2xl mt-4 text-cc-ink">Check {email}</h2>
            <p className="mt-2 text-sm text-cc-mute">A magic link was just sent. Click it and you're in.</p>

            {/* Simulation: surface the link inline */}
            <div className="mt-5 border border-dashed border-cc-line p-4 bg-cc-paper">
              <div className="text-[10px] uppercase tracking-[0.2em] text-cc-mute">Demo · simulated inbox</div>
              <button
                onClick={verify}
                disabled={stage === "verifying"}
                className="mt-2 w-full text-left text-cc-slate font-semibold underline underline-offset-4 break-all hover:text-cc-cyan transition"
              >
                {stage === "verifying" ? "Opening link…" : `https://cairoconfessions.eg/m/${token.slice(0, 24)}…`}
              </button>
            </div>

            {err && <div className="mt-3 text-sm text-destructive">{err}</div>}
            <button onClick={() => setStage("enter")} className="mt-4 text-xs text-cc-mute underline">
              Use a different email
            </button>
          </>
        )}

        {stage === "done" && (
          <div className="text-center py-4">
            <div className="grid place-items-center w-14 h-14 mx-auto bg-cc-green text-cc-off rounded-full">
              <Check size={28} strokeWidth={3} />
            </div>
            <h2 className="font-display text-2xl mt-4 text-cc-ink">You're in.</h2>
            <p className="text-cc-mute text-sm mt-1">Taking you to your profile…</p>
          </div>
        )}
      </div>

      <Link to="/" className="mt-6 inline-flex items-center gap-2 text-xs uppercase tracking-[0.2em] text-cc-mute hover:text-cc-ink">
        ← Back to explore
      </Link>
    </div>
  );
}
