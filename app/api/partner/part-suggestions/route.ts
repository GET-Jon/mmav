import { NextResponse } from "next/server";

import { normalizePartSearchesWithAi } from "@/lib/ai/part-search";
import { buildPartSearchSources } from "@/lib/mindful-inventory/part-suggestions";
import { requirePartnerPortalAccess } from "@/lib/partner-portal/access";

export async function POST(request: Request) {
  try {
    const access = await requirePartnerPortalAccess();
    if (!access.partner.mechanicalInspectionEligible) {
      return NextResponse.json({ error: "Mechanical inspection access is not enabled." }, { status: 403 });
    }

    const body = await request.json().catch(() => ({})) as Record<string, unknown>;
    const contextText = String(body.contextText || "").trim();
    const vehicleLabel = String(body.vehicleLabel || "").trim();

    if (!contextText) {
      return NextResponse.json({ error: "Enter a recommended action before asking Lot Logic for parts." }, { status: 400 });
    }

    const key = "inspection-part-suggestion";
    const normalized = await normalizePartSearchesWithAi([{
      workOrderId: key,
      workOrderTitle: contextText,
      partName: contextText,
      fitmentLabel: vehicleLabel,
    }]);

    const result = normalized[0];
    if (!result) return NextResponse.json({ items: [] });

    const rawCandidates = result.recommendedParts.length
      ? result.recommendedParts
      : [{ name: result.partName, need: "possible" as const, searchQuery: result.searchQuery }];

    const items = rawCandidates.slice(0, 5).map((part) => ({
      name: part.name,
      need: part.need,
      searchQuery: part.searchQuery,
      sources: buildPartSearchSources(part.searchQuery),
    }));

    return NextResponse.json({ items });
  } catch (error) {
    return NextResponse.json({
      error: error instanceof Error ? error.message : "Could not suggest parts for this inspection item.",
    }, { status: 500 });
  }
}
