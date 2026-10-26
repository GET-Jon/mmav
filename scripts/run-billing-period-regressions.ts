import assert from "node:assert/strict";
import { calendarMonthWindow, resolvePaidUsageWindow } from "../lib/billing/billing-period";
import { checkPreviewBillingIsolation, isDeployPreview } from "../lib/billing/preview-isolation";
import { trialRolloverForPeriod } from "../lib/billing/trial-rollover";

const windowFor = (start: string | null, end: string | null, now: string, subscription = "sub_live") =>
  resolvePaidUsageWindow({
    stripeSubscriptionId: subscription,
    currentPeriodStart: start,
    currentPeriodEnd: end,
    now: new Date(now),
  });

const inPeriod = (date: string, start: string, end: string) =>
  new Date(date).getTime() >= new Date(start).getTime() &&
  new Date(date).getTime() < new Date(end).getTime();

const monthly = windowFor("2026-10-12T16:00:00Z", "2026-11-12T16:00:00Z", "2026-11-01T09:00:00Z");
assert.equal(monthly.kind, "stripe");
assert.equal(monthly.start, "2026-10-12T16:00:00.000Z");
assert.equal(monthly.end, "2026-11-12T16:00:00.000Z");
assert.equal(inPeriod("2026-10-31T23:59:59Z", monthly.start!, monthly.end!), true);
assert.equal(inPeriod("2026-11-01T00:00:00Z", monthly.start!, monthly.end!), true,
  "Calendar rollover must not replenish paid allowances");
assert.equal(inPeriod("2026-10-12T15:59:59Z", monthly.start!, monthly.end!), false,
  "Evaluations during an earlier free trial do not count against a new paid period");
assert.equal(inPeriod("2026-11-12T16:00:00Z", monthly.start!, monthly.end!), false,
  "Period boundary is exclusive");

const newPeriod = windowFor("2026-11-12T16:00:00Z", "2026-12-12T16:00:00Z", "2026-11-12T17:00:00Z");
assert.equal(newPeriod.kind, "stripe");
assert.equal(inPeriod("2026-11-12T16:02:00Z", newPeriod.start!, newPeriod.end!), true);
assert.equal(inPeriod("2026-11-12T15:59:59Z", newPeriod.start!, newPeriod.end!), false,
  "A successful renewal begins a fresh allowance");

assert.equal(windowFor(null, "2026-11-12T16:00:00Z", "2026-10-25T00:00:00Z").kind, "unsynchronized",
  "Stripe subscription with missing start must not fall back to a calendar month");
assert.equal(windowFor("2026-10-12T16:00:00Z", "2026-11-12T16:00:00Z", "2026-11-13T00:00:00Z").kind, "unsynchronized",
  "Late renewal webhook must not replenish allowance from old period");
assert.equal(windowFor("2026-11-12T16:00:00Z", "2026-12-12T16:00:00Z", "2026-11-01T00:00:00Z").kind, "unsynchronized",
  "Future start must not grant allowance");
assert.equal(windowFor("2026-11-12T16:00:00Z", "2026-11-12T16:00:00Z", "2026-11-12T16:00:00Z").kind, "unsynchronized");
assert.equal(windowFor("2026-10-12T16:00:00Z", "2026-11-12T16:00:00Z", "2026-11-01T00:00:00Z", "").kind, "calendar",
  "Comped/manual accounts without Stripe subscriptions retain their current allowance behavior");

// Stripe test clocks do not advance the Lot Logic server clock. An active
// subscription with a future simulated cycle must keep paid usage unavailable.
const simulatedRenewalStart = "2026-11-14T15:23:39Z";
const simulatedRenewalEnd = "2026-12-14T15:23:39Z";
assert.equal(
  windowFor(simulatedRenewalStart, simulatedRenewalEnd, "2026-10-14T16:40:00Z").kind,
  "unsynchronized",
  "Successful recovery to a future test-clock period must not grant evaluations early",
);
const currentRenewal = windowFor(
  simulatedRenewalStart, simulatedRenewalEnd, "2026-11-14T15:23:40Z",
);
assert.equal(currentRenewal.kind, "stripe", "The cycle becomes usable when the actual clock reaches it");
assert.equal(
  inPeriod("2026-10-14T15:23:39Z", currentRenewal.start!, currentRenewal.end!),
  false,
  "Previous period evaluations are excluded from the renewed allowance",
);
assert.equal(trialRolloverForPeriod({
  firstPeriodStart: "2026-10-14T15:23:39Z",
  currentPeriodStart: simulatedRenewalStart,
  carryoverEvaluations: 5,
}), 0, "First paid month trial bonus must expire on renewal");
assert.equal(trialRolloverForPeriod({
  firstPeriodStart: "2026-10-14T15:23:39Z",
  currentPeriodStart: "2026-10-14T15:23:39Z",
  carryoverEvaluations: 5,
}), 5, "Unused trial credits are only valid in their original paid cycle");

const feb = calendarMonthWindow(new Date("2028-02-29T17:00:00Z"));
assert.equal(feb.start, "2028-02-01T00:00:00.000Z");
assert.equal(feb.end, "2028-03-01T00:00:00.000Z");

const preview = {
  context: "deploy-preview",
  deployPrimeUrl: "https://deploy-preview-19--mmav.netlify.app",
  stripeSecretKey: "sk_test_fake",
  supabaseUrl: "https://separatetestproject.supabase.co",
};
assert.equal(isDeployPreview(preview), true);
assert.equal(checkPreviewBillingIsolation(preview).safe, true, "Proper test isolation permits checkout");
assert.equal(checkPreviewBillingIsolation({ ...preview, stripeSecretKey: "sk_live_fake" }).safe, false,
  "Preview must not accept live Stripe credentials");
assert.equal(checkPreviewBillingIsolation({ ...preview, stripeSecretKey: undefined }).safe, false,
  "Preview must fail closed if Stripe is unset");
assert.equal(checkPreviewBillingIsolation({ ...preview, supabaseUrl: "https://ymlleqpbpgzydyzwhlqq.supabase.co" }).safe, false,
  "Preview must not write to production Supabase");
assert.equal(checkPreviewBillingIsolation({ ...preview, supabaseUrl: undefined }).safe, false);
assert.equal(checkPreviewBillingIsolation({
  ...preview, context: undefined,
}).safe, true, "Preview hostname also enforces the same guards");
assert.equal(checkPreviewBillingIsolation({
  ...preview, context: "production", deployPrimeUrl: "https://yourlotlogic.com",
  stripeSecretKey: "sk_live_fake",
  supabaseUrl: "https://ymlleqpbpgzydyzwhlqq.supabase.co",
}).safe, true, "Production configuration remains unaffected by preview-only checks");

console.log("Billing-period and preview-isolation regressions passed");
