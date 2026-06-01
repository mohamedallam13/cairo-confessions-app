import { createServerFn } from "@tanstack/react-start";

export type CancelResult =
  | { success: true }
  | { success: false; error: string; currentStatus?: string };

export const cancelConfession = createServerFn({ method: "POST" })
  .handler(async (ctx): Promise<CancelResult> => {
    const { refNum } = ctx.data as unknown as { refNum: string };

    const url   = process.env["CC_INTAKE_URL"];
    const token = process.env["CC_INTAKE_TOKEN"];
    if (!url || !token) return { success: false, error: "not_configured" };
    if (!refNum) return { success: false, error: "refNum required" };

    const res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "cancel", refNum, token }),
    });

    if (!res.ok) return { success: false, error: `HTTP ${res.status}` };
    return await res.json() as CancelResult;
  });
