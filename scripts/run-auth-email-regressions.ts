import assert from "node:assert/strict";
import { buildAuthEmails, type HookPayload } from "../supabase/functions/send-email/template";

const hash = "pkce_1234567890123456789012345678901234";
const base: HookPayload = { user: { email: "owner@example.com" }, email_data: { token_hash: hash, email_action_type: "signup" } };
for (const [type, next] of [
  ["signup", "/onboarding"], ["magiclink", "/evaluate"], ["recovery", "/set-password"],
  ["invite", "/set-password"], ["email_change", "/settings"],
] as const) {
  const payload: HookPayload = {
    user: { email: "owner@example.com", new_email: "new@example.com" },
    email_data: { token_hash: hash, email_action_type: type },
  };
  const messages = buildAuthEmails(payload, "https://deploy-preview-32--mmav.netlify.app");
  assert.equal(messages.length, 1);
  assert.equal(messages[0].to, type === "email_change" ? "new@example.com" : "owner@example.com");
  assert.ok(messages[0].html.includes("LOT LOGIC"));
  assert.ok(messages[0].html.includes("support@yourlotlogic.com"));
  assert.ok(messages[0].text.includes("support@yourlotlogic.com"));
  const link = messages[0].text.match(/https:\/\/\S+\/auth\/confirm\?\S+/)?.[0];
  assert.ok(link, type);
  const url = new URL(link!);
  assert.equal(url.origin,"https://deploy-preview-32--mmav.netlify.app");
  assert.equal(url.searchParams.get("next"),next);
  assert.equal(url.searchParams.get("token_hash"),hash);
}
const change: HookPayload = {
  user: { email: "old@example.com", new_email: "new@example.com" },
  email_data: { email_action_type: "email_change", token_hash: hash, token_hash_new: "pkce_9999999999999999999999999999999999" },
};
const [oldMail,newMail] = buildAuthEmails(change,"https://yourlotlogic.com");
assert.equal(oldMail.to,"old@example.com");
assert.equal(newMail.to,"new@example.com");
assert.ok(oldMail.text.includes("pkce_9999999999999999999999999999999999"));
assert.ok(newMail.text.includes(hash));
assert.throws(()=>buildAuthEmails({...base,email_data:{email_action_type:"signup"}}, "https://yourlotlogic.com"), /token/);
assert.throws(()=>buildAuthEmails({...base,email_data:{email_action_type:"other",token_hash:hash}}, "https://yourlotlogic.com"), /Unsupported/);
assert.throws(()=>buildAuthEmails({...base,user:{email:"not-an-email"}}, "https://yourlotlogic.com"), /Invalid recipient/);
assert.equal(buildAuthEmails(base,"https://yourlotlogic.com")[0].to,"owner@example.com");
console.log("Auth email template regression suite passed.");
