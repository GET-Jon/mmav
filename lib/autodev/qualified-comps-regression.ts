import { buildAutoDevCompCandidates, mergeCompCandidates } from "./qualified-comps";
import type { VehicleIdentity } from "../marketcheck/vehicle-equivalence";
import type { MarketComp } from "../../types/comps";

function check(condition: unknown, message: string) {
  if (!condition) throw new Error("National comp regression: " + message);
}

const target: VehicleIdentity = {
  year: 2011, make: "Audi", model: "TTS", trim: "quattro Prestige",
  bodyType: "Coupe", drivetrain: "AWD", fuelType: "Gasoline",
};
const row = {
  year: 2011, make: "Audi", model: "TTS", trim: "quattro Prestige",
  bodyType: "Coupe", drivetrain: "AWD", fuelType: "Gasoline",
  price: 14500, miles: 99000, city: "Atlanta", state: "GA",
  zip: "30301", url: "https://example.com/listing/1",
  vin: "TRUK1AFK2B1016840",
};

export function assertAutoDevCompRegressionCases() {
  let passed = 0;
  const test = (condition: unknown, message: string) => { check(condition, message); passed++; };

  const data = buildAutoDevCompCandidates([
    row,
    { ...row, vin: "TRUK1AFK2B1016841", trim: "Premium Plus" },
    { ...row, vin: "TRUK1AFK2B1016842", model: "TT", trim: "Premium Plus" },
    { ...row, vin: "TRUK1AFK2B1016843", model: "TT RS", trim: "TT RS" },
    { ...row, vin: "TRUK1AFK2B1016844", price: null },
    { ...row, vin: "TRUK1AFK2B1016845", url: null },
    { ...row, vin: "TRUK1AFK2B1016846", trim: null },
    row,
  ], target, 140000);

  test(data.comps.length === 6, "valid national evidence and VIN deduplication");
  const exact = data.comps.find(x => x.marketCheckDetails?.vin === row.vin);
  test(exact?.equivalenceTier === "direct", "exact derivative is direct");
  test(exact?.included === true, "documented exact retail listing auto-included");
  const near = data.comps.find(x => x.marketCheckDetails?.vin === "TRUK1AFK2B1016841");
  test(near?.equivalenceTier === "near", "Prestige and Premium Plus are Near, not Direct");
  test(near?.included === true, "high quality Near is available for valuation");
  const ordinary = data.comps.find(x => x.marketCheckDetails?.vin === "TRUK1AFK2B1016842");
  test(ordinary?.equivalenceTier === "supporting" && !ordinary.included, "standard TT never auto-included");
  const rs = data.comps.find(x => x.marketCheckDetails?.vin === "TRUK1AFK2B1016843");
  test(rs?.equivalenceTier === "supporting" && !rs.included, "TT RS never auto-included");
  test(data.diagnostics.missingPriceOrMileage === 1, "missing sale data excluded");
  test(data.comps.some(x => x.marketCheckDetails?.vin === "TRUK1AFK2B1016845" && !x.included), "missing listing URL needs dealer input");
  test(data.comps.some(x => x.marketCheckDetails?.vin === "TRUK1AFK2B1016846" && !x.included), "missing trim cannot auto-include");

  const prior: MarketComp = { ...exact!, id: "mc-row", source: "MarketCheck", included: false, dealerDecision: "exclude" };
  test(mergeCompCandidates([prior], [exact!]).length === 1, "cross-provider VIN is not double counted");
  const withChoice = { ...exact!, included: false, dealerDecision: "exclude" as const };
  const mc: MarketComp = { ...exact!, id: "mc-again", source: "MarketCheck", included: true };
  const merged = mergeCompCandidates([withChoice], [mc]);
  test(merged.length === 1 && merged[0].source === "MarketCheck" && !merged[0].included && merged[0].dealerDecision === "exclude", "MarketCheck replaces Auto.dev while preserving dealer exclusion");

  const bronco = buildAutoDevCompCandidates([
    { ...row, year: 2023, make: "Ford", model: "Bronco Sport", trim: "Big Bend", bodyType: "SUV", drivetrain: "4WD", vin: "1FMEE5BPXPLB55559" },
    { ...row, year: 2023, make: "Ford", model: "Bronco 4-Door", trim: "Big Bend", bodyType: "SUV", drivetrain: "4WD", vin: "1FMEE5BPXPLB55550" },
  ], { year: 2023, make: "Ford", model: "Bronco", trim: "Big Bend", drivetrain: "4WD", bodyType: "SUV", fuelType: "Gasoline", doors: 4 }, 31500);
  test(bronco.comps.length === 1 && bronco.comps[0].model === "Bronco 4-Door", "Bronco Sport is excluded and Bronco 4-Door survives");
  return { passed };
}
