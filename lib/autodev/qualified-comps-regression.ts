import { buildDiscoveryModels, buildDiscoveryTrimFilter, buildBodyModelTrimSearch, countCloseDiscoveryCandidates } from "./discovery-models";
import { convertibleVinVerificationCandidates, useVerifiedBodyType } from "./verify-convertible-bodies";
import { buildAutoDevCompCandidates, excludeSubjectVinComps, mergeCompCandidates } from "./qualified-comps";
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

  // The search should not stop after seeing four loosely related vehicles.
  const discoveryCounts = [
    {included:true,equivalenceTier:"supporting",qualityScore:90,year:2020,mileage:38000},
    {included:true,equivalenceTier:"near",qualityScore:92,year:2020,mileage:38000},
    {included:true,equivalenceTier:"direct",qualityScore:94,year:2020,mileage:88000},
    {included:true,equivalenceTier:"direct",qualityScore:94,year:2020,mileage:39000},
  ];
  test(countCloseDiscoveryCandidates(discoveryCounts,2020,38000) === 1,
    "related and mileage-distant cars must not prematurely end national discovery");
  test(countCloseDiscoveryCandidates(Array.from({length:4},(_,i)=>({
    included:true,equivalenceTier:"direct",qualityScore:85,year:2020,mileage:38000+i*500,
  })),2020,38000) === 4,
    "four genuine close candidates can stop discovery pending final valuation qualification");
  test(countCloseDiscoveryCandidates([{included:true,equivalenceTier:"direct",qualityScore:90,year:2020,mileage:38000}],2020,0) === 0,
    "a missing subject mileage must not establish a confident discovery cohort");
  const focusedCayenne = buildBodyModelTrimSearch("Cayenne", "Turbo Coupe");
  test(focusedCayenne?.model === "Cayenne Coupe" && focusedCayenne?.trimFilter === "Turbo",
    "a performance derivative must search its provider model plus the specific remaining trim");
  test(buildBodyModelTrimSearch("Civic","Sport") === null,
    "ordinary cars must not incur unnecessary body-derivative API searches");
  const coupeModels = buildDiscoveryModels("Porsche","Cayenne","Turbo Coupe");
  test(coupeModels.includes("Cayenne Coupe") && coupeModels.includes("Cayenne Turbo Coupe"),
    "national search should try body-derivative provider model aliases for Turbo Coupe");
  test(buildDiscoveryModels("Honda","Civic","Sport").length === 1,
    "ordinary trims should not incur extra model-alias calls");

  // The targeted-first search must work for common and specialty variants
  // across brands, not depend on Mercedes-specific trim dictionaries.
  test(buildDiscoveryTrimFilter("Toyota", "Tacoma", "TRD Pro") === "TRD Pro",
    "Toyota trim-first query is available with broad Tacoma fallback");
  test(buildDiscoveryTrimFilter("Ford", "F-150", "Lariat") === "Lariat",
    "Ford pickup trim-first query is available with broad fallback");
  test(buildDiscoveryTrimFilter("Porsche", "911", "Carrera 4S") === "Carrera 4S",
    "Porsche trim-first discovery is not Mercedes-specific");
  test(buildDiscoveryTrimFilter("Honda", "Civic", "Sport") === "Sport",
    "ordinary Honda trims can be searched precisely before broad Civic listings");
  test(buildDiscoveryTrimFilter("Honda", "Civic", "Base") === null,
    "generic Base is not used as a narrow trim search");
  test(buildDiscoveryTrimFilter("Audi", "TTS", "TTS") === null,
    "same model and trim cannot waste a query");
  const porscheBodyTarget: VehicleIdentity = {
    year: 2018, make: "Porsche", model: "911", trim: "Carrera", bodyType: "Coupe",
    fuelType: "Gasoline",
  };
  const genericUnknownBody = {
    vin: "WP0AA2A94JS107254", year: 2018, make: "Porsche",
    model: "911", trim: "Carrera", bodyType: "Car",
    price: 63000, miles: 46000,
  };
  test(convertibleVinVerificationCandidates([genericUnknownBody], porscheBodyTarget, 8, 46000).length === 1,
    "Porsche coupe missing body details is eligible for bounded identity verification");
  test(convertibleVinVerificationCandidates([
    { ...genericUnknownBody, trim: "Turbo" },
  ], porscheBodyTarget, 8, 46000).length === 0,
    "different Porsche variant does not waste VIN verification allowance");
  const fordBodyTarget: VehicleIdentity = {
    year: 2020, make: "Ford", model: "F-150", trim: "XLT", bodyType: "Pickup",
    fuelType: "Gasoline",
  };
  test(convertibleVinVerificationCandidates([{
    vin: "1FTFW1E50LFA00100", year: 2020, make: "Ford",
    model: "F-150", trim: "XLT", bodyType: "Car", price: 34000, miles: 46000,
  }], fordBodyTarget, 8, 46000).length === 1,
    "Ford pickup unknown body is eligible for the same bounded VIN check");
  test(useVerifiedBodyType("Car","Pickup Truck") === "Pickup",
    "validated VIN can resolve pickup body style");
  const s63Filter = buildDiscoveryTrimFilter("Mercedes-Benz", "S-Class", "AMG S63");
  test(Boolean(s63Filter?.includes("AMG S63") && s63Filter.includes("S 63 AMG 4MATIC")),
    "rare S63 gets targeted Auto.dev trim query before broad S-Class pages");
  test(buildDiscoveryTrimFilter("Mercedes-Benz", "S-Class", "S 550 4MATIC") === "S 550 4MATIC",
    "ordinary S-Class may use a narrow trim-first query with the same broad fallback");
  test(buildDiscoveryTrimFilter("BMW", "5 Series", "M5") === null,
    "other makes retain normal discovery behavior");
  const s63Target: VehicleIdentity = { year: 2017, make: "Mercedes-Benz", model: "S-Class", trim: "AMG S63", bodyType: "Convertible", drivetrain: "AWD", fuelType: "Gasoline" };
  const ambiguousS63 = { vin: "WDDJK7JB5HA023044", year: 2017, make: "Mercedes-Benz", model: "S-Class", trim: "AMG S63", bodyType: "Car", price: 65000, miles: 43000 };
  test(convertibleVinVerificationCandidates([ambiguousS63],s63Target,8,46000).length === 1,
    "ambiguous S63 body type is eligible for bounded VIN verification");
  test(convertibleVinVerificationCandidates([{...ambiguousS63,trim:"S550"}],s63Target,8,46000).length === 0,
    "ordinary S550 does not trigger specialty VIN verification");
  test(convertibleVinVerificationCandidates([{...ambiguousS63,bodyType:"Sedan"}],s63Target,8,46000).length === 0,
    "known sedan is never reclassified based on speculative VIN evidence");
  test(useVerifiedBodyType("Car","Convertible/Cabriolet") === "Convertible",
    "confirmed convertible VIN can establish correct body class");
  test(useVerifiedBodyType("Car","Sedan/Saloon") === "Sedan",
    "confirmed sedan VIN stays excluded from convertible valuation");
  test(useVerifiedBodyType("Car",null) === "Car",
    "missing VIN evidence never invents convertible identity");
  test(useVerifiedBodyType("Sedan","Convertible") === "Sedan",
    "VIN probe cannot overwrite explicit contrary provider body style");
  const order = buildDiscoveryModels("Audi", "TTS", "quattro Prestige", ["TT", "TTS"]);
  test(order[0] === "TTS" && order[1] === "TT", "exact TTS searched before broad TT provider aliases");
  test(buildDiscoveryModels("Audi", "TTS", "Prestige", ["tt", "TT", "TTS"]).length === 2,
    "duplicate aliases cannot waste national provider calls");
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
  test(data.diagnostics.missingPrice === 1 && data.diagnostics.missingMileage === 0, "price and mileage rejection reasons stay distinct");
  const missingMileage = buildAutoDevCompCandidates([
    { ...row, miles: null },
  ], target, 140000);
  test(missingMileage.comps.length === 0 && missingMileage.diagnostics.missingMileage === 1,
    "missing mileage cannot manufacture a valuation comparison");
  test(data.comps.some(x => x.marketCheckDetails?.vin === "TRUK1AFK2B1016845" && !x.included), "missing listing URL needs dealer input");
  test(data.comps.some(x => x.marketCheckDetails?.vin === "TRUK1AFK2B1016846" && !x.included), "missing trim cannot auto-include");

  const subjectFiltered = excludeSubjectVinComps(data.comps, row.vin.toLowerCase());
  test(subjectFiltered.length === data.comps.length - 1 &&
    !subjectFiltered.some(x => x.marketCheckDetails?.vin === row.vin),
    "subject listing VIN excluded regardless of casing");
  test(excludeSubjectVinComps(data.comps, "invalid").length === data.comps.length,
    "invalid subject VIN never excludes unrelated listings");
  test(excludeSubjectVinComps(data.comps, "TRUK1AFK2B1016849").length === data.comps.length,
    "unrelated listing VIN remains valid comparable");

  const prior: MarketComp = { ...exact!, id: "mc-row", source: "MarketCheck", included: false, dealerDecision: "exclude" };
  test(mergeCompCandidates([prior], [exact!]).length === 1, "cross-provider VIN is not double counted");
  const matchingProvider: MarketComp = { ...exact!, id: "mc-matched", source: "MarketCheck", included: false, qualityScore: 68 };
  const acrossProviders = mergeCompCandidates([exact!], [matchingProvider]);
  test(acrossProviders.length === 1 && acrossProviders[0].included === true &&
    acrossProviders[0].source === "MarketCheck",
    "valid national comp is not silently deselected during MarketCheck merge");
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
