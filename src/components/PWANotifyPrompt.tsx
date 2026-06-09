import { useEffect, useState } from "react";
import { Bell } from "lucide-react";
import { AnimatePresence, motion } from "framer-motion";
import { useTranslation } from "../lib/i18n";
import { subscribePush, sendDirectPush } from "../lib/pushNotifications";
import { getOrCreateAnonId } from "../lib/anonIdentity";

const VAPID_PUBLIC_KEY = "BKAhcwHJv1WCOk0ve_MM07KF2Nx0nd_DKu7qARwt-u7iuA0f6jOOPe-sPU8th5yuEqcgk2DggXHaLXIUZ9IZPNk";
const PROMPTED_KEY = "cc_push_prompted";

function urlBase64ToUint8Array(b64: string): Uint8Array {
  const pad = "=".repeat((4 - (b64.length % 4)) % 4);
  const raw = atob((b64 + pad).replace(/-/g, "+").replace(/_/g, "/"));
  return Uint8Array.from([...raw].map((c) => c.charCodeAt(0)));
}

function isPWA() {
  return (
    window.matchMedia("(display-mode: standalone)").matches ||
    (navigator as Navigator & { standalone?: boolean }).standalone === true
  );
}

export default function PWANotifyPrompt({ canShow }: { canShow: boolean }) {
  const { t, lang } = useTranslation();
  const [visible, setVisible] = useState(false);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!canShow) return;
    if (localStorage.getItem(PROMPTED_KEY)) return;
    if (!("serviceWorker" in navigator) || !("PushManager" in window)) return;
    if (localStorage.getItem("cc_push_enabled") === "1") return;
    if (!isPWA()) return;

    const timer = setTimeout(() => setVisible(true), 2500);
    return () => clearTimeout(timer);
  }, [canShow]);

  function dismiss() {
    localStorage.setItem(PROMPTED_KEY, "skipped");
    setVisible(false);
  }

  async function enable() {
    setLoading(true);
    localStorage.setItem(PROMPTED_KEY, "prompted");
    try {
      await navigator.serviceWorker.register("/sw.js");
      const reg = await navigator.serviceWorker.ready;
      const perm = await Notification.requestPermission();
      if (perm !== "granted") { setVisible(false); setLoading(false); return; }
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const sub = await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: urlBase64ToUint8Array(VAPID_PUBLIC_KEY) as any });
      const j = sub.toJSON();
      const subJson = { endpoint: j.endpoint!, keys: { p256dh: j.keys!["p256dh"], auth: j.keys!["auth"] } };
      const anonId = getOrCreateAnonId();
      const nums = [...new Set([
        ...Object.values(JSON.parse(localStorage.getItem("cc_card_cache") ?? "{}") as Record<string, { serialNum?: string }>)
          .map(c => parseInt(c.serialNum ?? "", 10)).filter(n => !isNaN(n) && n > 0),
        ...Object.values(JSON.parse(localStorage.getItem("cc_status_cache") ?? "{}") as Record<string, { serialNum?: string }>)
          .map(e => parseInt(e.serialNum ?? "", 10)).filter(n => !isNaN(n) && n > 0),
      ])];
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      await (subscribePush as any)({ data: { anonId, subscription: subJson, confessionSerialNums: nums } });
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      await (sendDirectPush as any)({ data: { subscription: subJson, payload: { title: "Cairo Confessions", body: "Notifications are on.", url: "/track" } } });
      localStorage.setItem("cc_push_enabled", "1");
    } catch (e) {
      console.error("[pwa-notify-prompt]", e);
    }
    setVisible(false);
    setLoading(false);
  }

  return (
    <AnimatePresence>
      {visible && (
        <motion.div
          className="fixed inset-0 z-[55] flex items-end justify-center p-4"
          style={{ background: "rgba(0,0,0,0.55)", backdropFilter: "blur(6px)", paddingBottom: "calc(env(safe-area-inset-bottom,0px) + 16px)" }}
          initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
          onClick={dismiss}
        >
          <motion.div
            className="w-full max-w-lg rounded-2xl overflow-hidden"
            style={{ background: "rgba(10,12,15,0.98)", border: "1px solid rgba(255,255,255,0.10)", boxShadow: "0 32px 64px -16px rgba(0,0,0,0.8)" }}
            initial={{ y: 80, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            exit={{ y: 80, opacity: 0 }}
            transition={{ type: "spring", damping: 30, stiffness: 280 }}
            onClick={(e) => e.stopPropagation()}
          >
            {/* Header */}
            <div className="flex items-center gap-4 px-5 pt-6 pb-3" dir="ltr">
              <div
                className="w-12 h-12 rounded-2xl shrink-0 flex items-center justify-center"
                style={{ background: "rgba(var(--phase-accent-rgb,4,201,244),0.12)", border: "1px solid rgba(var(--phase-accent-rgb,4,201,244),0.20)" }}
              >
                <Bell size={22} strokeWidth={1.6} style={{ color: "var(--phase-accent,#04C9F4)" }} />
              </div>
              <div>
                <p className="text-[16px] font-semibold text-cc-off/95 leading-tight">{t("pwaNotify.title")}</p>
                <p className="text-[11.5px] text-cc-off/35 leading-snug mt-0.5">{t("pwaNotify.subtitle")}</p>
              </div>
            </div>

            <p className="text-[13px] text-cc-off/50 leading-[1.8] px-5 pb-5" dir={lang === "ar" ? "rtl" : "ltr"}>
              {t("pwaNotify.body")}
            </p>

            <div className="px-5 pb-6 flex flex-col gap-2.5">
              <button
                onClick={enable}
                disabled={loading}
                className="w-full py-3.5 font-display text-[12px] uppercase tracking-[0.20em] rounded-xl transition-all active:scale-[0.97] disabled:opacity-50"
                style={{
                  background: "linear-gradient(135deg, var(--phase-accent,#04C9F4), rgba(var(--phase-accent-rgb,4,201,244),0.75))",
                  color: "#050606",
                }}
              >
                {loading ? "···" : t("pwaNotify.enable")}
              </button>
              <button
                onClick={dismiss}
                className="w-full py-2.5 text-[11px] uppercase tracking-[0.16em] text-cc-off/22 hover:text-cc-off/45 transition-colors"
              >
                {t("pwaNotify.notNow")}
              </button>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
