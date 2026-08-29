import { NextResponse } from "next/server";

import { submitBlindEstimate } from "@/lib/lot-logic-intelligence/service";
import { createSupabaseAdminClient } from "@/lib/supabase/server";
import { createSupabaseServerAuthClient } from "@/lib/supabase/server-auth";

function optionalNonNegativeNumber(value: unknown) {
  if (value === null || value === undefined || value === "") return null;
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed < 0) return undefined;
  return parsed;
}

function optionalMinutes(value: unknown) {
  const parsed = optionalNonNegativeNumber(value);
  if (parsed === undefined || parsed === null) return parsed;
  return Math.round(parsed);
}

export async function POST(
  request: Request,
  context: { params: Promise<{ workOrderId: string }> },
) {
  try {
    const authClient = await createSupabaseServerAuthClient();
    const {
      data: { user },
      error: userError,
    } = await authClient.auth.getUser();

    if (userError || !user) {
      return NextResponse.json({ error: "Authentication required." }, { status: 401 });
    }

    const { workOrderId } = await context.params;
    const admin = createSupabaseAdminClient();

    const { data: workOrder, error: workOrderError } = await admin
      .from("mindful_inventory_work_orders")
      .select("id,assigned_partner_id")
      .eq("id", workOrderId)
      .maybeSingle();

    if (workOrderError) {
      return NextResponse.json({ error: workOrderError.message }, { status: 500 });
    }
    if (!workOrder?.assigned_partner_id) {
      return NextResponse.json({ error: "This work order is not assigned to a partner." }, { status: 404 });
    }

    const { data: partner, error: partnerError } = await admin
      .from("mindful_inventory_partners")
      .select("id,company_id,user_id,active")
      .eq("id", workOrder.assigned_partner_id)
      .maybeSingle();

    if (partnerError) {
      return NextResponse.json({ error: partnerError.message }, { status: 500 });
    }
    if (!partner || !partner.active || partner.user_id !== user.id) {
      return NextResponse.json({ error: "You are not the assigned partner for this work order." }, { status: 403 });
    }

    const { data: permissions, error: permissionsError } = await admin
      .from("mindful_inventory_partner_permissions")
      .select("edit_estimate")
      .eq("partner_id", partner.id)
      .maybeSingle();

    if (permissionsError) {
      return NextResponse.json({ error: permissionsError.message }, { status: 500 });
    }
    if (!permissions?.edit_estimate) {
      return NextResponse.json({ error: "Estimate entry is not enabled for this partner." }, { status: 403 });
    }

    const body = await request.json().catch(() => ({}));
    const quotedCost = optionalNonNegativeNumber(body.quotedCost);
    const estimatedLaborMinutes = optionalMinutes(body.estimatedLaborMinutes);
    const estimatedElapsedMinutes = optionalMinutes(body.estimatedElapsedMinutes);

    if (
      quotedCost === undefined ||
      estimatedLaborMinutes === undefined ||
      estimatedElapsedMinutes === undefined
    ) {
      return NextResponse.json({ error: "Estimate values must be non-negative numbers." }, { status: 400 });
    }

    if (
      quotedCost === null &&
      estimatedLaborMinutes === null &&
      estimatedElapsedMinutes === null
    ) {
      return NextResponse.json({ error: "Enter at least one estimate value." }, { status: 400 });
    }

    const result = await submitBlindEstimate(admin, {
      companyId: partner.company_id,
      workOrderId,
      partnerId: partner.id,
      quotedCost,
      estimatedLaborMinutes,
      estimatedElapsedMinutes,
      notes: body.notes == null ? null : String(body.notes).trim().slice(0, 2000),
      submittedByUserId: user.id,
    });

    return NextResponse.json(
      {
        id: result.id,
        revisionNo: result.revision_no,
        submittedAt: result.submitted_at,
      },
      { status: 201 },
    );
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to submit estimate." },
      { status: 500 },
    );
  }
}
