// Run: node --experimental-strip-types scripts/run-trial-rollover-regressions.mjs
import assert from "node:assert/strict";
import {
  firstPeriodTrialRollover,
  trialRolloverForPeriod,
  remainingTrialRollover,
} from "../lib/billing/trial-rollover.ts";

const joined = "2026-10-13T19:36:37.948Z";
const firstStart = "2026-10-13T20:11:44.000Z";
const nextStart = "2026-11-13T20:11:44.000Z";

for (let used = 0; used <= 5; used++) {
  assert.equal(firstPeriodTrialRollover({
    companyCreatedAt: joined,
    firstPeriodStart: firstStart,
    trialEvaluationsUsed: used,
  }), 5 - used);
}
assert.equal(firstPeriodTrialRollover({
  companyCreatedAt: joined,
  firstPeriodStart: firstStart,
  trialEvaluationsUsed: 20,
}), 0, "Can never award negative or more than five credits");
assert.equal(firstPeriodTrialRollover({
  companyCreatedAt: joined,
  firstPeriodStart: "2026-10-28T20:11:44Z",
  trialEvaluationsUsed: 0,
}), 0, "Expired trial has no remaining balance");
assert.equal(firstPeriodTrialRollover({
  companyCreatedAt: joined,
  firstPeriodStart: "2026-10-13T18:00:00Z",
  trialEvaluationsUsed: 0,
}), 0, "No carryover before signup");
assert.equal(firstPeriodTrialRollover({
  companyCreatedAt: null,
  firstPeriodStart: firstStart,
  trialEvaluationsUsed: 0,
}), 0, "Missing signup date cannot grant credits");

const firstPeriod = {
  firstPeriodStart: firstStart,
  currentPeriodStart: firstStart,
  carryoverEvaluations: 5,
};
assert.equal(trialRolloverForPeriod(firstPeriod), 5, "First paid period grants unused trial evaluations");
assert.equal(trialRolloverForPeriod({
  ...firstPeriod,
  currentPeriodStart: nextStart,
}), 0, "Renewal expires all remaining first-month trial carryover");
assert.equal(trialRolloverForPeriod({
  ...firstPeriod,
  currentPeriodStart: "2026-10-13T20:11:44+00:00",
}), 5, "Equivalent timestamp offsets must match");
assert.equal(trialRolloverForPeriod({
  ...firstPeriod,
  carryoverEvaluations: 10,
}), 5, "Never grant more than five first-month bonuses");

for (let used = 0; used <= 25; used++) {
  assert.equal(remainingTrialRollover({
    monthlyAllowance: 20, carryover: 5, periodEvaluationsUsed: used,
  }), Math.min(5, 25 - used), "Bonus is spent after the 20 included evaluations");
}
assert.equal(remainingTrialRollover({
  monthlyAllowance: 20, carryover: 0, periodEvaluationsUsed: 20,
}), 0, "Future periods get only the normal plan allowance");

console.log("Trial rollover regression cases passed.");
