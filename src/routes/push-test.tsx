import { createFileRoute } from "@tanstack/react-router";
import { createServerFn } from "@tanstack/react-start";
import { useState } from "react";

const VAPID_PUBLIC_KEY =
  "BKAhcwHJv1WCOk0ve_MM07KF2Nx0nd_DKu7qARwt-u7iuA0f6jOOPe-sPU8th5yuEqcgk2DggXHaLXIUZ9IZPNk";

type PushPayload = {
  subscription: { endpoint: string; keys: { p256dh: string; auth: string } };
};

const sendTestPush = createServerFn({ method: "POST" }).handler(async (ctx) => {
  const { subscription } = ctx.data as unknown as PushPayload;

  const webpush = (await import("web-push")).default;
  webpush.setVapidDetails(
    "mailto:theoracle@cairoconfessions.com",
    process.env["VAPID_PUBLIC_KEY"]!,
    process.env["VAPID_PRIVATE_KEY"]!,
  );

  await webpush.sendNotification(
    subscription as Parameters<typeof webpush.sendNotification>[0],
    JSON.stringify({ title: "Cairo Confessions", body: "Push notifications work!" }),
  );

  return { ok: true };
});

export const Route = createFileRoute("/push-test")({
  component: PushTestPage,
});

function urlBase64ToUint8Array(base64String: string): Uint8Array {
  const padding = "=".repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, "+").replace(/_/g, "/");
  const raw = atob(base64);
  return Uint8Array.from([...raw].map((c) => c.charCodeAt(0)));
}

type Status = "idle" | "subscribing" | "subscribed" | "sending" | "sent" | "error";

function PushTestPage() {
  const [status, setStatus] = useState<Status>("idle");
  const [subscription, setSubscription] = useState<PushSubscription | null>(null);
  const [error, setError] = useState("");

  async function handleSubscribe() {
    try {
      setStatus("subscribing");
      setError("");

      if (!("serviceWorker" in navigator) || !("PushManager" in window)) {
        throw new Error("Push not supported in this browser");
      }

      const reg = await navigator.serviceWorker.register("/sw.js");
      await navigator.serviceWorker.ready;

      const perm = await Notification.requestPermission();
      if (perm !== "granted") throw new Error("Permission denied");

      const sub = await reg.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToUint8Array(VAPID_PUBLIC_KEY).buffer as ArrayBuffer,
      });

      setSubscription(sub);
      setStatus("subscribed");
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
      setStatus("error");
    }
  }

  async function handleSendTest() {
    if (!subscription) return;
    try {
      setStatus("sending");
      setError("");
      const json = subscription.toJSON();
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      await (sendTestPush as any)({
        data: {
          subscription: {
            endpoint: json.endpoint!,
            keys: { p256dh: json.keys!["p256dh"], auth: json.keys!["auth"] },
          },
        },
      });
      setStatus("sent");
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
      setStatus("error");
    }
  }

  return (
    <div style={{ padding: 24, fontFamily: "monospace", color: "white", background: "#050606", minHeight: "100vh" }}>
      <h1 style={{ fontSize: 16, fontWeight: "bold", marginBottom: 20 }}>
        Push Notification Test
      </h1>

      <div style={{ marginBottom: 12, fontSize: 14 }}>
        Status: <span style={{ color: statusColor(status) }}>{status}</span>
      </div>

      {error && (
        <div style={{ color: "#ff6b6b", fontSize: 12, marginBottom: 12, maxWidth: 320 }}>
          {error}
        </div>
      )}

      <div style={{ display: "flex", flexDirection: "column", gap: 8, maxWidth: 240 }}>
        <button
          onClick={handleSubscribe}
          disabled={status === "subscribed" || status === "subscribing"}
          style={btnStyle(status === "subscribed" || status === "subscribing")}
        >
          {status === "subscribing" ? "Subscribing…" : "1. Subscribe"}
        </button>

        <button
          onClick={handleSendTest}
          disabled={!subscription || status === "sending" || status === "sent"}
          style={btnStyle(!subscription || status === "sending" || status === "sent")}
        >
          {status === "sending" ? "Sending…" : status === "sent" ? "Sent ✓" : "2. Send Test Notification"}
        </button>
      </div>

      {subscription && (
        <details style={{ marginTop: 20 }}>
          <summary style={{ cursor: "pointer", color: "#555", fontSize: 12 }}>
            Subscription JSON
          </summary>
          <pre style={{ fontSize: 10, color: "#555", overflow: "auto", marginTop: 8, maxWidth: "100%" }}>
            {JSON.stringify(subscription.toJSON(), null, 2)}
          </pre>
        </details>
      )}
    </div>
  );
}

function btnStyle(disabled: boolean): React.CSSProperties {
  return {
    padding: "10px 16px",
    background: disabled ? "#1a1a1a" : "#2a2a2a",
    color: disabled ? "#555" : "white",
    border: "1px solid #333",
    borderRadius: 6,
    cursor: disabled ? "not-allowed" : "pointer",
    fontSize: 13,
    textAlign: "left",
  };
}

function statusColor(status: Status): string {
  if (status === "error") return "#ff6b6b";
  if (status === "sent" || status === "subscribed") return "#6bffb8";
  if (status === "subscribing" || status === "sending") return "#ffd06b";
  return "#666";
}
