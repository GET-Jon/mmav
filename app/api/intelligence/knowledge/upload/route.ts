import { createHash } from "node:crypto";
import { NextResponse } from "next/server";

import { AiTemporarilyUnavailableError } from "@/lib/ai/errors";
import { getLotLogicIntelligenceAccess } from "@/lib/lot-logic-intelligence/access";
import {
  extractDealershipDocumentKnowledge,
  supportedDealershipKnowledgeMimeType,
} from "@/lib/lot-logic-intelligence/document-ingestion";

const MAX_FILE_BYTES = 10 * 1024 * 1024;

export async function POST(request: Request) {
  try {
    const access = await getLotLogicIntelligenceAccess();

    if (!access) {
      return NextResponse.json(
        { error: "Authentication required." },
        { status: 401 },
      );
    }

    if (!access.isAdmin) {
      return NextResponse.json(
        { error: "Administrator access required." },
        { status: 403 },
      );
    }

    const formData = await request.formData();
    const file = formData.get("file");

    if (!(file instanceof File)) {
      return NextResponse.json(
        { error: "Choose a dealership knowledge document to upload." },
        { status: 400 },
      );
    }

    if (file.size <= 0) {
      return NextResponse.json(
        { error: "The uploaded file is empty." },
        { status: 400 },
      );
    }

    if (file.size > MAX_FILE_BYTES) {
      return NextResponse.json(
        { error: "Keep dealership knowledge documents under 10 MB." },
        { status: 413 },
      );
    }

    const normalizedMime = supportedDealershipKnowledgeMimeType(
      file.name,
      file.type,
    );

    if (!normalizedMime) {
      return NextResponse.json(
        {
          error:
            "Unsupported file type. Upload PDF, TXT, Markdown, CSV, RTF, or JSON. For Word documents, export or save the file as PDF first.",
        },
        { status: 415 },
      );
    }

    const requestedTitle = String(formData.get("title") || "").trim();
    const fallbackTitle = file.name.replace(/\.[^.]+$/, "").trim();
    const title = (requestedTitle || fallbackTitle || "Dealership knowledge")
      .slice(0, 180);

    const bytes = new Uint8Array(await file.arrayBuffer());
    const extraction = await extractDealershipDocumentKnowledge({
      title,
      filename: file.name,
      mimeType: normalizedMime,
      bytes,
    });

    const contentHash = createHash("sha256")
      .update(Buffer.from(bytes))
      .digest("hex");
    const now = new Date().toISOString();

    const { data: source, error: sourceError } = await access.supabase
      .from("lot_logic_intelligence_knowledge_sources")
      .insert({
        company_id: access.company.companyId,
        source_type: "capabilities_document",
        title,
        extracted_text: extraction.extractedText,
        content_hash: contentHash,
        metadata: {
          entryMode: "upload",
          originalFilename: file.name,
          mimeType: normalizedMime,
          fileSize: file.size,
          extractionModel: extraction.model,
          assertionCount: extraction.assertions.length,
          sourceSummary: extraction.summary,
          originalFileStored: false,
        },
        created_by: access.userId,
        created_at: now,
        updated_at: now,
      })
      .select("id,title,source_type,active,created_at,updated_at")
      .single();

    if (sourceError) {
      return NextResponse.json(
        { error: sourceError.message },
        { status: 500 },
      );
    }

    if (extraction.assertions.length) {
      const { error: assertionError } = await access.supabase
        .from("lot_logic_intelligence_assertions")
        .insert(
          extraction.assertions.map((assertion) => ({
            company_id: access.company.companyId,
            knowledge_source_id: source.id,
            assertion_type: assertion.assertionType,
            subject_type: assertion.subjectType,
            subject_key: assertion.subjectKey,
            predicate: assertion.predicate,
            value: assertion.value,
            provenance_type: "explicit",
            status: "active",
            confidence: 1,
            sample_size: 0,
            supporting_count: 0,
            contradicting_count: 0,
            first_observed_at: now,
            last_observed_at: now,
            requires_validation: false,
            evidence: assertion.evidence
              ? [
                  {
                    source: title,
                    text: assertion.evidence,
                  },
                ]
              : [],
            created_at: now,
            updated_at: now,
          })),
        );

      if (assertionError) {
        await access.supabase
          .from("lot_logic_intelligence_knowledge_sources")
          .delete()
          .eq("company_id", access.company.companyId)
          .eq("id", source.id);

        return NextResponse.json(
          { error: assertionError.message },
          { status: 500 },
        );
      }
    }

    return NextResponse.json(
      {
        source,
        summary: extraction.summary,
        assertionCount: extraction.assertions.length,
        file: {
          name: file.name,
          mimeType: normalizedMime,
          size: file.size,
        },
      },
      { status: 201 },
    );
  } catch (error) {
    if (error instanceof AiTemporarilyUnavailableError) {
      return NextResponse.json(
        {
          error:
            "Document analysis is temporarily busy. Your file was not saved—please try again in a moment.",
          code: error.code,
          retryable: true,
        },
        { status: 503 },
      );
    }

    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "Lot Logic could not process that dealership document.",
      },
      { status: 500 },
    );
  }
}
