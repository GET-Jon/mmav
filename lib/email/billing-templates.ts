/**
 * Billing email presentation only. Deliberately no outbound delivery here.
 * A separate, idempotent notification outbox must determine eligibility from
 * confirmed Stripe events and persisted subscription state before sending.
 */
export type BillingNotice = "activated" | "payment_problem" | "plan_changed" | "cancellation_scheduled" | "canceled";
export type BillingEmailInput = {
  type: BillingNotice;
  companyName: string;
  planName: string;
  effectiveDate?: string;
};
export type BillingEmail = { subject: string; html: string; text: string };
const clean = (value: string) => value.replace(/[&<>"']/g, (key) =>
  ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[key] || key);
const titles: Record<BillingNotice, { subject: string; title: string; action: string; body: (p: string, date?: string) => string }> = {
  activated: {
    subject: "Your Lot Logic subscription is active",
    title: "You're ready to evaluate.",
    action: "Open your workspace",
    body: p => "Your " + p + " subscription is active. You can now use your plan's evaluation allowance in your dealership workspace.",
  },
  payment_problem: {
    subject: "Action needed: Lot Logic billing",
    title: "Your payment needs attention.",
    action: "Manage billing",
    body: p => "We couldn't confirm a renewal payment for your existing " + p + " subscription. Please review your payment method to avoid an interruption.",
  },
  plan_changed: {
    subject: "Your Lot Logic plan has changed",
    title: "Your plan has been updated.",
    action: "View billing",
    body: (p,date) => "Your Lot Logic plan is now " + p + (date ? ", effective " + date : "") + ". You can review your current allowances and billing details in Settings.",
  },
  cancellation_scheduled: {
    subject: "Your Lot Logic cancellation is scheduled",
    title: "Your subscription will end.",
    action: "Review your subscription",
    body: (p,date) => "You've scheduled your " + p + " subscription to cancel" + (date ? " on " + date : " at the end of its paid period") + ". Your access will follow your current billing terms.",
  },
  canceled: {
    subject: "Your Lot Logic subscription has ended",
    title: "Your subscription has ended.",
    action: "View account",
    body: p => "Your " + p + " subscription has ended. You can review any remaining access and subscription options in your account.",
  },
};
export function renderBillingEmail(input: BillingEmailInput): BillingEmail {
  const variant = titles[input.type];
  if (!variant) throw new Error("Unsupported billing notice");
  if (!input.companyName.trim() || !input.planName.trim()) throw new Error("Billing email requires company and plan");
  const title = variant.title;
  const sentence = variant.body(input.planName, input.effectiveDate);
  const destination = input.type === "activated" ? "https://yourlotlogic.com/" : "https://yourlotlogic.com/settings?tab=billing";
  const html = '<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>' +
    '<body style="margin:0;padding:32px 12px;background:#f3f6fa;font-family:Arial,Helvetica,sans-serif;color:#101827">' +
    '<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:560px;margin:0 auto"><tr><td style="background:#101d32;color:white;padding:25px 32px;border-radius:12px 12px 0 0">' +
    '<strong style="font-size:24px;letter-spacing:2px">LOT LOGIC</strong><p style="color:#b8c6d9;font-size:11px;letter-spacing:2px;margin:6px 0 0">DEALERSHIP INTELLIGENCE</p></td></tr>' +
    '<tr><td style="padding:36px 32px;background:white;border:1px solid #e2e8f0;border-top:0">' +
    '<h1 style="font-size:25px;line-height:1.3;margin:0 0 20px">'+clean(title)+'</h1><p style="font-size:14px;color:#475569">For '+clean(input.companyName)+'</p>' +
    '<p style="font-size:15px;line-height:1.7;color:#475569;margin-bottom:28px">'+clean(sentence)+'</p>' +
    '<a href="'+destination+'" style="display:inline-block;padding:15px 26px;border-radius:8px;background:#2458df;color:white;font-weight:bold;text-decoration:none">'+clean(variant.action)+'</a>' +
    '<p style="font-size:12px;color:#64748b;margin-top:28px">Questions? Reply to this email or contact <a href="mailto:support@yourlotlogic.com">support@yourlotlogic.com</a>.</p>' +
    '</td></tr><tr><td style="text-align:center;padding:24px 20px;color:#64748b;font-size:12px">Lot Logic · By Mindful Motor Co. · yourlotlogic.com</td></tr></table></body></html>';
  const text = title + "\n\nFor " + input.companyName + "\n\n" + sentence + "\n\n" + variant.action + ": " + destination +
    "\n\nQuestions? support@yourlotlogic.com\n\nLot Logic | https://yourlotlogic.com";
  return { subject: variant.subject, html, text };
}
