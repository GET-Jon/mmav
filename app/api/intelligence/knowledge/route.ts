import { createHash } from "node:crypto";
import { NextResponse } from "next/server";

import { getLotLogicIntelligenceAccess } from "@/lib/lot-logic-intelligence/access";

const VALID_SOURCE_TYPES = new Set([
  "capabilities_document",
  "sop",
  "policy",
  "manager_note",
  "reference_document",
  "import",
  "other",
]);

export async function POST(request: Request) {
  try {
    const access = await getLotLogicIntelligenceAccess();
    if (!access) {
      return NextResponse.json({ error: "Authentication required." }, { status: 401 });
    }
    if (!access.isAdmin) {
      return NextResponse.json({ error: "Administrator access required." }, { status: 403 });
    }

    const body = await request.json().catch(() => ({}));
    const title = String(body.title || "").trim().slice(0, 180);
    const text = String(body.text || "").trim().slice(0, 50_000);
    const sourceType = String(body.sourceType || "manager_note");

    if (!title) {
      return NextResponse.json({ error: "Title is required." }, { status: 400 });
    }
    if (!text) {
      return NextResponse.json({ error: "Knowledge text is required." }, { status: 400 });
    }
    if (!VALID_SOURCE_TYPES.has(sourceType)) {
      return NextResponse.json({ error: "Invalid knowledge source type." }, { status: 400 });
    }

    const contentHash = createHash("sha256").update(text).digest("hex");
    const now = new Date().toISOString();

    const { data, error } = await access.supabase
      .from("lot_logic_intelligence_knowledge_sources")
      .insert({
        company_id: access.company.companyId,
        source_type: sourceType,
        title,
        extracted_text: text,
        content_hash: contentHash,
        metadata: { entryMode: "manual" },
        created_by: access.userId,
        created_at: now,
        updated_at: now,
      })
      .select("id,title,source_type,active,created_at,updated_at")
      .single();

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json(data, { status: 201 });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to add knowledge." },
      { status: 500 },
    );
  }
}
