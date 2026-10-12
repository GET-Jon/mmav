import assert from "node:assert/strict";
import { calendarMonthWindow, resolvePaidUsageWindow } from "../lib/billing/billing-period";

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

const feb = calendarMonthWindow(new Date("2028-02-29T17:00:00Z"));
assert.equal(feb.start, "2028-02-01T00:00:00.000Z");
assert.equal(feb.end, "2028-03-01T00:00:00.000Z");

console.log("Billing-period regressions passed");
