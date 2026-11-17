import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { Webhook } from "https://esm.sh/standardwebhooks@1.0.0";
import { buildAuthEmails, type HookPayload } from "./template.ts";

// This endpoint is invoked only through Supabase Auth's signed Send Email Hook.
// NEVER log request bodies: they contain authentication token hashes.
Deno.serve(async (request) => {
  if (request.method !== "POST") return new Response("Method not allowed", { status: 405 });
  const apiKey = Deno.env.get("RESEND_API_KEY");
  const signedSecret = Deno.env.get("SEND_EMAIL_HOOK_SECRET");
  const origin = Deno.env.get("LOT_LOGIC_AUTH_ORIGIN");
  if (!apiKey || !signedSecret || !origin) return new Response("Email hook not configured", { status: 503 });
  let payload: HookPayload;
  try {
    const body = await request.text();
    const secret = signedSecret.replace(/^v1,whsec_/, "");
    payload = new Webhook(secret).verify(body,Object.fromEntries(request.headers)) as HookPayload;
  } catch {
    return new Response("Unauthorized", { status: 401 });
  }

  let messages;
  try {
    const site = new URL(origin);
    if (site.protocol !== "https:" || !site.hostname) throw new Error("Invalid origin");
    messages = buildAuthEmails(payload,site.origin);
  } catch {
    return new Response("Invalid email request", { status: 422 });
  }

  for (const mail of messages) {
    try {
      const response = await fetch("https://api.resend.com/emails", {
        method: "POST",
        headers: { Authorization: "Bearer " + apiKey, "Content-Type": "application/json" },
        body: JSON.stringify({
          from: "Lot Logic Accounts <accounts@yourlotlogic.com>",
          to: [mail.to],
          reply_to: "support@yourlotlogic.com",
          subject: mail.subject,
          html: mail.html,
          text: mail.text,
        }),
      });
      if (!response.ok) {
        // Do not log response body because it may contain customer information.
        return new Response("Email delivery unavailable", { status: 502 });
      }
    } catch {
      return new Response("Email delivery unavailable", { status: 502 });
    }
  }
  return new Response("{}", { status: 200, headers: { "Content-Type": "application/json" } });
});
