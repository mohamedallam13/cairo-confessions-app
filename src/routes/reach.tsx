import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useState, useEffect, useRef } from "react";
import { Send, ShieldCheck, Inbox, MessageSquarePlus, ArrowLeft, Trash2 } from "lucide-react";

export const Route = createFileRoute("/reach")({
  validateSearch: (search: Record<string, unknown>) => ({
    threadId: typeof search.threadId === "string" ? search.threadId : undefined,
    ref:      typeof search.ref      === "string" ? search.ref      : undefined,
    body:     typeof search.body     === "string" ? search.body     : undefined,
  }),
  head: () => ({
    meta: [
      { title: "Reach a confessor — Cairo Confessions" },
      { name: "description", content: "Send a kind, anonymous message to someone who shared." },
    ],
  }),
  component: ReachPage,
});

// ─── Types ─────────────────────────────────────────────────────────────────────

type Sender = "sender" | "confessor";

interface ThreadMsg {
  id: string;
  from: Sender;
  content: string;
  sentAt: string;
}

interface Thread {
  id: string;
  confessionRef: string;
  anonId: string;
  messages: ThreadMsg[];
  lastActivity: string;
  status: "pending" | "delivered" | "rejected";
}

// ─── Storage ───────────────────────────────────────────────────────────────────

function getOrCreateAnonId(): string {
  const key = "cc_anon_id";
  let id = localStorage.getItem(key);
  if (!id) {
    id = "anon_" + Array.from({ length: 12 }, () => "abcdefghijklmnopqrstuvwxyz0123456789"[Math.floor(Math.random() * 36)]).join("");
    localStorage.setItem(key, id);
  }
  return id;
}

function loadThreads(): Thread[] {
  try { return JSON.parse(localStorage.getItem("cc_threads") || "[]"); } catch { return []; }
}

function saveThreads(threads: Thread[]) {
  localStorage.setItem("cc_threads", JSON.stringify(threads));
}

function upsertThread(thread: Thread) {
  const all = loadThreads();
  const idx = all.findIndex((t) => t.id === thread.id);
  if (idx >= 0) all[idx] = thread; else all.unshift(thread);
  saveThreads(all);
}

// ─── Quick messages ────────────────────────────────────────────────────────────

type MessageType = "support" | "relate" | "admiration" | "advice" | "gratitude" | "criticism";

const MESSAGE_TYPES: { key: MessageType; label: string }[] = [
  { key: "support",    label: "Support"    },
  { key: "relate",     label: "Relate"     },
  { key: "admiration", label: "Admiration" },
  { key: "advice",     label: "Advice"     },
  { key: "gratitude",  label: "Gratitude"  },
  { key: "criticism",  label: "Criticism"  },
];

const QUICK: Record<MessageType, string[]> = {
  support: [
    "I read yours and felt less alone.",
    "You're braver than you know.",
    "I've been there too. It gets softer.",
    "Sending you warmth from across the city.",
    "You don't have to carry it alone.",
    "Thank you for saying this out loud.",
    "Whatever happens next, you're not invisible.",
    "I hope someone holds this with you.",
  ],
  relate: [
    "This could have been written by me.",
    "I know this feeling more than you'd think.",
    "I've been exactly where you are.",
    "You're not the only one carrying this.",
    "Same city, same weight.",
    "This hit closer to home than I expected.",
    "You're not alone in this, even if it feels that way.",
    "I've never told anyone either.",
  ],
  admiration: [
    "It takes real courage to say this out loud.",
    "Thank you for sharing this with the city.",
    "You put into words what many of us can't.",
    "This stayed with me.",
    "I see you.",
    "You're stronger than you think.",
    "This is the kind of honesty the world needs more of.",
    "I respect you for this.",
  ],
  advice: [
    "Have you talked to someone about this?",
    "Sometimes the first step is just saying it — you've done that.",
    "Whatever you decide, make sure it's for you.",
    "Give yourself permission to not have it figured out.",
    "You deserve support beyond this screen.",
    "One step at a time.",
    "Be gentle with yourself through this.",
    "This might be worth writing down somewhere private too.",
  ],
  gratitude: [
    "Thank you for being honest.",
    "Posts like yours make this city feel less cold.",
    "You reminded me I'm not alone either.",
    "This made my day a little more human.",
    "Thank you for trusting the city with this.",
    "You gave words to something I couldn't.",
    "This matters more than you know.",
    "Glad you shared it.",
  ],
  criticism: [
    "I think there's another side worth considering.",
    "Have you thought about how this affects others?",
    "I disagree, but I respect that you shared.",
    "This made me uncomfortable, but I'm listening.",
    "I hope you find a different path forward.",
    "There's more nuance here than it seems.",
    "I'd encourage you to reflect on this more.",
    "I hear you, but I don't fully agree.",
  ],
};

// ─── Thread view ───────────────────────────────────────────────────────────────

function ThreadView({ thread, perspective, onBack, onUpdated, onDeleted }: {
  thread: Thread;
  perspective: Sender;
  onBack: () => void;
  onUpdated: (t: Thread) => void;
  onDeleted: (id: string) => void;
}) {
  const [reply, setReply] = useState("");
  const [confirmDelete, setConfirmDelete] = useState(false);
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [thread.messages]);

  function send() {
    if (!reply.trim()) return;
    const newMsg: ThreadMsg = {
      id: "tmsg_" + Date.now(),
      from: perspective,
      content: reply.trim(),
      sentAt: new Date().toISOString(),
    };
    const updated: Thread = {
      ...thread,
      messages: [...thread.messages, newMsg],
      lastActivity: newMsg.sentAt,
    };
    upsertThread(updated);
    onUpdated(updated);
    setReply("");
  }

  const otherLabel = perspective === "sender" ? "Confessor" : "Them";

  return (
    <div
      className="flex flex-col gap-4 p-4 rounded-2xl"
      style={{
        background: "rgba(10,12,16,0.45)",
        border: "1px solid rgba(255,255,255,0.07)",
        backdropFilter: "blur(12px)",
        WebkitBackdropFilter: "blur(12px)",
      }}
    >

      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <button onClick={onBack} className="text-cc-off/30 hover:text-cc-off/70 transition-colors">
            <ArrowLeft size={18} strokeWidth={1.8} />
          </button>
          <div>
            <div className="font-display text-[11px] uppercase tracking-[0.2em]" style={{ color: "var(--phase-accent,#04C9F4)" }}>
              {thread.confessionRef}
            </div>
            <div className="text-[9.5px] uppercase tracking-[0.14em] text-cc-off/25">
              {thread.messages.length} {thread.messages.length === 1 ? "message" : "messages"}
            </div>
          </div>
        </div>

        {!confirmDelete ? (
          <button
            onClick={() => setConfirmDelete(true)}
            className="text-cc-off/20 hover:text-red-400/60 transition-colors p-1"
          >
            <Trash2 size={15} strokeWidth={1.8} />
          </button>
        ) : (
          <div className="flex items-center gap-2">
            <span className="text-[10px] uppercase tracking-[0.14em] text-cc-off/30">Delete?</span>
            <button
              onClick={() => {
                // TODO: DELETE from Supabase by thread.id
                const all = loadThreads().filter((t) => t.id !== thread.id);
                saveThreads(all);
                onDeleted(thread.id);
              }}
              className="text-[10px] uppercase tracking-[0.14em] px-3 py-2 rounded-lg transition-all"
              style={{ background: "rgba(220,60,60,0.15)", border: "1px solid rgba(220,60,60,0.3)", color: "rgba(220,80,80,0.9)" }}
            >
              Yes
            </button>
            <button
              onClick={() => setConfirmDelete(false)}
              className="text-[10px] uppercase tracking-[0.14em] text-cc-off/30 hover:text-cc-off/60 transition-colors"
            >
              No
            </button>
          </div>
        )}
      </div>

      {/* Messages */}
      <div className="flex flex-col gap-3 overflow-y-auto" style={{ scrollbarWidth: "none", maxHeight: "42dvh" }}>
        {thread.messages.map((m) => {
          const isMine = m.from === perspective;
          return (
            <div key={m.id} className={`flex flex-col gap-1 ${isMine ? "items-end" : "items-start"}`}>
              <div
                className="px-4 py-3 text-[13px] leading-[1.7] font-light max-w-[85%]"
                style={{
                  borderRadius: isMine ? "18px 18px 4px 18px" : "18px 18px 18px 4px",
                  background: isMine
                    ? "rgba(var(--phase-accent-rgb,4,201,244),0.13)"
                    : "rgba(255,255,255,0.08)",
                  border: isMine
                    ? "1px solid rgba(var(--phase-accent-rgb,4,201,244),0.22)"
                    : "1px solid rgba(255,255,255,0.10)",
                  color: isMine ? "rgba(242,242,242,0.85)" : "rgba(242,242,242,0.65)",
                }}
              >
                {m.content}
              </div>
              <div className="flex items-center gap-1.5 px-1">
                <span className="text-[9px] uppercase tracking-[0.12em] text-cc-off/20">
                  {isMine ? "You" : otherLabel}
                </span>
                <span className="text-cc-off/15 text-[9px]">·</span>
                <span className="text-[9px] text-cc-off/20">
                  {new Date(m.sentAt).toLocaleDateString("en-GB", { day: "numeric", month: "short" })}
                </span>
              </div>
            </div>
          );
        })}
        <div ref={bottomRef} />
      </div>

      {/* Reply box */}
      <div
        style={{
          background: "rgba(255,255,255,0.07)",
          border: "1px solid rgba(255,255,255,0.12)",
          borderRadius: "16px",
          overflow: "hidden",
        }}
      >
        <textarea
          value={reply}
          onChange={(e) => setReply(e.target.value)}
          onKeyDown={(e) => { if (e.key === "Enter" && (e.ctrlKey || e.metaKey)) send(); }}
          placeholder="Write a reply..."
          rows={3}
          className="w-full bg-transparent text-cc-off placeholder:text-cc-off/20 text-[13.5px] leading-[1.75] p-4 resize-none focus:outline-none font-light"
        />
        <div
          className="flex items-center justify-between px-4 pb-3"
          style={{ borderTop: "1px solid rgba(255,255,255,0.06)" }}
        >
          <span className="text-[9.5px] uppercase tracking-[0.14em] text-cc-off/18">Anonymous · Reviewed</span>
          <button
            onClick={send}
            disabled={!reply.trim()}
            className="flex items-center gap-1.5 px-4 py-2 text-[10.5px] font-semibold uppercase tracking-[0.14em] rounded-xl transition-all active:scale-95 disabled:opacity-25"
            style={{
              background: "linear-gradient(135deg, var(--phase-accent,#04C9F4), rgba(var(--phase-accent-rgb,4,201,244),0.75))",
              color: "#050606",
            }}
          >
            <Send size={11} strokeWidth={2.2} /> Send
          </button>
        </div>
      </div>

    </div>
  );
}

// ─── New message tab ───────────────────────────────────────────────────────────

function NewMessageTab({ onSent }: { onSent: (t: Thread) => void }) {
  const [refId, setRefId]   = useState("");
  const [msg, setMsg]       = useState("");
  const [email, setEmail]   = useState("");
  const [type, setType]     = useState<MessageType>("support");
  const [sent, setSent]     = useState(false);

  const canSend = refId.trim().length >= 3 && msg.trim().length >= 4;

  function send() {
    if (!canSend) return;
    const anonId = getOrCreateAnonId();
    const firstMsg: ThreadMsg = {
      id: "tmsg_" + Date.now(),
      from: "sender",
      content: msg.trim(),
      sentAt: new Date().toISOString(),
    };
    const thread: Thread = {
      id: "thread_" + Date.now(),
      confessionRef: refId.trim().toUpperCase(),
      anonId,
      messages: [firstMsg],
      lastActivity: firstMsg.sentAt,
      status: "pending",
      // TODO: persist to Supabase with anonId, type, email
    };
    upsertThread(thread);
    onSent(thread);
    setSent(true);
  }

  // Reset quick message when type changes if it belonged to previous type
  function selectType(t: MessageType) {
    if (!QUICK[t].includes(msg)) setMsg("");
    setType(t);
  }

  if (sent) return (
    <div className="flex flex-col items-center text-center gap-8 py-12">
      <div
        className="w-20 h-20 grid place-items-center rounded-full"
        style={{ background: "rgba(var(--phase-accent-rgb,4,201,244),0.07)", border: "1px solid rgba(var(--phase-accent-rgb,4,201,244),0.18)" }}
      >
        <Send size={24} strokeWidth={1.8} style={{ color: "var(--phase-accent,#04C9F4)" }} />
      </div>
      <div className="space-y-3">
        <div className="text-[10px] uppercase tracking-[0.3em] text-cc-off/30">— On its way</div>
        <h2 className="font-display text-4xl uppercase text-cc-off leading-tight">Your kindness<br />is travelling.</h2>
        <p className="text-cc-off/35 text-[13px] leading-relaxed max-w-[260px] mx-auto">
          Your message is being reviewed. If it passes, it'll reach the confessor quietly and anonymously.
        </p>
      </div>
      <button
        onClick={() => { setSent(false); setRefId(""); setMsg(""); setEmail(""); setType("support"); }}
        className="w-full flex items-center justify-center px-5 py-3.5 text-[11px] font-semibold uppercase tracking-[0.16em] transition-all active:scale-[0.98]"
        style={{ background: "rgba(255,255,255,0.07)", border: "1px solid rgba(255,255,255,0.14)", borderRadius: "13px", color: "rgba(242,242,242,0.55)" }}
      >
        Send another message
      </button>
    </div>
  );

  return (
    <div className="flex flex-col gap-5">
      <input
        value={refId}
        onChange={(e) => setRefId(e.target.value)}
        placeholder="Confession ID — e.g. A4KZ9BM2"
        className="w-full bg-transparent text-cc-off placeholder:text-cc-off/25 px-4 py-3.5 font-display uppercase tracking-widest text-[14px] focus:outline-none"
        style={{
          background: "rgba(255,255,255,0.10)",
          border: refId.trim().length >= 3 ? "1px solid rgba(var(--phase-accent-rgb,4,201,244),0.4)" : "1px solid rgba(255,255,255,0.16)",
          borderRadius: "14px",
          backdropFilter: "blur(14px)",
          transition: "border-color 0.3s ease",
        }}
      />

      {/* Message area */}
      <div style={{ background: "rgba(255,255,255,0.10)", border: "1px solid rgba(255,255,255,0.16)", borderRadius: "18px", backdropFilter: "blur(14px)", overflow: "hidden" }}>
        {/* Suggestions title + type selector */}
        <div className="flex flex-col gap-2 px-4 pt-3 pb-1">
          <span className="text-[9.5px] uppercase tracking-[0.18em] text-cc-off/20">Suggestions</span>
          <div className="flex items-center gap-1.5" style={{ overflowX: "auto", scrollbarWidth: "none" }}>
            {MESSAGE_TYPES.map(({ key, label }, i) => (
              <span key={key} className="flex items-center gap-1.5 shrink-0">
                {i > 0 && <span className="text-cc-off/15 text-[9px]">·</span>}
                <button
                  onClick={() => selectType(key)}
                  className="text-[9.5px] uppercase tracking-[0.12em] transition-colors shrink-0"
                  style={{ color: type === key ? "var(--phase-accent,#04C9F4)" : "rgba(242,242,242,0.25)" }}
                >
                  {label}
                </button>
              </span>
            ))}
          </div>
        </div>
        <div className="flex gap-2 px-4 pt-2 pb-3" style={{ overflowX: "auto", scrollbarWidth: "none" }}>
          {QUICK[type].map((q) => (
            <button
              key={q}
              onClick={() => setMsg(msg === q ? "" : q)}
              className="shrink-0 px-3.5 py-2 text-[11.5px] leading-snug transition-all active:scale-95 whitespace-nowrap"
              style={{
                borderRadius: "9999px",
                border: msg === q ? "1px solid rgba(var(--phase-accent-rgb,4,201,244),0.5)" : "1px solid rgba(255,255,255,0.18)",
                background: msg === q ? "rgba(var(--phase-accent-rgb,4,201,244),0.12)" : "rgba(255,255,255,0.08)",
                color: msg === q ? "var(--phase-accent,#04C9F4)" : "rgba(242,242,242,0.45)",
              }}
            >
              {q}
            </button>
          ))}
        </div>
        <div style={{ borderTop: "1px solid rgba(255,255,255,0.06)", margin: "0 16px" }} />
        <textarea
          value={msg}
          onChange={(e) => setMsg(e.target.value)}
          placeholder="Write whatever you feel..."
          rows={5}
          className="w-full bg-transparent text-cc-off placeholder:text-cc-off/20 text-[14px] leading-[1.75] p-4 resize-none focus:outline-none font-light"
        />
      </div>

      {/* Optional email */}
      <input
        type="email"
        value={email}
        onChange={(e) => setEmail(e.target.value)}
        placeholder="Your email — optional, so they can reply"
        className="w-full bg-transparent text-cc-off/70 placeholder:text-cc-off/20 px-4 py-3 text-[13px] focus:outline-none font-light"
        style={{
          background: "rgba(255,255,255,0.06)",
          border: "1px solid rgba(255,255,255,0.10)",
          borderRadius: "12px",
        }}
      />

      <button
        onClick={send}
        disabled={!canSend}
        className="w-full flex items-center justify-between px-6 py-4 font-display uppercase tracking-[0.18em] text-[13px] transition-all active:scale-[0.98] disabled:opacity-25 disabled:cursor-not-allowed"
        style={{
          background: canSend ? "linear-gradient(135deg, var(--phase-accent,#04C9F4), rgba(var(--phase-accent-rgb,4,201,244),0.75))" : "rgba(255,255,255,0.06)",
          borderRadius: "14px",
          color: canSend ? "#050606" : "rgba(242,242,242,0.3)",
          boxShadow: canSend ? "0 8px 24px -6px var(--phase-glow,rgba(4,201,244,0.35))" : "none",
          transition: "background 0.3s ease, box-shadow 0.3s ease, color 0.3s ease",
        }}
      >
        Send message
        <Send size={15} strokeWidth={2.4} />
      </button>

      <div className="flex items-start gap-2.5 px-1">
        <ShieldCheck size={13} strokeWidth={1.8} className="text-cc-off/20 shrink-0 mt-0.5" />
        <p className="text-[11px] leading-relaxed" style={{ color: "rgba(242,242,242,0.18)" }}>
          All messages are reviewed before delivery. Harmful messages will not be sent.
        </p>
      </div>
    </div>
  );
}

// ─── Inbox tab ─────────────────────────────────────────────────────────────────

const STATUS_COLOR: Record<Thread["status"], string> = {
  pending:   "rgba(242,242,242,0.25)",
  delivered: "var(--phase-accent,#04C9F4)",
  rejected:  "rgba(220,80,80,0.7)",
};

const STATUS_LABEL: Record<Thread["status"], string> = {
  pending:   "Pending",
  delivered: "Delivered",
  rejected:  "Not sent",
};

function InboxTab({ threads, myAnonId, onOpen }: {
  threads: Thread[];
  myAnonId: string;
  onOpen: (t: Thread) => void;
}) {
  if (threads.length === 0) return (
    <div className="flex flex-col items-center text-center gap-4 py-16">
      <Inbox size={32} strokeWidth={1.4} className="text-cc-off/15" />
      <p className="text-[12px] uppercase tracking-[0.2em] text-cc-off/20">Nothing here yet</p>
    </div>
  );

  return (
    <div className="flex flex-col gap-3">
      {threads.map((t) => {
        const perspective: Sender = t.anonId === myAnonId ? "sender" : "confessor";
        const last = t.messages[t.messages.length - 1];
        const hasReply = t.messages.some((m) => m.from !== perspective);
        return (
          <button
            key={t.id}
            onClick={() => onOpen(t)}
            className="w-full text-left flex flex-col gap-2 px-4 py-4 transition-all active:scale-[0.99]"
            style={{
              background: "rgba(255,255,255,0.06)",
              border: hasReply
                ? "1px solid rgba(var(--phase-accent-rgb,4,201,244),0.22)"
                : "1px solid rgba(255,255,255,0.10)",
              borderRadius: "16px",
            }}
          >
            <div className="flex items-center justify-between">
              <span className="font-display text-[11px] uppercase tracking-[0.2em]" style={{ color: "var(--phase-accent,#04C9F4)" }}>
                → {t.confessionRef}
              </span>
              <div className="flex items-center gap-2">
                {hasReply && (
                  <span className="text-[9px] uppercase tracking-[0.14em] px-2 py-0.5 rounded-full" style={{ background: "rgba(var(--phase-accent-rgb,4,201,244),0.12)", color: "var(--phase-accent,#04C9F4)" }}>
                    Reply
                  </span>
                )}
                <span className="text-[9.5px] uppercase tracking-[0.14em]" style={{ color: STATUS_COLOR[t.status] }}>
                  {STATUS_LABEL[t.status]}
                </span>
              </div>
            </div>
            <p className="text-[13px] leading-relaxed text-cc-off/55 font-light line-clamp-2">{last?.content}</p>
            <span className="text-[10px] text-cc-off/20 uppercase tracking-[0.12em]">
              {t.messages.length} {t.messages.length === 1 ? "message" : "messages"} · {new Date(t.lastActivity).toLocaleDateString("en-GB", { day: "numeric", month: "short" })}
            </span>
          </button>
        );
      })}
    </div>
  );
}

// ─── Main page ─────────────────────────────────────────────────────────────────

type Tab = "new" | "inbox";

function ReachPage() {
  const { threadId, ref, body } = Route.useSearch();
  const navigate = useNavigate();

  const [tab, setTab]             = useState<Tab>(threadId ? "inbox" : "new");
  const [threads, setThreads]     = useState<Thread[]>([]);
  const [activeThread, setActiveThread] = useState<Thread | null>(null);
  const [myAnonId, setMyAnonId]   = useState("");

  useEffect(() => {
    const id = getOrCreateAnonId();
    setMyAnonId(id);
    const all = loadThreads();
    setThreads(all);

    // Came from Track — find or create confessor thread
    if (threadId) {
      const found = all.find((t) => t.id === threadId);
      if (found) {
        setActiveThread(found);
      } else if (ref) {
        // Create a stub thread for the confessor, seeded with the original message
        const firstMsg: ThreadMsg | undefined = body ? {
          id: "tmsg_seed_" + threadId,
          from: "sender",
          content: body,
          sentAt: new Date(Date.now() - 60000).toISOString(),
        } : undefined;
        const stub: Thread = {
          id: threadId,
          confessionRef: ref.toUpperCase(),
          anonId: "anon_sender_" + threadId, // not the confessor's ID — keeps perspective correct
          messages: firstMsg ? [firstMsg] : [],
          lastActivity: new Date().toISOString(),
          status: "delivered",
        };
        upsertThread(stub);
        setThreads(loadThreads());
        setActiveThread(stub);
      }
      setTab("inbox");
    }
  }, []);

  function handleSent(thread: Thread) {
    setThreads(loadThreads());
    setActiveThread(thread);
    setTab("inbox");
  }

  function handleUpdated(thread: Thread) {
    setThreads(loadThreads());
    setActiveThread(thread);
  }

  function handleOpen(thread: Thread) {
    setActiveThread(thread);
    // Clear URL params so back button feels clean
    navigate({ to: "/reach", search: { threadId: undefined, ref: undefined, body: undefined } });
  }

  function handleBack() {
    setActiveThread(null);
  }

  const perspective: Sender = activeThread
    ? (activeThread.anonId === myAnonId ? "sender" : "confessor")
    : "sender";

  const inboxCount = threads.filter((t) => t.messages.some((m) => m.from !== (t.anonId === myAnonId ? "sender" : "confessor"))).length;

  return (
    <div className="flex flex-col gap-5 py-2">

      {/* Header */}
      <div className="space-y-1">
        <div className="text-[10px] uppercase tracking-[0.28em] text-cc-off/30">— Anonymous · Reviewed before delivery</div>
        <h1 className="font-display text-[2rem] uppercase text-cc-off leading-tight">
          Let them know<br />someone heard.
        </h1>
      </div>

      {/* Thread open → full thread view */}
      {activeThread ? (
        <ThreadView
          thread={activeThread}
          perspective={perspective}
          onBack={handleBack}
          onUpdated={handleUpdated}
          onDeleted={(id) => {
            setThreads((prev) => prev.filter((t) => t.id !== id));
            setActiveThread(null);
          }}
        />
      ) : (
        <>
          {/* Tab switcher */}
          <div className="flex gap-1 p-1" style={{ background: "rgba(255,255,255,0.06)", border: "1px solid rgba(255,255,255,0.10)", borderRadius: "12px" }}>
            {(["new", "inbox"] as Tab[]).map((t) => (
              <button
                key={t}
                onClick={() => setTab(t)}
                className="flex-1 flex items-center justify-center gap-2 py-2.5 text-[10.5px] uppercase tracking-[0.16em] font-semibold transition-all"
                style={{
                  borderRadius: "9px",
                  background: tab === t ? "rgba(255,255,255,0.10)" : "transparent",
                  color: tab === t ? "rgba(242,242,242,0.85)" : "rgba(242,242,242,0.25)",
                  border: tab === t ? "1px solid rgba(255,255,255,0.14)" : "1px solid transparent",
                }}
              >
                {t === "new" ? <MessageSquarePlus size={13} /> : <Inbox size={13} />}
                {t === "new" ? "New Message" : `Inbox${inboxCount > 0 ? ` · ${inboxCount}` : threads.length > 0 ? ` (${threads.length})` : ""}`}
              </button>
            ))}
          </div>

          {tab === "new"
            ? <NewMessageTab onSent={handleSent} />
            : <InboxTab threads={threads} myAnonId={myAnonId} onOpen={handleOpen} />
          }
        </>
      )}

    </div>
  );
}
