import { NextResponse } from "next/server";

import { getLotLogicIntelligenceAccess } from "@/lib/lot-logic-intelligence/access";
import { listIntelligenceSettingsData } from "@/lib/lot-logic-intelligence/service";

export async function GET() {
  try {
    const access = await getLotLogicIntelligenceAccess();
    if (!access) {
      return NextResponse.json({ error: "Authentication required." }, { status: 401 });
    }

    const data = await listIntelligenceSettingsData(
      access.supabase,
      access.company.companyId,
    );

    return NextResponse.json({
      company: {
        id: access.company.companyId,
        name: access.company.companyName,
        role: access.company.role,
      },
      canReview: access.isAdmin,
      ...data,
    });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to load Lot Logic Intelligence." },
      { status: 500 },
    );
  }
}
