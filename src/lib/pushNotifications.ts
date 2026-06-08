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

// In-memory fallback for local dev — lives on globalThis to survive Vite module re-evaluations
const g = globalThis as Record<string, unknown>;
if (!g.__devSubStore) g.__devSubStore = new Map<string, string>();
const devSubStore = g.__devSubStore as Map<string, string>;

function putSub(env: CFEnv | undefined, key: string, value: string): Promise<void> {
  if (env?.PUSH_SUBS) return env.PUSH_SUBS.put(key, value);
  devSubStore.set(key, value);
  return Promise.resolve();
}

function getSub(env: CFEnv | undefined, key: string): Promise<string | null> {
  if (env?.PUSH_SUBS) return env.PUSH_SUBS.get(key);
  return Promise.resolve(devSubStore.get(key) ?? null);
}

function deleteSub(env: CFEnv | undefined, key: string): Promise<void> {
  if (env?.PUSH_SUBS) return env.PUSH_SUBS.delete(key);
  devSubStore.delete(key);
  return Promise.resolve();
}

export const subscribePush = createServerFn({ method: "POST" }).handler(async (ctx) => {
  const { anonId, subscription } = ctx.data as unknown as {
    anonId: string;
    subscription: PushSubscriptionJSON;
  };

  const env = getCFEnv();
  await putSub(env, `sub:${anonId}`, JSON.stringify(subscription));
  return { ok: true };
});

export const unsubscribePush = createServerFn({ method: "POST" }).handler(async (ctx) => {
  const { anonId } = ctx.data as unknown as { anonId: string };
  const env = getCFEnv();
  await deleteSub(env, `sub:${anonId}`);
  return { ok: true };
});

export const getPushStatus = createServerFn({ method: "GET" }).handler(async (ctx) => {
  const { anonId } = ctx.data as unknown as { anonId: string };
  const env = getCFEnv();
  const sub = await getSub(env, `sub:${anonId}`);
  return { subscribed: sub !== null };
});

export const sendDirectPush = createServerFn({ method: "POST" }).handler(async (ctx) => {
  const { subscription, payload } = ctx.data as unknown as {
    subscription: PushSubscriptionJSON;
    payload: { title: string; body: string; url?: string };
  };
  const env = getCFEnv();
  const pubKey = env?.VAPID_PUBLIC_KEY ?? process.env["VAPID_PUBLIC_KEY"];
  const privKey = env?.VAPID_PRIVATE_KEY ?? process.env["VAPID_PRIVATE_KEY"];
  if (!pubKey || !privKey) return { ok: false };
  const webpush = (await import("web-push")).default;
  webpush.setVapidDetails("mailto:theoracle@cairoconfessions.com", pubKey, privKey);
  await webpush.sendNotification(
    subscription as Parameters<typeof webpush.sendNotification>[0],
    JSON.stringify(payload),
  );
  return { ok: true };
});

export async function sendPushToUser(
  anonId: string,
  payload: { title: string; body: string; url?: string },
): Promise<void> {
  const env = getCFEnv();
  const raw = await getSub(env, `sub:${anonId}`);
  if (!raw) return;
  const pubKey = env?.VAPID_PUBLIC_KEY ?? process.env["VAPID_PUBLIC_KEY"];
  const privKey = env?.VAPID_PRIVATE_KEY ?? process.env["VAPID_PRIVATE_KEY"];
  if (!pubKey || !privKey) return;
  const webpush = (await import("web-push")).default;
  webpush.setVapidDetails("mailto:theoracle@cairoconfessions.com", pubKey, privKey);
  try {
    const sub = JSON.parse(raw) as PushSubscriptionJSON;
    await webpush.sendNotification(
      sub as Parameters<typeof webpush.sendNotification>[0],
      JSON.stringify(payload),
    );
  } catch {
    await deleteSub(env, `sub:${anonId}`);
  }
}

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
