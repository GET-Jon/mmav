export type FindingApprovalPart = {
  description: string;
  quantity: number;
  partNumber: string | null;
  notes: string | null;
  aiEstimatedUnitPriceLow: number | null;
  aiEstimatedUnitPriceHigh: number | null;
  aiPriceBasis: string | null;
  partnerOfferUnitPrice: number | null;
};

export type FindingApprovalPartDisposition =
  | "purchase_required"
  | "in_stock"
  | "not_needed";

export type FindingApprovalCost = {
  laborPrice: number | null;
  /** New cash spend for parts that still need to be sourced. */
  partsLow: number;
  partsHigh: number;
  /** Informational value of parts already on hand; excluded from authorization. */
  inStockValueLow: number;
  inStockValueHigh: number;
  totalLow: number | null;
  totalHigh: number | null;
  hasRange: boolean;
  pricingComplete: boolean;
  unknownPartCount: number;
  purchaseRequiredCount: number;
  inStockCount: number;
  notNeededCount: number;
  usesAiPartEstimate: boolean;
  usesPartnerPartPrice: boolean;
};

function finiteNonNegative(value: unknown) {
  if (value === null || value === undefined || value === "") return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : null;
}

export function findingApprovalPartDisposition(
  part: Pick<FindingApprovalPart, "notes">,
): FindingApprovalPartDisposition {
  const notes = String(part.notes || "").trim().toUpperCase();
  if (notes.startsWith("IN STOCK ·") || notes === "IN STOCK") return "in_stock";
  if (notes.startsWith("NOT NEEDED ·") || notes === "NOT NEEDED") return "not_needed";
  return "purchase_required";
}

function partPriceRange(part: FindingApprovalPart) {
  const partnerPrice = finiteNonNegative(part.partnerOfferUnitPrice);
  if (partnerPrice !== null) {
    return {
      low: partnerPrice,
      high: partnerPrice,
      source: "partner" as const,
    };
  }

  let low = finiteNonNegative(part.aiEstimatedUnitPriceLow);
  let high = finiteNonNegative(part.aiEstimatedUnitPriceHigh);
  if (low !== null && high !== null && high < low) [low, high] = [high, low];
  if (low !== null || high !== null) {
    return {
      low: low ?? high ?? 0,
      high: high ?? low ?? 0,
      source: "ai" as const,
    };
  }

  return null;
}

export function summarizeFindingApprovalCost(
  laborPriceInput: number | null,
  parts: FindingApprovalPart[],
): FindingApprovalCost {
  const laborPrice = finiteNonNegative(laborPriceInput);
  let partsLow = 0;
  let partsHigh = 0;
  let inStockValueLow = 0;
  let inStockValueHigh = 0;
  let unknownPartCount = 0;
  let purchaseRequiredCount = 0;
  let inStockCount = 0;
  let notNeededCount = 0;
  let usesAiPartEstimate = false;
  let usesPartnerPartPrice = false;

  for (const part of parts) {
    const disposition = findingApprovalPartDisposition(part);
    if (disposition === "not_needed") {
      notNeededCount += 1;
      continue;
    }

    const quantity =
      Number.isFinite(Number(part.quantity)) && Number(part.quantity) > 0
        ? Number(part.quantity)
        : 1;
    const price = partPriceRange(part);

    if (disposition === "in_stock") {
      inStockCount += 1;
      if (price) {
        inStockValueLow += price.low * quantity;
        inStockValueHigh += price.high * quantity;
      }
      continue;
    }

    purchaseRequiredCount += 1;
    if (!price) {
      unknownPartCount += 1;
      continue;
    }

    partsLow += price.low * quantity;
    partsHigh += price.high * quantity;
    if (price.source === "partner") usesPartnerPartPrice = true;
    if (price.source === "ai") usesAiPartEstimate = true;
  }

  const pricingComplete = laborPrice !== null && unknownPartCount === 0;
  const totalLow = pricingComplete ? laborPrice + partsLow : null;
  const totalHigh = pricingComplete ? laborPrice + partsHigh : null;

  return {
    laborPrice,
    partsLow,
    partsHigh,
    inStockValueLow,
    inStockValueHigh,
    totalLow,
    totalHigh,
    hasRange:
      pricingComplete && totalLow !== null && totalHigh !== null
        ? Math.abs(totalHigh - totalLow) > 0.009
        : Math.abs(partsHigh - partsLow) > 0.009,
    pricingComplete,
    unknownPartCount,
    purchaseRequiredCount,
    inStockCount,
    notNeededCount,
    usesAiPartEstimate,
    usesPartnerPartPrice,
  };
}

export function approvalAuthorizationLabel(cost: FindingApprovalCost) {
  if (!cost.pricingComplete || cost.totalHigh === null) return "Pricing incomplete";
  if (cost.hasRange && cost.totalLow !== null) {
    return `${money(cost.totalLow)}–${money(cost.totalHigh)}`;
  }
  return money(cost.totalHigh);
}

export function money(value: number | null) {
  if (value === null) return "TBD";
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 0,
  }).format(value);
}
