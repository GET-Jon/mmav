import type { MindfulIntelligenceEntry } from "./types";

const documentName = "Mindful Motor Co. Vehicle Data for Lot Logic";

export const mindfulIntelligenceEntries: MindfulIntelligenceEntry[] = [
  {
    id: "bmw-e46-m3",
    title: "BMW E46 M3",
    status: "draft",
    scope: "generation",

    identity: {
      makes: ["BMW"],
      models: ["M3"],
      yearStart: 2001,
      yearEnd: 2006,
      generations: ["E46 M3"],
      chassisCodes: ["E46"],
      engines: ["S54"],
      bodyStyles: ["coupe", "convertible"],
    },

    verdict: "strong_fit",
    confidence: "high",

    opportunityTypes: [
      "enthusiast_buy",
      "curated_driver",
      "tasteful_build",
    ],

    rationale:
      "A landmark analog BMW M car with strong enthusiast recognition, a clear buyer story, and strong alignment with Mindful Motor Co. when condition, originality, and documentation support the acquisition.",

    strengths: [
      "Strong enthusiast recognition and broad buyer awareness.",
      "Analog driving experience with a compelling retail story.",
      "Desirable colors, manual transmission, and documented maintenance can create meaningful value.",
      "Tasteful and reversible modifications can support a curated-driver or build thesis.",
    ],

    limitations: [
      "Mechanical and chassis exposure can be substantial when the major known issues are undocumented.",
      "Poor modifications, track abuse, accident history, or incomplete records materially reduce confidence.",
      "SMG examples generally require more pricing discipline than comparable manual cars.",
    ],

    desirableSpecs: [
      "Six-speed manual transmission.",
      "Desirable factory colors.",
      "Documented rod-bearing, VANOS, and rear-subframe work.",
      "Stock or lightly modified condition with factory parts retained.",
      "Complete specialist maintenance records.",
    ],

    avoidSpecs: [
      "Unknown tuning or low-quality modifications.",
      "Unverified track use or stripped interiors.",
      "Poorly repaired rear-subframe damage.",
      "Mystery accident history or mismatched paintwork.",
    ],

    knownIssues: [
      "Rod-bearing wear and preventive-service history.",
      "VANOS wear or failure.",
      "Rear axle carrier panel and rear-subframe cracking.",
      "Cooling-system aging.",
      "Suspension and bushing wear.",
      "Age-related interior and electronic faults.",
    ],

    verificationItems: [
      "Verify rod-bearing service history.",
      "Inspect VANOS operation and fault history.",
      "Inspect the rear axle carrier panel on a lift.",
      "Confirm cooling-system service and absence of overheating history.",
      "Verify title, accident history, paintwork, and structural repairs.",
      "Test transmission operation hot and cold.",
      "Review maintenance records and modification documentation.",
    ],

    buyerProfile:
      "BMW M enthusiasts seeking an analog performance car with strong community recognition and usable collector appeal.",

    mileageNotes:
      "Mileage matters less than condition, maintenance depth, originality, and documented completion of the major known service items.",

    modificationNotes:
      "Tasteful, documented, reversible modifications may support the thesis. Cheap suspension, unknown tunes, missing factory parts, or evidence of abuse should reduce confidence.",

    exitNotes:
      "Best positioned as a documented enthusiast car or curated driver rather than a generic used BMW.",

    source: {
      documentName,
      sectionTitle: "2003 BMW M3 ACV auction",
      sourceVersion: "2026-07-02",
    },
  },

  {
    id: "cadillac-xlr",
    title: "Cadillac XLR",
    status: "draft",
    scope: "model",

    identity: {
      makes: ["Cadillac"],
      models: ["XLR"],
      yearStart: 2004,
      yearEnd: 2009,
      bodyStyles: ["roadster", "convertible"],
      keywords: ["retractable hardtop"],
    },

    verdict: "good_fit",
    confidence: "medium",

    opportunityTypes: [
      "specialty_collector",
      "curated_driver",
    ],

    rationale:
      "An unusual, design-forward, Corvette-adjacent luxury roadster with a credible forgotten-luxury story and good Mindful fit when specialty systems are fully functional.",

    strengths: [
      "Distinctive styling and strong curb appeal.",
      "Low production volume creates a specialty-retail story.",
      "Corvette-adjacent chassis and positioning are understandable to buyers.",
      "Moderate-mileage examples can occupy a usable enthusiast sweet spot.",
    ],

    limitations: [
      "Buyer depth is narrower than for comparable Corvette models.",
      "Specialty electronic and roof-system failures can overwhelm margin.",
      "Parts availability and model-specific repair knowledge may limit operational confidence.",
    ],

    desirableSpecs: [
      "Fully functioning retractable hardtop.",
      "Clean history and strong cosmetic condition.",
      "Documented maintenance.",
      "Moderate mileage with no unresolved warnings.",
    ],

    avoidSpecs: [
      "Inoperative or intermittent hardtop.",
      "Unresolved electronic faults.",
      "Magnetic-ride suspension faults.",
      "Poorly documented Northstar cooling or engine history.",
    ],

    knownIssues: [
      "Retractable-hardtop hydraulic and electronic systems.",
      "Electronic modules and age-related electrical faults.",
      "Magnetic Ride Control repair exposure.",
      "Northstar V8 cooling and sealing concerns.",
      "Specialty-parts availability.",
    ],

    verificationItems: [
      "Cycle the retractable hardtop repeatedly.",
      "Scan all modules for active and stored faults.",
      "Confirm suspension operation and warning-light status.",
      "Inspect for coolant leaks and overheating history.",
      "Verify parts availability for any identified defects.",
      "Confirm clean history and quality paintwork.",
    ],

    buyerProfile:
      "Buyers seeking an unusual American luxury roadster with rarity, design appeal, and a Corvette connection.",

    exitNotes:
      "Position around rarity, design, and usable luxury-roadster character rather than outright performance.",

    source: {
      documentName,
      sectionTitle: "2004 Cadillac XLR",
      sourceVersion: "2026-07-02",
    },
  },

  {
    id: "mercedes-w463-g550",
    title: "Mercedes-Benz W463 G 550",
    status: "draft",
    scope: "generation",

    identity: {
      makes: ["Mercedes-Benz", "Mercedes"],
      models: ["G 550", "G550", "G-Class"],
      yearStart: 2016,
      yearEnd: 2018,
      generations: ["W463"],
      chassisCodes: ["W463"],
      engines: ["M176", "4.0L twin-turbo V8"],
      drivetrains: ["AWD", "4WD"],
      bodyStyles: ["SUV"],
    },

    verdict: "good_fit",
    confidence: "high",

    opportunityTypes: [
      "specialty_collector",
      "utility_terrain",
      "modern_luxury_value",
    ],

    rationale:
      "An iconic specialty SUV with immediate buyer recognition, a strong design story, and durable brand appeal, but with high capital exposure and meaningful mechanical, corrosion, and electronics risk.",

    strengths: [
      "Iconic shape and strong buyer recognition.",
      "Distinctive old-school luxury-truck character.",
      "Triple-locker capability creates a real utility and enthusiast story.",
      "Strong powertrain and premium positioning.",
    ],

    limitations: [
      "High acquisition cost increases downside exposure.",
      "Rust, prior body repair, and deferred maintenance can be exceptionally expensive.",
      "Heavy vehicle consumables and specialized repairs can compress margin.",
    ],

    desirableSpecs: [
      "Rust-free body and undercarriage.",
      "Documented transmission, transfer-case, and differential service.",
      "Fully functioning differential locks.",
      "Clean history and high-quality original paintwork.",
      "Matching premium tires and recent brake service.",
    ],

    avoidSpecs: [
      "Corrosion around doors, windshield frame, roof gutters, or underbody.",
      "Unresolved warning lights or drivetrain faults.",
      "Vague accident history.",
      "Misaligned doors or evidence of poor body repair.",
      "Inoperative differential locks.",
    ],

    knownIssues: [
      "Rust and corrosion.",
      "Suspension, steering, and driveline wear.",
      "Cooling-system and turbo-related repair exposure.",
      "Engine mounts.",
      "Interior electronics and COMAND faults.",
      "Door, hinge, latch, and seal wear.",
    ],

    verificationItems: [
      "Inspect all common corrosion areas.",
      "Test center, rear, and front differential locks.",
      "Test all doors, locks, windows, seals, and rear cargo door.",
      "Review transmission, transfer-case, and differential service records.",
      "Scan all modules and test every major electronic feature.",
      "Inspect suspension, steering, tires, brakes, and driveline vibration.",
      "Verify recall completion by VIN.",
    ],

    buyerProfile:
      "Luxury and enthusiast buyers seeking the recognizable old-body G-Wagen experience rather than the refinement of the newer redesign.",

    exitNotes:
      "Best positioned around iconic design, old-school character, and verified condition. A cheap G-Class with mystery history is not a value proposition.",

    source: {
      documentName,
      sectionTitle: "2017 Mercedes-Benz G-Class G 550",
      sourceVersion: "2026-07-02",
    },
  },

  {
    id: "bmw-f15-x5-40e",
    title: "BMW F15 X5 xDrive40e",
    status: "draft",
    scope: "powertrain",

    identity: {
      makes: ["BMW"],
      models: ["X5", "X5 xDrive40e", "xDrive40e"],
      yearStart: 2016,
      yearEnd: 2018,
      generations: ["F15"],
      chassisCodes: ["F15"],
      engines: ["N20"],
      fuelTypes: ["plug-in hybrid", "PHEV", "hybrid"],
      keywords: ["40e", "xdrive40e"],
    },

    verdict: "high_risk",
    confidence: "high",

    opportunityTypes: [
      "high_risk_opportunity",
      "pass",
    ],

    rationale:
      "The early N20-based plug-in-hybrid configuration combines known N20 engine exposure with aging high-voltage components and integrated drivetrain complexity that can exceed the vehicle's residual value.",

    strengths: [
      "Premium BMW SUV presentation.",
      "Potentially attractive acquisition pricing due to depreciation.",
      "Useful short-range plug-in-hybrid functionality when fully healthy.",
    ],

    limitations: [
      "High-voltage battery and integrated drivetrain repairs can be economically disproportionate.",
      "N20 timing-chain exposure remains material.",
      "Battery degradation and drivetrain warnings can make resale difficult.",
      "Specialized diagnosis reduces operational flexibility.",
    ],

    desirableSpecs: [
      "Documented high-voltage battery health.",
      "Complete BMW service history.",
      "Documented timing-chain or updated-component history.",
      "No drivetrain-malfunction history.",
      "Remaining applicable battery or emissions coverage.",
    ],

    avoidSpecs: [
      "Low electric range without documented diagnosis.",
      "Drivetrain malfunction warnings.",
      "Unknown timing-chain history.",
      "Unresolved charging faults.",
      "Battery or transmission faults.",
    ],

    knownIssues: [
      "N20 timing-chain guide failure.",
      "High-voltage battery degradation.",
      "Integrated electric-motor and transmission faults.",
      "Turbocharger and oil-line leaks.",
      "Carbon buildup.",
      "Complex battery-cooling and charging systems.",
    ],

    verificationItems: [
      "Perform a complete BMW diagnostic scan.",
      "Measure usable electric range and battery health.",
      "Verify charging operation.",
      "Review timing-chain and engine service history.",
      "Confirm absence of drivetrain-malfunction history.",
      "Price potential high-voltage repairs before bidding.",
    ],

    buyerProfile:
      "A narrow value-oriented luxury-SUV buyer willing to accept early-PHEV complexity.",

    exitNotes:
      "Treat as highly selective or pass inventory unless the car has exceptional documentation, verified battery health, and unusually strong margin.",

    source: {
      documentName,
      sectionTitle: "2018 BMW X5 40e Hybrid",
      sourceVersion: "2026-07-02",
    },
  },

  {
    id: "mini-r56-generation",
    title: "Mini Generation 2 R55/R56/R57/R60",
    status: "draft",
    scope: "generation",

    identity: {
      makes: ["Mini", "Mini Cooper"],
      models: ["Cooper", "Cooper S", "John Cooper Works", "JCW"],
      yearStart: 2007,
      yearEnd: 2013,
      generations: ["Generation 2"],
      chassisCodes: ["R55", "R56", "R57", "R60"],
      engines: ["N12", "N14", "N16", "N18"],
    },

    verdict: "high_risk",
    confidence: "high",

    opportunityTypes: [
      "high_risk_opportunity",
      "enthusiast_buy",
    ],

    rationale:
      "The second-generation Mini has strong style and enthusiast appeal, but the Prince-engine family creates significant timing-chain, oil-consumption, fuel-system, carbon, and cooling-system risk.",

    strengths: [
      "Distinctive styling and recognizable enthusiast character.",
      "Cooper S and JCW trims have clear buyer appeal.",
      "N18 cars are preferable to earlier N14 examples.",
      "Strong personalization and community support.",
    ],

    limitations: [
      "Maintenance neglect can quickly lead to engine failure.",
      "The N14 is especially problematic.",
      "Packaging increases labor cost and repair complexity.",
      "Cheap examples commonly carry deferred maintenance.",
    ],

    desirableSpecs: [
      "2011–2013 N18 Cooper S with strong records.",
      "Documented timing-chain, cooling-system, and oil-service history.",
      "Clean, lightly modified JCW examples.",
    ],

    avoidSpecs: [
      "N14 cars with unknown timing-chain history.",
      "Persistent oil consumption.",
      "Cold-start timing-chain rattle.",
      "Unresolved HPFP or overheating symptoms.",
      "Poorly modified cars.",
    ],

    knownIssues: [
      "Timing-chain slack and tensioner failure.",
      "Excessive oil consumption.",
      "High-pressure fuel-pump failure.",
      "Direct-injection carbon buildup.",
      "Thermostat-housing and water-pump failures.",
    ],

    verificationItems: [
      "Cold-start the engine and listen for chain rattle.",
      "Confirm oil-consumption history.",
      "Scan for fuel-pressure, timing, and mixture faults.",
      "Inspect cooling-system components and leak history.",
      "Verify carbon-cleaning history where applicable.",
      "Confirm exact engine code.",
    ],

    buyerProfile:
      "Style-conscious enthusiast buyers who prioritize handling and character over low operating costs.",

    exitNotes:
      "Only strong-history examples should be treated as viable inventory. Price the generation as a maintenance-sensitive enthusiast car, not a simple economy hatchback.",

    source: {
      documentName,
      sectionTitle: "2013 Mini Cooper — Generation 2",
      sourceVersion: "2026-07-02",
    },
  },

  {
    id: "mini-f5x-generation",
    title: "Mini Generation 3 F54/F55/F56/F60",
    status: "draft",
    scope: "generation",

    identity: {
      makes: ["Mini", "Mini Cooper"],
      models: [
        "Cooper",
        "Cooper S",
        "John Cooper Works",
        "JCW",
        "Clubman",
        "Countryman",
      ],
      yearStart: 2014,
      yearEnd: 2026,
      generations: ["Generation 3"],
      chassisCodes: ["F54", "F55", "F56", "F60"],
      engines: ["B38", "B48"],
    },

    verdict: "good_fit",
    confidence: "high",

    opportunityTypes: [
      "easy_flip",
      "enthusiast_buy",
      "curated_driver",
    ],

    rationale:
      "The third-generation Mini combines the brand's recognizable style and handling with substantially more robust BMW B-series powertrains, making it the preferred modern Mini generation.",

    strengths: [
      "More reliable B38 and B48 engine architecture.",
      "Strong styling and buyer recognition.",
      "Cooper S and JCW variants offer a clear enthusiast ladder.",
      "Multiple body styles serve different buyer needs.",
    ],

    limitations: [
      "Engine mounts and suspension bushings remain common wear items.",
      "Some electronic and shifter-mechanism faults can affect presentation.",
      "JCW examples may show signs of hard use or aggressive modification.",
    ],

    desirableSpecs: [
      "2014+ B-series powertrain.",
      "Cooper S or JCW with clean maintenance history.",
      "Tasteful factory options.",
      "Documented engine-mount and suspension maintenance.",
    ],

    avoidSpecs: [
      "Unresolved shifter warnings.",
      "Leaking engine mounts.",
      "Poorly modified or heavily abused JCW examples.",
      "Persistent front-suspension clunks.",
    ],

    knownIssues: [
      "Upper engine-mount failure.",
      "Shifter-mechanism microswitch faults.",
      "Front control-arm bushing wear.",
    ],

    verificationItems: [
      "Confirm exact engine and chassis code.",
      "Inspect the upper engine mount.",
      "Check for shifter and parking-warning messages.",
      "Inspect front control-arm bushings.",
      "Review modification and service history.",
    ],

    buyerProfile:
      "Style-oriented daily-driver buyers, entry-level enthusiasts, and performance buyers seeking Cooper S or JCW variants.",

    exitNotes:
      "This is the preferred modern Mini generation and can support either a value/velocity or enthusiast-retail thesis depending on trim.",

    source: {
      documentName,
      sectionTitle: "2013 Mini Cooper — Generation 3",
      sourceVersion: "2026-07-02",
    },
  },

  {
    id: "maserati-modern-lineup",
    title: "Modern Maserati Inventory Guidance",
    status: "draft",
    scope: "brand",

    identity: {
      makes: ["Maserati"],
      models: [
        "Ghibli",
        "Quattroporte",
        "Levante",
        "GranTurismo",
      ],
      yearStart: 2014,
      yearEnd: 2026,
    },

    verdict: "high_risk",
    confidence: "medium",

    opportunityTypes: [
      "high_risk_opportunity",
      "specialty_collector",
      "pass",
    ],

    rationale:
      "Modern Maserati inventory carries severe depreciation, inconsistent cabin quality, expensive repair exposure, and a narrow buyer pool. Only specific powertrains and exceptionally documented examples justify consideration.",

    strengths: [
      "Distinctive styling and brand recognition.",
      "Ferrari-derived engines create emotional appeal.",
      "Older naturally aspirated GranTurismo V8 cars have a clearer enthusiast story.",
      "Strong acquisition discounts may occasionally create opportunity.",
    ],

    limitations: [
      "Extremely steep depreciation.",
      "Narrow buyer depth and financing sensitivity.",
      "High repair and ownership costs.",
      "Weak demand for four-cylinder and electric variants.",
      "Early interiors and infotainment can undermine premium positioning.",
    ],

    desirableSpecs: [
      "Naturally aspirated 4.7L V8 GranTurismo.",
      "Well-documented 3.0L twin-turbo V6 S models.",
      "Complete dealer or specialist service history.",
      "Strong cosmetic condition and desirable specification.",
    ],

    avoidSpecs: [
      "Four-cylinder mild-hybrid models.",
      "Folgore electric models as inventory.",
      "2017–2019 Levante examples with unresolved infotainment or trim issues.",
      "V8 Trofeo models without exceptional margin.",
      "Poor-history Ghibli or Quattroporte examples.",
    ],

    knownIssues: [
      "Rapid depreciation.",
      "Suspension and electronic faults.",
      "Infotainment glitches.",
      "High parts and labor costs.",
      "Cabin-material and trim-quality concerns.",
    ],

    verificationItems: [
      "Confirm exact engine and trim.",
      "Review full dealer or specialist service history.",
      "Test every electronic and infotainment function.",
      "Inspect suspension, tires, brakes, and warning-light history.",
      "Compare acquisition price against realistic near-term depreciation.",
      "Confirm sufficient buyer depth before stocking.",
    ],

    buyerProfile:
      "Emotion-driven luxury buyers who value styling and engine character and accept higher ownership risk.",

    exitNotes:
      "Treat most modern Maseratis as highly selective or pass inventory. Favor the strongest engine stories and require exceptional purchase discipline.",

    source: {
      documentName,
      sectionTitle: "2019 Maserati Levante and Maserati lineup guidance",
      sourceVersion: "2026-07-02",
    },
  },
];
