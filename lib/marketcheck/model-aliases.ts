import { normalizeText } from "./model-taxonomy";

export type MarketCheckModelAlias = {
  make: string;
  models: string[];
  fallbackModel: string;
  notes: string;
};

export const marketCheckModelAliases: MarketCheckModelAlias[] = [
  // BMW standard series aliases
  {
    make: "BMW",
    models: ["228i", "230i", "m235i", "m240i"],
    fallbackModel: "2 Series",
    notes: "BMW 2 Series standard model-code fallback.",
  },
  {
    make: "BMW",
    models: ["320i", "328i", "330i", "335i", "340i", "m340i"],
    fallbackModel: "3 Series",
    notes: "BMW 3 Series standard model-code fallback.",
  },
  {
    make: "BMW",
    models: ["428i", "430i", "435i", "440i", "m440i"],
    fallbackModel: "4 Series",
    notes: "BMW 4 Series standard model-code fallback.",
  },
  {
    make: "BMW",
    models: ["528i", "530i", "535i", "540i", "550i", "m550i"],
    fallbackModel: "5 Series",
    notes: "BMW 5 Series standard model-code fallback.",
  },
  {
    make: "BMW",
    models: ["740i", "745e", "750i", "760i", "m760i"],
    fallbackModel: "7 Series",
    notes: "BMW 7 Series standard model-code fallback.",
  },

  // Mercedes-Benz standard class aliases
  {
    make: "Mercedes-Benz",
    models: ["c250", "c300", "c350", "c400", "c450"],
    fallbackModel: "C-Class",
    notes: "Mercedes-Benz C-Class standard model-code fallback.",
  },
  {
    make: "Mercedes-Benz",
    models: ["e300", "e350", "e400", "e450", "e550"],
    fallbackModel: "E-Class",
    notes: "Mercedes-Benz E-Class standard model-code fallback.",
  },
  {
    make: "Mercedes-Benz",
    models: ["s450", "s500", "s550", "s560", "s580"],
    fallbackModel: "S-Class",
    notes: "Mercedes-Benz S-Class standard model-code fallback.",
  },
  {
    make: "Mercedes-Benz",
    models: ["glc300", "glc350"],
    fallbackModel: "GLC",
    notes: "Mercedes-Benz GLC standard model-code fallback.",
  },
  {
    make: "Mercedes-Benz",
    models: ["gle350", "gle400", "gle450", "gle580"],
    fallbackModel: "GLE",
    notes: "Mercedes-Benz GLE standard model-code fallback.",
  },
  {
    make: "Mercedes-Benz",
    models: ["gls450", "gls550", "gls580"],
    fallbackModel: "GLS",
    notes: "Mercedes-Benz GLS standard model-code fallback.",
  },

  // Audi standard aliases
  {
    make: "Audi",
    models: ["a3 2.0t", "a3 quattro"],
    fallbackModel: "A3",
    notes: "Audi A3 trim-string fallback.",
  },
  {
    make: "Audi",
    models: ["a4 2.0t", "a4 quattro"],
    fallbackModel: "A4",
    notes: "Audi A4 trim-string fallback.",
  },
  {
    make: "Audi",
    models: ["a5 2.0t", "a5 quattro"],
    fallbackModel: "A5",
    notes: "Audi A5 trim-string fallback.",
  },
  {
    make: "Audi",
    models: ["a6 2.0t", "a6 3.0t", "a6 quattro"],
    fallbackModel: "A6",
    notes: "Audi A6 trim-string fallback.",
  },
  {
    make: "Audi",
    models: ["q5 2.0t", "q5 3.0t", "q5 quattro"],
    fallbackModel: "Q5",
    notes: "Audi Q5 trim-string fallback.",
  },

  // Porsche
  {
    make: "Porsche",
    models: ["911 carrera", "911 carrera s", "911 carrera 4", "911 carrera 4s"],
    fallbackModel: "911",
    notes: "Porsche 911 Carrera variant fallback.",
  },
  {
    make: "Porsche",
    models: ["718 cayman", "cayman s", "cayman gts"],
    fallbackModel: "Cayman",
    notes: "Porsche Cayman variant fallback.",
  },
  {
    make: "Porsche",
    models: ["718 boxster", "boxster s", "boxster gts"],
    fallbackModel: "Boxster",
    notes: "Porsche Boxster variant fallback.",
  },

  // Honda
  {
    make: "Honda",
    models: ["civic sport", "civic ex", "civic lx", "civic touring"],
    fallbackModel: "Civic",
    notes: "Honda Civic trim fallback.",
  },
  {
    make: "Honda",
    models: ["accord sport", "accord ex", "accord lx", "accord touring"],
    fallbackModel: "Accord",
    notes: "Honda Accord trim fallback.",
  },

  // Toyota
  {
    make: "Toyota",
    models: ["corolla le", "corolla se", "corolla xse", "corolla hybrid"],
    fallbackModel: "Corolla",
    notes: "Toyota Corolla trim fallback.",
  },
  {
    make: "Toyota",
    models: ["camry le", "camry se", "camry xle", "camry xse", "camry hybrid"],
    fallbackModel: "Camry",
    notes: "Toyota Camry trim fallback.",
  },
  {
    make: "Toyota",
    models: ["4runner sr5", "4runner trd off road", "4runner trd pro", "4runner limited"],
    fallbackModel: "4Runner",
    notes: "Toyota 4Runner trim fallback.",
  },

  // Lexus
  {
    make: "Lexus",
    models: ["is250", "is300", "is350"],
    fallbackModel: "IS",
    notes: "Lexus IS model-code fallback.",
  },
  {
    make: "Lexus",
    models: ["es300h", "es350"],
    fallbackModel: "ES",
    notes: "Lexus ES model-code fallback.",
  },
  {
    make: "Lexus",
    models: ["gx460", "gx470", "gx550"],
    fallbackModel: "GX",
    notes: "Lexus GX model-code fallback.",
  },
  {
    make: "Lexus",
    models: ["rx350", "rx450h", "rx500h"],
    fallbackModel: "RX",
    notes: "Lexus RX model-code fallback.",
  },

  // Jeep / Land Rover / Volvo / Alfa
  {
    make: "Jeep",
    models: ["wrangler sport", "wrangler sahara", "wrangler rubicon"],
    fallbackModel: "Wrangler",
    notes: "Jeep Wrangler trim fallback.",
  },
  {
    make: "Land Rover",
    models: ["range rover sport hse", "range rover sport supercharged", "range rover sport autobiography"],
    fallbackModel: "Range Rover Sport",
    notes: "Range Rover Sport variant fallback.",
  },
  {
    make: "Land Rover",
    models: ["range rover hse", "range rover supercharged", "range rover autobiography"],
    fallbackModel: "Range Rover",
    notes: "Range Rover variant fallback.",
  },
  {
    make: "Volvo",
    models: ["xc60 t5", "xc60 t6", "xc60 b5", "xc60 b6"],
    fallbackModel: "XC60",
    notes: "Volvo XC60 powertrain-string fallback.",
  },
  {
    make: "Volvo",
    models: ["xc90 t5", "xc90 t6", "xc90 b5", "xc90 b6"],
    fallbackModel: "XC90",
    notes: "Volvo XC90 powertrain-string fallback.",
  },
  {
    make: "Alfa Romeo",
    models: ["giulia ti", "giulia veloce", "giulia sprint"],
    fallbackModel: "Giulia",
    notes: "Alfa Romeo Giulia trim fallback.",
  },
  {
    make: "Alfa Romeo",
    models: ["stelvio ti", "stelvio veloce", "stelvio sprint"],
    fallbackModel: "Stelvio",
    notes: "Alfa Romeo Stelvio trim fallback.",
  },
];

export function findMarketCheckModelAliases({
  make,
  model,
}: {
  make: string;
  model: string;
}) {
  const normalizedMake = normalizeText(make);
  const normalizedModel = normalizeText(model);

  return marketCheckModelAliases
    .filter((alias) => normalizeText(alias.make) === normalizedMake)
    .filter((alias) =>
      alias.models.some((candidate) => normalizeText(candidate) === normalizedModel)
    )
    .map((alias) => alias.fallbackModel)
    .filter((fallbackModel) => normalizeText(fallbackModel) !== normalizedModel);
}
