import { createFileRoute } from "@tanstack/react-router";
import { useTranslation } from "../lib/i18n";

export const Route = createFileRoute("/home")({
  component: HomePage,
});

function HomePage() {
  const { t } = useTranslation();
  return (
    <div className="flex flex-col items-center justify-center min-h-[60vh] gap-4 text-center px-6">
      <div
        className="w-14 h-14 flex items-center justify-center rounded-2xl mb-2"
        style={{ background: "rgba(255,255,255,0.06)", border: "1px solid rgba(255,255,255,0.10)" }}
      >
        <span className="text-2xl">📰</span>
      </div>
      <h2 className="text-cc-off text-[18px] font-semibold tracking-tight">{t("home.title")}</h2>
      <p className="text-cc-off/40 text-[13px] leading-relaxed max-w-xs">{t("home.body")}</p>
    </div>
  );
}
