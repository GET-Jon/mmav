import assert from "node:assert/strict";
import { solveMotorMatch, type MotorMatchListing } from "../lib/motor-match/solver";

const row = (
  year: number,
  price: number,
  miles: number,
): MotorMatchListing => ({
  vin: null,
  year,
  make: "BMW",
  model: "3 Series",
  trim: "330i",
  price,
  miles,
  dealer: null,
  city: null,
  state: null,
  url: null,
});

const g20: MotorMatchListing[] = [
  row(2019, 17905, 85412),
  row(2019, 20683, 69300),
  row(2020, 12389, 122070),
  row(2020, 12798, 128166),
  row(2020, 26827, 30986),
  row(2021, 12998, 139202),
  row(2021, 22955, 56344),
  row(2021, 24578, 48733),
  row(2021, 25222, 40182),
  row(2021, 27955, 42654),
  row(2022, 29255, 27902),
  row(2023, 30955, 29309),
  row(2023, 32955, 17753),
  row(2026, 44877, 7693),
  row(2026, 48732, 4),
  row(2026, 49147, 4),
  row(2021, 699, 61214),
];

const constrained = solveMotorMatch({
  listings: g20,
  budget: 19500,
  mileage: 60000,
  targetYear: 2021,
  generationStartYear: 2019,
});

assert.ok(constrained.summary.sampleSize >= 8, "generation sample should remain useful");
assert.ok(constrained.summary.marketCenter, "market center should be calculated");
assert.ok(constrained.summary.marketLow, "market low should be calculated");
assert.ok(constrained.summary.marketHigh, "market high should be calculated");
assert.ok(
  constrained.market.priceNeeded ||
    constrained.market.mileageNeeded ||
    constrained.market.yearNeeded,
  "a constrained target should produce at least one useful neighbor recommendation",
);
assert.ok(
  constrained.summary.marketLow! > 699,
  "obvious junk/down-payment prices must not drive the market range",
);

const realistic = solveMotorMatch({
  listings: g20,
  budget: 32000,
  mileage: 70000,
  targetYear: 2021,
  generationStartYear: 2019,
});

assert.notEqual(realistic.confidence, "none");
assert.ok(realistic.matchCount > 0, "a realistic target should find estimated matches");

console.log("Motor Match regression suite passed.");
