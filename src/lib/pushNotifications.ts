import { createServerFn } from "@tanstack/react-start";

type KVNamespace = {
  get(key: string): Promise<string | null>;
  put(key: string, value: string): Promise<void>;
  delete(key: string): Promise<void>;
  list(opts?: { prefix?: string }): Promise<{ keys: Array<{ name: string }> }>;
};

type CFEnv = {
  PUSH_SUBS: KVNamespace;
  VAPID_PUBLIC_KEY: string;
  VAPID_PRIVATE_KEY: string;
};

export type PushSubscriptionJSON = {
  endpoint: string;
  keys: { p256dh: string; auth: string };
};

function getCFEnv(): CFEnv {
  return (globalThis as Record<string, unknown>)["__env__"] as CFEnv;
}

export const subscribePush = createServerFn({ method: "POST" }).handler(async (ctx) => {
  const { anonId, subscription } = ctx.data as unknown as {
    anonId: string;
    subscription: PushSubscriptionJSON;
  };

  const env = getCFEnv();
  await env.PUSH_SUBS.put(`sub:${anonId}`, JSON.stringify(subscription));
  return { ok: true };
});

export const unsubscribePush = createServerFn({ method: "POST" }).handler(async (ctx) => {
  const { anonId } = ctx.data as unknown as { anonId: string };
  const env = getCFEnv();
  await env.PUSH_SUBS.delete(`sub:${anonId}`);
  return { ok: true };
});

export const getPushStatus = createServerFn({ method: "GET" }).handler(async (ctx) => {
  const { anonId } = ctx.data as unknown as { anonId: string };
  const env = getCFEnv();
  const sub = await env.PUSH_SUBS.get(`sub:${anonId}`);
  return { subscribed: sub !== null };
});

export async function sendPushToAll(env: CFEnv): Promise<void> {
  const webpush = (await import("web-push")).default;
  webpush.setVapidDetails(
    "mailto:theoracle@cairoconfessions.com",
    env.VAPID_PUBLIC_KEY,
    env.VAPID_PRIVATE_KEY,
  );

  const list = await env.PUSH_SUBS.list({ prefix: "sub:" });
  const sends = list.keys.map(async ({ name }) => {
    const raw = await env.PUSH_SUBS.get(name);
    if (!raw) return;
    try {
      const sub = JSON.parse(raw) as PushSubscriptionJSON;
      await webpush.sendNotification(
        sub as Parameters<typeof webpush.sendNotification>[0],
        JSON.stringify({ title: "Cairo Confessions", body: "Something is waiting for you." }),
      );
    } catch {
      await env.PUSH_SUBS.delete(name);
    }
  });
  await Promise.all(sends);
}
