import { NextResponse } from "next/server";

import { getPlatformAdminAccess } from "@/lib/admin/platform-admin";

export async function POST(request: Request) {
  const access = await getPlatformAdminAccess();
  if (!access) {
    return NextResponse.json(
      { error: "Platform administrator access required." },
      { status: 403 },
    );
  }

  try {
    const body = (await request.json()) as {
      companyId?: unknown;
      amount?: unknown;
      note?: unknown;
    };

    const companyId = String(body.companyId || "").trim();
    const amount = Math.round(Number(body.amount || 0));
    const note = String(body.note || "").trim().slice(0, 240);

    if (!companyId) {
      return NextResponse.json(
        { error: "Company is required." },
        { status: 400 },
      );
    }

    if (!Number.isFinite(amount) || amount < 1 || amount > 500) {
      return NextResponse.json(
        { error: "Gift between 1 and 500 evaluations at a time." },
        { status: 400 },
      );
    }

    const { data: company, error: companyError } = await access.admin
      .from("companies")
      .select("id,name,slug")
      .eq("id", companyId)
      .maybeSingle();

    if (companyError) {
      return NextResponse.json(
        { error: companyError.message },
        { status: 500 },
      );
    }

    if (!company) {
      return NextResponse.json(
        { error: "Company not found." },
        { status: 404 },
      );
    }

    const { data: balance, error } = await access.admin.rpc(
      "gift_company_evaluation_credits",
      {
        p_company_id: companyId,
        p_amount: amount,
        p_granted_by: access.userId,
        p_note: note || null,
      },
    );

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({
      ok: true,
      company: {
        id: company.id,
        name: company.name,
      },
      amount,
      giftedEvaluationsRemaining: Number(balance || 0),
    });
  } catch (error) {
    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "Unable to gift evaluation credits.",
      },
      { status: 500 },
    );
  }
}
