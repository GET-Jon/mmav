import { NextResponse } from "next/server";
import { createSupabaseAdminClient } from "@/lib/supabase/server";
import { getCurrentCompanyForUser } from "@/lib/supabase/company";
import { getCurrentUser } from "@/lib/supabase/server-auth";

const allowedStatuses = new Set([
  "watching",
  "needs_review",
  "bid",
  "passed",
  "won",
  "lost",
  "purchased",
  "archived",
]);

export async function PATCH(request: Request) {
  try {
    const user = await getCurrentUser();

    if (!user) {
      return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
    }

    const body = await request.json();

    const id = String(body.id || "").trim();
    const status = String(body.status || "").trim();

    if (!id) {
      return NextResponse.json(
        { error: "Evaluation id is required." },
        { status: 400 }
      );
    }

    if (!allowedStatuses.has(status)) {
      return NextResponse.json(
        { error: "Invalid evaluation status." },
        { status: 400 }
      );
    }

    const supabase = createSupabaseAdminClient();
    const company = await getCurrentCompanyForUser(supabase, user.id);

    const { data, error } = await supabase
      .from("auction_evaluations")
      .update({
        status,
        updated_by: user.id,
      })
      .eq("id", id)
      .eq("company_id", company.companyId)
      .select("id, status, updated_at")
      .single();

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({
      id: data.id,
      status: data.status,
      updatedAt: data.updated_at,
    });
  } catch (error) {
    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "Failed to update evaluation status.",
      },
      { status: 500 }
    );
  }
}
