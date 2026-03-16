import { env } from "../config/env.js";

type TurnstileResponse = {
  success: boolean;
  "error-codes"?: string[];
};

export async function verifyTurnstileToken(params: {
  token: string;
  remoteIp?: string;
}): Promise<{ ok: boolean; errors?: string[] }> {
  if (!env.CLOUDFLARE_TURNSTILE_SECRET) {
    return { ok: true };
  }

  const body = new URLSearchParams();
  body.set("secret", env.CLOUDFLARE_TURNSTILE_SECRET);
  body.set("response", params.token);
  if (params.remoteIp) {
    body.set("remoteip", params.remoteIp);
  }

  const response = await fetch("https://challenges.cloudflare.com/turnstile/v0/siteverify", {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: body.toString(),
  });

  if (!response.ok) {
    return { ok: false, errors: ["turnstile_http_error"] };
  }

  const payload = (await response.json()) as TurnstileResponse;
  return { ok: payload.success, errors: payload["error-codes"] };
}
