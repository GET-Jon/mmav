import { NextResponse } from "next/server";

import { getPlatformAdminAccess } from "@/lib/admin/platform-admin";

export async function GET() {
  const access = await getPlatformAdminAccess();

  return NextResponse.json(
    { isPlatformAdmin: Boolean(access) },
    { headers: { "Cache-Control": "private, no-store" } },
  );
}
