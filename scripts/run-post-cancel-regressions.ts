import assert from "node:assert/strict";
import { cancellationBalance, cancellationWindow, POST_CANCEL_DAYS } from "../lib/billing/post-cancel";

// Cancellation never invents credits: paid balance = plan limit - paid-cycle use.
// Five one-time free-trial credits are intentionally absent from this formula.
const stopped = cancellationBalance({
  paidAllowance: 200,
  evaluationsUsedInFinalPaidPeriod: 30,
  endedAt: "2026-11-13T20:11:44Z",
});
assert.ok(stopped);
assert.equal(POST_CANCEL_DAYS, 30);
assert.equal(stopped.evaluations, 170);
assert.equal(stopped.startsAt, "2026-11-13T20:11:44.000Z");
assert.equal(stopped.expiresAt, "2026-12-13T20:11:44.000Z");

const status = (when: string, used = 0, state = "canceled") => cancellationWindow({
  status: state,
  startsAt: stopped.startsAt,
  expiresAt: stopped.expiresAt,
  initialEvaluations: stopped.evaluations,
  usedDuringWindow: used,
  now: new Date(when),
});
assert.equal(status("2026-11-13T20:11:43Z").active, false, "Never make credits usable before end");
assert.equal(status("2026-11-13T20:11:44Z").remaining, 170, "Full bank usable at exact end");
assert.equal(status("2026-11-25T00:00:00Z", 14).remaining, 156, "Each completed evaluation consumes one bank credit");
assert.equal(status("2026-12-13T20:11:43Z", 14).remaining, 156, "Last instant before deadline is valid");
assert.equal(status("2026-12-13T20:11:44Z", 14).remaining, 0, "30-day deadline is exclusive");
assert.equal(status("2026-12-15T00:00:00Z", 14).remaining, 0, "No refill after deadline");
assert.equal(status("2026-11-20T00:00:00Z", 2, "past_due").remaining, 0, "Unpaid renewals cannot use grace credits");
assert.equal(status("2026-11-20T00:00:00Z", 2, "active").remaining, 0, "Resubscription stops using old grace");

assert.equal(cancellationBalance({
  paidAllowance: 20,
  evaluationsUsedInFinalPaidPeriod: 25, // Includes 5 promotional trial credits.
  endedAt: "2026-11-13T20:11:44Z",
})?.evaluations, 0, "Free trial bonus is not banked");
assert.equal(cancellationBalance({
  paidAllowance: 75,
  evaluationsUsedInFinalPaidPeriod: 0,
  endedAt: "2026-11-13T20:11:44Z",
})?.evaluations, 75, "Only unused paid plan credits carry");
assert.equal(cancellationBalance({
  paidAllowance: 75,
  evaluationsUsedInFinalPaidPeriod: 20,
  endedAt: null,
}), null, "Missing Stripe end date never generates credits");

assert.equal(cancellationWindow({
  status: "canceled",
  startsAt: stopped.startsAt,
  expiresAt: "2027-12-13T20:11:44Z",
  initialEvaluations: 170,
  usedDuringWindow: 0,
  now: new Date("2026-11-20T00:00:00Z"),
}).remaining, 0, "Manipulated windows longer than 30 days fail closed");
console.log("30-day cancellation balance and expiry regression cases passed.");
