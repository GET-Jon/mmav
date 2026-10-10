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

// Fetch note body only when an administrator opens the inline editor.
// Avoid delivering large document text as part of normal Settings page loads.
export async function GET(request: Request) {
  try {
    const access = await getLotLogicIntelligenceAccess();
    if (!access) return NextResponse.json({ error: "Authentication required." }, { status: 401 });
    if (!access.isAdmin) return NextResponse.json({ error: "Administrator access required." }, { status: 403 });
    const id = new URL(request.url).searchParams.get("id");
    if (!id) return NextResponse.json({ error: "Note ID required." }, { status: 400 });
    const { data, error } = await access.supabase
      .from("lot_logic_intelligence_knowledge_sources")
      .select("id,title,extracted_text,source_type")
      .eq("company_id", access.company.companyId)
      .eq("source_type", "manager_note")
      .eq("id", id)
      .single();
    if (error || !data) return NextResponse.json({ error: "Editable manager note not found." }, { status: 404 });
    return NextResponse.json(data);
  } catch (error) {
    return NextResponse.json({
      error: error instanceof Error ? error.message : "Unable to load manager note.",
    }, { status: 500 });
  }
}

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

    const assertionType =
      sourceType === "policy"
        ? "policy"
        : sourceType === "capabilities_document"
          ? "capability"
          : "preference";

    const { error: assertionError } = await access.supabase
      .from("lot_logic_intelligence_assertions")
      .insert({
        company_id: access.company.companyId,
        knowledge_source_id: data.id,
        assertion_type: assertionType,
        subject_type: "company",
        subject_key: "company",
        predicate: title,
        value: text,
        provenance_type: "explicit",
        status: "active",
        confidence: 1,
        sample_size: 0,
        supporting_count: 0,
        contradicting_count: 0,
        first_observed_at: now,
        last_observed_at: now,
        requires_validation: false,
        evidence: [{ source: title, text: text.slice(0, 1000) }],
        created_at: now,
        updated_at: now,
      });

    if (assertionError) {
      await access.supabase
        .from("lot_logic_intelligence_knowledge_sources")
        .delete()
        .eq("company_id", access.company.companyId)
        .eq("id", data.id);

      return NextResponse.json(
        { error: assertionError.message },
        { status: 500 },
      );
    }

    return NextResponse.json(
      { ...data, assertionCount: 1 },
      { status: 201 },
    );
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to add knowledge." },
      { status: 500 },
    );
  }
}


// Editing an explicit manager note must also update its linked intelligence
// assertions. Otherwise old preferences continue influencing recommendations.
export async function PATCH(request: Request) {
  try {
    const access = await getLotLogicIntelligenceAccess();
    if (!access) return NextResponse.json({ error: "Authentication required." }, { status: 401 });
    if (!access.isAdmin) return NextResponse.json({ error: "Administrator access required." }, { status: 403 });

    const body = await request.json().catch(() => ({}));
    const id = String(body.id || "").trim();
    const title = String(body.title || "").trim().slice(0, 180);
    const text = String(body.text || "").trim().slice(0, 50_000);
    if (!id || !title || !text) {
      return NextResponse.json({ error: "Source ID, title and knowledge are required." }, { status: 400 });
    }

    const sources = access.supabase.from("lot_logic_intelligence_knowledge_sources");
    const { data: original, error: readError } = await sources
      .select("id,title,extracted_text,content_hash,source_type,active,created_at,updated_at")
      .eq("id", id).eq("company_id", access.company.companyId)
      .eq("source_type", "manager_note").single();
    if (readError || !original) {
      return NextResponse.json({ error: "Editable manager note not found." }, { status: 404 });
    }

    const now = new Date().toISOString();
    const nextHash = createHash("sha256").update(text).digest("hex");
    const { data: updated, error: updateError } = await access.supabase
      .from("lot_logic_intelligence_knowledge_sources")
      .update({ title, extracted_text: text, content_hash: nextHash, updated_at: now })
      .eq("id", id).eq("company_id", access.company.companyId)
      .eq("source_type", "manager_note")
      .select("id,title,source_type,active,created_at,updated_at").single();
    if (updateError || !updated) {
      return NextResponse.json({ error: updateError?.message || "Unable to update knowledge." }, { status: 500 });
    }

    const { error: assertionsError } = await access.supabase
      .from("lot_logic_intelligence_assertions")
      .update({
        predicate: title, value: text,
        evidence: [{ source: title, text: text.slice(0, 1000) }],
        updated_at: now,
      })
      .eq("company_id", access.company.companyId)
      .eq("knowledge_source_id", id)
      .eq("provenance_type", "explicit");
    if (assertionsError) {
      // Restore the source text if linked assertion update failed.
      await access.supabase.from("lot_logic_intelligence_knowledge_sources")
        .update({
          title: original.title,
          extracted_text: original.extracted_text,
          content_hash: original.content_hash,
          updated_at: original.updated_at,
        }).eq("company_id", access.company.companyId).eq("id", id);
      return NextResponse.json({ error: "Knowledge assertions could not be updated: " + assertionsError.message }, { status: 500 });
    }
    return NextResponse.json(updated);
  } catch (error) {
    return NextResponse.json({
      error: error instanceof Error ? error.message : "Unable to edit knowledge.",
    }, { status: 500 });
  }
}
