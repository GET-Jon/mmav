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
const outcomeStatuses = new Set(["passed", "won", "lost", "purchased"]);

export async function PATCH(request: Request) {
  try {
    const user = await getCurrentUser();
    if (!user) {
      return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
    }

    const body = await request.json();
    const id = String(body.id || "").trim();
    const status = String(body.status || "").trim();
    const recordOutcome = body.recordOutcome === true;
    const hasOutcomeReason = Object.prototype.hasOwnProperty.call(body, "outcomeReason");
    const outcomeReason =
      body.outcomeReason === null || body.outcomeReason === ""
        ? null
        : String(body.outcomeReason || "").trim();

    if (!id) {
      return NextResponse.json({ error: "Evaluation id is required." }, { status: 400 });
    }
    if (!allowedStatuses.has(status)) {
      return NextResponse.json({ error: "Invalid evaluation status." }, { status: 400 });
    }
    if (outcomeReason && outcomeReason.length > 1200) {
      return NextResponse.json({ error: "Keep the note under 1,200 characters." }, { status: 400 });
    }
    if ((recordOutcome || hasOutcomeReason) && !outcomeStatuses.has(status)) {
      return NextResponse.json(
        { error: "Outcome notes are only available for final statuses." },
        { status: 400 },
      );
    }

    const supabase = await createSupabaseServerAuthClient();
    const company = await getCurrentCompanyForUser(supabase, user.id);
    let payloadUpdate: Record<string, unknown> | undefined;
    let existingPayload: Record<string, unknown> = {};

    if (recordOutcome || hasOutcomeReason) {
      const { data: existing, error: existingError } = await supabase
        .from("auction_evaluations")
        .select("payload")
        .eq("id", id)
        .eq("company_id", company.companyId)
        .single();

      if (existingError) {
        return NextResponse.json(
          { error: existingError.message },
          { status: existingError.code === "PGRST116" ? 404 : 500 },
        );
      }

      existingPayload =
        existing?.payload && typeof existing.payload === "object" && !Array.isArray(existing.payload)
          ? (existing.payload as Record<string, unknown>)
          : {};
      payloadUpdate = {
        ...existingPayload,
        ...(hasOutcomeReason ? { dealerOutcomeReason: outcomeReason } : {}),
        ...(recordOutcome
          ? {
              dealerOutcomeRecordedAt: new Date().toISOString(),
              dealerOutcomeRecordedBy: user.id,
            }
          : {}),
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

    const recordedAt = recordOutcome
      ? (payloadUpdate?.dealerOutcomeRecordedAt as string)
      : (existingPayload.dealerOutcomeRecordedAt as string | undefined) || null;

    return NextResponse.json({
      id: data.id,
      status: data.status,
      outcomeReason: hasOutcomeReason
        ? outcomeReason
        : (existingPayload.dealerOutcomeReason as string | undefined) || null,
      outcomeRecordedAt: recordedAt,
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
