import assert from "node:assert/strict";
import { allowsPaidEvaluationAccess, preserveInitialTrial, shouldSyncSubscriptionStatus } from "../lib/billing/payment-status";

assert.equal(preserveInitialTrial("trialing", null, "past_due"), true);
assert.equal(preserveInitialTrial("trialing", null, "canceled"), true);
assert.equal(preserveInitialTrial("trialing", null, "active"), false);
assert.equal(preserveInitialTrial("active", "2026-10-13T20:11:44Z", "past_due"), false);
assert.equal(shouldSyncSubscriptionStatus("incomplete"), false);
assert.equal(shouldSyncSubscriptionStatus("active"), true);
assert.equal(allowsPaidEvaluationAccess("past_due"), false);
assert.equal(allowsPaidEvaluationAccess("active"), true);

console.log("Checkout failure and trial-preservation regressions passed.");
