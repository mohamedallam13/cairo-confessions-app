import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { useTranslation } from "../lib/i18n";

export const Route = createFileRoute("/events")({
  component: EventsPage,
});

function EventsPage() {
  const { t } = useTranslation();
  const [tab, setTab] = useState<"events" | "chat">("events");

  return (
    <div className="flex flex-col">
      {/* Sub-tab bar */}
      <div
        className="flex rounded-xl mb-6 p-1"
        style={{ background: "rgba(255,255,255,0.05)", border: "1px solid rgba(255,255,255,0.08)" }}
      >
        {(["events", "chat"] as const).map((tab_) => (
          <button
            key={tab_}
            onClick={() => setTab(tab_)}
            className="flex-1 py-2 text-[12px] font-bold uppercase tracking-[0.08em] rounded-lg transition-all duration-200"
            style={
              tab === tab_
                ? { background: "rgba(var(--phase-accent-rgb, 4,201,244), 0.15)", color: "var(--phase-accent, #04C9F4)" }
                : { color: "rgba(242,242,242,0.35)" }
            }
          >
            {tab_ === "events" ? t("community.tabEvents") : t("community.tabChat")}
          </button>
        ))}
      </div>

      {tab === "events" && (
        <div className="flex flex-col items-center justify-center min-h-[50vh] gap-4 text-center px-6">
          <div
            className="w-14 h-14 flex items-center justify-center rounded-2xl mb-2"
            style={{ background: "rgba(255,255,255,0.06)", border: "1px solid rgba(255,255,255,0.10)" }}
          >
            <span className="text-2xl">👥</span>
          </div>
          <h2 className="text-cc-off text-[18px] font-semibold tracking-tight">{t("community.eventsTitle")}</h2>
          <p className="text-cc-off/40 text-[13px] leading-relaxed max-w-xs">{t("community.eventsBody")}</p>
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
          <h2 className="text-cc-off text-[18px] font-semibold tracking-tight">{t("community.chatTitle")}</h2>
          <p className="text-cc-off/40 text-[13px] leading-relaxed max-w-xs">{t("community.chatBody")}</p>
        </div>
      )}
    </div>
  );
}
