import { NextResponse } from "next/server";

import { createSupabaseAdminClient } from "@/lib/supabase/server";
import { createSupabaseServerAuthClient } from "@/lib/supabase/server-auth";

const threadEvents = [
  "partner_parts_issue_reported",
  "parts_issue_message",
  "partner_parts_issue_resolved",
  "parts_issue_reorder",
  "parts_issue_not_required",
  "partner_parts_confirmed",
];

function messageFromHistory(row: { id: string; event_type: string; summary: string; metadata: unknown; created_at: string }) {
  const metadata = row.metadata && typeof row.metadata === "object" && !Array.isArray(row.metadata) ? row.metadata as Record<string, unknown> : {};
  const explicit = typeof metadata.message === "string" ? metadata.message : null;
  const note = typeof metadata.note === "string" ? metadata.note : null;
  const authorRole = metadata.authorRole === "owner" ? "owner" : metadata.authorRole === "partner" ? "partner" : row.event_type === "partner_parts_issue_reported" || row.event_type === "partner_parts_confirmed" ? "partner" : "system";
  const authorLabel = typeof metadata.actorLabel === "string"
    ? metadata.actorLabel
    : typeof metadata.partnerName === "string"
      ? metadata.partnerName
      : authorRole === "owner" ? "Mindful" : authorRole === "partner" ? "You" : "Lot Logic";
  return { id: row.id, authorLabel, authorRole, message: explicit || note || row.summary, createdAt: row.created_at };
}

async function partnerContext(workOrderId: string) {
  const auth = await createSupabaseServerAuthClient();
  const { data: { user } } = await auth.auth.getUser();
  if (!user) return { error: NextResponse.json({ error: "Authentication required." }, { status: 401 }) } as const;
  const admin = createSupabaseAdminClient();
  const { data: work, error } = await admin.from("mindful_inventory_work_orders").select("id,vehicle_id,assigned_partner_id,partner_parts_confirmation_status,partner_parts_note").eq("id", workOrderId).maybeSingle();
  if (error) throw new Error(error.message);
  if (!work?.assigned_partner_id) return { error: NextResponse.json({ error: "Assigned Work Order not found." }, { status: 404 }) } as const;
  const { data: partner, error: partnerError } = await admin.from("mindful_inventory_partners").select("id,user_id,active,company_id,name").eq("id", work.assigned_partner_id).maybeSingle();
  if (partnerError) throw new Error(partnerError.message);
  if (!partner || !partner.active || partner.user_id !== user.id) return { error: NextResponse.json({ error: "You are not the assigned Partner for this Work Order." }, { status: 403 }) } as const;
  return { admin, user, work, partner } as const;
}

export async function GET(_request: Request, context: { params: Promise<{ workOrderId: string }> }) {
  try {
    const { workOrderId } = await context.params;
    const ctx = await partnerContext(workOrderId);
    if ("error" in ctx) return ctx.error;
    const { data, error } = await ctx.admin.from("mindful_inventory_history")
      .select("id,event_type,summary,metadata,created_at")
      .eq("vehicle_id", ctx.work.vehicle_id)
      .eq("entity_type", "work_order")
      .eq("entity_id", workOrderId)
      .in("event_type", threadEvents)
      .order("created_at", { ascending: true });
    if (error) throw new Error(error.message);
    const messages = (data || []).map(messageFromHistory);
    if (ctx.work.partner_parts_note && !messages.some((item) => item.message === ctx.work.partner_parts_note)) {
      messages.unshift({ id: `legacy-${workOrderId}`, authorLabel: "You", authorRole: "partner" as const, message: ctx.work.partner_parts_note, createdAt: new Date().toISOString() });
    }
    return NextResponse.json({ status: ctx.work.partner_parts_confirmation_status, messages });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Could not load the parts issue." }, { status: 500 });
  }
}

export async function POST(request: Request, context: { params: Promise<{ workOrderId: string }> }) {
  try {
    const { workOrderId } = await context.params;
    const ctx = await partnerContext(workOrderId);
    if ("error" in ctx) return ctx.error;
    const body = await request.json().catch(() => ({}));
    if (String(body.action || "") !== "reply") return NextResponse.json({ error: "Unsupported parts issue action." }, { status: 400 });
    const message = String(body.message || "").trim().slice(0, 1000);
    if (!message) return NextResponse.json({ error: "Enter a reply first." }, { status: 400 });
    const { error } = await ctx.admin.from("mindful_inventory_history").insert({
      company_id: ctx.partner.company_id,
      vehicle_id: ctx.work.vehicle_id,
      event_type: "parts_issue_message",
      entity_type: "work_order",
      entity_id: workOrderId,
      actor_user_id: ctx.user.id,
      actor_partner_id: ctx.partner.id,
      summary: "Partner replied to the parts issue.",
      metadata: { scope: "parts_issue", authorRole: "partner", actorLabel: ctx.partner.name, message },
    });
    if (error) throw new Error(error.message);
    return NextResponse.json({ ok: true });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Could not reply to the parts issue." }, { status: 500 });
  }
}
