import assert from "node:assert/strict";
import { ignoreSubscriptionEvent, invoiceBelongsToCurrentSubscription } from "../lib/billing/subscription-event-guard";

const decide = (storedStatus: string, oldId: string | null, incomingStatus: string, nextId: string) =>
  ignoreSubscriptionEvent({
    storedSubscriptionId: oldId,
    incomingSubscriptionId: nextId,
    storedStatus,
    incomingStatus,
  });

assert.equal(decide("active", "sub_new", "canceled", "sub_old"), true,
  "Late cancellation for old subscription must never cancel current paid access");
assert.equal(decide("past_due", "sub_new", "active", "sub_old"), true,
  "Old subscription must not revive after newer subscription becomes past due");
assert.equal(decide("canceled", "sub_old", "active", "sub_old"), true,
  "Canceled subscription cannot be reactivated by a delayed update");
assert.equal(decide("canceled", "sub_old", "canceled", "sub_old"), false,
  "Duplicate canceled event remains idempotent");
assert.equal(decide("canceled", "sub_old", "active", "sub_new"), false,
  "A genuinely new paid subscription can restore a canceled dealership");
assert.equal(decide("active", "sub_new", "active", "sub_new"), false,
  "Legitimate same-subscription updates are accepted");
assert.equal(decide("active", "sub_new", "active", "sub_unrelated"), true,
  "Separate subscription must not overwrite the linked active one");
assert.equal(decide("trialing", null, "active", "sub_first"), false,
  "First successful checkout may activate the account");
assert.equal(decide("active", null, "canceled", ""), true,
  "Malformed missing-subscription payload must not change billing");

assert.equal(invoiceBelongsToCurrentSubscription({
  invoiceSubscriptionId: "sub_current",
  storedSubscriptionId: "sub_current",
}), true);
assert.equal(invoiceBelongsToCurrentSubscription({
  invoiceSubscriptionId: "sub_old",
  storedSubscriptionId: "sub_current",
}), false, "A late paid invoice must not settle a different subscription");
assert.equal(invoiceBelongsToCurrentSubscription({
  invoiceSubscriptionId: null,
  storedSubscriptionId: "sub_current",
}), false, "An unlinked invoice must not change subscription status");

console.log("Stripe event ordering and subscription-linkage regressions passed.");
