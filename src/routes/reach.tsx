import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useTranslation } from "../lib/i18n";
import { useState, useEffect, useRef } from "react";
import { createPortal } from "react-dom";
import { Send, ShieldCheck, Inbox, SquarePen, ArrowLeft, Trash2, TriangleAlert } from "lucide-react";
import { getOrCreateAnonId } from "../lib/anonIdentity";
import { createThread, replyToThread, getThreads, deleteThread, blockSender, markConfessorOpened, reactToMessage, getDailyOutreachCount } from "../lib/reachOut";
import type { RemoteThread } from "../lib/reachOut";

export const Route = createFileRoute("/reach")({
  validateSearch: (search: Record<string, unknown>) => ({
    threadId:     typeof search.threadId     === "string" ? search.threadId     : undefined,
    ref:          typeof search.ref          === "string" ? search.ref          : undefined,
    body:         typeof search.body         === "string" ? search.body         : undefined,
    senderAnonId: typeof search.senderAnonId === "string" ? search.senderAnonId : undefined,
    new:          search.new ? "1" as const : undefined,
    serial:       search.serial != null ? String(search.serial) : undefined,
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
  reactions: Record<string, string[]>;
}

interface Thread {
  id: string;
  confessionRef: string;  // stores the serial number as a string
  anonId: string;          // sender_anon_id
  confessorAnonId: string | null;
  messages: ThreadMsg[];
  lastActivity: string;
  lastReactedMessageId: string | null;
  createdAt: string;
  status: "pending" | "delivered" | "rejected";
}

// ─── Helpers ───────────────────────────────────────────────────────────────────

function genRef(): string {
  const c = "ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789";
  return Array.from({ length: 8 }, () => c[Math.floor(Math.random() * c.length)]).join("");
}

function genId(): string {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
}

function formatMsgTime(iso: string): string {
  const d = new Date(iso);
  const now = new Date();
  const diffMs = now.getTime() - d.getTime();
  const diffDays = Math.floor(diffMs / 86_400_000);
  if (diffDays === 0) return d.toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" });
  if (diffDays < 7)   return d.toLocaleDateString("en-GB", { weekday: "short" });
  return d.toLocaleDateString("en-GB", { day: "numeric", month: "short" });
}

// For message bubbles: time first, date context for older messages
function formatBubbleTime(iso: string): string {
  const d = new Date(iso);
  const now = new Date();
  const time = d.toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" });
  const isToday = d.toDateString() === now.toDateString();
  if (isToday) return time;
  const yesterday = new Date(now);
  yesterday.setDate(yesterday.getDate() - 1);
  if (d.toDateString() === yesterday.toDateString()) return `Yesterday · ${time}`;
  return `${d.toLocaleDateString("en-GB", { day: "numeric", month: "short" })} · ${time}`;
}

export function remoteToLocal(t: RemoteThread): Thread {
  return {
    id: t.id,
    confessionRef: String(t.confessionSerialNum),
    anonId: t.senderAnonId,
    confessorAnonId: t.confessorAnonId,
    messages: t.messages.map((m) => ({
      id: m.id,
      from: m.fromRole,
      content: m.content,
      sentAt: m.sentAt,
      reactions: m.reactions ?? {},
    })),
    lastActivity: t.lastActivity,
    lastReactedMessageId: t.lastReactedMessageId,
    createdAt: t.createdAt,
    status: t.status,
  };
}

function anonInitials(id: string): string {
  if (!id || id.startsWith("anon_sender_")) return "?";
  const caps = id.replace(/[^A-Z]/g, "");
  return caps.slice(0, 2) || id.slice(0, 2).toUpperCase();
}

function resolvedConfessorAnon(thread: Thread, myAnonId: string): string | null {
  if (thread.confessorAnonId) return thread.confessorAnonId;
  // If I'm the confessor and haven't replied yet, I still know my own anonId
  if (thread.anonId !== myAnonId) return myAnonId;
  return null;
}

// ─── Reach thread cache ────────────────────────────────────────────────────────

const REACH_CACHE_KEY = "cc_reach_threads";
const REACH_SEEN_KEY  = "cc_reach_thread_seen"; // Record<threadId, sentAt of last seen msg from other party>

export function saveReachCache(threads: Thread[]): void {
  try { localStorage.setItem(REACH_CACHE_KEY, JSON.stringify(threads)); } catch { /* storage full */ }
}

export function loadReachCache(): Thread[] {
  try {
    const raw = localStorage.getItem(REACH_CACHE_KEY);
    return raw ? (JSON.parse(raw) as Thread[]) : [];
  } catch { return []; }
}

// seen = ISO timestamp of when user last opened this thread (their local clock)
function markThreadSeen(threadId: string): void {
  try {
    const raw = localStorage.getItem(REACH_SEEN_KEY);
    const map: Record<string, string> = raw ? JSON.parse(raw) : {};
    map[threadId] = new Date().toISOString();
    localStorage.setItem(REACH_SEEN_KEY, JSON.stringify(map));
    window.dispatchEvent(new CustomEvent("cc:thread-seen"));
  } catch { /* storage full */ }
}

function getThreadSeen(threadId: string): string | null {
  try {
    const raw = localStorage.getItem(REACH_SEEN_KEY);
    const map: Record<string, string> = raw ? JSON.parse(raw) : {};
    return map[threadId] ?? null;
  } catch { return null; }
}

function isThreadUnread(thread: Thread, myAnonId: string): boolean {
  const perspective: Sender = thread.anonId === myAnonId ? "sender" : "confessor";
  const otherMsgs = thread.messages.filter((m) => m.from !== perspective);
  const lastMsg = thread.messages[thread.messages.length - 1];
  const lastMsgSentAt = lastMsg?.sentAt ?? "";
  const lastMsgIsOwn = lastMsg?.from === perspective;
  // Only count lastActivity as reaction activity if the last message isn't ours
  // (prevents server-time skew from flipping back to unread after we send)
  const hasReactionActivity = !lastMsgIsOwn && thread.lastActivity > lastMsgSentAt;
  if (otherMsgs.length === 0 && !hasReactionActivity) return false;
  const seen = getThreadSeen(thread.id);
  if (!seen) return true;
  const lastOtherSentAt = otherMsgs[otherMsgs.length - 1]?.sentAt ?? "";
  const activityUnread = !lastMsgIsOwn && thread.lastActivity > seen;
  return lastOtherSentAt > seen || activityUnread;
}

// ─── Quick messages ────────────────────────────────────────────────────────────

type MessageType = "support" | "relate" | "admiration" | "advice" | "gratitude" | "criticism";


// ─── Thread view ───────────────────────────────────────────────────────────────

function ThreadView({ thread, perspective, myAnonId, onBack, onUpdated, onDeleted }: {
  thread: Thread;
  perspective: Sender;
  myAnonId: string;
  onBack: () => void;
  onUpdated: (t: Thread) => void;
  onDeleted: (id: string) => void;
}) {
  const { t } = useTranslation();
  const REACTION_EMOJIS = ["❤️", "😢", "🤗", "😮", "🙏", "✨"];
  const PAGE_SIZE = 30;
  const [reply, setReply] = useState("");
  const [sendError, setSendError] = useState("");
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [copied, setCopied] = useState(false);
  const [visibleCount, setVisibleCount] = useState(PAGE_SIZE);
  const [pickerMsgId, setPickerMsgId] = useState<string | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const isFirstMount = useRef(true);
  const prevMsgCount = useRef(thread.messages.length);

  function copyRef() {
    navigator.clipboard.writeText(thread.id).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    });
  }

  // Mark thread seen immediately when view opens — covers deep-link and inbox opens
  useEffect(() => {
    markThreadSeen(thread.id);
  }, []);

  // Fire-and-forget: set confessor_anon_id when confessor opens thread (before replying)
  useEffect(() => {
    if (perspective === "confessor" && !thread.confessorAnonId) {
      (markConfessorOpened as unknown as (o: { data: unknown }) => Promise<void>)(
        { data: { threadId: thread.id, anonId: myAnonId } } as never
      ).catch(() => {});
    }
  }, []);

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const newMsgAdded = thread.messages.length > prevMsgCount.current;
    prevMsgCount.current = thread.messages.length;
    if (isFirstMount.current) {
      el.scrollTop = el.scrollHeight; // instant — no visible scroll-from-top
      isFirstMount.current = false;
    } else if (newMsgAdded) {
      el.scrollTo({ top: el.scrollHeight, behavior: "smooth" });
    }
  }, [thread.messages]);

  const displayMessages = thread.messages.slice(-visibleCount);
  const hasMore = thread.messages.length > visibleCount;

  async function send() {
    if (!reply.trim()) return;
    setSendError("");
    const messageId = genId();
    const newMsg: ThreadMsg = {
      id: messageId,
      from: perspective,
      content: reply.trim(),
      sentAt: new Date().toISOString(),
      reactions: {},
    };
    const originalThread = thread;
    const updated: Thread = {
      ...thread,
      messages: [...thread.messages, newMsg],
      lastActivity: newMsg.sentAt,
    };
    onUpdated(updated);
    markThreadSeen(thread.id);
    setReply("");

    const res = await (replyToThread as unknown as (opts: { data: unknown }) => Promise<{ success: true } | { success: false; error: string }>)({ data: {
      threadId: thread.id,
      fromRole: perspective,
      messageId,
      content: newMsg.content,
      anonId: myAnonId,
    } } as never).catch(() => ({ success: false as const, error: "network" }));

    if (!res.success && res.error === "rate_limited") {
      onUpdated(originalThread);
      setReply(newMsg.content);
      setSendError(t("reach.rateError"));
    }
  }

  const otherLabel = perspective === "sender" ? t("reach.confessor") : t("reach.them");
  const confessorHasReplied = thread.messages.some((m) => m.from === "confessor");
  const senderLocked = perspective === "sender" && !confessorHasReplied;

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
      <div className="flex items-center justify-between gap-2">
        {/* Left: back + other person's identity */}
        <div className="flex items-center gap-3 min-w-0">
          <button onClick={onBack} className="text-cc-off/30 hover:text-cc-off/70 transition-colors shrink-0">
            <ArrowLeft size={18} strokeWidth={1.8} />
          </button>
          <div className="flex flex-col gap-0.5 min-w-0">
            <span
              className="text-[13px] font-medium truncate"
              style={{ color: "rgba(242,242,242,0.90)" }}
            >
              {perspective === "sender"
                ? (resolvedConfessorAnon(thread, myAnonId) ?? "···")
                : thread.anonId}
            </span>
            <span
              className="text-[10px]"
              style={{ color: "rgba(242,242,242,0.45)" }}
            >
              {t("reach.reachOutTo")}{thread.confessionRef}
            </span>
          </div>
        </div>

        {/* Right: convo ref + delete */}
        <div className="flex items-center gap-2 shrink-0">
          <button
            onClick={copyRef}
            className="font-mono text-[9px] transition-colors px-2 py-1 rounded"
            style={{
              color: copied ? "var(--phase-accent,#04C9F4)" : "rgba(242,242,242,0.22)",
              background: "rgba(255,255,255,0.04)",
              border: "1px solid rgba(255,255,255,0.08)",
            }}
            title="Copy convo ref"
          >
            {copied ? "Copied" : thread.id}
          </button>
          <button
            onClick={() => setConfirmDelete(true)}
            className="text-cc-off/20 hover:text-red-400/60 transition-colors p-1"
          >
            <Trash2 size={15} strokeWidth={1.8} />
          </button>
        </div>
      </div>

      {/* Delete confirmation modal */}
      {confirmDelete && (
        <div
          className="rounded-2xl p-5 space-y-4"
          style={{ background: "rgba(10,12,16,0.92)", border: "1px solid rgba(220,60,60,0.18)", backdropFilter: "blur(16px)" }}
        >
          <div className="space-y-1">
            <p className="text-[13px] font-medium" style={{ color: "rgba(242,242,242,0.80)" }}>{t("reach.deleteConvo")}</p>
            {perspective === "confessor" && (
              <p className="text-[11px] leading-relaxed" style={{ color: "rgba(242,242,242,0.35)" }}>
                {t("reach.blockNote")}
              </p>
            )}
          </div>
          <div className="flex flex-col gap-2">
            <button
              onClick={() => {
                setConfirmDelete(false);
                onDeleted(thread.id);
                (deleteThread as unknown as (o: { data: unknown }) => Promise<unknown>)({ data: { threadId: thread.id, anonId: myAnonId } } as never).catch(() => {});
              }}
              className="w-full py-3 text-[11px] uppercase tracking-[0.16em] rounded-xl transition-all active:scale-[0.98]"
              style={{ background: "rgba(255,255,255,0.06)", border: "1px solid rgba(255,255,255,0.10)", color: "rgba(242,242,242,0.55)" }}
            >
              Delete
            </button>
            {perspective === "confessor" && (
              <button
                onClick={() => {
                  setConfirmDelete(false);
                  (blockSender as unknown as (o: { data: unknown }) => Promise<unknown>)({ data: {
                    senderAnonId: thread.anonId,
                    confessionSerialNum: Number(thread.confessionRef),
                  } } as never).catch(() => {});
                }}
                className="w-full py-3 text-[11px] uppercase tracking-[0.16em] font-semibold rounded-xl transition-all active:scale-[0.98]"
                style={{ background: "rgba(220,60,60,0.18)", border: "1px solid rgba(220,60,60,0.35)", color: "rgba(220,80,80,0.95)" }}
              >
                Block
              </button>
            )}
            <button
              onClick={() => setConfirmDelete(false)}
              className="w-full py-2 text-[10px] uppercase tracking-[0.14em] transition-colors"
              style={{ color: "rgba(242,242,242,0.25)" }}
            >
              Cancel
            </button>
          </div>
        </div>
      )}

      {/* Messages */}
      <div ref={containerRef} className="flex flex-col gap-3 overflow-y-auto" style={{ scrollbarWidth: "none", maxHeight: "42dvh" }}>
        {hasMore && (
          <button
            onClick={() => setVisibleCount((v) => v + PAGE_SIZE)}
            className="self-center text-[10px] uppercase tracking-[0.14em] px-4 py-1.5 rounded-full transition-colors"
            style={{ color: "rgba(242,242,242,0.30)", border: "1px solid rgba(255,255,255,0.10)", background: "rgba(255,255,255,0.04)" }}
          >
            {t("reach.loadEarlier")}
          </button>
        )}
        {displayMessages.map((m) => {
          const isMine = m.from === perspective;
          const pickerOpen = pickerMsgId === m.id;
          const reactionEntries = Object.entries(m.reactions ?? {}).filter(([, ids]) => ids.length > 0);

          function handleReact(emoji: string) {
            setPickerMsgId(null);
            const updated = { ...m.reactions };
            const current = updated[emoji] ?? [];
            if (current.includes(myAnonId)) {
              const next = current.filter((id) => id !== myAnonId);
              if (next.length === 0) delete updated[emoji]; else updated[emoji] = next;
            } else {
              updated[emoji] = [...current, myAnonId];
            }
            onUpdated({
              ...thread,
              messages: thread.messages.map((msg) => msg.id === m.id ? { ...msg, reactions: updated } : msg),
            });
            (reactToMessage as unknown as (o: { data: unknown }) => Promise<unknown>)(
              { data: { messageId: m.id, threadId: thread.id, emoji, anonId: myAnonId } } as never
            ).then(() => window.dispatchEvent(new CustomEvent("cc:reaction"))).catch(() => {});
          }

          return (
            <div key={m.id} className={`flex flex-col gap-1 ${isMine ? "items-end" : "items-start"}`}>
              {/* Emoji picker */}
              {pickerOpen && (
                <div
                  className={`flex items-center gap-1 px-2 py-1.5 rounded-2xl mb-0.5 ${isMine ? "self-end" : "self-start"}`}
                  style={{ background: "rgba(30,25,22,0.92)", border: "1px solid rgba(255,255,255,0.10)", backdropFilter: "blur(12px)" }}
                >
                  {REACTION_EMOJIS.map((emoji) => {
                    const reacted = (m.reactions[emoji] ?? []).includes(myAnonId);
                    return (
                      <button
                        key={emoji}
                        onClick={() => handleReact(emoji)}
                        className="text-[18px] transition-transform active:scale-110 rounded-full px-1"
                        style={{ background: reacted ? "rgba(var(--phase-accent-rgb,4,201,244),0.15)" : "transparent" }}
                      >
                        {emoji}
                      </button>
                    );
                  })}
                </div>
              )}

              {/* Bubble */}
              <div
                className="px-4 py-3 text-[13px] leading-[1.7] font-light max-w-[85%] cursor-pointer select-none"
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
                onClick={() => setPickerMsgId(pickerOpen ? null : m.id)}
              >
                {m.content}
              </div>

              {/* Reactions display */}
              {reactionEntries.length > 0 && (
                <div className={`flex items-center gap-1 flex-wrap px-1 ${isMine ? "justify-end" : "justify-start"}`}>
                  {reactionEntries.map(([emoji, ids]) => {
                    const reacted = ids.includes(myAnonId);
                    return (
                      <button
                        key={emoji}
                        onClick={() => handleReact(emoji)}
                        className="flex items-center gap-0.5 px-1.5 py-0.5 rounded-full text-[11px] transition-all"
                        style={{
                          background: reacted ? "rgba(var(--phase-accent-rgb,4,201,244),0.15)" : "rgba(255,255,255,0.07)",
                          border: reacted ? "1px solid rgba(var(--phase-accent-rgb,4,201,244),0.30)" : "1px solid rgba(255,255,255,0.10)",
                        }}
                      >
                        <span>{emoji}</span>
                        {ids.length > 1 && <span style={{ color: "rgba(242,242,242,0.45)", fontSize: "10px" }}>{ids.length}</span>}
                      </button>
                    );
                  })}
                </div>
              )}

              <div className="flex items-center gap-1.5 px-1">
                <span className="text-[9px] uppercase tracking-[0.12em] text-cc-off/20">
                  {isMine ? t("reach.you") : otherLabel}
                </span>
                <span className="text-cc-off/15 text-[9px]">·</span>
                <span className="text-[9px] text-cc-off/20">
                  {formatBubbleTime(m.sentAt)}
                </span>
              </div>
            </div>
          );
        })}
      </div>

      {/* Reply box — locked until confessor replies */}
      {senderLocked ? (
        <div
          className="flex items-center justify-center gap-2 py-4 px-4"
          style={{
            background: "rgba(255,255,255,0.04)",
            border: "1px solid rgba(255,255,255,0.08)",
            borderRadius: "16px",
          }}
        >
          <span className="text-[11px] uppercase tracking-[0.16em]" style={{ color: "rgba(242,242,242,0.25)" }}>
            {t("reach.waitingReply")}
          </span>
        </div>
      ) : (
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
            onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); send(); } }}
            placeholder={t("reach.writeReply")}
            rows={3}
            className="w-full bg-transparent text-cc-off placeholder:text-cc-off/20 text-[13.5px] leading-[1.75] p-4 resize-none focus:outline-none font-light"
          />
          <div
            className="flex items-center justify-between px-4 pb-3"
            style={{ borderTop: "1px solid rgba(255,255,255,0.06)" }}
          >
            <span className="text-[9.5px] uppercase tracking-[0.14em] text-cc-off/18">{t("reach.anonymousReviewed")}</span>
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
      )}

      {sendError && (
        <p className="text-[11px] text-red-400/70 text-center px-1">{sendError}</p>
      )}

    </div>
  );
}

// ─── New message tab ───────────────────────────────────────────────────────────

function NewMessageTab({ onSent, prefilledSerial, reachLimitHit, reachDailyUsed = 0 }: { onSent: (t: Thread) => void; prefilledSerial?: string; reachLimitHit?: boolean; reachDailyUsed?: number }) {
  const { t, ta } = useTranslation();

  const MESSAGE_TYPES: { key: MessageType; label: string }[] = [
    { key: "support",    label: t("reach.typeSupport")    },
    { key: "relate",     label: t("reach.typeRelate")     },
    { key: "admiration", label: t("reach.typeAdmiration") },
    { key: "advice",     label: t("reach.typeAdvice")     },
    { key: "gratitude",  label: t("reach.typeGratitude")  },
    { key: "criticism",  label: t("reach.typeCriticism")  },
  ];

  const QUICK: Record<MessageType, string[]> = {
    support:    ta("reach.quick_support"),
    relate:     ta("reach.quick_relate"),
    admiration: ta("reach.quick_admiration"),
    advice:     ta("reach.quick_advice"),
    gratitude:  ta("reach.quick_gratitude"),
    criticism:  ta("reach.quick_criticism"),
  };

  const [refId, setRefId]   = useState(prefilledSerial ?? "");
  const [msg, setMsg]       = useState("");
  const [email, setEmail]   = useState("");
  const [type, setType]     = useState<MessageType>("support");
  const [sending, setSending] = useState(false);
  const [error, setError]   = useState("");
  const [showRulesModal, setShowRulesModal] = useState(false);
  useEffect(() => { setShowRulesModal(true); }, []);

  const canSend = /^\d+$/.test(refId.trim()) && msg.trim().length >= 4;

  async function send() {
    if (!canSend || sending) return;
    setSending(true);
    setError("");

    const anonId = getOrCreateAnonId();
    const conversationRef = genRef();
    const messageId = genId();
    const now = new Date().toISOString();
    const firstMsg: ThreadMsg = {
      id: messageId,
      from: "sender",
      content: msg.trim(),
      sentAt: now,
      reactions: {},
    };
    const thread: Thread = {
      id: conversationRef,
      confessionRef: refId.trim(),
      anonId,
      confessorAnonId: null,
      messages: [firstMsg],
      lastActivity: now,
      createdAt: now,
      lastReactedMessageId: null,
      status: "pending",
    };

    try {
      const res = await (createThread as unknown as (opts: { data: unknown }) => Promise<{ success: boolean; existingThreadId?: string; error?: string }>)({ data: {
        conversationRef,
        confessionSerialNum: Number(refId.trim()),
        senderAnonId: anonId,
        messageId,
        message: msg.trim(),
        type,
        senderEmail: email.trim(),
      } });
      if (!res.success) {
        if (res.error === "rate_limited") throw new Error(t("reach.rateError"));
        if (res.error === "blocked") throw new Error(t("reach.blockedError"));
        throw new Error(res.error);
      }

      if (res.existingThreadId) {
        // Active thread already exists — fetch threads and open the existing one
        const remote = await (getThreads as unknown as (o: { data: { anonId: string } }) => Promise<RemoteThread[]>)({ data: { anonId } } as never);
        const mapped = remote.map(remoteToLocal);
        const existing = mapped.find((t) => t.id === res.existingThreadId);
        if (existing) { onSent(existing); return; }
      }

      onSent(thread);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong. Try again.");
      setSending(false);
    }
  }

  function selectType(t: MessageType) {
    if (!QUICK[t].includes(msg)) setMsg("");
    setType(t);
  }



  return (
    <>
      {showRulesModal && createPortal(
        <div
          className="fixed inset-0 z-[9999] flex items-center justify-center px-4"
          style={{ background: "rgba(5,6,6,0.75)", backdropFilter: "blur(8px)" }}
          onClick={() => setShowRulesModal(false)}
        >
          <div
            className="w-full max-w-md rounded-2xl p-5 flex flex-col gap-4"
            style={{ background: "rgba(18,18,22,0.98)", border: "1px solid rgba(255,255,255,0.10)" }}
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center gap-2.5">
              <TriangleAlert size={15} strokeWidth={2} style={{ color: "rgba(251,191,36,0.8)" }} className="shrink-0" />
              <span className="text-[13px] font-display uppercase tracking-[0.16em]" style={{ color: "rgba(242,242,242,0.7)" }}>
                {t("reach.rulesTitle")}
              </span>
            </div>
            <ul className="flex flex-col gap-1.5 text-[12.5px] leading-relaxed list-none" style={{ color: "rgba(242,242,242,0.45)" }}>
              {ta("reach.rules_en").map((r, i) => <li key={i}>{r}</li>)}
            </ul>
            <div style={{ borderTop: "1px solid rgba(255,255,255,0.07)" }} />
            <ul className="flex flex-col gap-1.5 text-[12.5px] leading-relaxed list-none text-right" style={{ color: "rgba(242,242,242,0.35)", direction: "rtl" }}>
              <li>✕ ممنوع طلبات المواعدة أو العلاقات العاطفية</li>
              <li>✕ ممنوع طلبات الخطبة أو الزواج</li>
              <li>✕ ممنوع التحرش والتنمر والإهانة</li>
              <li>✕ ممنوع أي محتوى مسيء أو غير لائق</li>
            </ul>
            <button
              onClick={() => setShowRulesModal(false)}
              className="w-full py-3.5 rounded-xl text-[13px] font-display uppercase tracking-[0.16em] transition-all active:scale-[0.98]"
              style={{ background: "rgba(251,191,36,0.15)", color: "rgba(251,191,36,0.85)", border: "1px solid rgba(251,191,36,0.25)" }}
            >
              {t("reach.rulesUnderstood")}
            </button>
            <p className="text-center text-[10px]" style={{ color: "rgba(242,242,242,0.2)" }}>
              {t("reach.rulesBan")}{" "}
              <span style={{ direction: "rtl", display: "inline" }}>{t("reach.rulesBanAr")}</span>
            </p>
          </div>
        </div>,
        document.body
      )}

      <div className="flex flex-col gap-5">
        <div
          className="flex items-center gap-2 px-3 py-2 rounded-xl"
          style={{ background: "rgba(251,191,36,0.06)", border: "1px solid rgba(251,191,36,0.14)" }}
        >
          <TriangleAlert size={11} strokeWidth={2} className="shrink-0" style={{ color: "rgba(251,191,36,0.5)" }} />
          <p className="text-[10.5px] leading-snug" style={{ color: "rgba(242,242,242,0.35)" }}>
            {t("reach.noDating")}{" "}
            <span style={{ color: "rgba(251,191,36,0.55)" }}>{t("reach.behave")}</span>
          </p>
        </div>

      <div className="flex flex-col gap-1.5">
        <input
          value={refId}
          onChange={(e) => setRefId(e.target.value)}
          placeholder={t("reach.confessionNumber")}
          className="w-full bg-transparent text-cc-off placeholder:text-cc-off/25 px-4 py-3.5 font-display tracking-widest text-[14px] focus:outline-none"
          style={{
            background: "rgba(255,255,255,0.10)",
            border: refId.trim().length >= 1 ? "1px solid rgba(var(--phase-accent-rgb,4,201,244),0.4)" : "1px solid rgba(255,255,255,0.16)",
            borderRadius: "14px",
            backdropFilter: "blur(14px)",
            transition: "border-color 0.3s ease",
          }}
        />
        <p className="text-[10.5px] text-cc-off/30 px-1">The number at the beginning of every confession — e.g. <span style={{ color: "rgba(242,242,242,0.45)" }}>#1042</span></p>
      </div>

      {/* Message area */}
      <div style={{ background: "rgba(255,255,255,0.10)", border: "1px solid rgba(255,255,255,0.16)", borderRadius: "18px", backdropFilter: "blur(14px)", overflow: "hidden" }}>
        {/* Suggestions title + type selector */}
        <div className="flex flex-col gap-2 px-4 pt-3 pb-1">
          <div className="flex items-center justify-between">
            <span className="text-[9.5px] uppercase tracking-[0.18em] text-cc-off/20">{t("reach.suggestions")}</span>
            <span className="text-[9.5px] tracking-[0.08em]">
              <span style={{ color: reachLimitHit ? "rgba(248,113,113,0.7)" : "var(--phase-accent,#04C9F4)" }}>{reachDailyUsed}</span>
              <span style={{ color: "rgba(242,242,242,0.20)" }}> {t("reach.today")}</span>
            </span>
          </div>
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
        {reachLimitHit ? (
          <div className="flex flex-col items-center justify-center gap-2 py-8 px-6 text-center">
            <p className="text-[12.5px] leading-relaxed" style={{ color: "rgba(242,242,242,0.35)" }}>
              {t("reach.rateLimit1")}
            </p>
            <p className="text-[11px]" style={{ color: "rgba(242,242,242,0.22)" }}>{t("reach.rateLimit2")}</p>
          </div>
        ) : (
          <textarea
            value={msg}
            onChange={(e) => setMsg(e.target.value)}
            placeholder={t("reach.writeFeel")}
            rows={5}
            className="w-full bg-transparent text-cc-off placeholder:text-cc-off/20 text-[14px] leading-[1.75] p-4 resize-none focus:outline-none font-light"
          />
        )}
      </div>

      {/* Optional email */}
      <input
        type="email"
        value={email}
        onChange={(e) => setEmail(e.target.value)}
        placeholder={t("reach.emailOptional")}
        className="w-full bg-transparent text-cc-off/70 placeholder:text-cc-off/20 px-4 py-3 text-[13px] focus:outline-none font-light"
        style={{
          background: "rgba(255,255,255,0.06)",
          border: "1px solid rgba(255,255,255,0.10)",
          borderRadius: "12px",
        }}
      />

      {error && (
        <p className="text-[11px] text-red-400/70 text-center px-1">{error}</p>
      )}

      <button
        onClick={send}
        disabled={!canSend || sending || reachLimitHit}
        className="w-full flex items-center justify-between px-6 py-4 font-display uppercase tracking-[0.18em] text-[13px] transition-all active:scale-[0.98] disabled:cursor-not-allowed"
        style={{
          background: sending
            ? "rgba(var(--phase-accent-rgb,4,201,244),0.15)"
            : canSend
              ? "linear-gradient(135deg, var(--phase-accent,#04C9F4), rgba(var(--phase-accent-rgb,4,201,244),0.75))"
              : "rgba(255,255,255,0.06)",
          borderRadius: "14px",
          border: sending ? "1px solid rgba(var(--phase-accent-rgb,4,201,244),0.3)" : "none",
          color: sending
            ? "var(--phase-accent,#04C9F4)"
            : canSend
              ? "#050606"
              : "rgba(242,242,242,0.3)",
          opacity: !canSend && !sending ? 0.25 : 1,
          boxShadow: canSend && !sending ? "0 8px 24px -6px var(--phase-glow,rgba(4,201,244,0.35))" : "none",
          transition: "background 0.3s ease, box-shadow 0.3s ease, color 0.3s ease",
        }}
      >
        {sending ? t("reach.sending") : t("reach.sendMessage")}
        {sending
          ? <div className="w-4 h-4 rounded-full border-2 border-current/30 border-t-current animate-spin" />
          : <Send size={15} strokeWidth={2.4} />
        }
      </button>

      <div className="flex items-start gap-2.5 px-1">
        <ShieldCheck size={13} strokeWidth={1.8} className="text-cc-off/20 shrink-0 mt-0.5" />
        <p className="text-[11px] leading-relaxed" style={{ color: "rgba(242,242,242,0.18)" }}>
          {t("reach.safetyNote")}
        </p>
      </div>
    </div>
    </>
  );
}

// ─── Inbox tab ─────────────────────────────────────────────────────────────────


function InboxTab({ threads, myAnonId, onOpen }: {
  threads: Thread[];
  myAnonId: string;
  onOpen: (t: Thread) => void;
}) {
  const { t } = useTranslation();

  if (threads.length === 0) return (
    <div className="flex flex-col items-center text-center gap-4 py-16">
      <Inbox size={32} strokeWidth={1.4} className="text-cc-off/15" />
      <p className="text-[12px] uppercase tracking-[0.2em] text-cc-off/20">{t("reach.nothingHere")}</p>
    </div>
  );

  return (
    <div>
      {threads.map((thread, i) => {
        const perspective: Sender = thread.anonId === myAnonId ? "sender" : "confessor";
        const unread = isThreadUnread(thread, myAnonId);
        const last = thread.messages[thread.messages.length - 1];
        const lastFrom = last ? (last.from === perspective ? t("reach.you") : t("reach.them")) : null;
        const isReactionActivity = last && thread.lastActivity > last.sentAt && thread.lastReactedMessageId != null;
        const lastReactedMsg = isReactionActivity
          ? thread.messages.find((m) => m.id === thread.lastReactedMessageId) ?? null
          : null;
        const reactionEmojis = lastReactedMsg ? Object.keys(lastReactedMsg.reactions).join(" ") : null;

        return (
          <button
            key={thread.id}
            onClick={() => onOpen(thread)}
            className="w-full text-left flex items-center gap-3 px-4 py-3.5 transition-colors"
            style={{
              borderBottom: i < threads.length - 1 ? "1px solid rgba(255,255,255,0.06)" : "none",
            }}
          >
            {/* Avatar — sender's initials */}
            <div
              className="shrink-0 w-10 h-10 rounded-full flex items-center justify-center"
              style={{
                background: unread
                  ? "rgba(var(--phase-accent-rgb,4,201,244),0.22)"
                  : "rgba(255,255,255,0.10)",
              }}
            >
              <span
                className="font-display text-[11px] font-bold tracking-wide leading-none"
                style={{ color: unread ? "var(--phase-accent,#04C9F4)" : "rgba(242,242,242,0.55)" }}
              >
                {perspective === "sender"
                  ? anonInitials(resolvedConfessorAnon(thread, myAnonId) ?? myAnonId)
                  : anonInitials(thread.anonId)}
              </span>
            </div>

            {/* Content */}
            <div className="flex-1 min-w-0 flex flex-col gap-0.5">
              {/* Row 1: other person's anon ID + time */}
              <div className="flex items-baseline justify-between gap-2">
                <span className="text-[12px] truncate" style={{ color: "rgba(242,242,242,0.92)" }}>
                  {perspective === "sender"
                    ? (resolvedConfessorAnon(thread, myAnonId) ?? "···")
                    : thread.anonId}
                </span>
                <span
                  className="text-[10px] shrink-0 tabular-nums"
                  style={{ color: unread ? "var(--phase-accent,#04C9F4)" : "rgba(242,242,242,0.40)" }}
                >
                  {formatMsgTime(thread.lastActivity)}
                </span>
              </div>

              {/* Row 2: serial as subject */}
              <span className="text-[11px]" style={{ color: "rgba(242,242,242,0.85)" }}>
                {t("reach.reachOutTo")}{thread.confessionRef}
              </span>

              {/* Row 3: preview + unread dot */}
              <div className="flex items-center justify-between gap-2">
                <p
                  className={`text-[12px] truncate ${unread ? "font-normal" : "font-light"}`}
                  style={{ color: unread ? "rgba(242,242,242,0.95)" : "rgba(242,242,242,0.68)", fontWeight: unread ? 600 : 300 }}
                >
                  {isReactionActivity ? (
                    <>
                      <span style={{ color: unread ? "rgba(242,242,242,0.68)" : "rgba(242,242,242,0.45)" }}>
                        {reactionEmojis || "·"} to:{" "}
                      </span>
                      {lastReactedMsg?.content.slice(0, 40)}
                    </>
                  ) : (
                    <>
                      {lastFrom && (
                        <span style={{ color: unread ? "rgba(242,242,242,0.68)" : "rgba(242,242,242,0.45)" }}>
                          {lastFrom}:{" "}
                        </span>
                      )}
                      {last?.content}
                    </>
                  )}
                </p>
                {unread && (
                  <div
                    className="shrink-0 w-2 h-2 rounded-full"
                    style={{ background: "var(--phase-accent,#04C9F4)" }}
                  />
                )}
              </div>
            </div>
          </button>
        );
      })}
    </div>
  );
}

// ─── Main page ─────────────────────────────────────────────────────────────────

const CLEAR_SEARCH = { threadId: undefined, ref: undefined, body: undefined, senderAnonId: undefined, new: undefined, serial: undefined } as const;

function ReachPage() {
  const { t, lang } = useTranslation();
  const search    = Route.useSearch();
  const navigate  = useNavigate();

  const threadId     = search.threadId;
  const ref          = search.ref;
  const body         = search.body;
  const senderAnonId = search.senderAnonId;
  const isCompose    = search.new === "1";
  const serial       = search.serial;

  const [threads, setThreads]           = useState<Thread[]>([]);
  const [activeThread, setActiveThread] = useState<Thread | null>(null);
  const [myAnonId, setMyAnonId]         = useState("");
  const [loading, setLoading]           = useState(true);
  const [reachDailyUsed, setReachDailyUsed] = useState(0);

  // 15s refresh while on this page — updates both inbox and open thread
  useEffect(() => {
    if (!myAnonId) return;
    const id = setInterval(() => {
      (getThreads as unknown as (o: { data: { anonId: string } }) => Promise<RemoteThread[]>)({ data: { anonId: myAnonId } } as never)
        .then((remote) => {
          const mapped = remote.map(remoteToLocal);
          setThreads(mapped);
          saveReachCache(mapped);
          setActiveThread((prev) => {
            if (!prev) return prev;
            return mapped.find((t) => t.id === prev.id) ?? prev;
          });
        })
        .catch(() => {});
    }, 15_000);
    return () => clearInterval(id);
  }, [myAnonId]);

  useEffect(() => {
    const id = getOrCreateAnonId();
    setMyAnonId(id);

    // Load cache immediately — instant render, no spinner for returning users
    const cached = loadReachCache();
    if (cached.length > 0) {
      setThreads(cached);
      setLoading(false);
      if (threadId) {
        const found = cached.find((t) => t.id === threadId);
        if (found) setActiveThread(found);
      }
    }

    // Fetch daily outreach count in parallel — correct counter from first load
    (getDailyOutreachCount as unknown as (o: { data: { senderAnonId: string } }) => Promise<{ count: number }>)({ data: { senderAnonId: id } } as never)
      .then(({ count }) => setReachDailyUsed(count))
      .catch(() => {});

    // Fetch fresh data from Supabase in the background
    (getThreads as unknown as (o: { data: { anonId: string } }) => Promise<RemoteThread[]>)({ data: { anonId: id } } as never)
      .then((remote) => {
        const mapped = remote.map(remoteToLocal);
        setThreads(mapped);
        saveReachCache(mapped);

        if (threadId) {
          const found = mapped.find((t) => t.id === threadId);
          if (found) {
            setActiveThread(found);
          } else if (ref) {
            const firstMsg: ThreadMsg | undefined = body
              ? { id: "tmsg_seed_" + threadId, from: "sender", content: body, sentAt: new Date(Date.now() - 60000).toISOString(), reactions: {} }
              : undefined;
            const stub: Thread = {
              id: threadId,
              confessionRef: ref.toUpperCase(),
              anonId: senderAnonId ?? ("anon_sender_" + threadId),
              confessorAnonId: null,
              messages: firstMsg ? [firstMsg] : [],
              lastActivity: new Date().toISOString(),
              createdAt: new Date().toISOString(),
              lastReactedMessageId: null,
              status: "delivered",
            };
            const withStub = [stub, ...mapped];
            setThreads(withStub);
            saveReachCache(withStub);
            setActiveThread(stub);
          }
        }
      })
      .catch(() => {
        if (threadId && ref && cached.length === 0) {
          const firstMsg: ThreadMsg | undefined = body
            ? { id: "tmsg_seed_" + threadId, from: "sender", content: body, sentAt: new Date(Date.now() - 60000).toISOString(), reactions: {} }
            : undefined;
          const stub: Thread = {
            id: threadId,
            confessionRef: ref.toUpperCase(),
            anonId: senderAnonId ?? ("anon_sender_" + threadId),
            confessorAnonId: null,
            messages: firstMsg ? [firstMsg] : [],
            lastActivity: new Date().toISOString(),
            lastReactedMessageId: null,
            createdAt: new Date().toISOString(),
            status: "delivered",
          };
          setThreads([stub]);
          setActiveThread(stub);
        }
      })
      .finally(() => setLoading(false));
  }, []);

  const reachLimitHit = reachDailyUsed >= 3;

  function handleSent(thread: Thread) {
    setThreads((prev) => {
      const next = [thread, ...prev.filter(t => t.id !== thread.id)];
      saveReachCache(next);
      return next;
    });
    setReachDailyUsed((prev) => prev + 1);
    setActiveThread(thread);
    markThreadSeen(thread.id);
    navigate({ to: "/reach", search: CLEAR_SEARCH });
  }

  function handleUpdated(thread: Thread) {
    setThreads((prev) => {
      const next = prev.map((t) => t.id === thread.id ? thread : t);
      saveReachCache(next);
      return next;
    });
    setActiveThread(thread);
  }

  function handleOpen(thread: Thread) {
    markThreadSeen(thread.id);
    setActiveThread(thread);
    navigate({ to: "/reach", search: CLEAR_SEARCH });
  }

  function handleBack() {
    if (activeThread) markThreadSeen(activeThread.id);
    setActiveThread(null);
  }

  const perspective: Sender = activeThread
    ? (activeThread.anonId === myAnonId ? "sender" : "confessor")
    : "sender";

  // ── Thread view ──
  if (activeThread) {
    return (
      <div className="flex flex-col gap-5 py-2">
        <ThreadView
          thread={activeThread}
          perspective={perspective}
          myAnonId={myAnonId}
          onBack={handleBack}
          onUpdated={handleUpdated}
          onDeleted={(id) => {
            setThreads((prev) => {
              const next = prev.filter((t) => t.id !== id);
              saveReachCache(next);
              return next;
            });
            setActiveThread(null);
          }}
        />
      </div>
    );
  }

  // ── Compose view ──
  if (isCompose) {
    return (
      <div className="flex flex-col gap-5 py-2">

        <div className="space-y-1" dir={lang === "ar" ? "rtl" : "ltr"}>
          <div className="text-[10px] uppercase tracking-[0.28em] text-cc-off/30">{t("reach.heading1")}</div>
          <h1 className="font-display text-[2rem] uppercase text-cc-off leading-tight">
            {t("reach.heading2")}<br />{t("reach.heading3")}
          </h1>
        </div>

        <div
          className="rounded-2xl overflow-hidden"
          style={{
            background: "rgba(8,10,13,0.60)",
            border: "1px solid rgba(255,255,255,0.09)",
            backdropFilter: "blur(20px)",
            WebkitBackdropFilter: "blur(20px)",
          }}
        >
          <div
            className="flex items-center gap-3 px-4 py-3"
            style={{ borderBottom: "1px solid rgba(255,255,255,0.07)" }}
          >
            <button
              onClick={() => navigate({ to: "/reach", search: CLEAR_SEARCH })}
              className="text-cc-off/25 hover:text-cc-off/60 transition-colors"
            >
              <ArrowLeft size={16} strokeWidth={1.8} />
            </button>
            <span className="text-[9.5px] uppercase tracking-[0.2em] text-cc-off/25">{t("reach.newMessage")}</span>
          </div>
          <div className="p-3">
            <NewMessageTab prefilledSerial={serial} onSent={handleSent} reachLimitHit={reachLimitHit} reachDailyUsed={reachDailyUsed} />
          </div>
        </div>

      </div>
    );
  }

  // ── Inbox view ──
  return (
    <div className="flex flex-col gap-5 py-2">

      <div className="space-y-1" dir={lang === "ar" ? "rtl" : "ltr"}>
        <div className="text-[10px] uppercase tracking-[0.28em] text-cc-off/30">{t("reach.heading1")}</div>
        <h1 className="font-display text-[2rem] uppercase text-cc-off leading-tight">
          {t("reach.heading2")}<br />{t("reach.heading3")}
        </h1>
      </div>

      {/* Inbox panel */}
      <div
        className="rounded-2xl overflow-hidden"
        style={{
          background: "rgba(8,10,13,0.60)",
          border: "1px solid rgba(255,255,255,0.09)",
          backdropFilter: "blur(20px)",
          WebkitBackdropFilter: "blur(20px)",
        }}
      >
        {/* Panel header row */}
        <div
          className="flex items-center justify-between px-4 py-3"
          style={{ borderBottom: "1px solid rgba(255,255,255,0.07)" }}
        >
          <div className="flex items-center gap-2">
            <Inbox size={12} strokeWidth={1.8} className="text-cc-off/25" />
            <span className="text-[9.5px] uppercase tracking-[0.2em] text-cc-off/25">
              {threads.length > 0
                ? lang === "ar"
                  ? `${threads.length} ${t("reach.conversations")}`
                  : `${threads.length} conversation${threads.length === 1 ? "" : "s"}`
                : t("reach.inbox")}
            </span>
          </div>
          <button
            onClick={() => navigate({ to: "/reach", search: { ...CLEAR_SEARCH, new: "1" } })}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg transition-all active:scale-95"
            style={{
              background: "rgba(var(--phase-accent-rgb,4,201,244),0.08)",
              border: "1px solid rgba(var(--phase-accent-rgb,4,201,244),0.18)",
              color: "var(--phase-accent,#04C9F4)",
            }}
          >
            <SquarePen size={12} strokeWidth={2} />
            <span className="text-[9.5px] uppercase tracking-[0.14em] font-semibold">{t("reach.new")}</span>
          </button>
        </div>

        {/* Thread list */}
        <div style={{ minHeight: "55dvh" }}>
          {loading ? (
            <div className="flex items-center justify-center py-12">
              <div className="w-5 h-5 rounded-full border-2 border-cc-off/10 border-t-cc-off/40 animate-spin" />
            </div>
          ) : (
            <InboxTab threads={threads} myAnonId={myAnonId} onOpen={handleOpen} />
          )}
        </div>
      </div>

    </div>
  );
}
