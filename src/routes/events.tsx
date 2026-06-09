import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";

export const Route = createFileRoute("/events")({
  component: EventsPage,
});

function EventsPage() {
  const [tab, setTab] = useState<"events" | "chat">("events");

  return (
    <div className="flex flex-col">
      {/* Sub-tab bar */}
      <div
        className="flex rounded-xl mb-6 p-1"
        style={{ background: "rgba(255,255,255,0.05)", border: "1px solid rgba(255,255,255,0.08)" }}
      >
        {(["events", "chat"] as const).map((t) => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className="flex-1 py-2 text-[12px] font-bold uppercase tracking-[0.08em] rounded-lg transition-all duration-200"
            style={
              tab === t
                ? { background: "rgba(var(--phase-accent-rgb, 4,201,244), 0.15)", color: "var(--phase-accent, #04C9F4)" }
                : { color: "rgba(242,242,242,0.35)" }
            }
          >
            {t === "events" ? "Events" : "Community Chat"}
          </button>
        ))}
      </div>

      {/* Tab content */}
      {tab === "events" && (
        <div className="flex flex-col items-center justify-center min-h-[50vh] gap-4 text-center px-6">
          <div
            className="w-14 h-14 flex items-center justify-center rounded-2xl mb-2"
            style={{ background: "rgba(255,255,255,0.06)", border: "1px solid rgba(255,255,255,0.10)" }}
          >
            <span className="text-2xl">👥</span>
          </div>
          <h2 className="text-cc-off text-[18px] font-semibold tracking-tight">Community</h2>
          <p className="text-cc-off/40 text-[13px] leading-relaxed max-w-xs">
            Your home for everything happening in the Cairo Confessions community — events, support groups, workshops, and more. Coming soon.
          </p>
        </div>
      )}

      {tab === "chat" && (
        <div className="flex flex-col items-center justify-center min-h-[50vh] gap-4 text-center px-6">
          <div
            className="w-14 h-14 flex items-center justify-center rounded-2xl mb-2"
            style={{ background: "rgba(255,255,255,0.06)", border: "1px solid rgba(255,255,255,0.10)" }}
          >
            <span className="text-2xl">💬</span>
          </div>
          <h2 className="text-cc-off text-[18px] font-semibold tracking-tight">Community Chat</h2>
          <p className="text-cc-off/40 text-[13px] leading-relaxed max-w-xs">
            A shared space for the Cairo Confessions community. Coming soon.
          </p>
        </div>
      )}
    </div>
  );
}
