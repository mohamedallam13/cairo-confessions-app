import { createServerFn } from "@tanstack/react-start";

interface StatusObj {
  status: string;
  timestamp: string;
  rejectionReasons?: string;
}

interface TrackingFileEntry {
  serialNum?: string;
  status: StatusObj[];
  confessionsArray: Array<{ confession: string; timestamp: string; refNum?: string }>;
  link?: string;
  confessorMessagesArray?: Array<Record<string, unknown>>;
  anonIds?: Array<{ id: string; timestamp: string }>;
}

export interface ResolvedEntry {
  serialNum: string;
  status: StatusObj[];
  confessionsArray: Array<{ confession: string; timestamp: string }>;
  link?: string;
  messageCount: number;
  anonIds: Array<{ id: string; timestamp: string }>;
}

export interface PollResponse {
  ok: boolean;
  lastUpdated?: string;
  entries?: Record<string, ResolvedEntry | null>;  // null = refNum not yet in tracking file
}

export const pollTrackingStatuses = createServerFn({ method: "POST" })
  .handler(async (ctx): Promise<PollResponse> => {
    const { refNums } = ctx.data as unknown as { refNums: string[] };

    const url   = process.env["CC_INTAKE_URL"];
    const token = process.env["CC_INTAKE_TOKEN"];
    if (!url || !token || !refNums?.length) return { ok: false };

    const refNumsParam = refNums.map((r) => r.trim().toUpperCase()).join(",");

    let res: Response;
    try {
      res = await fetch(`${url}?token=${encodeURIComponent(token)}&refNums=${encodeURIComponent(refNumsParam)}`);
      if (!res.ok) return { ok: false };
    } catch {
      return { ok: false };
    }

    const body = await res.json() as { ok: boolean; lastUpdated?: string; entries?: Record<string, TrackingFileEntry | null> };
    if (!body.ok || !body.entries) return { ok: false };

    const entries: Record<string, ResolvedEntry | null> = {};
    for (const refNum of refNums) {
      const key = refNum.trim().toUpperCase();
      const d = body.entries[key];
      if (!d) { entries[refNum] = null; continue; }
      entries[refNum] = {
        serialNum: d.serialNum ?? "",
        status: d.status,
        confessionsArray: d.confessionsArray ?? [],
        link: d.link,
        messageCount: d.confessorMessagesArray?.length ?? 0,
        anonIds: d.anonIds ?? [],
      };
    }

    return { ok: true, lastUpdated: body.lastUpdated, entries };
  });

export const addAnonId = createServerFn({ method: "POST" })
  .handler(async (ctx): Promise<{ success: boolean }> => {
    const { refNum, anonId, browser, device } = ctx.data as unknown as { refNum: string; anonId: string; browser?: string; device?: string };
    const url   = process.env["CC_INTAKE_URL"];
    const token = process.env["CC_INTAKE_TOKEN"];
    if (!url || !token || !refNum || !anonId) return { success: false };

    try {
      const res = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "addAnonId", refNum, anonId, browser: browser ?? "", device: device ?? "", token }),
      });
      if (!res.ok) return { success: false };
      return await res.json() as { success: boolean };
    } catch {
      return { success: false };
    }
  });
