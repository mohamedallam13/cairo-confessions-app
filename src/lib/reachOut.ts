import { createServerFn } from "@tanstack/react-start";
import { scheduleDirectPush, getConfessorPushAnonId } from "./pushNotifications";
import { sanitizeText } from "./sanitize";

function getSupabaseHeaders() {
  const key = process.env["SUPABASE_ANON_KEY"]!;
  return {
    "Content-Type": "application/json",
    "apikey": key,
    "Authorization": `Bearer ${key}`,
  };
}

function supabaseUrl(path: string) {
  return `${process.env["SUPABASE_URL"]}/rest/v1/${path}`;
}

const DAILY_SEND_LIMIT = 3;

async function getNewThreadDailyCount(senderAnonId: string): Promise<number> {
  const since = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
  const headers = getSupabaseHeaders();
  // No is_deleted filter — deleted threads still consume quota
  const res = await fetch(
    supabaseUrl(`cc_threads?sender_anon_id=eq.${senderAnonId}&created_at=gt.${since}&select=id`),
    { headers },
  );
  if (!res.ok) return 0;
  const rows = await res.json() as unknown[];
  return rows.length;
}

export const getDailyOutreachCount = createServerFn({ method: "POST" })
  .handler(async (ctx): Promise<{ count: number }> => {
    const { senderAnonId } = ctx.data as unknown as { senderAnonId: string };
    const count = await getNewThreadDailyCount(senderAnonId);
    return { count };
  });

export interface RemoteMessage {
  id: string;
  fromRole: "sender" | "confessor";
  content: string;
  sentAt: string;
  reactions: Record<string, string[]>; // emoji → anonId[]
}

export interface RemoteThread {
  id: string;
  confessionSerialNum: number;
  senderAnonId: string;
  confessorAnonId: string | null;
  type: string | null;
  senderEmail: string | null;
  status: "pending" | "delivered" | "rejected";
  createdAt: string;
  lastActivity: string;
  lastReactedMessageId: string | null;
  messages: RemoteMessage[];
}

// Creates thread + first message in Supabase, then fires GAS sendMessage (best-effort)
export const createThread = createServerFn({ method: "POST" })
  .handler(async (ctx): Promise<{ success: true; existingThreadId?: string } | { success: false; error: string }> => {
    const p = ctx.data as unknown as {
      conversationRef: string;
      confessionSerialNum: number;
      senderAnonId: string;
      messageId: string;
      message: string;
      type: string;
      senderEmail: string;
    };

    const cleanMessage = sanitizeText(p.message);

    const now = new Date().toISOString();
    const headers = getSupabaseHeaders();

    // Check if this sender is blocked from messaging this confession
    const blockRes = await fetch(
      supabaseUrl(`cc_blocks?sender_anon_id=eq.${p.senderAnonId}&confession_serial_num=eq.${p.confessionSerialNum}&select=sender_anon_id&limit=1`),
      { headers },
    );
    if (blockRes.ok) {
      const blocks = await blockRes.json() as unknown[];
      if (blocks.length > 0) return { success: false, error: "blocked" };
    }

    // Check for existing active thread between this sender and this confession
    const existingRes = await fetch(
      supabaseUrl(`cc_threads?confession_serial_num=eq.${p.confessionSerialNum}&sender_anon_id=eq.${p.senderAnonId}&is_deleted=eq.false&select=id&limit=1`),
      { headers },
    );
    if (existingRes.ok) {
      const existing = await existingRes.json() as Array<{ id: string }>;
      if (existing.length > 0) {
        return { success: true, existingThreadId: existing[0].id };
      }
    }

    // Rate limit: max DAILY_SEND_LIMIT new conversations per anonId per 24h
    const dailyCount = await getNewThreadDailyCount(p.senderAnonId);
    if (dailyCount >= DAILY_SEND_LIMIT) {
      return { success: false, error: "rate_limited" };
    }

    // Insert thread
    const threadRes = await fetch(supabaseUrl("cc_threads"), {
      method: "POST",
      headers: { ...headers, "Prefer": "return=minimal" },
      body: JSON.stringify({
        id: p.conversationRef,
        confession_serial_num: p.confessionSerialNum,
        sender_anon_id: p.senderAnonId,
        type: p.type,
        sender_email: p.senderEmail || null,
        status: "pending",
        created_at: now,
        last_activity: now,
      }),
    });
    if (!threadRes.ok) {
      const err = await threadRes.text();
      return { success: false, error: err };
    }

    // Insert first message
    const msgRes = await fetch(supabaseUrl("cc_messages"), {
      method: "POST",
      headers: { ...headers, "Prefer": "return=minimal" },
      body: JSON.stringify({
        id: p.messageId,
        thread_id: p.conversationRef,
        from_role: "sender",
        content: cleanMessage,
        sent_at: now,
      }),
    });
    if (!msgRes.ok) {
      const err = await msgRes.text();
      return { success: false, error: err };
    }

    // GAS sendMessage — writes message to responses DB
    const url = process.env["CC_INTAKE_URL"];
    const token = process.env["CC_INTAKE_TOKEN"];
    if (url && token) {
      let sendOk = false;
      try {
        const gasRes = await fetch(url, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            token,
            action: "sendMessage",
            conversationRef: p.conversationRef,
            confessionSerialNum: p.confessionSerialNum,
            message: cleanMessage,
            messageType: p.type,
            senderEmail: p.senderEmail || "",
            senderAnonId: p.senderAnonId,
          }),
          signal: AbortSignal.timeout(20000),
        });
        const gasBody = await gasRes.json() as { success: boolean; error?: string };
        if (!gasBody.success) {
          return { success: false, error: gasBody.error ?? "gas_send_failed" };
        }
        sendOk = true;
      } catch (e) {
        console.error("[createThread] sendMessage failed:", e);
      }

      // buildTracking immediately after a confirmed write — server-side, guaranteed sequence
      if (sendOk) {
        try {
          await fetch(url, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ token, action: "buildTracking" }),
            signal: AbortSignal.timeout(25000),
          });
        } catch (e) { console.error("[createThread] buildTracking failed:", e); }
      }
    }

    // Push notification to confessor on first message — only if they have push enabled
    const confessorPushId = await getConfessorPushAnonId(p.confessionSerialNum);
    console.log(`[createThread:push] serialNum=${p.confessionSerialNum} confessorPushId=${confessorPushId}`);
    if (confessorPushId) {
      scheduleDirectPush(confessorPushId, {
        title: "Cairo Confessions",
        body: "Someone wants to reach you",
        url: `/reach?threadId=${p.conversationRef}`,
      });
    }

    return { success: true };
  });

// Sets confessor_anon_id when confessor opens a thread (before they reply)
// Allows the thread to appear in the confessor's inbox immediately
export const markConfessorOpened = createServerFn({ method: "POST" })
  .handler(async (ctx): Promise<void> => {
    const { threadId, anonId } = ctx.data as unknown as { threadId: string; anonId: string };
    const headers = getSupabaseHeaders();
    await fetch(supabaseUrl(`cc_threads?id=eq.${threadId}&confessor_anon_id=is.null`), {
      method: "PATCH",
      headers: { ...headers, "Prefer": "return=minimal" },
      body: JSON.stringify({ confessor_anon_id: anonId }),
    });
  });

// Inserts a reply and updates last_activity; enforces Bumble lock for senders
export const replyToThread = createServerFn({ method: "POST" })
  .handler(async (ctx): Promise<{ success: true } | { success: false; error: string }> => {
    const p = ctx.data as unknown as {
      threadId: string;
      fromRole: "sender" | "confessor";
      messageId: string;
      content: string;
      anonId: string;
    };

    const cleanContent = sanitizeText(p.content);

    const now = new Date().toISOString();
    const headers = getSupabaseHeaders();

    // Bumble lock: sender cannot reply until confessor has sent at least one message
    if (p.fromRole === "sender") {
      const checkRes = await fetch(
        supabaseUrl(`cc_messages?thread_id=eq.${p.threadId}&from_role=eq.confessor&select=id&limit=1`),
        { headers },
      );
      const confessorMsgs = checkRes.ok ? await checkRes.json() as unknown[] : [];
      if (confessorMsgs.length === 0) {
        return { success: false, error: "waiting_for_reply" };
      }

    }

    const msgRes = await fetch(supabaseUrl("cc_messages"), {
      method: "POST",
      headers: { ...headers, "Prefer": "return=minimal" },
      body: JSON.stringify({
        id: p.messageId,
        thread_id: p.threadId,
        from_role: p.fromRole,
        content: cleanContent,
        sent_at: now,
      }),
    });
    if (!msgRes.ok) {
      const err = await msgRes.text();
      return { success: false, error: err };
    }

    const update: Record<string, unknown> = { last_activity: now };
    if (p.fromRole === "confessor") {
      update.confessor_anon_id = p.anonId;
      update.status = "delivered";
    }

    await fetch(supabaseUrl(`cc_threads?id=eq.${p.threadId}`), {
      method: "PATCH",
      headers: { ...headers, "Prefer": "return=minimal" },
      body: JSON.stringify(update),
    });

    // Push notification to recipient — best-effort, non-blocking
    const threadFetch = await fetch(
      supabaseUrl(`cc_threads?id=eq.${p.threadId}&select=sender_anon_id,confessor_anon_id,confession_serial_num`),
      { headers },
    );
    console.log(`[reply:push] fromRole=${p.fromRole} threadFetchOk=${threadFetch.ok}`);
    if (threadFetch.ok) {
      const rows = await threadFetch.json() as Array<{ sender_anon_id: string; confessor_anon_id: string | null; confession_serial_num: number }>;
      const thread = rows[0];
      const recipientId = thread ? (p.fromRole === "confessor" ? thread.sender_anon_id : thread.confessor_anon_id) : null;
      console.log(`[reply:push] rows=${rows.length} confessor_anon_id=${thread?.confessor_anon_id} recipientId=${recipientId}`);
      if (recipientId) {
        const body = p.fromRole === "confessor"
          ? `Message from Confessor: #${thread.confession_serial_num}`
          : `Message from ${p.anonId.slice(0, 10)}…`;
        scheduleDirectPush(recipientId, { title: "Cairo Confessions", body, url: `/reach?threadId=${p.threadId}` });
      }
    }

    return { success: true };
  });

// Fetches all threads (with messages) where anonId is sender or confessor
export const getThreads = createServerFn({ method: "POST" })
  .handler(async (ctx): Promise<RemoteThread[]> => {
    const { anonId } = ctx.data as unknown as { anonId: string };
    if (!anonId) return [];

    const headers = getSupabaseHeaders();
    const filter = `or=(sender_anon_id.eq.${anonId},confessor_anon_id.eq.${anonId})`;
    const res = await fetch(
      supabaseUrl(`cc_threads?${filter}&is_deleted=eq.false&select=*,cc_messages(*)&order=last_activity.desc`),
      { headers },
    );

    if (!res.ok) return [];

    const data = await res.json() as Array<Record<string, unknown>>;

    return data.map((t) => ({
      id: t["id"] as string,
      confessionSerialNum: t["confession_serial_num"] as number,
      senderAnonId: t["sender_anon_id"] as string,
      confessorAnonId: t["confessor_anon_id"] as string | null,
      type: t["type"] as string | null,
      senderEmail: t["sender_email"] as string | null,
      status: t["status"] as "pending" | "delivered" | "rejected",
      createdAt: t["created_at"] as string,
      lastActivity: t["last_activity"] as string,
      lastReactedMessageId: (t["last_reacted_message_id"] as string | null) ?? null,
      messages: ((t["cc_messages"] ?? []) as Array<Record<string, unknown>>)
        .sort((a, b) => new Date(a["sent_at"] as string).getTime() - new Date(b["sent_at"] as string).getTime())
        .map((m) => ({
          id: m["id"] as string,
          fromRole: m["from_role"] as "sender" | "confessor",
          content: m["content"] as string,
          sentAt: m["sent_at"] as string,
          reactions: (m["reactions"] ?? {}) as Record<string, string[]>,
        })),
    }));
  });

// Hard-deletes a thread — only if anonId is sender or confessor
export const deleteThread = createServerFn({ method: "POST" })
  .handler(async (ctx): Promise<{ success: true } | { success: false; error: string }> => {
    const { threadId, anonId } = ctx.data as unknown as { threadId: string; anonId: string };

    const headers = getSupabaseHeaders();
    const filter = `id=eq.${threadId}&or=(sender_anon_id.eq.${anonId},confessor_anon_id.eq.${anonId})`;
    const res = await fetch(supabaseUrl(`cc_threads?${filter}`), {
      method: "PATCH",
      headers: { ...headers, "Prefer": "return=minimal" },
      body: JSON.stringify({ is_deleted: true }),
    });

    if (!res.ok) {
      const err = await res.text();
      return { success: false, error: err };
    }
    return { success: true };
  });

// Toggles an emoji reaction on a message — adds if not present, removes if already reacted
export const reactToMessage = createServerFn({ method: "POST" })
  .handler(async (ctx): Promise<{ success: true; reactions: Record<string, string[]> } | { success: false; error: string }> => {
    const { messageId, threadId, emoji, anonId } = ctx.data as unknown as {
      messageId: string;
      threadId: string;
      emoji: string;
      anonId: string;
    };
    const headers = getSupabaseHeaders();

    const res = await fetch(supabaseUrl(`cc_messages?id=eq.${messageId}&select=reactions`), { headers });
    if (!res.ok) return { success: false, error: await res.text() };

    const rows = await res.json() as Array<{ reactions: Record<string, string[]> }>;
    if (!rows.length) return { success: false, error: "message_not_found" };

    const reactions: Record<string, string[]> = rows[0].reactions ?? {};
    const current = reactions[emoji] ?? [];
    if (current.includes(anonId)) {
      // Remove reaction
      const next = current.filter((id) => id !== anonId);
      if (next.length === 0) delete reactions[emoji];
      else reactions[emoji] = next;
    } else {
      reactions[emoji] = [...current, anonId];
    }

    const patchRes = await fetch(supabaseUrl(`cc_messages?id=eq.${messageId}`), {
      method: "PATCH",
      headers: { ...headers, "Prefer": "return=minimal" },
      body: JSON.stringify({ reactions }),
    });
    if (!patchRes.ok) return { success: false, error: await patchRes.text() };

    // Update thread so the other party sees a notification for this exact message
    await fetch(supabaseUrl(`cc_threads?id=eq.${threadId}`), {
      method: "PATCH",
      headers: { ...headers, "Prefer": "return=minimal" },
      body: JSON.stringify({ last_activity: new Date().toISOString(), last_reacted_message_id: messageId }),
    });

    return { success: true, reactions };
  });

// Blocks the sender from messaging this confession again — thread stays in inbox
export const blockSender = createServerFn({ method: "POST" })
  .handler(async (ctx): Promise<{ success: true } | { success: false; error: string }> => {
    const { senderAnonId, confessionSerialNum } = ctx.data as unknown as {
      senderAnonId: string;
      confessionSerialNum: number;
    };
    const headers = getSupabaseHeaders();

    const res = await fetch(supabaseUrl("cc_blocks"), {
      method: "POST",
      headers: { ...headers, "Prefer": "return=minimal" },
      body: JSON.stringify({ sender_anon_id: senderAnonId, confession_serial_num: confessionSerialNum }),
    });
    if (!res.ok) {
      const err = await res.text();
      if (!err.includes("23505")) return { success: false, error: err }; // ignore duplicate
    }

    return { success: true };
  });

// Triggers GAS tracking file rebuild — called fire-and-forget from client after send
export const triggerBuildTracking = createServerFn({ method: "POST" })
  .handler(async (): Promise<void> => {
    const url = process.env["CC_INTAKE_URL"];
    const token = process.env["CC_INTAKE_TOKEN"];
    if (!url || !token) return;
    try {
      await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token, action: "buildTracking" }),
        signal: AbortSignal.timeout(25000),
      });
    } catch (e) { console.error("[triggerBuildTracking] failed:", e); }
  });
