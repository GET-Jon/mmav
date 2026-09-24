import { NextResponse } from "next/server";

import { getMindfulInventoryAccess } from "@/lib/mindful-inventory/access";
import { getSystemHealthSnapshot } from "@/lib/observability/health";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  const access = await getMindfulInventoryAccess();
  if (!access || access.company.role !== "company_admin") {
    return NextResponse.json({ error: "Admin access required." }, { status: 403 });
  }

  const snapshot = await getSystemHealthSnapshot(100);
  return NextResponse.json(snapshot, {
    headers: {
      "cache-control": "no-store",
    },
  });
}
