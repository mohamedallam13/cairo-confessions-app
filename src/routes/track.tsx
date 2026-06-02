import { createFileRoute, useNavigate, useSearch, Link } from "@tanstack/react-router";
import { useState, useEffect, useCallback, useRef } from "react";
import { Search, Heart, MessageCircle, Clock, ExternalLink, X, Reply, Check, ChevronRight, ChevronLeft, Copy, ArrowRightLeft, Download } from "lucide-react";
import { fieldWithPadding } from "../lib/fieldStyles";
import { getOrCreateAnonId, getMyRefs, saveRefToProfile, isIngesting as checkIngesting, getIngestingRefs, getIngestionFailedRefs, getSnippet, saveSnippet, saveCardCache, getCardCache, getStatusCache, saveStatusCache, getAllStatusCache, getLastPolled, resetIdentity, clearIngestionFailed, clearIngesting, adoptSession, detectBrowser, getOriginBrowser, getBrowserDetails } from "../lib/anonIdentity";
import { pollTrackingStatuses, addAnonId, type ResolvedEntry } from "../lib/fetchTracking";
import { cancelConfession } from "../lib/cancelConfession";
import { createRecoveryToken, redeemRecoveryToken } from "../lib/recoveryToken";

export const Route = createFileRoute("/track")({
  validateSearch: (search: Record<string, unknown>) => ({
    t: typeof search.t === "string" ? search.t : undefined, // transfer token (direct link)
    recover: search.recover === "1" ? "1" : undefined,      // open recover modal directly
  }),
  head: () => ({
    meta: [
      { title: "My Confessions — Cairo Confessions" },
      { name: "description", content: "See where your confession is." },
    ],
  }),
  component: TrackPage,
});

// ─── Types ────────────────────────────────────────────────────────────────────

type StatusKey = "ingesting" | "pending" | "scheduled" | "posted" | "shadowed" | "rejected" | "canceled" | "skipped";

interface StatusEntry {
  status: StatusKey;
  rejectionReasons?: string;
  timestamp: string;
}

interface Confession {
  confession: string;
  timestamp: string;
}

interface IncomingMessage {
  id: string;
  time: string;
  body: string;
  anonId?: string;           // sender's anon ID — used to route reply back
  replied?: boolean;
  replyText?: string;
}

interface TrackResult {
  serialNum: string;
  status: StatusEntry[];       // newest-first
  ingesting?: boolean;         // true while sheet write is in-flight
  ingestionFailed?: boolean;   // sheet write succeeded, pipeline threw — self-heals on next poll
  link?: string;
  confessionsArray: Confession[];
  hearts: number;
  messages: IncomingMessage[];
}

// ─── Timeline ─────────────────────────────────────────────────────────────────

const STEPS = [
  { key: "ingesting", label: "Ingestion",  note: "Writing your confession to our records." },
  { key: "pending",   label: "In Review",  note: "A human is reading it." },
  { key: "scheduled", label: "Scheduled",  note: "Going live soon." },
  { key: "posted",    label: "Posted",     note: "The city can hear you." },
];

function resolvedStatus(raw: StatusKey): StatusKey {
  return raw === "shadowed" ? "posted" : raw;
}

function stepIndex(status: StatusKey): number {
  const s = resolvedStatus(status);
  if (s === "ingesting") return 0;
  if (s === "pending")   return 1;
  if (s === "scheduled") return 2;
  if (s === "posted")    return 3;
  return 0;
}

function isTerminal(status: StatusKey) {
  return status === "rejected" || status === "canceled" || status === "skipped";
}

// ─── Demo data ────────────────────────────────────────────────────────────────

const DEMO: Record<string, TrackResult> = {
  "CC-DEMO": {
    serialNum: "1042",
    status: [
      { status: "posted",    timestamp: new Date(Date.now() - 3600000).toISOString() },
      { status: "scheduled", timestamp: new Date(Date.now() - 7200000).toISOString() },
      { status: "pending",   timestamp: new Date(Date.now() - 10800000).toISOString() },
      { status: "ingesting", timestamp: new Date(Date.now() - 14400000).toISOString() },
    ],
    link: "https://facebook.com",
    confessionsArray: [
      { confession: "I drive past her balcony in Zamalek every Friday. She's been gone two years. I know I should stop. I don't want to.", timestamp: new Date(Date.now() - 14400000).toISOString() },
    ],
    hearts: 142,
    messages: [
      { id: "msg1", time: "2 days ago", body: "I read yours and felt less alone. Thank you for writing it.", anonId: "anon_demo1" },
      { id: "msg2", time: "5 hours ago", body: "Sending you all the warmth I have today.", anonId: "anon_demo2" },
    ],
  },
  "REJECTME": {
    serialNum: "1087",
    status: [
      { status: "rejected", rejectionReasons: "The confession contained content that could identify another person without their consent.", timestamp: new Date(Date.now() - 3600000).toISOString() },
      { status: "pending",   timestamp: new Date(Date.now() - 72000000).toISOString() },
      { status: "ingesting", timestamp: new Date(Date.now() - 86400000).toISOString() },
    ],
    confessionsArray: [
      { confession: "Demo rejection case.", timestamp: new Date(Date.now() - 86400000).toISOString() },
    ],
    hearts: 0,
    messages: [],
  },
  "CANCEL01": {
    serialNum: "1099",
    status: [
      { status: "pending",   timestamp: new Date(Date.now() - 1800000).toISOString() },
      { status: "ingesting", timestamp: new Date(Date.now() - 3600000).toISOString() },
    ],
    confessionsArray: [
      { confession: "Demo pending case — you can cancel this one.", timestamp: new Date(Date.now() - 3600000).toISOString() },
    ],
    hearts: 0,
    messages: [],
  },
  "INGEST01": {
    serialNum: "",
    ingesting: true,
    status: [],
    confessionsArray: [
      { confession: "Demo ingesting case — sheet write in progress.", timestamp: new Date().toISOString() },
    ],
    hearts: 0,
    messages: [],
  },
};



const POLL_INTERVAL_MS = 30 * 60 * 1000; // 30 minutes

function resolvedEntryToTrackResult(entry: ResolvedEntry): TrackResult {
  const statusArr = entry.status.length > 0
    ? entry.status.map((s) => ({ status: s.status as StatusKey, timestamp: s.timestamp, rejectionReasons: s.rejectionReasons }))
    : [{ status: "pending" as StatusKey, timestamp: entry.confessionsArray[0]?.timestamp ?? new Date().toISOString() }];
  return {
    serialNum: entry.serialNum,
    status: statusArr,
    confessionsArray: entry.confessionsArray,
    link: entry.link,
    hearts: 0,
    messages: [],
  };
}

function formatLastUpdated(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  return `${Math.floor(hrs / 24)}d ago`;
}

const REFNUM_RE = /^[A-Z0-9]{8}$/;
function isValidInput(s: string) {
  return REFNUM_RE.test(s) || s === "CC-DEMO" || s === "REJECTME" || s === "CANCEL01" || s === "INGEST01";
}

// ─── Messages tab ────────────────────────────────────────────────────────────

function MessageItem({ msg, confessionRef }: { msg: IncomingMessage; confessionRef: string }) {
  const navigate = useNavigate();
  const hasReplied = msg.replied ?? false;

  return (
    <div
      style={{
        ...fieldWithPadding,
        padding: "16px 20px",
        border: hasReplied
          ? "1px solid rgba(var(--phase-accent-rgb,4,201,244),0.18)"
          : "1px solid rgba(255,255,255,0.10)",
      }}
      className="space-y-3"
    >
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-1.5 text-cc-off/25 text-[10px] uppercase tracking-[0.14em]">
          <Clock size={10} strokeWidth={1.8} />
          {msg.time}
        </div>
        {hasReplied && (
          <div className="flex items-center gap-1 text-[9.5px] uppercase tracking-[0.14em]" style={{ color: "var(--phase-accent,#04C9F4)" }}>
            <Check size={10} strokeWidth={2.2} /> Replied
          </div>
        )}
      </div>

      <p className="text-cc-off/60 text-[13px] leading-[1.7]">{msg.body}</p>

      <button
        onClick={() => navigate({ to: "/reach", search: { threadId: msg.id, ref: confessionRef, body: msg.body } })}
        className="flex items-center gap-1.5 text-[10.5px] uppercase tracking-[0.14em] transition-colors hover:opacity-80"
        style={{ color: "rgba(var(--phase-accent-rgb,4,201,244),0.7)" }}
      >
        <Reply size={12} strokeWidth={2} />
        {hasReplied ? "Continue in Reach Out" : "Reply in Reach Out"}
      </button>
    </div>
  );
}

function MessagesTab({ messages, confessionRef }: { messages: IncomingMessage[]; confessionRef: string }) {
  if (messages.length === 0) {
    return (
      <div className="text-center py-10 space-y-1.5">
        <MessageCircle size={22} strokeWidth={1.4} className="mx-auto text-cc-off/20" />
        <p className="text-cc-off/25 text-[13px]">No messages yet.</p>
        <p className="text-cc-off/15 text-[11px]">When someone reaches out, it'll appear here.</p>
      </div>
    );
  }
  return (
    <div className="space-y-2.5">
      {messages.map((msg) => <MessageItem key={msg.id} msg={msg} confessionRef={confessionRef} />)}
    </div>
  );
}

// ─── Component ────────────────────────────────────────────────────────────────

function ResultView({
  r, refNum, tab, setTab, latest, displayStep, progressPct, canCancel, confirmCancel, setConfirmCancel, doCancel, cancelLoading, cancelError, lastPolled,
}: {
  r: TrackResult;
  refNum: string;
  tab: "status" | "messages";
  setTab: (t: "status" | "messages") => void;
  latest: StatusKey | null;
  displayStep: number | null;
  progressPct: number;
  canCancel: boolean;
  confirmCancel: boolean;
  setConfirmCancel: (v: boolean) => void;
  doCancel: () => void;
  cancelLoading: boolean;
  cancelError: string;
  lastPolled: string | null;
}) {
  const isIngesting = r.ingesting === true;
  const isIngestionFailed = r.ingestionFailed === true;
  const terminal = !isIngesting && !isIngestionFailed && r.status.length > 0 && isTerminal(r.status[0].status);
  const isRejected = !isIngesting && r.status[0]?.status === "rejected";
  const isCanceled = !isIngesting && r.status[0]?.status === "canceled";
  const isSkipped  = !isIngesting && r.status[0]?.status === "skipped";

  // Color palette per terminal state
  const trackColor = isRejected
    ? "rgba(220,60,60,0.7)"
    : isCanceled || isSkipped
    ? "rgba(255,255,255,0.18)"
    : "linear-gradient(90deg, var(--phase-accent,#04C9F4), rgba(var(--phase-accent-rgb,4,201,244),0.6))";

  const dotDoneColor = isRejected
    ? "rgba(220,60,60,0.8)"
    : isCanceled || isSkipped
    ? "rgba(255,255,255,0.2)"
    : "var(--phase-accent,#04C9F4)";

  const labelDoneColor = isRejected
    ? "rgba(220,80,80,0.8)"
    : isCanceled || isSkipped
    ? "rgba(242,242,242,0.25)"
    : "var(--phase-accent,#04C9F4)";

  return (
    <div className="space-y-3">

      {/* Tab bar — hidden while ingesting or processing */}
      {!isIngesting && !isIngestionFailed && (
        <div
          className="flex p-1 gap-1"
          style={{ background: "rgba(255,255,255,0.06)", border: "1px solid rgba(255,255,255,0.10)", borderRadius: "14px" }}
        >
          {(["status", "messages"] as const).map((t) => (
            <button
              key={t}
              onClick={() => setTab(t)}
              className="flex-1 flex items-center justify-center gap-2 py-2.5 text-[11px] font-semibold uppercase tracking-[0.16em] rounded-[10px] transition-all"
              style={{
                background: tab === t ? "rgba(255,255,255,0.10)" : "transparent",
                color: tab === t ? "rgba(242,242,242,0.85)" : "rgba(242,242,242,0.28)",
              }}
            >
              {t === "messages" && r.messages.length > 0 && (
                <span
                  className="grid place-items-center w-4 h-4 rounded-full text-[9px] font-bold"
                  style={{ background: "rgba(var(--phase-accent-rgb,4,201,244),0.25)", color: "var(--phase-accent,#04C9F4)" }}
                >
                  {r.messages.length}
                </span>
              )}
              {t === "status" ? "Status" : "Messages"}
            </button>
          ))}
        </div>
      )}

      {/* ── Status tab ── */}
      {(isIngesting || tab === "status") && (
        <div className="space-y-3">
          <div style={{ ...fieldWithPadding }} className="space-y-5">

            {/* Timeline */}
            <div className="relative">
              <div className="absolute top-[10px] left-[10px] right-[10px] h-px" style={{ background: "rgba(255,255,255,0.08)" }} />
              {!isIngesting && (
                <div
                  className="absolute top-[10px] left-[10px] h-px transition-all duration-700"
                  style={{
                    background: trackColor,
                    width: `${progressPct * (1 - 6 / 100)}%`,
                    maxWidth: "calc(100% - 20px)",
                  }}
                />
              )}
              <div className="relative flex justify-between">
                {STEPS.map((s, i) => {
                  const isIngestStep = i === 0;
                  const done = !isIngesting && displayStep !== null && i <= displayStep;
                  const active = !isIngesting && !terminal && i === displayStep;

                  return (
                    <div key={s.key} className="flex flex-col items-center gap-2" style={{ width: "25%" }}>
                      <div className="relative w-5 h-5 grid place-items-center">
                        {/* Spinning ring — only on ingestion step while ingesting */}
                        {(isIngesting || isIngestionFailed) && isIngestStep && (
                          <div
                            className="absolute inset-0 rounded-full animate-spin"
                            style={{
                              border: isIngestionFailed
                                ? "1.5px solid rgba(255,170,40,0.15)"
                                : "1.5px solid rgba(var(--phase-accent-rgb,4,201,244),0.15)",
                              borderTopColor: isIngestionFailed ? "rgba(255,180,60,0.8)" : "var(--phase-accent,#04C9F4)",
                            }}
                          />
                        )}
                        <div
                          className="w-5 h-5 rounded-full grid place-items-center transition-all duration-500"
                          style={{
                            background: (isIngesting || isIngestionFailed) && isIngestStep
                              ? isIngestionFailed
                                ? "rgba(255,170,40,0.08)"
                                : "rgba(var(--phase-accent-rgb,4,201,244),0.08)"
                              : done
                              ? dotDoneColor
                              : "rgba(255,255,255,0.07)",
                            boxShadow: active ? "0 0 14px var(--phase-glow,rgba(4,201,244,0.5))" : "none",
                          }}
                        >
                          {(isIngesting || isIngestionFailed) && isIngestStep ? (
                            <div className="w-1.5 h-1.5 rounded-full" style={{ background: isIngestionFailed ? "rgba(255,180,60,0.8)" : "var(--phase-accent,#04C9F4)" }} />
                          ) : done ? (
                            <div className="w-2 h-2 rounded-full" style={{ background: "rgba(5,6,6,0.7)" }} />
                          ) : null}
                        </div>
                      </div>
                      <div
                        className="text-[9px] uppercase tracking-[0.12em] text-center leading-tight"
                        style={{
                          color: isIngesting && isIngestStep
                            ? "rgba(var(--phase-accent-rgb,4,201,244),0.6)"
                            : done
                            ? labelDoneColor
                            : "rgba(242,242,242,0.22)",
                        }}
                      >
                        {s.label}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>

            {/* Ingesting / processing notes */}
            {isIngesting && (
              <p className="text-cc-off/30 text-[12px]">Writing your confession to our records…</p>
            )}
            {isIngestionFailed && (
              <p className="text-[12px] leading-relaxed" style={{ color: "rgba(255,180,60,0.55)" }}>
                Your confession reached us. Still processing — this usually resolves on the next poll.
              </p>
            )}

            {/* Status note */}
            {!isIngesting && !isIngestionFailed && !terminal && displayStep !== null && (
              <p className="text-cc-off/30 text-[12px]">{STEPS[displayStep]?.note}</p>
            )}

            {/* Last updated */}
            {lastPolled && !isIngesting && !isIngestionFailed && (
              <div
                className="flex items-center gap-2 px-3 py-2 rounded-xl self-start"
                style={{ background: "rgba(255,255,255,0.05)", border: "1px solid rgba(255,255,255,0.08)" }}
              >
                <div className="w-1.5 h-1.5 rounded-full" style={{ background: "rgba(var(--phase-accent-rgb,4,201,244),0.5)" }} />
                <span className="text-[11px] tracking-[0.08em] text-cc-off/45">
                  Updated {formatLastUpdated(lastPolled)}
                </span>
              </div>
            )}

            {/* Terminal badge + reason */}
            {terminal && (
              <div className="space-y-3 pt-1 border-t border-white/5">
                <div
                  className="inline-flex items-center gap-2 px-4 py-2 rounded-full text-[12px] font-semibold uppercase tracking-[0.16em]"
                  style={{
                    background: isRejected ? "rgba(220,60,60,0.12)" : "rgba(255,255,255,0.06)",
                    border: isRejected ? "1px solid rgba(220,60,60,0.3)" : "1px solid rgba(255,255,255,0.10)",
                    color: isRejected ? "rgba(220,80,80,0.9)" : "rgba(242,242,242,0.35)",
                  }}
                >
                  <X size={13} strokeWidth={2.5} />
                  {isRejected ? "Rejected" : isSkipped ? "Skipped" : "Canceled"}
                </div>
                {isRejected && r.status[0].rejectionReasons && (
                  <div
                    className="px-4 py-3 rounded-xl text-[13px] leading-relaxed"
                    style={{ background: "rgba(220,60,60,0.06)", border: "1px solid rgba(220,60,60,0.15)", color: "rgba(242,242,242,0.55)" }}
                  >
                    <span className="text-[10px] uppercase tracking-[0.18em] block mb-1.5" style={{ color: "rgba(220,80,80,0.6)" }}>Reason</span>
                    {r.status[0].rejectionReasons}
                  </div>
                )}
                {isCanceled && (
                  <p className="text-cc-off/30 text-[12px]">Your confession was canceled before review.</p>
                )}
                {isSkipped && (
                  <p className="text-cc-off/30 text-[12px]">Your confession was skipped during this round. It may be reconsidered in a future batch.</p>
                )}
              </div>
            )}

            {/* Post link */}
            {latest === "posted" && r.link && (
              <a
                href={r.link}
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center gap-2 text-[12px] font-semibold uppercase tracking-[0.14em] transition-opacity hover:opacity-80"
                style={{ color: "var(--phase-accent,#04C9F4)" }}
              >
                <ExternalLink size={13} strokeWidth={2.2} />
                View post on Facebook
              </a>
            )}

          </div>

          {/* Serial + ref numbers */}
          {r.serialNum && (
            <div
              className="px-4 py-4 rounded-xl space-y-4"
              style={{ background: "rgba(var(--phase-accent-rgb,4,201,244),0.06)", border: "1px solid rgba(var(--phase-accent-rgb,4,201,244),0.16)" }}
            >
              {/* Serial — public */}
              <div className="flex items-end justify-between">
                <div className="space-y-0.5">
                  <p className="text-[9px] uppercase tracking-[0.22em] text-cc-off/30">Confession number</p>
                  <p className="font-display text-[1.8rem] tracking-[0.08em]" style={{ color: "var(--phase-accent,#04C9F4)" }}>
                    #{r.serialNum}
                  </p>
                </div>
                <p className="text-cc-off/30 text-[11px] leading-relaxed text-right max-w-[140px]">
                  The public number on the post.
                </p>
              </div>
              {/* Divider */}
              <div className="border-t border-white/6" />
              {/* RefNum — private */}
              <div className="flex items-end justify-between">
                <div className="space-y-0.5">
                  <p className="text-[9px] uppercase tracking-[0.22em] text-cc-off/25">Your reference key</p>
                  <p className="font-display text-[1rem] tracking-[0.14em] text-cc-off/55">
                    {refNum}
                  </p>
                </div>
                <p className="text-cc-off/20 text-[10.5px] leading-relaxed text-right max-w-[140px]">
                  Private. Only you have this.
                </p>
              </div>
            </div>
          )}

          {/* Confession body — all submissions */}
          {r.confessionsArray.length > 0 && (
            <div style={fieldWithPadding} className="space-y-4">
              <div className="text-[10px] uppercase tracking-[0.22em] text-cc-off/30">
                {r.confessionsArray.length > 1 ? `Your confessions (${r.confessionsArray.length})` : "Your confession"}
              </div>
              {r.confessionsArray.map((c, i) => (
                <div key={i} className={r.confessionsArray.length > 1 ? "space-y-1.5 pb-4 border-b border-white/5 last:border-0 last:pb-0" : "space-y-1.5"}>
                  {c.timestamp && (() => {
                    const d = new Date(c.timestamp);
                    const valid = !isNaN(d.getTime());
                    return valid ? (
                      <div className="flex items-center gap-1.5 text-cc-off/20 text-[9.5px] uppercase tracking-[0.14em]">
                        <Clock size={9} strokeWidth={1.8} />
                        {d.toLocaleString("en-GB", { day: "numeric", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" })}
                      </div>
                    ) : (
                      <div className="flex items-center gap-1.5 text-cc-off/20 text-[9.5px] uppercase tracking-[0.14em]">
                        <Clock size={9} strokeWidth={1.8} />
                        {c.timestamp}
                      </div>
                    );
                  })()}
                  <p className="text-cc-off/65 text-[16px] leading-[1.8] font-light font-serif">
                    "{c.confession}"
                  </p>
                </div>
              ))}
              {r.hearts > 0 && (
                <div className="flex items-center gap-1.5 text-cc-off/30 text-[12px]">
                  <Heart size={11} strokeWidth={1.8} />
                  {r.hearts}
                </div>
              )}
            </div>
          )}
        {/* Cancel — at the bottom, out of the way */}
        {!terminal && !isIngesting && !isIngestionFailed && latest && latest !== "pending" && (
          <div className="pt-2 border-t border-white/5">
            <button
              disabled
              className="w-full py-3 rounded-xl text-[11px] uppercase tracking-[0.16em] font-semibold opacity-20 cursor-not-allowed"
              style={{ background: "rgba(220,60,60,0.10)", border: "1px solid rgba(220,60,60,0.20)", color: "rgba(220,80,80,0.9)" }}
            >
              Cancel my confession
            </button>
            <p className="text-cc-off/20 text-[10.5px] text-center mt-1.5">
              {latest === "posted" ? "Already posted — cannot be canceled." : "Can no longer be canceled at this stage."}
            </p>
          </div>
        )}
        {canCancel && (
          <div className="pt-2 border-t border-white/5 space-y-2">
            {!confirmCancel ? (
              <button
                onClick={() => setConfirmCancel(true)}
                className="w-full py-3.5 rounded-xl text-[12px] uppercase tracking-[0.16em] font-semibold transition-all active:scale-[0.98]"
                style={{ background: "rgba(220,60,60,0.18)", border: "1px solid rgba(220,60,60,0.45)", color: "rgba(220,80,80,1)" }}
              >
                Cancel my confession
              </button>
            ) : (
              <div className="space-y-3">
                <p className="text-cc-off/50 text-[13px] leading-relaxed text-center">Are you sure you want to cancel?</p>
                <div className="flex gap-3">
                  <button
                    onClick={doCancel}
                    disabled={cancelLoading}
                    className="flex-1 py-3 text-[11px] uppercase tracking-[0.14em] rounded-xl font-semibold transition-all active:scale-95 disabled:opacity-50"
                    style={{ background: "rgba(220,60,60,0.20)", border: "1px solid rgba(220,60,60,0.45)", color: "rgba(220,80,80,1)" }}
                  >
                    {cancelLoading ? "Canceling…" : "Yes, cancel it"}
                  </button>
                  <button
                    onClick={() => setConfirmCancel(false)}
                    disabled={cancelLoading}
                    className="flex-1 py-3 text-[11px] uppercase tracking-[0.14em] rounded-xl text-cc-off/50 hover:text-cc-off/80 transition-colors disabled:opacity-50"
                    style={{ border: "1px solid rgba(255,255,255,0.10)" }}
                  >
                    Keep it
                  </button>
                </div>
              </div>
            )}
            {cancelError && (
              <p className="text-[11px] text-center" style={{ color: "rgba(220,80,80,0.7)" }}>{cancelError}</p>
            )}
          </div>
        )}
      </div>
      )}

      {/* ── Messages tab ── */}
      {!isIngesting && tab === "messages" && (
        <MessagesTab messages={r.messages} confessionRef={r.serialNum} />
      )}

    </div>
  );
}

// ─── Status badge ─────────────────────────────────────────────────────────────

function StatusBadge({ status }: { status: StatusKey }) {
  const resolved = resolvedStatus(status);
  const cfg: Record<string, { label: string; bg: string; border: string; color: string }> = {
    ingesting:        { label: "Ingesting",   bg: "rgba(var(--phase-accent-rgb,4,201,244),0.08)", border: "rgba(var(--phase-accent-rgb,4,201,244),0.2)",  color: "rgba(var(--phase-accent-rgb,4,201,244),0.6)" },
    ingestionFailed:  { label: "Processing",  bg: "rgba(255,170,40,0.08)",                        border: "rgba(255,170,40,0.22)",                         color: "rgba(255,180,60,0.8)" },
    pending:   { label: "In Review",  bg: "rgba(255,190,60,0.10)",  border: "rgba(255,190,60,0.25)",  color: "rgba(255,200,80,0.85)" },
    scheduled: { label: "Scheduled",  bg: "rgba(var(--phase-accent-rgb,4,201,244),0.10)", border: "rgba(var(--phase-accent-rgb,4,201,244),0.25)", color: "var(--phase-accent,#04C9F4)" },
    posted:    { label: "Posted",     bg: "rgba(60,200,120,0.10)",  border: "rgba(60,200,120,0.25)",  color: "rgba(80,210,130,0.9)" },
    rejected:  { label: "Rejected",   bg: "rgba(220,60,60,0.10)",   border: "rgba(220,60,60,0.25)",   color: "rgba(220,80,80,0.9)" },
    canceled:  { label: "Canceled",   bg: "rgba(255,255,255,0.06)", border: "rgba(255,255,255,0.12)", color: "rgba(242,242,242,0.35)" },
    skipped:   { label: "Skipped",    bg: "rgba(255,255,255,0.05)", border: "rgba(255,255,255,0.10)", color: "rgba(242,242,242,0.30)" },
  };
  const s = cfg[resolved] ?? cfg.pending;
  return (
    <span
      className="text-[9px] uppercase tracking-[0.18em] font-semibold px-2.5 py-1 rounded-full"
      style={{ background: s.bg, border: `1px solid ${s.border}`, color: s.color }}
    >
      {s.label}
    </span>
  );
}

// ─── Confession card ──────────────────────────────────────────────────────────

function ConfessionCard({ refNum, result, onOpen }: { refNum: string; result: TrackResult | null; onOpen: () => void }) {
  const ingesting = result?.ingesting === true;
  const isFailed = result?.ingestionFailed === true;
  const latestStatus: StatusKey = ingesting ? "ingesting" : isFailed ? ("ingestionFailed" as StatusKey) : (result?.status[0]?.status ?? "pending");
  const cached = getCardCache(refNum);
  const snippet = result?.confessionsArray[0]?.confession ?? getSnippet(refNum);
  const serialNum = result?.serialNum || cached?.serialNum;
  const date = result?.status[result.status.length - 1]?.timestamp ?? cached?.timestamp;
  const lastPolled = getStatusCache(refNum)?.lastPolled ?? null;

  return (
    <button
      onClick={onOpen}
      className="w-full text-left flex flex-col gap-3 p-4 transition-all active:scale-[0.99]"
      style={{
        background: "rgba(10,12,16,0.45)",
        border: "1px solid rgba(255,255,255,0.08)",
        borderRadius: "16px",
        backdropFilter: "blur(12px)",
        WebkitBackdropFilter: "blur(12px)",
      }}
    >
      <div className="flex items-start justify-between">
        <div className="flex flex-col gap-1">
          <div className="flex items-center gap-2.5">
            <span
              className="font-display text-[11px] uppercase tracking-[0.22em]"
              style={{ color: "var(--phase-accent,#04C9F4)" }}
            >
              {refNum}
            </span>
            <div className="flex items-center gap-1.5">
              <StatusBadge status={latestStatus} />
              {ingesting && (
                <div
                  className="w-3 h-3 rounded-full border animate-spin"
                  style={{ borderColor: "rgba(var(--phase-accent-rgb,4,201,244),0.15)", borderTopColor: "var(--phase-accent,#04C9F4)" }}
                />
              )}
            </div>
          </div>
          {serialNum && (
            <span className="font-display text-[15px] tracking-[0.06em] text-cc-off/70">
              #{serialNum}
            </span>
          )}
        </div>
        <ChevronRight size={14} strokeWidth={1.8} className="text-cc-off/20 mt-0.5" />
      </div>

      {snippet && (
        <p className="text-cc-off/45 text-[13px] leading-[1.65] font-light line-clamp-2 font-serif">
          "{snippet}"
        </p>
      )}

      <div className="flex items-center justify-between">
        {date && (
          <div className="text-[9.5px] uppercase tracking-[0.14em] text-cc-off/20">
            {new Date(date).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" })}
          </div>
        )}
        {lastPolled && (
          <div className="text-[9px] tracking-[0.08em] text-cc-off/15">
            Updated {formatLastUpdated(lastPolled)}
          </div>
        )}
      </div>
    </button>
  );
}

// ─── Search bar ───────────────────────────────────────────────────────────────

function RefSearchBar({ onSearch }: { onSearch: (ref: string) => void }) {
  const [input, setInput] = useState("");
  const [err, setErr]     = useState("");

  function lookup() {
    const target = input.trim().toUpperCase();
    setErr("");
    if (!isValidInput(target)) {
      setErr("Must be 8 characters — letters and numbers only.");
      return;
    }
    onSearch(target);
  }

  return (
    <div className="space-y-2">
      <div
        className="flex gap-2 p-1.5"
        style={{
          background: "rgba(255,255,255,0.08)",
          border: "1px solid rgba(255,255,255,0.12)",
          borderRadius: "14px",
          backdropFilter: "blur(14px)",
        }}
      >
        <input
          value={input}
          onChange={(e) => { setInput(e.target.value.toUpperCase()); setErr(""); }}
          onKeyDown={(e) => e.key === "Enter" && lookup()}
          placeholder="Enter a reference number"
          maxLength={8}
          className="flex-1 bg-transparent text-cc-off placeholder:text-cc-off/20 px-3 py-2 font-display uppercase tracking-widest text-[14px] focus:outline-none"
        />
        <button
          onClick={lookup}
          disabled={input.trim().length < 3}
          className="flex items-center gap-2 px-4 py-2.5 font-display text-[11px] uppercase tracking-[0.16em] transition-all active:scale-95 disabled:opacity-30"
          style={{
            background: "linear-gradient(135deg, var(--phase-accent, #04C9F4), rgba(var(--phase-accent-rgb, 4,201,244), 0.75))",
            borderRadius: "10px",
            color: "#050606",
          }}
        >
          <Search size={13} strokeWidth={2.4} />
          Find
        </button>
      </div>
      {err && <p className="text-[11px] px-1" style={{ color: "rgba(240,100,100,0.8)" }}>{err}</p>}
    </div>
  );
}

// ─── Reset zone ───────────────────────────────────────────────────────────────

function ResetZone({ onReset }: { onReset: () => void }) {
  const [confirm, setConfirm] = useState(false);

  function doReset() {
    resetIdentity();
    onReset();
  }

  return (
    <div className="flex flex-col items-center">
      {!confirm ? (
        <button
          onClick={() => setConfirm(true)}
          className="text-[10.5px] uppercase tracking-[0.16em] text-cc-off/35 hover:text-cc-off/60 underline underline-offset-2 decoration-cc-off/20 transition-colors"
        >
          Remove my data from this browser
        </button>
      ) : (
        <div className="w-full space-y-3">
          <p className="text-cc-off/30 text-[12px] leading-relaxed text-center">
            This clears your confessions and identity from this browser. You can still recover them later using a transfer link.
          </p>
          <div className="flex gap-3 justify-center">
            <button
              onClick={doReset}
              className="px-4 py-2.5 text-[11px] uppercase tracking-[0.14em] rounded-lg transition-all"
              style={{ background: "rgba(255,255,255,0.07)", border: "1px solid rgba(255,255,255,0.14)", color: "rgba(242,242,242,0.55)" }}
            >
              Yes, remove it
            </button>
            <button
              onClick={() => setConfirm(false)}
              className="px-4 py-2.5 text-[11px] uppercase tracking-[0.14em] rounded-lg text-cc-off/35 hover:text-cc-off/60 transition-colors"
              style={{ border: "1px solid rgba(255,255,255,0.08)" }}
            >
              Keep it
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Anon ID chip ─────────────────────────────────────────────────────────────

function AnonIdChip({ anonId }: { anonId: string }) {
  const browser = detectBrowser();
  if (!anonId) return null;
  return (
    <div
      className="flex flex-col gap-1 self-start px-3.5 py-2.5 rounded-xl"
      style={{
        background: "rgba(10,12,16,0.45)",
        border: "1px solid rgba(255,255,255,0.08)",
        backdropFilter: "blur(12px)",
        WebkitBackdropFilter: "blur(12px)",
      }}
    >
      <div className="flex flex-col gap-0.5">
        <span className="text-[8.5px] uppercase tracking-[0.2em] text-cc-off/25">Your ID</span>
        <span className="font-display text-[12px] tracking-[0.12em]" style={{ color: "var(--phase-accent,#04C9F4)" }}>
          {anonId}
        </span>
      </div>
      {browser && (
        <span className="text-[9.5px] text-cc-off/30">{browser}</span>
      )}
    </div>
  );
}

// ─── Transfer token helpers ───────────────────────────────────────────────────

function extractTokenFromInput(input: string): string | null {
  const trimmed = input.trim();
  try {
    const url = new URL(trimmed.includes("://") ? trimmed : `https://placeholder.cc/${trimmed}`);
    const t = url.searchParams.get("t");
    if (t) return t;
  } catch { /* not a URL */ }
  // raw token fallback
  if (/^[A-Za-z0-9_-]{8,}$/.test(trimmed)) return trimmed;
  return null;
}

// ─── Transfer-out modal (Get transfer link) ───────────────────────────────────

function TransferOutModal({ anonId, onClose }: { anonId: string; onClose: () => void }) {
  const [stage, setStage]           = useState<"consent" | "generating" | "ready">("consent");
  const [link, setLink]             = useState("");
  const [copied, setCopied]         = useState(false);
  const [countdown, setCountdown]   = useState(900); // 15 min
  const [genError, setGenError]     = useState("");
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    return () => { if (timerRef.current) clearInterval(timerRef.current); };
  }, []);

  async function generate() {
    setStage("generating");
    setGenError("");
    const res = await (createRecoveryToken as unknown as (opts: { data: { anonId: string } }) => Promise<{ ok: boolean; token?: string; error?: string }>)({ data: { anonId } } as never);
    if (!res.ok || !res.token) {
      setGenError("Couldn't generate a link. Try again.");
      setStage("consent");
      return;
    }
    const base = typeof window !== "undefined" ? `${window.location.origin}/track` : "/track";
    setLink(`${base}?t=${res.token}`);
    setCountdown(900);
    setStage("ready");
    timerRef.current = setInterval(() => {
      setCountdown((c) => {
        if (c <= 1) { clearInterval(timerRef.current!); return 0; }
        return c - 1;
      });
    }, 1000);
  }

  function copyLink() {
    navigator.clipboard.writeText(link).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2500);
    });
  }

  function regen() {
    if (timerRef.current) clearInterval(timerRef.current);
    setLink("");
    setCopied(false);
    setCountdown(900);
    generate();
  }

  const mins = String(Math.floor(countdown / 60)).padStart(2, "0");
  const secs = String(countdown % 60).padStart(2, "0");

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4"
      style={{ background: "rgba(0,0,0,0.65)", backdropFilter: "blur(6px)" }}
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div
        className="w-full max-w-lg rounded-2xl p-6 space-y-5"
        style={{ background: "rgba(12,15,18,0.97)", border: "1px solid rgba(255,255,255,0.10)" }}
      >
        {stage === "consent" && (
          <>
            <div className="space-y-1.5">
              <h2 className="font-display text-[1.1rem] uppercase tracking-[0.16em] text-cc-off">Open in another browser</h2>
              <p className="text-cc-off/45 text-[13px] leading-[1.7]">
                This generates a one-time link that lets you bring your confessions into another browser or device.
              </p>
              <p className="text-[13px] leading-[1.7]" style={{ color: "rgba(255,190,60,0.65)" }}>
                Treat it like a key — never share it with anyone. It expires in 15 minutes and works exactly once.
              </p>
            </div>
            {genError && <p className="text-[11px]" style={{ color: "rgba(220,80,80,0.8)" }}>{genError}</p>}
            <div className="flex gap-3">
              <button
                onClick={generate}
                className="flex-1 py-3 font-display text-[11px] uppercase tracking-[0.18em] rounded-xl transition-all active:scale-95"
                style={{
                  background: "linear-gradient(135deg, var(--phase-accent,#04C9F4), rgba(var(--phase-accent-rgb,4,201,244),0.75))",
                  color: "#050606",
                }}
              >
                Generate link
              </button>
              <button
                onClick={onClose}
                className="px-5 py-3 text-[11px] uppercase tracking-[0.14em] rounded-xl text-cc-off/40 hover:text-cc-off/70 transition-colors"
                style={{ border: "1px solid rgba(255,255,255,0.08)" }}
              >
                Cancel
              </button>
            </div>
          </>
        )}

        {stage === "generating" && (
          <div className="flex items-center gap-3 py-6 text-cc-off/30 text-[13px]">
            <div className="w-4 h-4 rounded-full border border-cc-off/30 border-t-transparent animate-spin shrink-0" />
            Generating…
          </div>
        )}

        {stage === "ready" && (
          <>
            <div className="space-y-1.5">
              <h2 className="font-display text-[1.1rem] uppercase tracking-[0.16em] text-cc-off">Your transfer link</h2>
              <p className="text-cc-off/35 text-[12px]">Paste this in the other browser. Never share it with anyone else.</p>
            </div>

            <div
              className="flex items-center gap-3 px-4 py-3 rounded-xl"
              style={{ background: "rgba(255,255,255,0.05)", border: "1px solid rgba(255,255,255,0.10)" }}
            >
              <span className="flex-1 font-mono text-[11px] text-cc-off/50 truncate">{link}</span>
              <button
                onClick={copyLink}
                className="flex items-center gap-1.5 shrink-0 text-[10.5px] uppercase tracking-[0.14em] transition-all active:scale-95"
                style={{ color: copied ? "rgba(60,200,120,0.85)" : "var(--phase-accent,#04C9F4)" }}
              >
                {copied ? <Check size={12} strokeWidth={2.2} /> : <Copy size={12} strokeWidth={2} />}
                {copied ? "Copied" : "Copy"}
              </button>
            </div>

            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2 text-cc-off/25 text-[11px]">
                <Clock size={11} strokeWidth={1.8} />
                Expires in {countdown > 0 ? `${mins}:${secs}` : "now — expired"}
              </div>
              {countdown > 0 && (
                <button
                  onClick={regen}
                  className="text-[10.5px] uppercase tracking-[0.14em] text-cc-off/30 hover:text-cc-off/60 transition-colors"
                >
                  Regenerate
                </button>
              )}
            </div>

            {countdown === 0 && (
              <button
                onClick={regen}
                className="w-full py-3 font-display text-[11px] uppercase tracking-[0.18em] rounded-xl transition-all active:scale-95"
                style={{
                  background: "linear-gradient(135deg, var(--phase-accent,#04C9F4), rgba(var(--phase-accent-rgb,4,201,244),0.75))",
                  color: "#050606",
                }}
              >
                Generate new link
              </button>
            )}

            <button
              onClick={onClose}
              className="w-full text-center text-[11px] uppercase tracking-[0.14em] text-cc-off/25 hover:text-cc-off/50 transition-colors pt-1"
            >
              Done
            </button>
          </>
        )}
      </div>
    </div>
  );
}

// ─── Import-session modal (Recover Space) ───────────────────────────────────

function ImportModal({
  prefilledToken,
  onClose,
  onImported,
}: {
  prefilledToken: string | null;  // set when ?t= is in URL
  onClose: () => void;
  onImported: () => void;
}) {
  const [linkInput, setLinkInput]   = useState("");
  const [refInput, setRefInput]     = useState("");
  const [loading, setLoading]       = useState(false);
  const [err, setErr]               = useState("");

  const hasToken = !!prefilledToken;

  async function doImport() {
    setErr("");
    const token = hasToken ? prefilledToken! : extractTokenFromInput(linkInput);
    const ref   = refInput.trim().toUpperCase();

    if (!token) { setErr("Paste a valid transfer link."); return; }
    if (!/^[A-Z0-9]{8}$/.test(ref)) { setErr("Reference number must be 8 characters — letters and numbers."); return; }

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
      const msg = res.error === "expired"       ? "This link has expired. Ask for a new one." :
                  res.error === "wrong_ref"     ? "That reference number doesn't match this session." :
                  res.error === "invalid_token" ? "This link is invalid or has already been used." :
                  "Something went wrong. Try again.";
      setErr(msg);
      return;
    }

    const refNums = [...(res.refNums ?? [])]
      .sort((a: unknown, b: unknown) => {
        const ta = (a && typeof a === "object" ? (a as { timestamp?: string }).timestamp : "") ?? "";
        const tb = (b && typeof b === "object" ? (b as { timestamp?: string }).timestamp : "") ?? "";
        return tb.localeCompare(ta); // newest first
      })
      .map((r: unknown) => typeof r === "string" ? r : (r as { refNum: string }).refNum);
    adoptSession(res.anonId!, refNums);
    onImported();
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4"
      style={{ background: "rgba(0,0,0,0.65)", backdropFilter: "blur(6px)" }}
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div
        className="w-full max-w-lg rounded-2xl p-6 space-y-5"
        style={{ background: "rgba(12,15,18,0.97)", border: "1px solid rgba(255,255,255,0.10)" }}
      >
        <div className="space-y-1.5">
          <h2 className="font-display text-[1.1rem] uppercase tracking-[0.16em] text-cc-off">
            Recover Your Space
          </h2>
          <p className="text-cc-off/40 text-[13px] leading-[1.7]">
            {hasToken
              ? "Enter one reference number from your confessions to verify this is your session."
              : "Go to your original browser, tap \"Get transfer link\", and paste it below. Then enter one of your reference numbers."}
          </p>
        </div>

        <div className="space-y-3">
          {!hasToken && (
            <div className="space-y-1.5">
              <label className="text-[10px] uppercase tracking-[0.18em] text-cc-off/30">Transfer link</label>
              <input
                value={linkInput}
                onChange={(e) => { setLinkInput(e.target.value); setErr(""); }}
                placeholder="Paste your transfer link here"
                className="w-full bg-transparent px-4 py-3 rounded-xl text-cc-off/80 placeholder:text-cc-off/20 text-[13px] focus:outline-none"
                style={{ border: "1px solid rgba(255,255,255,0.12)", background: "rgba(255,255,255,0.04)" }}
              />
            </div>
          )}

          <div className="space-y-1.5">
            <label className="text-[10px] uppercase tracking-[0.18em] text-cc-off/30">Reference number</label>
            <input
              value={refInput}
              onChange={(e) => { setRefInput(e.target.value.toUpperCase()); setErr(""); }}
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
            style={{
              background: "linear-gradient(135deg, var(--phase-accent,#04C9F4), rgba(var(--phase-accent-rgb,4,201,244),0.75))",
              color: "#050606",
            }}
          >
            {loading ? "Verifying…" : "Import session"}
          </button>
          <button
            onClick={onClose}
            disabled={loading}
            className="px-5 py-3 text-[11px] uppercase tracking-[0.14em] rounded-xl text-cc-off/40 hover:text-cc-off/70 transition-colors disabled:opacity-30"
            style={{ border: "1px solid rgba(255,255,255,0.08)" }}
          >
            Cancel
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── Page ─────────────────────────────────────────────────────────────────────

function TrackPage() {
  const search = useSearch({ from: "/track" });
  const navigate = useNavigate();

  const [mounted, setMounted]           = useState(false);
  const [anonId, setAnonId]             = useState("");
  const [myRefs, setMyRefs]             = useState<string[]>([]);
  const [ingestingRefs, setIngestingRefs] = useState<string[]>([]);
  const [pollingRefs, setPollingRefs]     = useState<Set<string>>(new Set());
  const [activeRef, setActiveRef]       = useState<string | null>(null);
  const [result, setResult]             = useState<TrackResult | null | "not_found">(null);
  const [confirmCancel, setConfirmCancel] = useState(false);
  const [canceled, setCanceled]         = useState(false);
  const [tab, setTab]                   = useState<"status" | "messages">("status");
  const [resolvedResults, setResolvedResults] = useState<Record<string, TrackResult>>({});
  const [failedRefs, setFailedRefs]           = useState<string[]>([]);
  const [cancelLoading, setCancelLoading]     = useState(false);
  const [cancelError, setCancelError]         = useState("");

  // ── Session transfer modal state ──
  const [showTransferOut, setShowTransferOut]   = useState(false);
  const [showImportModal, setShowImportModal]   = useState(false);
  const pendingToken = search.t ?? null;

  // ── Origin browser mismatch banner ──
  const [showOriginBanner, setShowOriginBanner] = useState(false);
  useEffect(() => {
    const origin  = getOriginBrowser()?.trim().toLowerCase();
    const current = detectBrowser()?.trim().toLowerCase();
    if (origin && current && origin !== current) setShowOriginBanner(true);
  }, []);

  function maybeAddAnonId(refNum: string, entry: ResolvedEntry) {
    const localId = getOrCreateAnonId();
    const known = entry.anonIds.some((s) => s.id === localId);
    if (!known) {
      const { browser, device } = getBrowserDetails();
      (addAnonId as unknown as (opts: { data: { refNum: string; anonId: string; browser: string; device: string } }) => Promise<{ success: boolean }>)({ data: { refNum, anonId: localId, browser, device } } as never);
    }
  }

  const runPoll = useCallback(async () => {
    const refs = getMyRefs();
    const ingesting = getIngestingRefs();
    // Include ingesting refs so GAS confirmation clears them — exclude only DEMO refs
    const toFetch = refs.filter((r) => !DEMO[r]);
    if (!toFetch.length) return;

    setPollingRefs(new Set(toFetch));
    const res = await pollTrackingStatuses({ data: { refNums: toFetch } } as never);
    setPollingRefs(new Set());
    if (!res.ok || !res.entries) return;

    setResolvedResults((prev) => {
      const next = { ...prev };
      const polledAt = new Date().toISOString();
      for (const [refNum, entry] of Object.entries(res.entries!)) {
        if (!entry) continue;
        // If GAS returned an entry for an ingesting ref, it's confirmed — clear ingesting
        if (ingesting.includes(refNum)) {
          clearIngesting(refNum);
          setIngestingRefs(getIngestingRefs());
        }
        next[refNum] = resolvedEntryToTrackResult(entry);
        clearIngestionFailed(refNum);
        maybeAddAnonId(refNum, entry);
        const snippet = entry.confessionsArray[0]?.confession ?? "";
        const confessionTimestamp = entry.confessionsArray[0]?.timestamp ?? "";
        if (entry.serialNum) saveCardCache(refNum, { serialNum: entry.serialNum, timestamp: confessionTimestamp });
        if (snippet) saveSnippet(refNum, snippet);
        saveStatusCache(refNum, {
          statuses: entry.status,
          serialNum: entry.serialNum,
          snippet,
          confessionTimestamp,
          lastPolled: polledAt,
        });
      }
      return next;
    });

    setActiveRef((cur) => {
      if (cur && res.entries) {
        const entry = res.entries[cur];
        if (entry) setResult(resolvedEntryToTrackResult(entry));
      }
      return cur;
    });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    setMounted(true);
    setAnonId(getOrCreateAnonId());
    setMyRefs(getMyRefs());
    setIngestingRefs(getIngestingRefs());
    setFailedRefs(getIngestionFailedRefs());

    // Load status cache immediately — no loading state on repeat visits
    const cached = getAllStatusCache();
    if (Object.keys(cached).length > 0) {
      setResolvedResults((prev) => {
        const next = { ...prev };
        for (const [ref, entry] of Object.entries(cached)) {
          if (!next[ref]) {
            next[ref] = {
              serialNum: entry.serialNum,
              status: entry.statuses.length > 0
                ? entry.statuses.map((s) => ({ status: s.status as StatusKey, timestamp: s.timestamp, rejectionReasons: Array.isArray(s.rejectionReasons) ? s.rejectionReasons.join(", ") : s.rejectionReasons as string | undefined }))
                : [{ status: "pending" as StatusKey, timestamp: entry.confessionTimestamp || new Date().toISOString() }],
              confessionsArray: entry.snippet ? [{ confession: entry.snippet, timestamp: entry.confessionTimestamp } as never] : [],
              hearts: 0,
              messages: [],
            };
          }
        }
        return next;
      });
    }

    // Poll immediately if cache is stale (>30 mins old), missing, or any refs are still ingesting
    const lastPolled = getLastPolled();
    const isStale = !lastPolled || (Date.now() - new Date(lastPolled).getTime() > POLL_INTERVAL_MS);
    const hasIngesting = getIngestingRefs().length > 0;
    if (isStale || hasIngesting) runPoll();

    const interval = setInterval(runPoll, POLL_INTERVAL_MS);

    const onIngestionComplete = (e: Event) => {
      const { ref } = (e as CustomEvent<{ ref: string }>).detail;
      setIngestingRefs(getIngestingRefs());
      setActiveRef((cur) => {
        if (cur === ref) {
          setResult({
            serialNum: "",
            ingesting: false,
            status: [{ status: "pending", timestamp: new Date().toISOString() }],
            confessionsArray: [],
            hearts: 0,
            messages: [],
          });
        }
        return cur;
      });
    };
    window.addEventListener("cc:ingestion-complete", onIngestionComplete);

    return () => {
      clearInterval(interval);
      window.removeEventListener("cc:ingestion-complete", onIngestionComplete);
    };
  }, [runPoll]);

  // Auto-open import modal when ?t or ?recover=1 is in URL
  useEffect(() => {
    if (search.t || search.recover === "1") setShowImportModal(true);
    if (search.recover === "1") navigate({ to: "/track", search: { t: undefined, recover: undefined }, replace: true });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);


  function handleImported() {
    navigate({ to: "/track", search: { t: undefined, recover: undefined }, replace: true });
    setAnonId(getOrCreateAnonId());
    setMyRefs(getMyRefs());
    setShowImportModal(false);
    runPoll();
  }

  function openRef(ref: string) {
    const failed = failedRefs.includes(ref);
    if (failed) {
      setActiveRef(ref);
      setResult({ serialNum: "", ingestionFailed: true, status: [], confessionsArray: [], hearts: 0, messages: [] });
      setConfirmCancel(false);
      setCanceled(false);
      setTab("status");
      return;
    }

    const ingesting = checkIngesting(ref);
    if (ingesting || (pollingRefs.has(ref) && !resolvedResults[ref])) {
      setActiveRef(ref);
      setResult({ serialNum: "", ingesting: true, status: [], confessionsArray: [], hearts: 0, messages: [] });
      setConfirmCancel(false);
      setCanceled(false);
      setTab("status");
      return;
    }
    const found = DEMO[ref] ?? resolvedResults[ref] ?? {
      serialNum: "",
      status: [{ status: "pending" as const, timestamp: new Date().toISOString() }],
      confessionsArray: [],
      hearts: 0,
      messages: [],
    };
    setActiveRef(ref);
    setResult(found);
    setConfirmCancel(false);
    setCanceled(false);
    setTab("status");
  }

  async function handleSearch(ref: string) {
    setConfirmCancel(false);
    setCanceled(false);
    setTab("status");

    // Demo data → instant local result
    if (DEMO[ref]) {
      saveRefToProfile(ref);
      setMyRefs(getMyRefs());
      setActiveRef(ref);
      setResult(DEMO[ref]);
      return;
    }

    // Live fetch: show loading immediately, then resolve
    setActiveRef(ref);
    setResult(null);

    try {
      const res = await (pollTrackingStatuses as unknown as (opts: { data: { refNums: string[] } }) => Promise<{ ok: boolean; entries?: Record<string, import("../lib/fetchTracking").ResolvedEntry | null> }>)({ data: { refNums: [ref] } } as never);
      if (res.ok && res.entries?.[ref]) {
        const entry = res.entries[ref]!;
        const trackResult = resolvedEntryToTrackResult(entry);
        saveRefToProfile(ref);
        setMyRefs(getMyRefs());
        setResolvedResults((prev) => ({ ...prev, [ref]: trackResult }));
        setResult(trackResult);
        maybeAddAnonId(ref, entry);
      } else {
        setResult("not_found");
      }
    } catch {
      setResult("not_found");
    }
  }

  function goBack() {
    setActiveRef(null);
    setResult(null);
  }

  function handleReset() {
    setAnonId(getOrCreateAnonId());
    setMyRefs([]);
    setIngestingRefs([]);
    setFailedRefs([]);
    setActiveRef(null);
    setResult(null);
  }

  async function doCancel() {
    if (!result || result === "not_found" || !activeRef) return;
    setCancelLoading(true);
    setCancelError("");
    const res = await cancelConfession({ data: { refNum: activeRef } } as never);
    setCancelLoading(false);
    if (!res.success) {
      const msg = res.error === "not_cancelable"
        ? `Can't cancel — confession is already ${(res as { currentStatus?: string }).currentStatus ?? "past review"}.`
        : "Something went wrong. Try again.";
      setCancelError(msg);
      return;
    }
    const updated: TrackResult = {
      ...result,
      status: [{ status: "canceled", timestamp: new Date().toISOString() }, ...result.status],
    };
    setResult(updated);
    setConfirmCancel(false);
    setCanceled(true);
  }

  const isIngesting = result && result !== "not_found" && result.ingesting === true;
  const latest = result && result !== "not_found" && !isIngesting && result.status.length > 0
    ? resolvedStatus(result.status[0].status)
    : null;
  const canCancel = latest === "pending" && !canceled;
  const displayStep = latest ? (isTerminal(latest) ? stepIndex("pending") : stepIndex(latest)) : null;
  const progressPct = displayStep !== null ? (displayStep / (STEPS.length - 1)) * 100 : 0;

  const originBanner = showOriginBanner && (
    <div
      className="flex items-start gap-3 px-4 py-3 rounded-xl mb-1"
      style={{ background: "rgba(var(--phase-accent-rgb,4,201,244),0.08)", border: "1px solid rgba(var(--phase-accent-rgb,4,201,244),0.18)" }}
    >
      <div className="flex-1 space-y-0.5">
        <p className="text-[11px] uppercase tracking-[0.16em]" style={{ color: "var(--phase-accent,#04C9F4)" }}>
          You confessed from {getOriginBrowser()}
        </p>
        <p className="text-cc-off/40 text-[12px] leading-relaxed">
          This looks like a different browser. Transfer your session to see all your confessions here.
        </p>
      </div>
      <div className="flex flex-col items-end gap-1.5 shrink-0">
        <button
          onClick={() => { setShowImportModal(true); setShowOriginBanner(false); }}
          className="text-[10px] uppercase tracking-[0.16em] font-semibold transition-opacity hover:opacity-80"
          style={{ color: "var(--phase-accent,#04C9F4)" }}
        >
          Transfer
        </button>
        <button
          onClick={() => setShowOriginBanner(false)}
          className="text-[10px] uppercase tracking-[0.14em] text-cc-off/25 hover:text-cc-off/50 transition-colors"
        >
          Dismiss
        </button>
      </div>
    </div>
  );

  const modals = (
    <>
      {showTransferOut && (
        <TransferOutModal anonId={anonId} onClose={() => setShowTransferOut(false)} />
      )}
      {(showImportModal || pendingToken) && (
        <ImportModal
          prefilledToken={pendingToken}
          onClose={() => { setShowImportModal(false); if (pendingToken) navigate({ to: "/track", search: { t: undefined, recover: undefined }, replace: true }); }}
          onImported={handleImported}
        />
      )}
    </>
  );

  // ── Detail view ──
  if (activeRef) {
    return (
      <>
      <div className="flex flex-col gap-5 py-2">
        <button
          onClick={goBack}
          className="flex items-center gap-1.5 text-cc-off/35 hover:text-cc-off/70 transition-colors text-[11px] uppercase tracking-[0.18em] self-start"
        >
          <ChevronLeft size={15} strokeWidth={1.8} />
          My Confessions
        </button>

        <div className="space-y-1">
          <span className="font-display text-[11px] uppercase tracking-[0.22em]" style={{ color: "var(--phase-accent,#04C9F4)" }}>
            {activeRef}
          </span>
        </div>

        {result === null ? (
          <div className="flex items-center gap-3 py-10 text-cc-off/30 text-[13px]">
            <div className="w-4 h-4 rounded-full border border-cc-off/30 border-t-transparent animate-spin shrink-0" />
            Checking confession…
          </div>
        ) : result === "not_found" ? (
          <div className="text-center py-8 space-y-1.5">
            <div className="text-cc-off/35 text-[15px]">Nothing found for that reference.</div>
            <div className="text-cc-off/20 text-[12px]">Double-check the number and try again.</div>
          </div>
        ) : result && (
          <ResultView
            r={result}
            refNum={activeRef}
            tab={tab}
            setTab={setTab}
            latest={latest!}
            displayStep={displayStep}
            progressPct={progressPct}
            canCancel={canCancel}
            confirmCancel={confirmCancel}
            setConfirmCancel={setConfirmCancel}
            doCancel={doCancel}
            cancelLoading={cancelLoading}
            cancelError={cancelError}
            lastPolled={getStatusCache(activeRef)?.lastPolled ?? null}
          />
        )}
      </div>
      {modals}
      </>
    );
  }

  // ── Not yet mounted — don't flash empty state before localStorage is read ──
  if (!mounted) return null;

  // ── Collection view ──
  if (myRefs.length > 0) {
    return (
      <>
      <div className="flex flex-col gap-5 py-2">

        {originBanner}

        {/* Header */}
        <div className="flex flex-col gap-3">
          <AnonIdChip anonId={anonId} />
          <h1 className="font-display text-[2rem] uppercase text-cc-off leading-tight">
            Your<br />confessions.
          </h1>
        </div>

        {/* Search */}
        <RefSearchBar onSearch={handleSearch} />

        {/* Cards */}
        <div className="flex flex-col gap-3">
          {myRefs.map((ref) => (
            <ConfessionCard
              key={ref}
              refNum={ref}
              result={ingestingRefs.includes(ref)
                ? { serialNum: "", ingesting: true, status: [], confessionsArray: [], hearts: 0, messages: [] }
                : failedRefs.includes(ref)
                ? { serialNum: "", ingestionFailed: true, status: [], confessionsArray: [], hearts: 0, messages: [] }
                : (pollingRefs.has(ref) && !resolvedResults[ref])
                ? { serialNum: "", ingesting: true, status: [], confessionsArray: [], hearts: 0, messages: [] }
                : (DEMO[ref] ?? resolvedResults[ref] ?? { serialNum: "", status: [{ status: "pending" as const, timestamp: "" }], confessionsArray: [], hearts: 0, messages: [] })}
              onOpen={() => openRef(ref)}
            />
          ))}
        </div>

        {/* ── Device / session footer ── */}
        <div
          className="rounded-2xl p-4 space-y-3"
          style={{ background: "rgba(8,10,12,0.75)", border: "1px solid rgba(255,255,255,0.18)", backdropFilter: "blur(16px)", WebkitBackdropFilter: "blur(16px)" }}
        >
          <p className="text-[9px] uppercase tracking-[0.2em] text-cc-off/60 text-center font-semibold">My Space Settings</p>
          <div className="space-y-2">
            <button
              onClick={() => setShowImportModal(true)}
              className="w-full flex items-center justify-center gap-2.5 py-3 rounded-xl font-display text-[11px] uppercase tracking-[0.18em] transition-all active:scale-[0.98]"
              style={{
                background: "rgba(255,255,255,0.07)",
                border: "1px solid rgba(255,255,255,0.12)",
                color: "rgba(242,242,242,0.65)",
              }}
            >
              <Download size={13} strokeWidth={1.8} />
              Recover Space
            </button>
            <button
              onClick={() => setShowTransferOut(true)}
              className="w-full flex items-center justify-center gap-2 py-2.5 rounded-xl text-[10.5px] uppercase tracking-[0.16em] transition-all active:scale-[0.98]"
              style={{
                background: "rgba(255,255,255,0.06)",
                border: "1px solid rgba(255,255,255,0.13)",
                color: "rgba(242,242,242,0.50)",
              }}
            >
              <ArrowRightLeft size={11} strokeWidth={1.8} />
              Get transfer link
            </button>
          </div>
          <div className="pt-1 border-t border-white/5">
            <ResetZone onReset={handleReset} />
          </div>
        </div>

      </div>
      {modals}
      </>
    );
  }

  // ── Empty state ──
  return (
    <>
    <div className="flex flex-col gap-6 py-2">

      {originBanner}

      <div className="flex flex-col gap-3">
        <AnonIdChip anonId={anonId} />
        <h1 className="font-display text-[2rem] uppercase text-cc-off leading-tight">
          Your confession<br />is still there.
        </h1>
      </div>

      <RefSearchBar onSearch={handleSearch} />

      <div className="text-center py-6 flex flex-col items-center gap-5">
        <p className="text-cc-off/20 text-[13px] leading-relaxed">
          Nothing here yet.<br />Your confessions will appear once you submit.
        </p>
        <Link
          to="/confess-here"
          className="flex items-center justify-center w-[88px] h-[88px] active:scale-95 transition-transform"
          style={{
            background: "linear-gradient(135deg, var(--phase-accent,#04C9F4) 0%, rgba(var(--phase-accent-rgb,4,201,244),0.75) 100%)",
            borderRadius: "9999px",
            boxShadow: "0 12px 32px -6px var(--phase-glow,rgba(4,201,244,0.5))",
          }}
          aria-label="Confess"
        >
          <svg width={28} height={28} viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
            <path d="M21 15C21 15.5304 20.7893 16.0391 20.4142 16.4142C20.0391 16.7893 19.5304 17 19 17H7L3 21V5C3 4.46957 3.21071 3.96086 3.58579 3.58579C3.96086 3.21071 4.46957 3 5 3H19C19.5304 3 20.0391 3.21071 20.4142 3.58579C20.7893 3.96086 21 4.46957 21 5V15Z"
              stroke="#050606" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
            <circle cx="9" cy="10" r="1" fill="#050606" />
            <circle cx="12" cy="10" r="1" fill="#050606" />
            <circle cx="15" cy="10" r="1" fill="#050606" />
          </svg>
        </Link>
        <span className="text-[9.5px] uppercase tracking-[0.2em] text-cc-off/25">Say something</span>
      </div>

      {/* ── Device / session footer ── */}
      <div
        className="rounded-2xl p-4 space-y-3"
        style={{ background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.07)" }}
      >
        <p className="text-[9px] uppercase tracking-[0.2em] text-cc-off/20 text-center">My Space Settings</p>
        <div className="space-y-2">
          <button
            onClick={() => setShowImportModal(true)}
            className="w-full flex items-center justify-center gap-2.5 py-3 rounded-xl font-display text-[11px] uppercase tracking-[0.18em] transition-all active:scale-[0.98]"
            style={{
              background: "rgba(255,255,255,0.07)",
              border: "1px solid rgba(255,255,255,0.12)",
              color: "rgba(242,242,242,0.65)",
            }}
          >
            <Download size={13} strokeWidth={1.8} />
            Recover Space
          </button>
          <button
            onClick={() => setShowTransferOut(true)}
            className="w-full flex items-center justify-center gap-2 py-2.5 rounded-xl text-[10.5px] uppercase tracking-[0.16em] transition-all active:scale-[0.98]"
            style={{
              background: "rgba(255,255,255,0.03)",
              border: "1px solid rgba(255,255,255,0.07)",
              color: "rgba(242,242,242,0.30)",
            }}
          >
            <ArrowRightLeft size={11} strokeWidth={1.8} />
            Get transfer link
          </button>
        </div>
        <div className="pt-1 border-t border-white/5">
          <ResetZone onReset={handleReset} />
        </div>
      </div>

    </div>
    {modals}
    </>
  );
}
