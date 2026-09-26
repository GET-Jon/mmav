import { resolveMarketCheckModelCandidates } from "./model-discovery";

type Case = {
  name: string;
  make: string;
  requestedModel: string;
  discoveredModels: Array<{ item: string; count: number }>;
  expected: string[];
};

const cases: Case[] = [
  {
    name: "Audi TTS can recover through TT family",
    make: "Audi",
    requestedModel: "TTS",
    discoveredModels: [
      { item: "TT", count: 24 },
      { item: "A4", count: 80 },
      { item: "TTS", count: 1 },
    ],
    expected: ["TTS", "TT"],
  },
  {
    name: "Audi S5 can recover through A5 family without unrelated Audi models",
    make: "Audi",
    requestedModel: "S5",
    discoveredModels: [
      { item: "A5", count: 35 },
      { item: "RS5", count: 6 },
      { item: "Q5", count: 44 },
      { item: "S5", count: 2 },
    ],
    expected: ["S5", "A5", "RS5"],
  },
  {
    name: "BMW M2 can recover through 2 Series family",
    make: "BMW",
    requestedModel: "M2",
    discoveredModels: [
      { item: "2 Series", count: 48 },
      { item: "M2", count: 4 },
      { item: "3 Series", count: 70 },
    ],
    expected: ["M2", "2 Series"],
  },
  {
    name: "Mercedes C43 can recover through C-Class family",
    make: "Mercedes-Benz",
    requestedModel: "C43",
    discoveredModels: [
      { item: "C-Class", count: 42 },
      { item: "E-Class", count: 50 },
      { item: "C43", count: 3 },
    ],
    expected: ["C43", "C-Class"],
  },
  {
    name: "Volkswagen Golf R can recover through Golf family",
    make: "Volkswagen",
    requestedModel: "Golf R",
    discoveredModels: [
      { item: "Golf", count: 25 },
      { item: "Golf R", count: 3 },
      { item: "Jetta", count: 61 },
    ],
    expected: ["Golf R", "Golf"],
  },
  {
    name: "Unknown models do not broaden to unrelated labels",
    make: "Mazda",
    requestedModel: "MX-5 Miata",
    discoveredModels: [
      { item: "CX-5", count: 40 },
      { item: "Mazda3", count: 35 },
      { item: "MX-5 Miata", count: 2 },
    ],
    expected: ["MX-5 Miata"],
  },
];

export function assertMarketCheckModelDiscoveryRegressionCases() {
  const failures: string[] = [];

  for (const testCase of cases) {
    const actual = resolveMarketCheckModelCandidates({
      make: testCase.make,
      requestedModel: testCase.requestedModel,
      discoveredModels: testCase.discoveredModels,
    });

    if (JSON.stringify(actual) !== JSON.stringify(testCase.expected)) {
      failures.push(
        `${testCase.name}: expected ${JSON.stringify(testCase.expected)}, received ${JSON.stringify(actual)}`,
      );
    }
  }

  if (failures.length) {
    throw new Error(
      `MarketCheck model-discovery regression failure:\n${failures.join("\n")}`,
    );
  }

  return { passed: cases.length, failed: 0 };
}
