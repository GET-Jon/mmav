import {
  evaluateVehicleEquivalence,
  type VehicleEquivalenceTier,
  type VehicleIdentity,
} from "./vehicle-equivalence";
import { canonicalIdentitySnapshot } from "./vehicle-identity";

type RegressionCase = {
  name: string;
  target: VehicleIdentity;
  candidate: VehicleIdentity;
  expected: VehicleEquivalenceTier;
};

const base = {
  year: 2020,
  drivetrain: "RWD",
  fuelType: "Gasoline",
} as const;

export const vehicleEquivalenceRegressionCases: RegressionCase[] = [
  {
    name: "Audi A5 VIN naming vs A5 Sportback is near, not rejected",
    target: {
      year: 2025,
      make: "Audi",
      model: "A5",
      trim: "S Line quattro Premium",
      bodyType: "Hatchback",
      drivetrain: "AWD",
      fuelType: "Gasoline",
    },
    candidate: {
      year: 2025,
      make: "Audi",
      model: "A5 Sportback",
      trim: "Premium",
      bodyType: "Hatchback",
      drivetrain: "4WD",
      fuelType: "Gasoline",
    },
    expected: "near",
  },
  {
    name: "Audi A5 vs S5 Sportback preserves performance distinction",
    target: {
      year: 2025,
      make: "Audi",
      model: "A5",
      trim: "Premium",
      bodyType: "Hatchback",
      drivetrain: "AWD",
      fuelType: "Gasoline",
    },
    candidate: {
      year: 2025,
      make: "Audi",
      model: "S5 Sportback",
      trim: "Premium",
      bodyType: "Hatchback",
      drivetrain: "4WD",
      fuelType: "Gasoline",
    },
    expected: "supporting",
  },
  {
    name: "Audi A5 vs RS5 Sportback preserves performance distinction",
    target: {
      year: 2025,
      make: "Audi",
      model: "A5",
      trim: "Premium",
      bodyType: "Hatchback",
      drivetrain: "AWD",
      fuelType: "Gasoline",
    },
    candidate: {
      year: 2025,
      make: "Audi",
      model: "RS5 Sportback",
      trim: "Premium",
      bodyType: "Hatchback",
      drivetrain: "AWD",
      fuelType: "Gasoline",
    },
    expected: "supporting",
  },
  {
    name: "Audi TTS VIN naming vs TT TTS trim is direct",
    target: {
      year: 2020,
      make: "Audi",
      model: "TTS",
      trim: "TTS",
      bodyType: "Coupe",
      drivetrain: "AWD",
      fuelType: "Gasoline",
    },
    candidate: {
      year: 2020,
      make: "Audi",
      model: "TT",
      trim: "TTS",
      bodyType: "Coupe",
      drivetrain: "AWD",
      fuelType: "Gasoline",
    },
    expected: "direct",
  },
  {
    name: "Audi TTS vs standard TT preserves performance distinction",
    target: {
      year: 2020,
      make: "Audi",
      model: "TTS",
      trim: "TTS",
      bodyType: "Coupe",
      drivetrain: "AWD",
      fuelType: "Gasoline",
    },
    candidate: {
      year: 2020,
      make: "Audi",
      model: "TT",
      trim: "Premium Plus",
      bodyType: "Coupe",
      drivetrain: "AWD",
      fuelType: "Gasoline",
    },
    expected: "supporting",
  },
  {
    name: "Audi TTS vs TT RS preserves performance distinction",
    target: {
      year: 2020,
      make: "Audi",
      model: "TTS",
      trim: "TTS",
      bodyType: "Coupe",
      drivetrain: "AWD",
      fuelType: "Gasoline",
    },
    candidate: {
      year: 2020,
      make: "Audi",
      model: "TT",
      trim: "TT RS",
      bodyType: "Coupe",
      drivetrain: "AWD",
      fuelType: "Gasoline",
    },
    expected: "supporting",
  },
  {
    name: "Audi A5 Cabriolet vs Sportback is supporting body configuration",
    target: {
      year: 2025,
      make: "Audi",
      model: "A5 Cabriolet",
      trim: "Premium",
      bodyType: "Convertible",
      drivetrain: "AWD",
      fuelType: "Gasoline",
    },
    candidate: {
      year: 2025,
      make: "Audi",
      model: "A5 Sportback",
      trim: "Premium",
      bodyType: "Hatchback",
      drivetrain: "4WD",
      fuelType: "Gasoline",
    },
    expected: "supporting",
  },
  {
    name: "BMW 430i Gran Coupe vs 4 Series normalizes to same family",
    target: {
      year: 2024,
      make: "BMW",
      model: "430i Gran Coupe",
      trim: "430i",
      bodyType: "Hatchback",
      drivetrain: "RWD",
      fuelType: "Gasoline",
    },
    candidate: {
      year: 2024,
      make: "BMW",
      model: "4 Series",
      trim: "430i",
      bodyType: "Hatchback",
      drivetrain: "RWD",
      fuelType: "Gasoline",
    },
    expected: "direct",
  },
  {
    name: "Mercedes C300 model code vs C-Class normalizes to same family",
    target: {
      year: 2024,
      make: "Mercedes-Benz",
      model: "C300",
      trim: "C300",
      bodyType: "Sedan",
      drivetrain: "RWD",
      fuelType: "Gasoline",
    },
    candidate: {
      year: 2024,
      make: "Mercedes-Benz",
      model: "C-Class",
      trim: "C300",
      bodyType: "Sedan",
      drivetrain: "RWD",
      fuelType: "Gasoline",
    },
    expected: "direct",
  },
  {
    name: "Range Rover Sport remains distinct from Range Rover",
    target: {
      ...base,
      make: "Land Rover",
      model: "Range Rover Sport",
      trim: "HSE",
      bodyType: "SUV",
      drivetrain: "AWD",
    },
    candidate: {
      ...base,
      make: "Land Rover",
      model: "Range Rover",
      trim: "HSE",
      bodyType: "SUV",
      drivetrain: "AWD",
    },
    expected: "reject",
  },

  {
    name: "Wrangler TJ SE vs same SE is direct",
    target: { year: 2005, make: "Jeep", model: "Wrangler", trim: "SE", fuelType: "Gasoline", drivetrain: "4WD" },
    candidate: { year: 2005, make: "Jeep", model: "Wrangler", trim: "SE", fuelType: "Gasoline", drivetrain: "4WD" },
    expected: "direct",
  },
  {
    name: "Wrangler TJ SE vs Sport is near",
    target: { year: 2005, make: "Jeep", model: "Wrangler", trim: "SE", fuelType: "Gasoline", drivetrain: "4WD" },
    candidate: { year: 2005, make: "Jeep", model: "Wrangler", trim: "Sport", fuelType: "Gasoline", drivetrain: "4WD" },
    expected: "near",
  },
  {
    name: "Wrangler TJ SE vs LJ Unlimited is supporting",
    target: { year: 2005, make: "Jeep", model: "Wrangler", trim: "SE", fuelType: "Gasoline", drivetrain: "4WD" },
    candidate: { year: 2005, make: "Jeep", model: "Wrangler", trim: "Unlimited", fuelType: "Gasoline", drivetrain: "4WD" },
    expected: "supporting",
  },
  {
    name: "Wrangler Sport vs Rubicon is supporting",
    target: { year: 2005, make: "Jeep", model: "Wrangler", trim: "Sport", fuelType: "Gasoline", drivetrain: "4WD" },
    candidate: { year: 2005, make: "Jeep", model: "Wrangler", trim: "Rubicon", fuelType: "Gasoline", drivetrain: "4WD" },
    expected: "supporting",
  },
  {
    name: "F150 Raptor vs XLT is supporting",
    target: { ...base, make: "Ford", model: "F-150", trim: "Raptor" },
    candidate: { ...base, make: "Ford", model: "F-150", trim: "XLT" },
    expected: "supporting",
  },
  {
    name: "F150 Raptor alias vs Raptor trim is direct",
    target: { ...base, make: "Ford", model: "F-150 Raptor", trim: "Raptor" },
    candidate: { ...base, make: "Ford", model: "F-150", trim: "Raptor" },
    expected: "direct",
  },
  {
    name: "Civic Type R vs Sport is supporting",
    target: { ...base, make: "Honda", model: "Civic Type R", trim: "Type R", drivetrain: "FWD" },
    candidate: { ...base, make: "Honda", model: "Civic", trim: "Sport", drivetrain: "FWD" },
    expected: "supporting",
  },
  {
    name: "Civic Type R alias vs Type R is direct",
    target: { ...base, make: "Honda", model: "Civic Type R", trim: "Type R", drivetrain: "FWD" },
    candidate: { ...base, make: "Honda", model: "Civic", trim: "Type R", drivetrain: "FWD" },
    expected: "direct",
  },
  {
    name: "BMW 330i vs M340i is supporting",
    target: { ...base, make: "BMW", model: "3 Series", trim: "330i" },
    candidate: { ...base, make: "BMW", model: "3 Series", trim: "M340i" },
    expected: "supporting",
  },
  {
    name: "BMW M3 alias vs 3 Series M3 is direct",
    target: { ...base, make: "BMW", model: "M3", trim: "M3" },
    candidate: { ...base, make: "BMW", model: "3 Series", trim: "M3" },
    expected: "direct",
  },
  {
    name: "Mercedes C63 vs C300 is supporting",
    target: { ...base, make: "Mercedes-Benz", model: "C63", trim: "AMG C63" },
    candidate: { ...base, make: "Mercedes-Benz", model: "C-Class", trim: "C300" },
    expected: "supporting",
  },
  {
    name: "Porsche Carrera vs Carrera S is supporting",
    target: { ...base, make: "Porsche", model: "911", trim: "Carrera" },
    candidate: { ...base, make: "Porsche", model: "911", trim: "Carrera S" },
    expected: "supporting",
  },
  {
    name: "Porsche Carrera S vs same Carrera S is direct",
    target: { ...base, make: "Porsche", model: "911", trim: "Carrera S" },
    candidate: { ...base, make: "Porsche", model: "911", trim: "Carrera S" },
    expected: "direct",
  },
  {
    name: "Corvette Stingray vs Z06 is supporting",
    target: { ...base, make: "Chevrolet", model: "Corvette", trim: "Stingray" },
    candidate: { ...base, make: "Chevrolet", model: "Corvette", trim: "Z06" },
    expected: "supporting",
  },
  {
    name: "Tacoma TRD Pro vs SR5 is supporting",
    target: { ...base, make: "Toyota", model: "Tacoma", trim: "TRD Pro", drivetrain: "4WD" },
    candidate: { ...base, make: "Toyota", model: "Tacoma", trim: "SR5", drivetrain: "4WD" },
    expected: "supporting",
  },
  {
    name: "Tacoma SR5 vs TRD Sport is near",
    target: { ...base, make: "Toyota", model: "Tacoma", trim: "SR5", drivetrain: "4WD" },
    candidate: { ...base, make: "Toyota", model: "Tacoma", trim: "TRD Sport", drivetrain: "4WD" },
    expected: "near",
  },
  {
    name: "Coupe vs convertible is supporting",
    target: { ...base, make: "Ford", model: "Mustang", trim: "GT", bodyType: "Coupe" },
    candidate: { ...base, make: "Ford", model: "Mustang", trim: "GT", bodyType: "Convertible" },
    expected: "supporting",
  },
  {
    name: "4WD vs 2WD is supporting",
    target: { ...base, make: "Toyota", model: "4Runner", trim: "SR5", drivetrain: "4WD" },
    candidate: { ...base, make: "Toyota", model: "4Runner", trim: "SR5", drivetrain: "2WD" },
    expected: "supporting",
  },
  {
    name: "Gas vs diesel is rejected",
    target: { ...base, make: "Ford", model: "F-250", trim: "Lariat", fuelType: "Gasoline" },
    candidate: { ...base, make: "Ford", model: "F-250", trim: "Lariat", fuelType: "Diesel" },
    expected: "reject",
  },
  {
    name: "Missing trim is supporting rather than auto included",
    target: { ...base, make: "Toyota", model: "Camry", trim: "XSE" },
    candidate: { ...base, make: "Toyota", model: "Camry", trim: "" },
    expected: "supporting",
  },
  {
    name: "Different model is rejected",
    target: { ...base, make: "Toyota", model: "Camry", trim: "XSE" },
    candidate: { ...base, make: "Toyota", model: "Corolla", trim: "XSE" },
    expected: "reject",
  },
];


type IdentityRegressionCase = {
  name: string;
  vehicle: VehicleIdentity;
  expected: Partial<ReturnType<typeof canonicalIdentitySnapshot>>;
};

export const vehicleIdentityRegressionCases: IdentityRegressionCase[] = [
  {
    name: "Audi Sportback descriptor stays in configuration, not model family",
    vehicle: {
      year: 2025,
      make: "Audi",
      model: "A5 Sportback",
      trim: "Premium",
      bodyType: "",
      drivetrain: "4WD",
      fuelType: "Gasoline",
    },
    expected: {
      make: "audi",
      modelFamily: "a5",
      bodyClass: "hatchback",
      tractionClass: "all-wheel",
      fuelType: "gasoline",
    },
  },
  {
    name: "BMW model code and Gran Coupe descriptor normalize to 4 Series",
    vehicle: {
      year: 2024,
      make: "BMW",
      model: "430i Gran Coupe",
      trim: "430i",
      drivetrain: "RWD",
      fuelType: "Gasoline",
    },
    expected: {
      modelFamily: "4 series",
      bodyClass: "hatchback",
      tractionClass: "two-wheel",
    },
  },
  {
    name: "Mercedes model code normalizes to class family",
    vehicle: {
      year: 2024,
      make: "Mercedes",
      model: "C300 4MATIC",
      trim: "C300",
      drivetrain: "AWD",
      fuelType: "Gas",
    },
    expected: {
      make: "mercedes benz",
      modelFamily: "c class",
      tractionClass: "all-wheel",
      fuelType: "gasoline",
    },
  },
  {
    name: "Range Rover Sport is not collapsed into Range Rover",
    vehicle: {
      year: 2024,
      make: "Land Rover",
      model: "Range Rover Sport",
      trim: "HSE",
      bodyType: "SUV",
      drivetrain: "AWD",
      fuelType: "Gasoline",
    },
    expected: {
      modelFamily: "range rover sport",
      bodyClass: "suv",
    },
  },
];

export function assertVehicleEquivalenceRegressionCases() {
  const failures: string[] = [];

  for (const testCase of vehicleEquivalenceRegressionCases) {
    const actual = evaluateVehicleEquivalence({
      target: testCase.target,
      candidate: testCase.candidate,
    }).tier;

    if (actual !== testCase.expected) {
      failures.push(`${testCase.name}: expected ${testCase.expected}, received ${actual}`);
    }
  }

  for (const testCase of vehicleIdentityRegressionCases) {
    const actual = canonicalIdentitySnapshot(testCase.vehicle);

    for (const [key, expectedValue] of Object.entries(testCase.expected)) {
      const actualValue = actual[key as keyof typeof actual];
      if (actualValue !== expectedValue) {
        failures.push(
          `${testCase.name}: expected ${key}=${String(expectedValue)}, received ${String(actualValue)}`,
        );
      }
    }
  }

  if (failures.length) {
    throw new Error(`Vehicle-equivalence regression failure:\n${failures.join("\n")}`);
  }

  return {
    passed:
      vehicleEquivalenceRegressionCases.length +
      vehicleIdentityRegressionCases.length,
    failed: 0,
  };
}
