import { createServerFn } from "@tanstack/react-start";

export type CreateTokenResult =
  | { ok: true; token: string; refNum: string | null }
  | { ok: false; error: string };

export type RedeemTokenResult =
  | { ok: true; anonId: string; refNums: Array<{ refNum: string; timestamp: string }> }
  | { ok: false; error: "invalid_token" | "expired" | "wrong_ref" | "not_configured" | string };

export const createRecoveryToken = createServerFn({ method: "POST" })
  .handler(async (ctx): Promise<CreateTokenResult> => {
    const { anonId } = ctx.data as unknown as { anonId: string };
    const url   = process.env["CC_INTAKE_URL"];
    const token = process.env["CC_INTAKE_TOKEN"];
    if (!url || !token) return { ok: false, error: "not_configured" };
    if (!anonId)        return { ok: false, error: "anonId required" };

    const res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "createRecoveryToken", anonId, token }),
    });
    if (!res.ok) return { ok: false, error: `HTTP ${res.status}` };
    return await res.json() as CreateTokenResult;
  });

export const redeemRecoveryToken = createServerFn({ method: "POST" })
  .handler(async (ctx): Promise<RedeemTokenResult> => {
    const { recoveryToken, refNum } = ctx.data as unknown as { recoveryToken: string; refNum: string };
    const url   = process.env["CC_INTAKE_URL"];
    const token = process.env["CC_INTAKE_TOKEN"];
    if (!url || !token) return { ok: false, error: "not_configured" };
    if (!recoveryToken || !refNum) return { ok: false, error: "missing params" };

    try {
      const res = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "redeemRecoveryToken", recoveryToken, refNum, token }),
        signal: AbortSignal.timeout(55000),
      });
      const text = await res.text();
      try {
        return JSON.parse(text) as RedeemTokenResult;
      } catch {
        console.error("[redeemRecoveryToken] non-JSON response:", text.slice(0, 200));
        return { ok: false, error: "bad_response" };
      }
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      console.error("[redeemRecoveryToken] fetch error:", msg);
      return { ok: false, error: msg };
    }
  });
