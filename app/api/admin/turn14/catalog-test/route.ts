import { NextResponse } from "next/server";

import { getMindfulInventoryAccess } from "@/lib/mindful-inventory/access";
import {
  probeTurn14Catalog,
  probeTurn14Inventory,
} from "@/lib/turn14/read-only";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  try {
    const access = await getMindfulInventoryAccess();
    if (!access || access.company.role !== "company_admin") {
      return NextResponse.json({ error: "Admin access required." }, { status: 403 });
    }

    const body = (await request.json()) as {
      mode?: unknown;
      query?: unknown;
      itemId?: unknown;
    };

    const mode = body.mode === "inventory" ? "inventory" : "catalog";
    const result =
      mode === "inventory"
        ? await probeTurn14Inventory(String(body.itemId || ""))
        : await probeTurn14Catalog(String(body.query || ""));

    return NextResponse.json({ result });
  } catch (error) {
    console.error("Turn 14 read-only catalog test failed:", error);
    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "Failed to run Turn 14 read-only catalog test.",
      },
      { status: 500 },
    );
  }
}
