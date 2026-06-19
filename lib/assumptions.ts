import type { Assumptions } from "@/types/assumptions";

export const defaultAssumptions: Assumptions = {
  bidSettings: {
    safeBidDiscount: 0.075,
    stretchBidPremium: 0.05,
    minimumTargetProfit: 3000,
    highRiskProfitAdd: 1500,
    mediumRiskThreshold: 8,
    highRiskThreshold: 18,
    avoidRiskThreshold: 30,
  },

  costDefaults: [
    {
      vehicleType: "Mainstream Car",
      auctionFee: 700,
      transport: 500,
      recon: 1200,
      detailAdmin: 350,
      riskReserve: 750,
      targetProfit: 2500,
    },
    {
      vehicleType: "Luxury / German",
      auctionFee: 900,
      transport: 650,
      recon: 2500,
      detailAdmin: 500,
      riskReserve: 1500,
      targetProfit: 4000,
    },
    {
      vehicleType: "Truck / SUV",
      auctionFee: 800,
      transport: 700,
      recon: 1500,
      detailAdmin: 400,
      riskReserve: 1000,
      targetProfit: 3500,
    },
    {
      vehicleType: "Performance / Enthusiast",
      auctionFee: 1000,
      transport: 800,
      recon: 2000,
      detailAdmin: 600,
      riskReserve: 1500,
      targetProfit: 5000,
    },
  ],

  conditionRules: [
    {
      category: "Wear Items",
      name: "Needs Tires",
      riskPoints: 15,
      reserveAdd: 800,
      avoidFlag: false,
    },
    {
      category: "Wear Items",
      name: "Needs Brakes",
      riskPoints: 15,
      reserveAdd: 700,
      avoidFlag: false,
    },
    {
      category: "Mechanical",
      name: "Warning Light",
      riskPoints: 25,
      reserveAdd: 900,
      avoidFlag: false,
    },
    {
      category: "Mechanical",
      name: "Mechanical Concern",
      riskPoints: 35,
      reserveAdd: 1500,
      avoidFlag: true,
    },
    {
      category: "History / Disclosure",
      name: "Accident History",
      riskPoints: 40,
      reserveAdd: 1500,
      avoidFlag: false,
    },
    {
      category: "History / Disclosure",
      name: "Poor Disclosure",
      riskPoints: 25,
      reserveAdd: 1000,
      avoidFlag: false,
    },
    {
      category: "History / Disclosure",
      name: "Structural Announcement",
      riskPoints: 50,
      reserveAdd: 3000,
      avoidFlag: true,
    },
  ],

  auctionFeeRules: [
    {
      auctionSite: "ACV",
      minBid: 0,
      maxBid: 9999,
      fee: 550,
    },
    {
      auctionSite: "ACV",
      minBid: 10000,
      maxBid: 24999,
      fee: 750,
    },
    {
      auctionSite: "ACV",
      minBid: 25000,
      maxBid: 49999,
      fee: 950,
    },
    {
      auctionSite: "Manheim",
      minBid: 0,
      maxBid: 9999,
      fee: 600,
    },
    {
      auctionSite: "Manheim",
      minBid: 10000,
      maxBid: 24999,
      fee: 800,
    },
    {
      auctionSite: "Private Party",
      minBid: 0,
      maxBid: 9999999,
      fee: 0,
    },
  ],

  compSettings: {
    mileageAdjustmentPerThousand: 125,
    fastSaleDiscount: 0.03,
    minimumQualityScore: 55,
    minimumCompsForMediumConfidence: 4,
    minimumCompsForHighConfidence: 8,
    maxSpreadForHighConfidence: 0.15,
    sourceDiscounts: [
      {
        source: "MarketCheck/API",
        askDiscount: 0.05,
      },
      {
        source: "CarMax",
        askDiscount: 0.02,
      },
      {
        source: "Facebook",
        askDiscount: 0.08,
      },
      {
        source: "Private Party",
        askDiscount: 0.07,
      },
      {
        source: "Manual",
        askDiscount: 0.05,
      },
    ],
  },

  regionalMarkets: [
    {
      market: "Charleston",
      zip: "29412",
      enabled: true,
    },
    {
      market: "Columbia",
      zip: "29201",
      enabled: true,
    },
    {
      market: "Charlotte",
      zip: "28202",
      enabled: true,
    },
    {
      market: "Raleigh",
      zip: "27601",
      enabled: false,
    },
    {
      market: "Atlanta",
      zip: "30303",
      enabled: true,
    },
    {
      market: "Savannah",
      zip: "31401",
      enabled: true,
    },
    {
      market: "Jacksonville",
      zip: "32202",
      enabled: false,
    },
  ],
};
