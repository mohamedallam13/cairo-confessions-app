import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useRef, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { ArrowRight, ArrowLeft, Lock, Check, Copy, User, MessageSquare } from "lucide-react";
import freyal from "../assets/characters/freyal.png";
import { getOrCreateAnonId, saveRefToProfile, markIngesting, clearIngesting, markIngestionFailed, removeRefFromProfile, saveSnippet, saveOriginBrowser, detectBrowser, getBrowserDetails } from "../lib/anonIdentity";
import { submitConfession, type SubmitPayload } from "../lib/confessSubmit";
import { useTranslation } from "../lib/i18n";

export const Route = createFileRoute("/confess-here")({
  head: () => ({
    meta: [
      { title: "Confess — Cairo Confessions" },
      { name: "description", content: "Say what you carry. No name. No judgment." },
    ],
  }),
  component: ConfessPage,
});

// ─── Flow config ───────────────────────────────────────────────────────────────

type InputType = "chips" | "multichips" | "text" | "age" | "info" | "refreveal" | "submit";

interface FlowStep {
  id: string;
  message: string;
  type: InputType;
  options?: string[];
  displayOptions?: string[]; // translated labels — submission always uses options[]
  skip?: boolean;
  skipLabel?: string;
  description?: string;
}

function getDisplayFlow(t: (k: string) => string, ta: (k: string) => string[]): FlowStep[] {
  return FLOW.map((step) => {
    const base: FlowStep = {
      ...step,
      message: t(`confess.q_${step.id}`),
    };
    if (step.description) base.description = t(`confess.q_${step.id}_desc`);
    if (step.options) base.displayOptions = ta(`confess.opt_${step.id}`);
    if (step.skipLabel) base.skipLabel = t("confess.noThanks");
    return base;
  });
}

const FLOW: FlowStep[] = [
  {
    id: "mood",
    message: "How are you feeling?",
    type: "chips",
    options: ["Happy", "Sad", "Meh"],
  },
  {
    id: "gender",
    message: "Are you male or female?",
    type: "chips",
    options: ["Male", "Female"],
    description: "Let's start with the basics.",
  },
  {
    id: "age",
    message: "How old are you?",
    type: "age",
  },
  {
    id: "location",
    message: "Where are you located?",
    type: "chips",
    options: [
      "Greater Cairo",
      "Alexandria",
      "Delta Region",
      "Suez Canal & Sinai",
      "Northern Upper Egypt",
      "Asyut Region",
      "South Upper Egypt",
      "Outside Egypt",
    ],
    description: "This helps us connect you down the road with people near you who might be sharing the same circumstance.",
  },
  {
    id: "facebook_notice",
    message: "Please be aware that your confession will be posted on CC's Facebook and Instagram. We cannot take down confessions once submitted. If you do not want to proceed, you can close the window now to abort.",
    type: "info",
  },
  {
    id: "email",
    message: "If you'd like to be notified when your confession goes live, leave an email. It's optional and your identity stays 100% anonymous.",
    type: "text",
    skip: true,
    skipLabel: "No thanks",
  },
  {
    id: "category",
    message: "Your confession mainly revolves around a/an ________.",
    type: "chips",
    options: [
      "Relationship issue",
      "Loneliness issue",
      "Family issue",
      "Marriage issue",
      "Homosexuality issue",
      "Sexuality issue",
      "Situation / Incident",
      "Self Harm",
      "Drugs",
      "Religious issue",
      "Society issue",
      "Academic Advice",
      "Confusion / Feeling lost",
      "Self Esteem",
      "Psychological issue",
      "Inspirational story",
    ],
  },
  {
    id: "tags",
    message: "Tag your confession — pick all that apply.",
    type: "multichips",
    options: ["Dream", "Pain", "Lie", "Guilt", "Fantasy", "Random Feeling", "Truth", "Wild Incident", "First Experience", "Rant", "Opinion"],
  },
  {
    id: "contactable",
    message: "Would you like readers to be able to send you a support message about this confession?",
    type: "chips",
    options: ["Yes, reach out to me", "No thanks"],
  },
  {
    id: "refreveal",
    message: "One last thing before you submit — this is your reference number. It's the only link between you and your confession. Save it somewhere safe. Do NOT share it with anyone.",
    type: "refreveal",
  },
  {
    id: "submit",
    message: "Ready? Your confession hasn't been sent yet. Hit the button below to submit it now.",
    type: "submit",
  },
];

// ─── Avatars ───────────────────────────────────────────────────────────────────

function FreyalAvatar() {
  return (
    <img
      src={freyal}
      alt="Freyal"
      className="shrink-0 w-7 h-7 rounded-full object-cover"
      style={{ border: "1px solid rgba(var(--phase-accent-rgb,4,201,244),0.25)" }}
    />
  );
}

function AnonAvatar() {
  return (
    <div
      className="shrink-0 w-7 h-7 rounded-full grid place-items-center"
      style={{
        background: "rgba(255,255,255,0.08)",
        border: "1px solid rgba(255,255,255,0.12)",
      }}
    >
      <User size={13} strokeWidth={1.8} className="text-cc-off/40" />
    </div>
  );
}

// ─── Chat bubbles ──────────────────────────────────────────────────────────────

function BotBubble({ content }: { content: string }) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 6 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.25, ease: [0.16, 1, 0.3, 1] }}
      className="flex items-end gap-2"
    >
      <FreyalAvatar />
      <div
        className="px-4 py-3 text-[13px] leading-[1.65] text-cc-off/80 font-light max-w-[80%]"
        style={{
          background: "rgba(255,255,255,0.08)",
          border: "1px solid rgba(255,255,255,0.10)",
          borderRadius: "18px 18px 18px 4px",
          backdropFilter: "blur(12px)",
        }}
      >
        {content}
      </div>
    </motion.div>
  );
}

function UserBubble({ content }: { content: string }) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 6 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.25, ease: [0.16, 1, 0.3, 1] }}
      className="flex items-end justify-end gap-2"
    >
      <div
        className="px-4 py-3 text-[13px] leading-[1.65] font-light max-w-[80%]"
        style={{
          background: "rgba(var(--phase-accent-rgb,4,201,244),0.13)",
          border: "1px solid rgba(var(--phase-accent-rgb,4,201,244),0.22)",
          borderRadius: "18px 18px 4px 18px",
          color: "rgba(242,242,242,0.85)",
        }}
      >
        {content}
      </div>
      <AnonAvatar />
    </motion.div>
  );
}

function TypingIndicator() {
  return (
    <motion.div
      initial={{ opacity: 0, y: 6 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0 }}
      className="flex items-end gap-2"
    >
      <FreyalAvatar />
      <div
        className="flex items-center gap-1.5 px-4 py-3"
        style={{
          background: "rgba(255,255,255,0.07)",
          border: "1px solid rgba(255,255,255,0.09)",
          borderRadius: "18px 18px 18px 4px",
        }}
      >
        {[0, 1, 2].map((i) => (
          <motion.div
            key={i}
            className="w-1.5 h-1.5 rounded-full"
            style={{ background: "rgba(242,242,242,0.4)" }}
            animate={{ opacity: [0.3, 1, 0.3] }}
            transition={{ duration: 1.1, repeat: Infinity, delay: i * 0.18 }}
          />
        ))}
      </div>
    </motion.div>
  );
}

// ─── Input components ──────────────────────────────────────────────────────────

function ChipInput({ options, displayOptions, multi, onAnswer, onSkip, skipLabel }: {
  options: string[]; displayOptions?: string[]; multi?: boolean;
  onAnswer: (v: string) => void; onSkip?: () => void; skipLabel?: string;
}) {
  const { t } = useTranslation();
  const labels = displayOptions ?? options;
  const [selectedIdx, setSelectedIdx] = useState<number[]>([]);

  function toggle(i: number) {
    if (multi) {
      setSelectedIdx((s) => s.includes(i) ? s.filter((x) => x !== i) : [...s, i]);
    } else {
      onAnswer(options[i]); // always submit English value
    }
  }

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap gap-2 overflow-y-auto max-h-[220px]" style={{ scrollbarWidth: "none" }}>
        {labels.map((label, i) => {
          const active = selectedIdx.includes(i);
          return (
            <button
              key={options[i]}
              onClick={() => toggle(i)}
              className="px-3.5 py-2.5 text-[11px] font-medium uppercase tracking-[0.12em] transition-all active:scale-95"
              style={{
                borderRadius: "9999px",
                border: active ? "1px solid rgba(var(--phase-accent-rgb,4,201,244),0.55)" : "1px solid rgba(255,255,255,0.14)",
                background: active ? "rgba(var(--phase-accent-rgb,4,201,244),0.12)" : "rgba(255,255,255,0.05)",
                color: active ? "var(--phase-accent,#04C9F4)" : "rgba(242,242,242,0.5)",
              }}
            >
              {label}
            </button>
          );
        })}
      </div>
      <div className="flex items-center justify-between">
        {multi && selectedIdx.length > 0 ? (
          <button
            onClick={() => onAnswer(selectedIdx.map((i) => options[i]).join(", "))}
            className="px-4 py-2 text-[11px] font-semibold uppercase tracking-[0.14em] rounded-full transition-all active:scale-95"
            style={{
              background: "linear-gradient(135deg, var(--phase-accent,#04C9F4), rgba(var(--phase-accent-rgb,4,201,244),0.7))",
              color: "#050606",
            }}
          >
            {t("confess.done")}
          </button>
        ) : <div />}
        {onSkip && (
          <button
            onClick={onSkip}
            className="text-[10.5px] uppercase tracking-[0.16em] text-cc-off/20 hover:text-cc-off/45 transition-colors"
          >
            {skipLabel ?? t("confess.skip")}
          </button>
        )}
      </div>
    </div>
  );
}

function TextInput({ onAnswer, onSkip, skipLabel }: {
  onAnswer: (v: string) => void; onSkip?: () => void; skipLabel?: string;
}) {
  const { t } = useTranslation();
  const [val, setVal] = useState("");
  const [err, setErr] = useState("");
  const emailRe = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

  function submit() {
    if (!val.trim()) return;
    if (!emailRe.test(val.trim())) { setErr(t("confess.errEmail")); return; }
    onAnswer(val.trim());
  }

  return (
    <div className="space-y-2">
      <div
        className="flex gap-2 items-center p-1.5"
        style={{
          background: "rgba(255,255,255,0.07)",
          border: err ? "1px solid rgba(220,60,60,0.4)" : "1px solid rgba(255,255,255,0.12)",
          borderRadius: "14px",
        }}
      >
        <input
          type="email"
          value={val}
          onChange={(e) => { setVal(e.target.value); setErr(""); }}
          onKeyDown={(e) => e.key === "Enter" && submit()}
          placeholder="your@email.com"
          autoFocus
          className="flex-1 bg-transparent text-cc-off/80 placeholder:text-cc-off/20 px-3 py-2 text-[13.5px] focus:outline-none"
        />
        {val.trim() && (
          <button
            onClick={submit}
            className="px-4 py-2 rounded-[10px] text-[11px] font-semibold uppercase tracking-[0.12em]"
            style={{
              background: "linear-gradient(135deg, var(--phase-accent,#04C9F4), rgba(var(--phase-accent-rgb,4,201,244),0.7))",
              color: "#050606",
            }}
          >
            {t("confess.send")}
          </button>
        )}
      </div>
      {err && <p className="text-[11px] px-1" style={{ color: "rgba(220,60,60,0.8)" }}>{err}</p>}
      {onSkip && !err && (
        <div className="flex justify-end">
          <button onClick={onSkip} className="text-[10.5px] uppercase tracking-[0.16em] text-cc-off/20 hover:text-cc-off/45 transition-colors">
            {skipLabel ?? t("confess.skip")}
          </button>
        </div>
      )}
      {onSkip && err && (
        <div className="flex justify-end">
          <button onClick={onSkip} className="text-[10.5px] uppercase tracking-[0.16em] text-cc-off/20 hover:text-cc-off/45 transition-colors">
            {skipLabel ?? t("confess.skipAnyway")}
          </button>
        </div>
      )}
    </div>
  );
}

function AgeInput({ onAnswer }: { onAnswer: (v: string) => void }) {
  const { t } = useTranslation();
  const [val, setVal] = useState("");
  const [err, setErr] = useState("");

  function submit() {
    const n = parseInt(val, 10);
    if (isNaN(n) || val.trim() === "") { setErr(t("confess.errAgeEmpty")); return; }
    if (n < 16) { setErr(t("confess.errAgeMin")); return; }
    if (n > 99) { setErr(t("confess.errAgeMax")); return; }
    onAnswer(String(n));
  }

  return (
    <div className="space-y-2">
      <div
        className="flex gap-2 items-center p-1.5"
        style={{
          background: "rgba(255,255,255,0.07)",
          border: err ? "1px solid rgba(220,60,60,0.4)" : "1px solid rgba(255,255,255,0.12)",
          borderRadius: "14px",
        }}
      >
        <input
          type="number"
          inputMode="numeric"
          min={16}
          max={99}
          value={val}
          onChange={(e) => { setVal(e.target.value); setErr(""); }}
          onKeyDown={(e) => e.key === "Enter" && submit()}
          placeholder={t("confess.errAgeEmpty")}
          autoFocus
          className="flex-1 bg-transparent text-cc-off/80 placeholder:text-cc-off/20 px-3 py-2 text-[13.5px] focus:outline-none"
        />
        {val.trim() && (
          <button
            onClick={submit}
            className="px-4 py-2 rounded-[10px] text-[11px] font-semibold uppercase tracking-[0.12em]"
            style={{
              background: "linear-gradient(135deg, var(--phase-accent,#04C9F4), rgba(var(--phase-accent-rgb,4,201,244),0.7))",
              color: "#050606",
            }}
          >
            {t("confess.ok")}
          </button>
        )}
      </div>
      {err && <p className="text-[11px] px-1" style={{ color: "rgba(220,60,60,0.8)" }}>{err}</p>}
    </div>
  );
}

function InfoInput({ onNext }: { onNext: () => void }) {
  const { t } = useTranslation();
  return (
    <button
      onClick={onNext}
      className="w-full py-3 text-[11px] font-semibold uppercase tracking-[0.14em] rounded-2xl transition-all active:scale-[0.98]"
      style={{
        background: "rgba(255,255,255,0.10)",
        border: "1px solid rgba(255,255,255,0.16)",
        color: "rgba(242,242,242,0.7)",
      }}
    >
      {t("confess.gotIt")}
    </button>
  );
}

function RefRevealInput({ refId, onNext }: { refId: string; onNext: () => void }) {
  const { t } = useTranslation();
  const [copied, setCopied] = useState(false);
  function copy() {
    navigator.clipboard.writeText(refId).then(() => { setCopied(true); setTimeout(() => setCopied(false), 2000); });
  }
  return (
    <div className="space-y-3">
      <div
        className="flex items-center justify-between px-4 py-3.5"
        style={{
          background: "rgba(var(--phase-accent-rgb,4,201,244),0.08)",
          border: "1px solid rgba(var(--phase-accent-rgb,4,201,244),0.2)",
          borderRadius: "14px",
        }}
      >
        <div className="font-display text-2xl tracking-[0.22em]" style={{ color: "var(--phase-accent,#04C9F4)" }}>{refId}</div>
        <button
          onClick={copy}
          className="flex items-center gap-1.5 text-[10.5px] uppercase tracking-[0.14em] px-3 py-1.5 rounded-lg transition-colors"
          style={{ color: copied ? "var(--phase-accent,#04C9F4)" : "rgba(242,242,242,0.3)", border: "1px solid rgba(255,255,255,0.08)" }}
        >
          <Copy size={11} /> {copied ? t("confess.copied") : t("confess.copy")}
        </button>
      </div>
      <button
        onClick={onNext}
        className="w-full flex items-center justify-center px-5 py-3 text-[11px] font-semibold uppercase tracking-[0.16em] transition-all active:scale-[0.98]"
        style={{
          background: "rgba(255,255,255,0.07)",
          border: "1px solid rgba(255,255,255,0.14)",
          borderRadius: "13px",
          color: "rgba(242,242,242,0.6)",
        }}
      >
        {t("confess.iSavedIt")}
      </button>
    </div>
  );
}

function SubmitInput({ onDone, submitting }: { onDone: () => void; submitting: boolean }) {
  const { t } = useTranslation();
  return (
    <div className="space-y-2">
      <p className="text-[10.5px] uppercase tracking-[0.16em] text-cc-off/25 text-center pb-1">
        {submitting ? t("confess.sendingConfession") : t("confess.notSentYet")}
      </p>
      <button
        onClick={onDone}
        disabled={submitting}
        className="w-full flex items-center justify-between px-5 py-4 font-display uppercase tracking-[0.18em] text-[12px] transition-all active:scale-[0.98] disabled:opacity-60 disabled:cursor-not-allowed"
        style={{
          background: "linear-gradient(135deg, var(--phase-accent,#04C9F4), rgba(var(--phase-accent-rgb,4,201,244),0.75))",
          borderRadius: "13px",
          color: "#050606",
          boxShadow: submitting ? "none" : "0 8px 24px -6px var(--phase-glow,rgba(4,201,244,0.35))",
        }}
      >
        {submitting ? t("confess.sending") : t("confess.sendMyConfession")}
        {!submitting && <ArrowRight size={15} strokeWidth={2.4} />}
      </button>
    </div>
  );
}

// ─── Chat view ─────────────────────────────────────────────────────────────────

interface Message { id: string; role: "bot" | "user"; content: string; }

function ChatView({ body, flow, refId, submitting, onDone }: { body: string; flow: FlowStep[]; refId: string; submitting: boolean; onDone: (answers: Record<string, string>) => void | Promise<void>; }) {
  const { t } = useTranslation();
  const [messages, setMessages]     = useState<Message[]>([]);
  const [typing, setTyping]         = useState(false);
  const [stepIdx, setStepIdx]       = useState(0);
  const [inputReady, setInputReady] = useState(false);
  const bottomRef                   = useRef<HTMLDivElement>(null);
  const answersRef                  = useRef<Record<string, string>>({});

  useEffect(() => {
    const snippet = body.length > 100 ? body.slice(0, 100) + "…" : body;
    setMessages([{ id: "confession", role: "user", content: snippet }]);

    // Freyal welcome sequence before first question
    let t1: ReturnType<typeof setTimeout>;
    let t2: ReturnType<typeof setTimeout>;
    let t3: ReturnType<typeof setTimeout>;
    let t4: ReturnType<typeof setTimeout>;
    t1 = setTimeout(() => setTyping(true), 400);
    t2 = setTimeout(() => {
      setMessages((m) => [...m, { id: "welcome-1", role: "bot", content: t("confess.welcome1") }]);
      setTyping(false);
      t3 = setTimeout(() => setTyping(true), 300);
    }, 1100);
    t3 = setTimeout(() => setTyping(true), 1400);
    t4 = setTimeout(() => {
      setMessages((m) => [...m, { id: "welcome-2", role: "bot", content: t("confess.welcome2") }]);
      setTyping(false);
      setTimeout(() => askStep(0), 600);
    }, 2300);
    return () => { clearTimeout(t1); clearTimeout(t2); clearTimeout(t3); clearTimeout(t4); };
  }, []);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, typing, inputReady]);

  function askStep(idx: number) {
    if (idx >= flow.length) { onDone(answersRef.current); return; }
    setInputReady(false);
    setTyping(true);
    setTimeout(() => {
      setMessages((m) => m.some((x) => x.id === `bot-${idx}`) ? m : [...m, { id: `bot-${idx}`, role: "bot", content: flow[idx].message }]);
      setTyping(false);
      setStepIdx(idx);
      if (flow[idx].description) {
        setTimeout(() => setTyping(true), 200);
        setTimeout(() => {
          setMessages((m) => [...m, { id: `bot-${idx}-desc`, role: "bot", content: flow[idx].description! }]);
          setTyping(false);
          setTimeout(() => setInputReady(true), 120);
        }, 850);
      } else {
        setTimeout(() => setInputReady(true), 120);
      }
    }, 650);
  }

  function answer(value: string) {
    const stepId = flow[stepIdx]?.id;
    if (stepId && value) answersRef.current[stepId] = value;
    if (value) setMessages((m) => [...m, { id: `user-${stepIdx}`, role: "user", content: value }]);
    setInputReady(false);
    setTimeout(() => askStep(stepIdx + 1), value ? 350 : 100);
  }

  const currentStep = flow[stepIdx];
  const showInput = inputReady && !typing && messages.some((m) => m.id === `bot-${stepIdx}`);

  return (
    <>
      {/* Scrollable messages — fills all remaining space */}
      <div className="flex flex-col gap-3 overflow-y-auto flex-1" style={{ paddingBottom: "4px" }}>
        {messages.map((m) =>
          m.role === "bot"
            ? <BotBubble key={m.id} content={m.content} />
            : <UserBubble key={m.id} content={m.content} />
        )}
        <AnimatePresence>{typing && <TypingIndicator key="typing" />}</AnimatePresence>
        <div ref={bottomRef} />
      </div>

      {/* Input — fixed height at bottom, never causes container to grow */}
      <div style={{ borderTop: "1px solid rgba(255,255,255,0.07)", paddingTop: "14px", flexShrink: 0, minHeight: "120px" }}>
        <AnimatePresence mode="wait">
          {showInput && (
            <motion.div
              key={`input-${stepIdx}`}
              initial={{ opacity: 0, y: 6 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -4 }}
              transition={{ duration: 0.22, ease: [0.16, 1, 0.3, 1] }}
            >
              {currentStep.type === "chips" && (
                <ChipInput
                  options={currentStep.options!}
                  displayOptions={currentStep.displayOptions}
                  onAnswer={answer}
                  onSkip={currentStep.skip ? () => answer("") : undefined}
                  skipLabel={currentStep.skipLabel}
                />
              )}
              {currentStep.type === "multichips" && (
                <ChipInput
                  options={currentStep.options!}
                  displayOptions={currentStep.displayOptions}
                  multi
                  onAnswer={answer}
                  onSkip={currentStep.skip ? () => answer("") : undefined}
                  skipLabel={currentStep.skipLabel}
                />
              )}
              {currentStep.type === "text" && (
                <TextInput
                  onAnswer={answer}
                  onSkip={currentStep.skip ? () => answer("") : undefined}
                  skipLabel={currentStep.skipLabel}
                />
              )}
              {currentStep.type === "age" && (
                <AgeInput onAnswer={answer} />
              )}
              {currentStep.type === "info" && (
                <InfoInput onNext={() => answer("Got it")} />
              )}
              {currentStep.type === "refreveal" && (
                <RefRevealInput refId={refId} onNext={() => answer("Saved")} />
              )}
              {currentStep.type === "submit" && (
                <SubmitInput onDone={() => onDone(answersRef.current)} submitting={submitting} />
              )}
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </>
  );
}

// ─── Done state ────────────────────────────────────────────────────────────────

function DoneView({ refId, onAnother }: { refId: string; onAnother: () => void }) {
  const { t } = useTranslation();
  const [copied, setCopied] = useState(false);
  function copy() {
    navigator.clipboard.writeText(refId).then(() => { setCopied(true); setTimeout(() => setCopied(false), 2000); });
  }
  return (
    <div className="flex flex-col items-center text-center gap-8 py-10">
      <div
        className="w-20 h-20 grid place-items-center rounded-full"
        style={{ background: "rgba(var(--phase-accent-rgb,4,201,244),0.08)", border: "1px solid rgba(var(--phase-accent-rgb,4,201,244),0.2)" }}
      >
        <Check size={32} strokeWidth={2} style={{ color: "var(--phase-accent,#04C9F4)" }} />
      </div>
      <div className="space-y-3">
        <div className="text-[10px] uppercase tracking-[0.3em] text-cc-off/30">{t("confess.doneLabel")}</div>
        <h2 className="font-display text-4xl uppercase text-cc-off leading-tight">
          {t("confess.doneHeadline1")}<br />{t("confess.doneHeadline2")}
        </h2>
        <p className="text-cc-off/40 text-sm leading-relaxed max-w-xs mx-auto">
          {t("confess.doneBody")}
        </p>
      </div>

      {/* Ref number */}
      <div
        className="w-full flex items-center justify-between px-4 py-3.5"
        style={{
          background: "rgba(var(--phase-accent-rgb,4,201,244),0.07)",
          border: "1px solid rgba(var(--phase-accent-rgb,4,201,244),0.18)",
          borderRadius: "14px",
        }}
      >
        <div className="text-start">
          <div className="text-[9px] uppercase tracking-[0.2em] text-cc-off/30 mb-1">{t("confess.yourReference")}</div>
          <div className="font-display text-xl tracking-[0.22em]" style={{ color: "var(--phase-accent,#04C9F4)" }}>{refId}</div>
        </div>
        <button
          onClick={copy}
          className="flex items-center gap-1.5 text-[10.5px] uppercase tracking-[0.14em] px-3.5 py-2 rounded-lg transition-all active:scale-95"
          style={{
            color: copied ? "var(--phase-accent,#04C9F4)" : "rgba(242,242,242,0.75)",
            background: copied ? "rgba(var(--phase-accent-rgb,4,201,244),0.1)" : "rgba(255,255,255,0.1)",
            border: `1px solid ${copied ? "rgba(var(--phase-accent-rgb,4,201,244),0.35)" : "rgba(255,255,255,0.2)"}`,
          }}
        >
          <Copy size={11} /> {copied ? t("confess.copied") : t("confess.copy")}
        </button>
      </div>

      <button
        onClick={onAnother}
        className="w-full flex items-center justify-center gap-2 px-5 py-3.5 text-[11px] font-semibold uppercase tracking-[0.16em] transition-all active:scale-[0.98]"
        style={{
          background: "rgba(255,255,255,0.07)",
          border: "1px solid rgba(255,255,255,0.14)",
          borderRadius: "13px",
          color: "rgba(242,242,242,0.55)",
        }}
      >
        <MessageSquare size={13} strokeWidth={1.8} />
        {t("confess.confessAnother")}
      </button>
    </div>
  );
}

// ─── Main page ─────────────────────────────────────────────────────────────────

const LS_CONFESS_STAGE = "cc_last_confess_stage";
const LS_CONFESS_REF   = "cc_last_confess_ref";

function genRef() {
  return Array.from({ length: 8 }, () => "ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789"[Math.floor(Math.random() * 36)]).join("");
}

function ConfessPage() {
  const { t, ta, lang } = useTranslation();
  const displayFlow = getDisplayFlow(t, ta);
  const [stage, setStageRaw]      = useState<"write" | "chat" | "done">("write");
  const [body, setBody]           = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const refId = useRef(genRef());

  function setStage(s: "write" | "chat" | "done") {
    setStageRaw(s);
    if (s === "done") {
      localStorage.setItem(LS_CONFESS_STAGE, "done");
      localStorage.setItem(LS_CONFESS_REF, refId.current);
    } else {
      localStorage.removeItem(LS_CONFESS_STAGE);
      localStorage.removeItem(LS_CONFESS_REF);
    }
  }

  // Restore done state from localStorage after mount (SSR-safe)
  useEffect(() => {
    const savedStage = localStorage.getItem(LS_CONFESS_STAGE);
    const savedRef   = localStorage.getItem(LS_CONFESS_REF);
    if (savedStage === "done" && savedRef) {
      refId.current = savedRef;
      setStageRaw("done");
    }
  }, []);

  useEffect(() => { getOrCreateAnonId(); }, []);

  async function handleDone(answers: Record<string, string>) {
    if (body.length > 2500) return;
    setSubmitting(true);
    setSubmitError(null);

    const ref    = refId.current;
    const anonId = getOrCreateAnonId();

    // Optimistic save — Mine tab shows immediately
    saveRefToProfile(ref);
    markIngesting(ref);
    if (body) saveSnippet(ref, body);
    saveOriginBrowser(detectBrowser());
    const { browser, device } = getBrowserDetails();

    const payload: SubmitPayload = {
      refNum:      ref,
      anonId,
      mood:        answers["mood"]     ?? "",
      gender:      answers["gender"]   ?? "",
      age:         parseInt(answers["age"] ?? "0", 10),
      location:    answers["location"] ?? "",
      email:       answers["email"] ?? "",
      body,
      category:    answers["category"] ?? "",
      tags:        answers["tags"] ? answers["tags"].split(", ") : [],
      browser,
      device,
      contactable: answers["contactable"] === "Yes, reach out to me",
    };

    try {
      const submitFn = submitConfession as unknown as (opts: { data: SubmitPayload }) => Promise<import("../lib/confessSubmit").SubmitResult>;
      const timeout = new Promise<never>((_, reject) =>
        setTimeout(() => reject(new Error("timeout")), 32000)
      );
      const result = await Promise.race([submitFn({ data: payload }), timeout]);

      if (result.success) {
        clearIngesting(ref);
        setStage("done");
      } else if (result.step === "sheet") {
        // Confession not saved — rollback everything
        clearIngesting(ref);
        removeRefFromProfile(ref);
        setSubmitError(t("confess.errSubmit"));
      } else {
        // Sheet succeeded, pipeline failed — mark failed, still go to done
        clearIngesting(ref);
        markIngestionFailed(ref);
        setStage("done");
      }
    } catch {
      // Client 32s timeout OR CF Worker kill (~30s) — both mean GAS may have
      // received the confession. Stay ingesting; poll will resolve.
      setStage("done");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="py-2">
      <AnimatePresence mode="wait">

        {stage === "write" && (
          <motion.div
            key="write"
            initial={{ opacity: 1 }}
            exit={{ opacity: 0, scale: 0.97, y: -10 }}
            transition={{ duration: 0.28, ease: [0.4, 0, 1, 1] }}
            className="flex flex-col gap-5 pb-10"
            dir={lang === "ar" ? "rtl" : "ltr"}
          >
            <div className="space-y-1">
              <div className="text-[10px] uppercase tracking-[0.28em] text-cc-off/30">{t("confess.safeHere")}</div>
              <h1 className="font-display text-[2rem] uppercase text-cc-off leading-tight">
                {t("confess.headline1")}<br />{t("confess.headline2")}
              </h1>
            </div>

            <div
              style={{
                background: "rgba(255,255,255,0.10)",
                border: "1px solid rgba(255,255,255,0.16)",
                borderRadius: "18px",
                backdropFilter: "blur(14px)",
                overflow: "hidden",
              }}
            >
              <textarea
                value={body}
                onChange={(e) => setBody(e.target.value)}
                onKeyDown={(e) => {
                  if ((e.ctrlKey || e.metaKey) && e.key === "Enter" && body.trim().length >= 10 && body.length <= 2500) {
                    e.preventDefault();
                    setStage("chat");
                  }
                }}
                placeholder={t("confess.placeholder")}
                rows={8}
                className="w-full bg-transparent text-cc-off placeholder:text-cc-off/20 text-[15px] leading-[1.8] resize-none focus:outline-none font-light p-5"
              />
              <div
                className="flex items-center justify-between px-5 pb-4"
                style={{ borderTop: "1px solid rgba(255,255,255,0.05)" }}
              >
                <span className="flex items-center gap-1.5 text-[10px] text-cc-off/20 uppercase tracking-[0.18em]">
                  <Lock size={9} strokeWidth={1.8} />
                  {t("confess.anonymous")}
                </span>
                <span className="text-[11px]" style={{
                  color: body.length > 2500
                    ? "#ef4444"
                    : body.length > 0
                      ? "rgba(var(--phase-accent-rgb,4,201,244),0.5)"
                      : "rgba(242,242,242,0.2)",
                  transition: "color 0.2s ease",
                }}>
                  {body.length} / 2500
                </span>
              </div>
            </div>

            <button
              onClick={() => setStage("chat")}
              disabled={body.trim().length < 10 || body.length > 2500}
              className="w-full flex items-center justify-between px-6 py-4 font-display uppercase tracking-[0.18em] text-[13px] transition-all active:scale-[0.98] disabled:opacity-25 disabled:cursor-not-allowed"
              style={{
                background: body.trim().length >= 10 && body.length <= 2500
                  ? "linear-gradient(135deg, var(--phase-accent,#04C9F4), rgba(var(--phase-accent-rgb,4,201,244),0.75))"
                  : "rgba(255,255,255,0.06)",
                borderRadius: "14px",
                color: body.trim().length >= 10 && body.length <= 2500 ? "#050606" : "rgba(242,242,242,0.4)",
                boxShadow: body.trim().length >= 10 && body.length <= 2500 ? "0 8px 24px -6px var(--phase-glow,rgba(4,201,244,0.35))" : "none",
                transition: "background 0.3s ease, box-shadow 0.3s ease, color 0.3s ease",
              }}
            >
              {t("confess.continue")}
              {lang === "ar" ? <ArrowLeft size={16} strokeWidth={2.4} /> : <ArrowRight size={16} strokeWidth={2.4} />}
            </button>
          </motion.div>
        )}

        {stage === "chat" && (
          <motion.div
            key="chat"
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.35, ease: [0.16, 1, 0.3, 1] }}
            className="flex flex-col gap-4"
          >
            <div className="space-y-1">
              <div className="text-[10px] uppercase tracking-[0.28em] text-cc-off/30">{t("confess.quickQuestions")}</div>
              <h1 className="font-display text-[1.6rem] uppercase text-cc-off leading-tight">{t("confess.helpUs")}</h1>
            </div>

            <div
              className="flex flex-col"
              style={{
                background: "rgba(255,255,255,0.07)",
                border: "1px solid rgba(255,255,255,0.12)",
                borderRadius: "22px",
                backdropFilter: "blur(20px)",
                padding: "20px",
                height: "62dvh",
              }}
            >
              <ChatView body={body} flow={displayFlow} refId={refId.current} submitting={submitting} onDone={handleDone} />
            </div>
            {submitError && (
              <div className="mt-3 px-4 py-3 text-[12.5px] text-red-400 leading-relaxed" style={{ background: "rgba(239,68,68,0.08)", borderRadius: "12px", border: "1px solid rgba(239,68,68,0.2)" }}>
                {submitError}
              </div>
            )}
          </motion.div>
        )}

        {stage === "done" && (
          <motion.div
            key="done"
            initial={{ opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.35, ease: [0.16, 1, 0.3, 1] }}
          >
            <DoneView refId={refId.current} onAnother={() => {
              refId.current = genRef();
              setBody("");
              setStage("write");
            }} />
          </motion.div>
        )}

      </AnimatePresence>
    </div>
  );
}
