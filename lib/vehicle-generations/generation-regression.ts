import { resolveVehicleGeneration } from "./resolve-generation";

type GenerationCase = {
  name: string;
  vehicle: {
    year: number;
    make: string;
    model: string;
    trim?: string;
  };
  expectedGeneration: string | null;
};

const cases: GenerationCase[] = [
  {
    name: "2012 Audi TTS resolves to 8J",
    vehicle: {
      year: 2012,
      make: "Audi",
      model: "TTS",
      trim: "Premium Plus",
    },
    expectedGeneration: "8J",
  },
  {
    name: "2012 Audi TT resolves to 8J",
    vehicle: {
      year: 2012,
      make: "Audi",
      model: "TT",
      trim: "Premium Plus",
    },
    expectedGeneration: "8J",
  },
  {
    name: "2019 Audi TT RS resolves to 8S",
    vehicle: {
      year: 2019,
      make: "Audi",
      model: "TT RS",
      trim: "TT RS",
    },
    expectedGeneration: "8S",
  },
  {
    name: "2024 Audi TTS is outside the modeled TT run",
    vehicle: {
      year: 2024,
      make: "Audi",
      model: "TTS",
      trim: "TTS",
    },
    expectedGeneration: null,
  },
];

export function assertVehicleGenerationRegressionCases() {
  const failures: string[] = [];

  for (const testCase of cases) {
    const actual = resolveVehicleGeneration(testCase.vehicle);
    const actualGeneration = actual?.generation || null;

    if (actualGeneration !== testCase.expectedGeneration) {
      failures.push(
        `${testCase.name}: expected ${String(testCase.expectedGeneration)}, received ${String(actualGeneration)}`,
      );
    }
  }

  if (failures.length) {
    throw new Error(
      `Vehicle-generation regression failure:\n${failures.join("\n")}`,
    );
  }

  return { passed: cases.length, failed: 0 };
}
