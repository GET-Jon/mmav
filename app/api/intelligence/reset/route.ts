import { NextResponse } from "next/server";

import { getCurrentCompanyForUser } from "@/lib/supabase/company";
import { createSupabaseAdminClient } from "@/lib/supabase/server";
import {
  createSupabaseServerAuthClient,
  getCurrentUser,
} from "@/lib/supabase/server-auth";

type ResetMode = "learning" | "full";

const CONFIRMATION = "RESET LOT LOGIC INTELLIGENCE";

async function deleteCompanyRows(
  supabase: ReturnType<typeof createSupabaseAdminClient>,
  table: string,
  companyId: string,
) {
  const { error, count } = await supabase
    .from(table)
    .delete({ count: "exact" })
    .eq("company_id", companyId);

  if (error) throw new Error(`${table}: ${error.message}`);
  return count ?? 0;
}

export async function POST(request: Request) {
  try {
    const user = await getCurrentUser();
    if (!user) {
      return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
    }

    const authClient = await createSupabaseServerAuthClient();
    const company = await getCurrentCompanyForUser(authClient, user.id);
    if (company.role !== "company_admin") {
      return NextResponse.json(
        { error: "Only company administrators can reset Lot Logic Intelligence." },
        { status: 403 },
      );
    }

    const body = await request.json();
    const mode: ResetMode = body.mode === "full" ? "full" : "learning";
    const confirmation = String(body.confirmation || "").trim();

    if (confirmation !== CONFIRMATION) {
      return NextResponse.json(
        { error: `Type ${CONFIRMATION} to confirm the reset.` },
        { status: 400 },
      );
    }

    const supabase = createSupabaseAdminClient();
    const companyId = company.companyId;
    const deleted: Record<string, number> = {};

    // Delete dependents before parents. This affects Intelligence records only;
    // Evaluator, Inventory, Work Orders, Findings, History, and source operations remain intact.
    deleted.predictionOutcomes = await deleteCompanyRows(
      supabase,
      "lot_logic_intelligence_prediction_outcomes",
      companyId,
    );
    deleted.blindPartnerEstimates = await deleteCompanyRows(
      supabase,
      "lot_logic_partner_blind_estimates",
      companyId,
    );
    deleted.predictionSnapshots = await deleteCompanyRows(
      supabase,
      "lot_logic_intelligence_prediction_snapshots",
      companyId,
    );
    deleted.decisionEvents = await deleteCompanyRows(
      supabase,
      "lot_logic_intelligence_decision_events",
      companyId,
    );
    deleted.insights = await deleteCompanyRows(
      supabase,
      "lot_logic_intelligence_insights",
      companyId,
    );
    deleted.issueRelations = await deleteCompanyRows(
      supabase,
      "lot_logic_intelligence_issue_relations",
      companyId,
    );

    if (mode === "full") {
      deleted.assertions = await deleteCompanyRows(
        supabase,
        "lot_logic_intelligence_assertions",
        companyId,
      );
      deleted.knowledgeSources = await deleteCompanyRows(
        supabase,
        "lot_logic_intelligence_knowledge_sources",
        companyId,
      );
    } else {
      const { error, count } = await supabase
        .from("lot_logic_intelligence_assertions")
        .delete({ count: "exact" })
        .eq("company_id", companyId)
        .neq("provenance_type", "explicit");
      if (error) throw new Error(`lot_logic_intelligence_assertions: ${error.message}`);
      deleted.learnedAssertions = count ?? 0;
    }

    return NextResponse.json({
      ok: true,
      mode,
      deleted,
      preserved:
        mode === "learning"
          ? [
              "explicit company knowledge",
              "knowledge sources",
              "evaluations",
              "inventory vehicles",
              "findings",
              "work orders",
              "operational history",
            ]
          : [
              "evaluations",
              "inventory vehicles",
              "findings",
              "work orders",
              "operational history",
            ],
    });
  } catch (error) {
    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "Lot Logic Intelligence reset failed.",
      },
      { status: 500 },
    );
  }
}
