import { useEffect, useState } from "react";
import { X, Share, MoreVertical, Plus, ChevronDown } from "lucide-react";
import { AnimatePresence, motion } from "framer-motion";
import { useTranslation } from "../lib/i18n";
import logoIcon from "../assets/logo-icon.png";

function isPWA() {
  return (
    window.matchMedia("(display-mode: standalone)").matches ||
    (navigator as Navigator & { standalone?: boolean }).standalone === true
  );
}

function isIOS() {
  return /iphone|ipad|ipod/i.test(navigator.userAgent);
}

type Mode = "ios" | "android-native" | "android-manual";

export default function InstallBanner() {
  const { t, lang } = useTranslation();
  const [visible, setVisible] = useState(false);
  const [mode, setMode] = useState<Mode>("ios");
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const [deferredPrompt, setDeferredPrompt] = useState<any>(null);

  useEffect(() => {
    if (isPWA()) return;

    if (isIOS()) {
      setMode("ios");
      setVisible(true);
      return;
    }

    function onPrompt(e: Event) {
      e.preventDefault();
      setDeferredPrompt(e);
      setMode("android-native");
      setVisible(true);
    }

    window.addEventListener("beforeinstallprompt", onPrompt);

    // Fallback: Android browser with no prompt API (Samsung Internet, Firefox, etc.)
    const fallbackTimer = setTimeout(() => {
      if (!isPWA()) {
        setMode("android-manual");
        setVisible(true);
      }
    }, 3000);

    return () => {
      window.removeEventListener("beforeinstallprompt", onPrompt);
      clearTimeout(fallbackTimer);
    };
  }, []);

  function dismiss() {
    setVisible(false);
  }

  async function install() {
    if (!deferredPrompt) return;
    deferredPrompt.prompt();
    await deferredPrompt.userChoice;
    setDeferredPrompt(null);
    setVisible(false);
  }

  return (
    <AnimatePresence>
      {visible && (
        <motion.div
          className="fixed left-1/2 -translate-x-1/2 z-40 w-[min(440px,calc(100%-24px))]"
          style={{ bottom: "calc(env(safe-area-inset-bottom, 0px) + 108px)" }}
          initial={{ y: 100, opacity: 0 }}
          animate={{ y: 0, opacity: 1 }}
          exit={{ y: 100, opacity: 0 }}
          transition={{ type: "spring", damping: 28, stiffness: 260 }}
        >
          <div
            className="w-full rounded-2xl overflow-hidden"
            style={{
              background: "rgba(12,15,18,0.97)",
              backdropFilter: "blur(28px)",
              border: "1.5px solid rgba(var(--phase-accent-rgb,4,201,244),0.22)",
              boxShadow: "0 16px 48px -8px rgba(0,0,0,0.75), 0 0 0 1px rgba(255,255,255,0.04) inset",
            }}
          >
            {/* Header row — always LTR: logo left, brand name, X right */}
            <div className="flex items-center gap-3 px-4 pt-4 pb-3" dir="ltr">
              <img src={logoIcon} alt="" className="w-9 h-9 rounded-xl shrink-0" />
              <div className="flex-1 min-w-0" dir="ltr">
                <p className="text-[13px] font-semibold text-cc-off/90 leading-tight">Cairo Confessions</p>
                <p className="text-[10.5px] text-cc-off/40 leading-tight mt-0.5">{t("install.tagline")}</p>
              </div>
              <button
                onClick={dismiss}
                className="shrink-0 w-7 h-7 flex items-center justify-center rounded-full transition-colors"
                style={{ color: "rgba(242,242,242,0.25)", background: "rgba(255,255,255,0.06)" }}
                aria-label="Dismiss"
              >
                <X size={13} strokeWidth={2.2} />
              </button>
            </div>

            {/* Divider */}
            <div style={{ borderTop: "1px solid rgba(255,255,255,0.07)" }} />

            {/* Steps */}
            <div className="px-4 py-3.5 space-y-3" dir={lang === "ar" ? "rtl" : "ltr"}>
              {mode === "ios" && (
                <>
                  <p className="text-[10px] uppercase tracking-[0.2em] text-cc-off/30 mb-1">{t("install.howTo")}</p>
                  <Step num={1} icon={<Share size={15} strokeWidth={1.8} />} text={t("install.ios_step1")} />
                  <Step num={2} icon={<ChevronDown size={15} strokeWidth={2} />} text={t("install.ios_step2")} />
                  <Step num={3} icon={<Plus size={15} strokeWidth={2} />} text={t("install.ios_step3")} />
                </>
              )}

              {mode === "android-native" && (
                <button
                  onClick={install}
                  className="w-full py-3 rounded-xl text-[12px] font-bold uppercase tracking-[0.14em] transition-all active:scale-[0.97]"
                  style={{
                    background: "linear-gradient(135deg, var(--phase-accent,#04C9F4), rgba(var(--phase-accent-rgb,4,201,244),0.75))",
                    color: "#050606",
                  }}
                >
                  {t("install.addToHomeScreen")}
                </button>
              )}

              {mode === "android-manual" && (
                <>
                  <p className="text-[10px] uppercase tracking-[0.2em] text-cc-off/30 mb-1">{t("install.howTo")}</p>
                  <Step
                    num={1}
                    icon={<MoreVertical size={15} strokeWidth={1.8} />}
                    text={t("install.android_step1")}
                  />
                  <Step
                    num={2}
                    icon={<Plus size={15} strokeWidth={2} />}
                    text={t("install.android_step2")}
                  />
                </>
              )}
            </div>
          </div>

          {/* Arrow pointing down toward Safari toolbar on iOS */}
          {mode === "ios" && (
            <div className="flex justify-center mt-1.5">
              <svg width="14" height="8" viewBox="0 0 14 8" fill="none">
                <path d="M1 1L7 7L13 1" stroke="rgba(var(--phase-accent-rgb,4,201,244),0.4)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
            </div>
          )}
        </motion.div>
      )}
    </AnimatePresence>
  );
}

function Step({ num, icon, text }: { num: number; icon: React.ReactNode; text: string }) {
  return (
    <div className="flex items-center gap-3">
      <div
        className="shrink-0 w-6 h-6 rounded-full flex items-center justify-center text-[10px] font-bold"
        style={{ background: "rgba(var(--phase-accent-rgb,4,201,244),0.12)", color: "var(--phase-accent,#04C9F4)" }}
      >
        {num}
      </div>
      <div
        className="shrink-0 w-7 h-7 rounded-lg flex items-center justify-center"
        style={{ background: "rgba(255,255,255,0.07)", color: "rgba(242,242,242,0.55)" }}
      >
        {icon}
      </div>
      <p className="text-[12px] text-cc-off/60 leading-snug flex-1">{text}</p>
    </div>
  );
}
