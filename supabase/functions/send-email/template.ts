
export type ActionType = "signup" | "magiclink" | "recovery" | "invite" | "email_change";
type EmailData = { token_hash?: string; token_hash_new?: string; redirect_to?: string; email_action_type?: string };
export type HookPayload = { user?: { email?: string; new_email?: string }; email_data?: EmailData };
export type Message = { to: string; subject: string; html: string; text: string };
const variants: Record<ActionType, [string,string,string,string]> = {
  signup: ["Confirm your email address","Confirm your email to finish setting up your Lot Logic dealership workspace.","Confirm email address","Confirm your Lot Logic account"],
  magiclink: ["Your secure sign-in link","You requested a secure link to sign in to your Lot Logic workspace.","Sign in to Lot Logic","Your Lot Logic sign-in link"],
  recovery: ["Reset your password","A password reset was requested for your Lot Logic account.","Reset password","Reset your Lot Logic password"],
  invite: ["You're invited to Lot Logic","You've been invited to a dealership workspace on Lot Logic.","Accept invitation","Your invitation to Lot Logic"],
  email_change: ["Confirm your email change","An email-address change was requested for your Lot Logic account.","Confirm email change","Confirm your Lot Logic email change"],
};
const escapeHtml = (s: string) => s.replace(/[&<>"']/g, (c) => ({ "&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;" }[c] || c));
const validAddress = (s: string) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(s);

function message(to: string, type: ActionType, tokenHash: string, origin: string): Message {
  const [title, intro, action, subject] = variants[type];
  const link = new URL("/auth/confirm", origin);
  link.searchParams.set("token_hash", tokenHash);
  link.searchParams.set("type", type === "signup" ? "email" : type);
  link.searchParams.set("next", type === "recovery" || type === "invite" ? "/set-password" : type === "magiclink" ? "/evaluate" : type === "email_change" ? "/settings" : "/onboarding");
  const url = link.toString();
  const html = '<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"></head>' +
    '<body style="margin:0;padding:32px 12px;background:#f3f6fa;font-family:Arial,Helvetica,sans-serif;color:#101827">' +
    '<div style="max-width:540px;margin:auto;background:#fff;border:1px solid #dfe6ef;border-radius:12px;overflow:hidden">' +
    '<div style="background:#101d32;padding:24px 32px;color:#fff"><strong style="font-size:22px;letter-spacing:2px">LOT LOGIC</strong><div style="color:#b8c6d9;font-size:11px;margin-top:6px">DEALERSHIP INTELLIGENCE</div></div>' +
    '<div style="padding:32px"><h1 style="font-size:25px;line-height:1.3">'+escapeHtml(title)+'</h1><p style="font-size:15px;line-height:1.6">'+escapeHtml(intro)+'</p>' +
    '<p style="margin:28px 0"><a href="'+escapeHtml(url)+'" style="display:inline-block;background:#2458df;color:white;font-size:15px;font-weight:bold;text-decoration:none;border-radius:8px;padding:14px 22px">'+escapeHtml(action)+'</a></p>' +
    '<p style="font-size:12px;color:#667085;overflow-wrap:anywhere">If the button does not work, paste this link into your browser: <a href="'+escapeHtml(url)+'">'+escapeHtml(url)+'</a></p>' +
    '<p style="font-size:12px;color:#667085">If you did not request this, you can ignore this email. Questions? Reply to this email or contact support@yourlotlogic.com.</p></div>' +
    '<div style="border-top:1px solid #e5eaf0;padding:18px 32px;font-size:12px;color:#667085">Lot Logic · yourlotlogic.com</div></div></body></html>';
  return { to, subject, html, text: title+'\n\n'+intro+'\n\n'+action+': '+url+'\n\nIf you did not request this, you can ignore it.\nQuestions? support@yourlotlogic.com\n\nLot Logic | https://yourlotlogic.com' };
}
export function buildAuthEmails(payload: HookPayload, origin: string): Message[] {
  const user = payload.user;
  const data = payload.email_data;
  const type = data?.email_action_type as ActionType | undefined;
  if (!type || !Object.prototype.hasOwnProperty.call(variants,type)) throw new Error("Unsupported email type");
  if (!user?.email || !validAddress(user.email)) throw new Error("Invalid recipient");
  const send = (recipient: string, token: string | undefined) => {
    if (!token || !/^[a-zA-Z0-9_-]{20,256}$/.test(token)) throw new Error("Invalid authentication token");
    return message(recipient,type,token,origin);
  };
  if (type !== "email_change") return [send(user.email, data?.token_hash)];
  const newEmail = user.new_email;
  if (!newEmail || !validAddress(newEmail)) throw new Error("Invalid new email");
  // Supabase secure-change fields are reversed: token_hash_new is for current email.
  return data?.token_hash_new
    ? [send(user.email,data.token_hash_new),send(newEmail,data.token_hash)]
    : [send(newEmail,data?.token_hash)];
}
