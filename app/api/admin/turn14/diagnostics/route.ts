import { NextResponse } from "next/server";

import { getMindfulInventoryAccess } from "@/lib/mindful-inventory/access";
import { testTurn14Connection } from "@/lib/turn14/read-only";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST() {
  try {
    const access = await getMindfulInventoryAccess();
    if (!access || access.company.role !== "company_admin") {
      return NextResponse.json({ error: "Admin access required." }, { status: 403 });
    }

    const diagnostics = await testTurn14Connection();
    return NextResponse.json({ diagnostics });
  } catch (error) {
    console.error("Turn 14 diagnostics failed:", error);
    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "Failed to test Turn 14 connection.",
      },
      { status: 500 },
    );
  }
}
