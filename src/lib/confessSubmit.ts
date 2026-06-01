import { createServerFn } from "@tanstack/react-start";

export interface SubmitPayload {
  refNum:   string;
  anonId:   string;
  mood:     string;
  gender:   string;
  age:      number;
  location: string;
  email:    string;
  body:     string;
  category: string;
  tags:     string[];
  browser:  string;
  device:   string;
}

export type SubmitResult =
  | { success: true }
  | { success: false; step: "sheet" | "populate" | "tracking" | "unknown"; error: string };

export const submitConfession = createServerFn({ method: "POST" })
  .handler(async (ctx): Promise<SubmitResult> => {
    const payload = ctx.data as unknown as SubmitPayload;

    const url   = process.env["CC_INTAKE_URL"];
    const token = process.env["CC_INTAKE_TOKEN"];

    if (!url || !token) {
      return { success: false, step: "unknown", error: "Intake endpoint not configured" };
    }

    if (payload.body.length > 2500) {
      return { success: false, step: "unknown", error: "Confession exceeds 2500 characters" };
    }

    const res = await fetch(url, {
      method:  "POST",
      headers: { "Content-Type": "application/json" },
      body:    JSON.stringify({ ...payload, token }),
    });

    if (!res.ok) {
      return { success: false, step: "unknown", error: `HTTP ${res.status}` };
    }

    return await res.json() as SubmitResult;
  });
