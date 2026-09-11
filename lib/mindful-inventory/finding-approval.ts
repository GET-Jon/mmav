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

export type FindingApprovalCost = {
  laborPrice: number | null;
  partsLow: number;
  partsHigh: number;
  totalLow: number | null;
  totalHigh: number | null;
  hasRange: boolean;
  pricingComplete: boolean;
  unknownPartCount: number;
  usesAiPartEstimate: boolean;
  usesPartnerPartPrice: boolean;
};

function finiteNonNegative(value: unknown) {
  if (value === null || value === undefined || value === "") return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : null;
}

export function summarizeFindingApprovalCost(
  laborPriceInput: number | null,
  parts: FindingApprovalPart[],
): FindingApprovalCost {
  const laborPrice = finiteNonNegative(laborPriceInput);
  let partsLow = 0;
  let partsHigh = 0;
  let unknownPartCount = 0;
  let usesAiPartEstimate = false;
  let usesPartnerPartPrice = false;

  for (const part of parts) {
    const quantity = Number.isFinite(Number(part.quantity)) && Number(part.quantity) > 0
      ? Number(part.quantity)
      : 1;
    const partnerPrice = finiteNonNegative(part.partnerOfferUnitPrice);
    let aiLow = finiteNonNegative(part.aiEstimatedUnitPriceLow);
    let aiHigh = finiteNonNegative(part.aiEstimatedUnitPriceHigh);

    if (aiLow !== null && aiHigh !== null && aiHigh < aiLow) {
      [aiLow, aiHigh] = [aiHigh, aiLow];
    }

    if (partnerPrice !== null) {
      partsLow += partnerPrice * quantity;
      partsHigh += partnerPrice * quantity;
      usesPartnerPartPrice = true;
      continue;
    }

    if (aiLow !== null || aiHigh !== null) {
      const low = aiLow ?? aiHigh ?? 0;
      const high = aiHigh ?? aiLow ?? 0;
      partsLow += low * quantity;
      partsHigh += high * quantity;
      usesAiPartEstimate = true;
      continue;
    }

    unknownPartCount += 1;
  }

  const pricingComplete = laborPrice !== null && unknownPartCount === 0;
  const totalLow = pricingComplete ? laborPrice + partsLow : null;
  const totalHigh = pricingComplete ? laborPrice + partsHigh : null;

  return {
    laborPrice,
    partsLow,
    partsHigh,
    totalLow,
    totalHigh,
    hasRange:
      pricingComplete && totalLow !== null && totalHigh !== null
        ? Math.abs(totalHigh - totalLow) > 0.009
        : Math.abs(partsHigh - partsLow) > 0.009,
    pricingComplete,
    unknownPartCount,
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
