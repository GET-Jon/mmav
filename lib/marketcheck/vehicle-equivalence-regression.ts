import {
  evaluateVehicleEquivalence,
  type VehicleEquivalenceTier,
  type VehicleIdentity,
} from "./vehicle-equivalence";
import { canonicalIdentitySnapshot, dedicatedBmwMModel } from "./vehicle-identity";

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
    name: "2000 M5 VIN-style M5 5-Series target matches genuine M5",
    target: { year: 2000, make: "BMW", model: "M5 5-Series", trim: "", bodyType: "Sedan" },
    candidate: { year: 2001, make: "BMW", model: "M5", trim: "", bodyType: "Sedan" },
    expected: "direct",
  },
  {
    name: "2000 BMW M5 rejects ordinary 525i",
    target: { year: 2000, make: "BMW", model: "M5", trim: "", bodyType: "Sedan" },
    candidate: { year: 2002, make: "BMW", model: "5 Series", trim: "525i", bodyType: "Sedan" },
    expected: "reject",
  },
  {
    name: "2000 BMW M5 rejects ordinary 540i",
    target: { year: 2000, make: "BMW", model: "M5", trim: "", bodyType: "Sedan" },
    candidate: { year: 2003, make: "BMW", model: "5 Series", trim: "540i", bodyType: "Sedan" },
    expected: "reject",
  },
  {
    name: "BMW M5 rejects M550i M Performance",
    target: { ...base, make: "BMW", model: "M5", trim: "" },
    candidate: { ...base, make: "BMW", model: "M550i", trim: "" },
    expected: "reject",
  },
  {
    name: "Provider 5 Series M5 trim matches the dedicated M5 model",
    target: { year: 2000, make: "BMW", model: "M5", trim: "" },
    candidate: { year: 2000, make: "BMW", model: "5 Series", trim: "M5" },
    expected: "direct",
  },
  {
    name: "BMW M3 cannot be valued using 330i",
    target: { ...base, make: "BMW", model: "M3", trim: "" },
    candidate: { ...base, make: "BMW", model: "330i", trim: "" },
    expected: "reject",
  },
  {
    name: "Canadian Audi A3 Komfort and US Premium stay near pending verified equipment equivalence",
    target: { year: 2018, make: "Audi", model: "A3 Sedan", trim: "Premium, Komfort (Canada)", bodyType: "Sedan", drivetrain: "FWD", fuelType: "Gasoline" },
    candidate: { year: 2017, make: "Audi", model: "A3 Sedan", trim: "Premium", bodyType: "Sedan", drivetrain: "FWD", fuelType: "Gasoline" },
    expected: "near",
  },
  {
    name: "Canadian A3 FWD and US A3 quattro cannot become direct pricing matches",
    target: { year: 2018, make: "Audi", model: "A3 Sedan", trim: "Premium, Komfort (Canada)", bodyType: "Sedan", drivetrain: "FWD", fuelType: "Gasoline" },
    candidate: { year: 2017, make: "Audi", model: "A3 Sedan", trim: "Premium", bodyType: "Sedan", drivetrain: "AWD", fuelType: "Gasoline" },
    expected: "supporting",
  },
  {
    name: "Silverado Trail Boss subject vs MarketCheck Silverado 1500 Custom is supporting, not a family reject",
    target: { year: 2020, make: "Chevrolet", model: "Silverado Trail Boss", trim: "Custom", bodyType: "Pickup", drivetrain: "4WD", fuelType: "Gasoline" },
    candidate: { year: 2020, make: "Chevrolet", model: "Silverado 1500", trim: "Custom", bodyType: "Pickup", drivetrain: "RWD", fuelType: "Gasoline" },
    expected: "supporting",
  },
  {
    name: "Silverado Trail Boss remains a materially different derivative from an ordinary Custom",
    target: { year: 2020, make: "Chevrolet", model: "Silverado Trail Boss", trim: "Custom", bodyType: "Pickup", drivetrain: "4WD", fuelType: "Gasoline" },
    candidate: { year: 2020, make: "Chevrolet", model: "Silverado 1500", trim: "Custom", bodyType: "Pickup", drivetrain: "4WD", fuelType: "Gasoline" },
    expected: "supporting",
  },
  {
    name: "Silverado 1500 LT Trail Boss still matches the subject derivative as near evidence",
    target: { year: 2020, make: "Chevrolet", model: "Silverado Trail Boss", trim: "Custom", bodyType: "Pickup", drivetrain: "4WD", fuelType: "Gasoline" },
    candidate: { year: 2020, make: "Chevrolet", model: "Silverado 1500", trim: "LT Trail Boss", bodyType: "Pickup", drivetrain: "4WD", fuelType: "Gasoline" },
    expected: "near",
  },
  {
    name: "Silverado 2500HD is never a Silverado 1500 comp",
    target: { year: 2020, make: "Chevrolet", model: "Silverado Trail Boss", trim: "Custom", bodyType: "Pickup", drivetrain: "4WD", fuelType: "Gasoline" },
    candidate: { year: 2020, make: "Chevrolet", model: "Silverado 2500HD", trim: "Custom", bodyType: "Pickup", drivetrain: "4WD", fuelType: "Gasoline" },
    expected: "reject",
  },
  {
    name: "Silverado EV is never a Silverado 1500 comp",
    target: { year: 2025, make: "Chevrolet", model: "Silverado 1500", trim: "Custom", bodyType: "Pickup", drivetrain: "4WD", fuelType: "Gasoline" },
    candidate: { year: 2025, make: "Chevrolet", model: "Silverado EV", trim: "WT", bodyType: "Pickup", drivetrain: "4WD", fuelType: "Electric" },
    expected: "reject",
  },
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
    name: "Audi TTS Prestige and quattro Prestige are the same equipment trim",
    target: {
      year: 2011, make: "Audi", model: "TTS", trim: "quattro Prestige",
      bodyType: "Coupe", drivetrain: "AWD", fuelType: "Gasoline",
    },
    candidate: {
      year: 2011, make: "Audi", model: "TTS", trim: "Prestige",
      bodyType: "Coupe", drivetrain: "AWD", fuelType: "Gasoline",
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
    name: "AI-normalized RAV4 Prime XSE matches provider RAV4 Prime XSE",
    target: {
      year: 2023,
      make: "Toyota",
      model: "RAV4 Prime",
      trim: "XSE",
      bodyType: "SUV",
      drivetrain: "AWD",
      fuelType: "Plug-in Hybrid",
    },
    candidate: {
      year: 2023,
      make: "Toyota",
      model: "RAV4 Prime",
      trim: "XSE",
      bodyType: "SUV",
      drivetrain: "AWD",
      fuelType: "PHEV",
    },
    expected: "direct",
  },
  {
    name: "RAV4 Prime XSE matches provider RAV4 XSE when fuel proves PHEV",
    target: {
      year: 2023,
      make: "Toyota",
      model: "RAV4 Prime",
      trim: "XSE",
      bodyType: "SUV",
      drivetrain: "AWD",
      fuelType: "Plug-in Hybrid",
    },
    candidate: {
      year: 2023,
      make: "Toyota",
      model: "RAV4",
      trim: "XSE",
      bodyType: "SUV",
      drivetrain: "AWD",
      fuelType: "Plug-in Hybrid",
    },
    expected: "direct",
  },
  {
    name: "RAV4 Prime XSE rejects RAV4 Hybrid XSE",
    target: {
      year: 2023,
      make: "Toyota",
      model: "RAV4 Prime",
      trim: "XSE",
      bodyType: "SUV",
      drivetrain: "AWD",
      fuelType: "Plug-in Hybrid",
    },
    candidate: {
      year: 2023,
      make: "Toyota",
      model: "RAV4",
      trim: "XSE",
      bodyType: "SUV",
      drivetrain: "AWD",
      fuelType: "Hybrid",
    },
    expected: "reject",
  },
  {
    name: "RAV4 Prime XSE keeps unclassified RAV4 XSE as supporting only",
    target: {
      year: 2023,
      make: "Toyota",
      model: "RAV4 Prime",
      trim: "XSE",
      bodyType: "SUV",
      drivetrain: "AWD",
      fuelType: "Plug-in Hybrid",
    },
    candidate: {
      year: 2023,
      make: "Toyota",
      model: "RAV4",
      trim: "XSE",
      bodyType: "SUV",
      drivetrain: "AWD",
      fuelType: "",
    },
    expected: "supporting",
  },
  {
    name: "BMW 428i provider model matches 4 Series 428i target",
    target: {
      year: 2016,
      make: "BMW",
      model: "4 Series",
      trim: "428i",
      bodyType: "Coupe",
      drivetrain: "RWD",
      fuelType: "Gasoline",
    },
    candidate: {
      year: 2016,
      make: "BMW",
      model: "428i",
      trim: "428i",
      bodyType: "Coupe",
      drivetrain: "RWD",
      fuelType: "Gasoline",
    },
    expected: "direct",
  },
  {
    name: "BMW 428i cannot use dedicated M4 for pricing",
    target: {
      year: 2016,
      make: "BMW",
      model: "4 Series",
      trim: "428i",
      bodyType: "Coupe",
      drivetrain: "RWD",
      fuelType: "Gasoline",
    },
    candidate: {
      year: 2016,
      make: "BMW",
      model: "M4",
      trim: "M4",
      bodyType: "Coupe",
      drivetrain: "RWD",
      fuelType: "Gasoline",
    },
    expected: "reject",
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
    name: "Bronco 4-Door Big Bend matches Bronco Big Bend target",
    target: {
      year: 2023,
      make: "Ford",
      model: "Bronco",
      trim: "Big Bend",
      bodyType: "SUV",
      drivetrain: "4WD",
      fuelType: "Gasoline",
      doors: 4,
    },
    candidate: {
      year: 2023,
      make: "Ford",
      model: "Bronco 4-Door",
      trim: "Big Bend",
      bodyType: "SUV",
      drivetrain: "4WD",
      fuelType: "Gasoline",
      doors: 4,
    },
    expected: "direct",
  },
  {
    name: "Bronco Big Bend does not treat Raptor as valuation-equivalent",
    target: {
      year: 2023,
      make: "Ford",
      model: "Bronco",
      trim: "Big Bend",
      bodyType: "SUV",
      drivetrain: "4WD",
      fuelType: "Gasoline",
      doors: 4,
    },
    candidate: {
      year: 2023,
      make: "Ford",
      model: "Bronco",
      trim: "Raptor",
      bodyType: "SUV",
      drivetrain: "4WD",
      fuelType: "Gasoline",
      doors: 4,
    },
    expected: "reject",
  },
  {
    name: "Bronco Big Bend vs Black Diamond is supporting evidence",
    target: {
      year: 2023,
      make: "Ford",
      model: "Bronco",
      trim: "Big Bend",
      bodyType: "SUV",
      drivetrain: "4WD",
      fuelType: "Gasoline",
      doors: 4,
    },
    candidate: {
      year: 2023,
      make: "Ford",
      model: "Bronco 4-Door",
      trim: "Black Diamond",
      bodyType: "SUV",
      drivetrain: "4WD",
      fuelType: "Gasoline",
      doors: 4,
    },
    expected: "supporting",
  },
  {
    name: "Bronco 4-Door Big Bend vs 2-Door Big Bend is supporting evidence",
    target: {
      year: 2023,
      make: "Ford",
      model: "Bronco",
      trim: "Big Bend",
      bodyType: "SUV",
      drivetrain: "4WD",
      fuelType: "Gasoline",
      doors: 4,
    },
    candidate: {
      year: 2023,
      make: "Ford",
      model: "Bronco 2-Door",
      trim: "Big Bend",
      bodyType: "SUV",
      drivetrain: "4WD",
      fuelType: "Gasoline",
      doors: 2,
    },
    expected: "supporting",
  },
  {
    name: "Bronco Sport remains a different model family",
    target: {
      year: 2023,
      make: "Ford",
      model: "Bronco",
      trim: "Big Bend",
      bodyType: "SUV",
      drivetrain: "4WD",
      fuelType: "Gasoline",
    },
    candidate: {
      year: 2023,
      make: "Ford",
      model: "Bronco Sport",
      trim: "Big Bend",
      bodyType: "SUV",
      drivetrain: "AWD",
      fuelType: "Gasoline",
    },
    expected: "reject",
  },
  {
    name: "Bronco decoder trim option list stays unresolved",
    target: {
      year: 2023,
      make: "Ford",
      model: "Bronco",
      trim: "Base, Big Bend, Black Diamond, Outer Banks",
      bodyType: "SUV",
      drivetrain: "4WD",
      fuelType: "Gasoline",
    },
    candidate: {
      year: 2023,
      make: "Ford",
      model: "Bronco 4-Door",
      trim: "Big Bend",
      bodyType: "SUV",
      drivetrain: "4WD",
      fuelType: "Gasoline",
    },
    expected: "supporting",
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
    name: "4Runner Base Grade versus Base is same trim",
    target: { ...base, year: 2015, make: "Toyota", model: "4Runner", trim: "Base Grade" },
    candidate: { ...base, year: 2015, make: "Toyota", model: "4Runner", trim: "Base" },
    expected: "direct",
  },
  {
    name: "4Runner Base Grade versus SR5 Premium is different trim",
    target: { ...base, year: 2015, make: "Toyota", model: "4Runner", trim: "Base Grade" },
    candidate: { ...base, year: 2015, make: "Toyota", model: "4Runner", trim: "SR5 Premium" },
    expected: "near",
  },
  {
    name: "4Runner Base Grade versus Limited is different trim",
    target: { ...base, year: 2015, make: "Toyota", model: "4Runner", trim: "Base Grade" },
    candidate: { ...base, year: 2015, make: "Toyota", model: "4Runner", trim: "Limited" },
    expected: "near",
  },
  {
    name: "4Runner Base Grade versus unknown trim stays supporting",
    target: { ...base, year: 2015, make: "Toyota", model: "4Runner", trim: "Base Grade" },
    candidate: { ...base, year: 2015, make: "Toyota", model: "4Runner", trim: "" },
    expected: "supporting",
  },
  {
    name: "4Runner Base Grade versus TRD Pro cannot establish equal value",
    target: { ...base, year: 2015, make: "Toyota", model: "4Runner", trim: "Base Grade" },
    candidate: { ...base, year: 2015, make: "Toyota", model: "4Runner", trim: "TRD Pro" },
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
    name: "Silverado Trail Boss 1500 and provider Silverado 1500 resolve into light-duty model family",
    vehicle: { year: 2020, make: "Chevrolet", model: "Silverado Trail Boss", trim: "Custom", bodyType: "Pickup", drivetrain: "4WD", fuelType: "Gasoline" },
    expected: { modelFamily: "silverado 1500" },
  },
  {
    name: "Silverado 3500 remains separate from Silverado 1500",
    vehicle: { year: 2020, make: "Chevrolet", model: "Silverado 3500HD", trim: "LT", bodyType: "Pickup", fuelType: "Diesel" },
    expected: { modelFamily: "silverado 3500" },
  },
  {
    name: "Silverado EV remains a separate electric model family",
    vehicle: { year: 2025, make: "Chevrolet", model: "Silverado EV", trim: "WT", bodyType: "Pickup", fuelType: "Electric" },
    expected: { modelFamily: "silverado ev" },
  },
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
    name: "Ford Bronco 4-Door normalizes to Bronco family",
    vehicle: {
      year: 2023,
      make: "Ford",
      model: "Bronco 4-Door",
      trim: "Big Bend",
      bodyType: "SUV",
      drivetrain: "4WD",
      fuelType: "Gasoline",
    },
    expected: {
      modelFamily: "bronco",
      variant: "big bend",
      bodyClass: "suv",
    },
  },
  {
    name: "Ford Bronco Sport remains a separate family",
    vehicle: {
      year: 2023,
      make: "Ford",
      model: "Bronco Sport",
      trim: "Big Bend",
      bodyType: "SUV",
      drivetrain: "AWD",
      fuelType: "Gasoline",
    },
    expected: {
      modelFamily: "bronco sport",
    },
  },
  {
    name: "Ford Bronco decoder option list does not become a fake compound trim",
    vehicle: {
      year: 2023,
      make: "Ford",
      model: "Bronco",
      trim: "Base, Big Bend, Black Diamond, Outer Banks",
      bodyType: "SUV",
      drivetrain: "4WD",
      fuelType: "Gasoline",
    },
    expected: {
      modelFamily: "bronco",
      variant: "",
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

  for (const [name, make, model, trim, expected] of [
    ["VIN decoder M5 5-Series", "BMW", "M5 5-Series", "", "M5"],
    ["BMW Series model with M5 trim", "BMW", "5 Series", "M5", "M5"],
    ["Ordinary 540i", "BMW", "540i", "", null],
    ["M550i is not M5", "BMW", "M550i", "", null],
    ["M Sport package is not M model", "BMW", "5 Series", "M Sport", null],
    ["BMW M3 canonical model", "BMW", "M3 3-Series", "", "M3"],
  ] as Array<[string,string,string,string,string|null]>) {
    const actual = dedicatedBmwMModel(make, model, trim);
    if (actual !== expected) failures.push(`${name}: expected ${expected}, got ${actual}`);
  }

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
