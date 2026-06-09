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

type CFCtx = { waitUntil(p: Promise<unknown>): void };

export type PushSubscriptionJSON = {
  endpoint: string;
  keys: { p256dh: string; auth: string };
};

function getCFEnv(): CFEnv {
  return (globalThis as Record<string, unknown>)["__env__"] as CFEnv;
}

function getCFCtx(): CFCtx | undefined {
  return (globalThis as Record<string, unknown>)["__ctx__"] as CFCtx | undefined;
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
  const { anonId, subscription, confessionSerialNums } = ctx.data as unknown as {
    anonId: string;
    subscription: PushSubscriptionJSON;
    confessionSerialNums?: number[];
  };

  const env = getCFEnv();
  const hasKV = !!env?.PUSH_SUBS;
  console.log(`[push:subscribe] anonId=${anonId} hasKV=${hasKV} endpoint=${subscription?.endpoint?.slice(0, 50)} serials=${confessionSerialNums?.length ?? 0}`);
  await putSub(env, `sub:${anonId}`, JSON.stringify(subscription));

  // Map each confession serial → this anonId so createThread can push on first message
  if (confessionSerialNums?.length) {
    await Promise.all(confessionSerialNums.map(n => putSub(env, `confession_push:${n}`, anonId)));
    console.log(`[push:subscribe] mapped serials [${confessionSerialNums.join(",")}] → ${anonId}`);
  }

  console.log(`[push:subscribe] stored sub:${anonId} in ${hasKV ? "KV" : "devStore"}`);
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

export const sendStatusChangePush = createServerFn({ method: "POST" }).handler(async (ctx) => {
  const { anonId, newStatus, rejectionReasons } = ctx.data as unknown as {
    anonId: string;
    newStatus: string;
    rejectionReasons?: string;
  };

  const STATUS_MESSAGES: Record<string, { title: string; body: string }> = {
    scheduled:   { title: "Cairo Confessions", body: "Your confession is scheduled — going live soon." },
    posted:      { title: "Cairo Confessions", body: "Your confession is live. Cairo can hear you." },
    shadowed:    { title: "Cairo Confessions", body: "Your confession is live. Cairo can hear you." },
    rejected:    { title: "Cairo Confessions", body: rejectionReasons ? `Your confession wasn't posted: ${rejectionReasons}` : "Your confession wasn't posted. Tap for details." },
    skipped:     { title: "Cairo Confessions", body: "Your confession was skipped this round — may be reconsidered." },
    new_message: { title: "Cairo Confessions", body: rejectionReasons ? `Someone reached out — ${rejectionReasons}` : "Someone reached out about your confession." },
  };

  const msg = STATUS_MESSAGES[newStatus];
  if (!msg) return { ok: false };

  await sendPushToUser(anonId, { ...msg, url: "/track" });
  return { ok: true };
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
    { TTL: 86400 },
  );
  return { ok: true };
});

export async function sendPushToUser(
  anonId: string,
  payload: { title: string; body: string; url?: string },
): Promise<void> {
  await new Promise(r => setTimeout(r, 3000));
  const env = getCFEnv();
  const raw = await getSub(env, `sub:${anonId}`);
  console.log(`[push:send] anonId=${anonId} subFound=${!!raw} hasKV=${!!env?.PUSH_SUBS}`);
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
      { TTL: 86400 },
    );
  } catch (err) {
    const code = (err as Record<string, unknown>)?.statusCode as number | undefined;
    console.error(`[push] sendPushToUser failed for ${anonId}: statusCode=${code}`, err);
    // Only remove subscription on explicit "subscription gone" responses
    if (code === 410 || code === 404) {
      await deleteSub(env, `sub:${anonId}`);
    }
  }
}

/** Returns the anonId of the confessor who owns this serial number, or null if not registered. */
export async function getConfessorPushAnonId(serialNum: number): Promise<string | null> {
  const env = getCFEnv();
  return getSub(env, `confession_push:${serialNum}`);
}

/** Fire push and extend CF Worker lifetime via waitUntil so it completes after response is sent. */
export function scheduleDirectPush(
  anonId: string,
  payload: { title: string; body: string; url?: string },
): void {
  const p = sendPushToUser(anonId, payload).catch((e) => {
    console.error(`[push] scheduleDirectPush failed for ${anonId}:`, e);
  });
  getCFCtx()?.waitUntil(p);
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
        { TTL: 86400 },
      );
    } catch (err) {
      console.error(`[push] sendPushToAll failed for ${name}:`, err);
      await env.PUSH_SUBS.delete(name);
    }
  });
  await Promise.all(sends);
}
