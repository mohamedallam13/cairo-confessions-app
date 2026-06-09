import { createFileRoute, useRouter } from "@tanstack/react-router";
import { useState, useEffect } from "react";
import { Bell, BellOff, ArrowRightLeft, Trash2 } from "lucide-react";
import { getOrCreateAnonId, resetIdentity } from "../lib/anonIdentity";
import { subscribePush, unsubscribePush, sendDirectPush } from "../lib/pushNotifications";

export const Route = createFileRoute("/profile")({
  component: ProfilePage,
});

const PUSH_VAPID_PUBLIC_KEY =
  "BKAhcwHJv1WCOk0ve_MM07KF2Nx0nd_DKu7qARwt-u7iuA0f6jOOPe-sPU8th5yuEqcgk2DggXHaLXIUZ9IZPNk";

function urlBase64ToUint8Array(b64: string): Uint8Array {
  const pad = "=".repeat((4 - (b64.length % 4)) % 4);
  const raw = atob((b64 + pad).replace(/-/g, "+").replace(/_/g, "/"));
  return Uint8Array.from([...raw].map((c) => c.charCodeAt(0)));
}

function NotificationsRow() {
  const anonId = typeof window !== "undefined" ? getOrCreateAnonId() : "";
  const [enabled, setEnabled] = useState(false);
  const [loading, setLoading] = useState(false);
  const [supported, setSupported] = useState(true);
  const [err, setErr] = useState("");

  useEffect(() => {
    if (!("serviceWorker" in navigator) || !("PushManager" in window)) {
      setSupported(false);
      return;
    }
    setEnabled(localStorage.getItem("cc_push_enabled") === "1");
  }, []);

  async function toggle() {
    if (loading || !anonId) return;
    setLoading(true);
    setErr("");
    try {
      if (!enabled) {
        await navigator.serviceWorker.register("/sw.js");
        const registration = await navigator.serviceWorker.ready;
        const perm = await Notification.requestPermission();
        if (perm !== "granted") { setLoading(false); return; }
        const sub = await registration.pushManager.subscribe({
          userVisibleOnly: true,
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          applicationServerKey: urlBase64ToUint8Array(PUSH_VAPID_PUBLIC_KEY) as any,
        });
        const j = sub.toJSON();
        const subJson = { endpoint: j.endpoint!, keys: { p256dh: j.keys!["p256dh"], auth: j.keys!["auth"] } };
        const cardNums = Object.values(JSON.parse(localStorage.getItem("cc_card_cache") ?? "{}") as Record<string, { serialNum?: string }>)
          .map(c => parseInt(c.serialNum ?? "", 10)).filter(n => !isNaN(n) && n > 0);
        const statusNums = Object.values(JSON.parse(localStorage.getItem("cc_status_cache") ?? "{}") as Record<string, { serialNum?: string }>)
          .map(e => parseInt(e.serialNum ?? "", 10)).filter(n => !isNaN(n) && n > 0);
        const allNums = [...new Set([...cardNums, ...statusNums])];
        await (subscribePush as any)({ data: { anonId, subscription: subJson, confessionSerialNums: allNums } });
        await (sendDirectPush as any)({
          data: { subscription: subJson, payload: { title: "Cairo Confessions", body: "Notifications enabled", url: "/track" } },
        });
        localStorage.setItem("cc_push_enabled", "1");
        setEnabled(true);
      } else {
        const reg = await navigator.serviceWorker.getRegistration("/sw.js");
        if (reg) { const sub = await reg.pushManager.getSubscription(); if (sub) await sub.unsubscribe(); }
        await (unsubscribePush as any)({ data: { anonId } });
        localStorage.removeItem("cc_push_enabled");
        setEnabled(false);
      }
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e));
    }
    setLoading(false);
  }

  if (!supported) return null;

  return (
    <div className="space-y-1.5">
      <button
        onClick={toggle}
        disabled={loading}
        className="w-full flex items-center justify-between gap-3 py-3.5 px-4 rounded-xl transition-all active:scale-[0.98]"
        style={{
          background: enabled ? "rgba(var(--phase-accent-rgb,4,201,244),0.08)" : "rgba(255,255,255,0.04)",
          border: enabled ? "1px solid rgba(var(--phase-accent-rgb,4,201,244),0.22)" : "1px solid rgba(255,255,255,0.09)",
          opacity: loading ? 0.6 : 1,
        }}
      >
        <div className="flex items-center gap-3">
          {enabled
            ? <Bell size={17} strokeWidth={1.6} style={{ color: "var(--phase-accent,#04C9F4)" }} />
            : <BellOff size={17} strokeWidth={1.6} style={{ color: "rgba(242,242,242,0.35)" }} />
          }
          <span className="text-[13px]" style={{ color: enabled ? "var(--phase-accent,#04C9F4)" : "rgba(242,242,242,0.55)" }}>
            Push notifications
          </span>
        </div>
        <div
          className="w-10 h-5.5 rounded-full flex items-center px-0.5 transition-all"
          style={{
            background: enabled ? "rgba(var(--phase-accent-rgb,4,201,244),0.35)" : "rgba(255,255,255,0.10)",
            paddingTop: "2px",
            paddingBottom: "2px",
          }}
        >
          <div
            className="w-4 h-4 rounded-full transition-all duration-200"
            style={{
              background: enabled ? "var(--phase-accent,#04C9F4)" : "rgba(242,242,242,0.35)",
              transform: enabled ? "translateX(20px)" : "translateX(0)",
            }}
          />
        </div>
      </button>
      {err && <p className="text-[11px] text-red-400/70 px-1">{err}</p>}
    </div>
  );
}

function ResetRow() {
  const router = useRouter();
  const [confirm, setConfirm] = useState(false);

  function doReset() {
    resetIdentity();
    router.navigate({ to: "/" });
  }

  return (
    <div>
      {!confirm ? (
        <button
          onClick={() => setConfirm(true)}
          className="w-full flex items-center gap-3 py-3.5 px-4 rounded-xl transition-all active:scale-[0.98]"
          style={{ background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.09)" }}
        >
          <Trash2 size={17} strokeWidth={1.6} style={{ color: "rgba(242,242,242,0.35)" }} />
          <span className="text-[13px] text-cc-off/55">Reset session</span>
        </button>
      ) : (
        <div
          className="rounded-xl px-4 py-4 space-y-3"
          style={{ background: "rgba(255,80,80,0.06)", border: "1px solid rgba(255,80,80,0.18)" }}
        >
          <p className="text-cc-off/50 text-[12px] leading-relaxed">
            This removes your confessions and identity from this browser. You can recover them later with a transfer link.
          </p>
          <div className="flex gap-2">
            <button
              onClick={doReset}
              className="flex-1 py-2.5 text-[11px] uppercase tracking-[0.14em] rounded-lg transition-all"
              style={{ background: "rgba(255,80,80,0.15)", border: "1px solid rgba(255,80,80,0.3)", color: "rgba(255,140,140,0.85)" }}
            >
              Yes, remove it
            </button>
            <button
              onClick={() => setConfirm(false)}
              className="flex-1 py-2.5 text-[11px] uppercase tracking-[0.14em] rounded-lg text-cc-off/35 hover:text-cc-off/60 transition-colors"
            >
              Cancel
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

function ProfilePage() {
  const router = useRouter();

  return (
    <div className="space-y-8">
      {/* Notifications */}
      <section className="space-y-2.5">
        <div className="text-[9px] uppercase tracking-[0.2em] text-cc-off/25 px-1">Notifications</div>
        <NotificationsRow />
      </section>

      {/* Session */}
      <section className="space-y-2.5">
        <div className="text-[9px] uppercase tracking-[0.2em] text-cc-off/25 px-1">Session</div>
        <button
          onClick={() => router.navigate({ to: "/track", search: { t: undefined, recover: undefined } })}
          className="w-full flex items-center gap-3 py-3.5 px-4 rounded-xl transition-all active:scale-[0.98]"
          style={{ background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.09)" }}
        >
          <ArrowRightLeft size={17} strokeWidth={1.6} style={{ color: "rgba(242,242,242,0.35)" }} />
          <span className="text-[13px] text-cc-off/55">Transfer session</span>
        </button>
        <ResetRow />
      </section>
    </div>
  );
}
