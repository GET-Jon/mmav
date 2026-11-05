import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const cases = [
  ["confirm-signup","email","/onboarding"],
  ["magic-link","magiclink","/evaluate"],
  ["reset-password","recovery","/set-password"],
  ["invite-user","invite","/set-password"],
  ["change-email","email_change","/settings"],
];
for (const [slug, type, next] of cases) {
  const html = readFileSync(`docs/email/supabase-templates/${slug}.html`, "utf8");
  assert.ok(html.includes("LOT LOGIC") && html.includes("support@yourlotlogic.com"), `branding: ${slug}`);
  assert.ok(html.includes("{{ .SiteURL }}/auth/confirm?token_hash={{ .TokenHash }}"), `token handling: ${slug}`);
  assert.ok(html.includes(`&amp;type=${type}&amp;next=${next}`), `route: ${slug}`);
  assert.ok(html.includes('href="https://yourlotlogic.com"'), `domain: ${slug}`);
}
const requestPage = readFileSync("app/forgot-password/page.tsx","utf8");
assert.ok(requestPage.includes("resetPasswordForEmail"));
assert.ok(requestPage.includes("/auth/confirm?next=%2Fset-password"));
const login = readFileSync("app/login/page.tsx","utf8");
assert.ok(login.includes('href="/forgot-password"'));
console.log("Supabase email template regression suite passed: 5 templates and password recovery route.");
