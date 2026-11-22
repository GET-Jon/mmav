import { NextResponse } from "next/server";
import { getCurrentCompanyForUser } from "@/lib/supabase/company";
import {
  createSupabaseServerAuthClient,
  getCurrentUser,
} from "@/lib/supabase/server-auth";

const allowedStatuses = new Set([
  "undecided",
  "watching",
  "needs_review",
  "bid",
  "passed",
  "won",
  "lost",
  "purchased",
  "archived",
]);

const allowedOutcomeReasons = new Set([
  "price",
  "condition_title",
  "market_confidence",
  "seller",
  "timing",
  "other",
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
    const hasOutcomeReason = Object.prototype.hasOwnProperty.call(body, "outcomeReason");
    const outcomeReason =
      body.outcomeReason === null || body.outcomeReason === ""
        ? null
        : String(body.outcomeReason || "").trim();

    if (!id) {
      return NextResponse.json(
        { error: "Evaluation id is required." },
        { status: 400 },
      );
    }

    if (!allowedStatuses.has(status)) {
      return NextResponse.json(
        { error: "Invalid evaluation status." },
        { status: 400 },
      );
    }

    if (outcomeReason && !allowedOutcomeReasons.has(outcomeReason)) {
      return NextResponse.json(
        { error: "Invalid outcome reason." },
        { status: 400 },
      );
    }

    if (outcomeReason && !["passed", "lost"].includes(status)) {
      return NextResponse.json(
        { error: "Outcome reasons are only available for passed or lost deals." },
        { status: 400 },
      );
    }

    const supabase = await createSupabaseServerAuthClient();
    const company = await getCurrentCompanyForUser(supabase, user.id);

    let payloadUpdate: Record<string, unknown> | undefined;

    if (hasOutcomeReason) {
      const { data: existing, error: existingError } = await supabase
        .from("auction_evaluations")
        .select("payload")
        .eq("id", id)
        .eq("company_id", company.companyId)
        .single();

      if (existingError) {
        return NextResponse.json({ error: existingError.message }, { status: 500 });
      }

      const existingPayload =
        existing?.payload && typeof existing.payload === "object" && !Array.isArray(existing.payload)
          ? (existing.payload as Record<string, unknown>)
          : {};

      payloadUpdate = {
        ...existingPayload,
        dealerOutcomeReason: outcomeReason,
      };
    }

    const { data, error } = await supabase
      .from("auction_evaluations")
      .update({
        status,
        updated_by: user.id,
        ...(payloadUpdate ? { payload: payloadUpdate } : {}),
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
      outcomeReason: hasOutcomeReason ? outcomeReason : undefined,
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
      { status: 500 },
    );
  }
}
