import { NextResponse } from "next/server";

import { getMindfulInventoryAccess } from "@/lib/mindful-inventory/access";
import { createSupabaseAdminClient } from "@/lib/supabase/server";

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
  const authorRole = metadata.authorRole === "partner" ? "partner" : metadata.authorRole === "owner" ? "owner" : row.event_type === "partner_parts_issue_reported" || row.event_type === "partner_parts_confirmed" ? "partner" : "system";
  const authorLabel = typeof metadata.actorLabel === "string"
    ? metadata.actorLabel
    : typeof metadata.partnerName === "string"
      ? metadata.partnerName
      : authorRole === "owner" ? "Mindful" : authorRole === "partner" ? "Partner" : "Lot Logic";
  return {
    id: row.id,
    authorLabel,
    authorRole,
    message: explicit || note || row.summary,
    createdAt: row.created_at,
  };
}

async function ownerContext(workOrderId: string) {
  const access = await getMindfulInventoryAccess();
  if (!access) return { error: NextResponse.json({ error: "Mindful Inventory access denied." }, { status: 403 }) } as const;
  const admin = createSupabaseAdminClient();
  const { data: work, error } = await admin
    .from("mindful_inventory_work_orders")
    .select("id,vehicle_id,assigned_partner_id,partner_parts_confirmation_status,partner_parts_note,scheduled_start_at")
    .eq("id", workOrderId)
    .maybeSingle();
  if (error) throw new Error(error.message);
  if (!work) return { error: NextResponse.json({ error: "Work Order not found." }, { status: 404 }) } as const;
  const { data: vehicle } = await admin.from("mindful_inventory_vehicles").select("id,company_id").eq("id", work.vehicle_id).maybeSingle();
  if (!vehicle || vehicle.company_id !== access.company.companyId) return { error: NextResponse.json({ error: "Work Order is outside the current company." }, { status: 403 }) } as const;
  return { access, admin, work, companyId: vehicle.company_id } as const;
}

export async function GET(_request: Request, context: { params: Promise<{ workOrderId: string }> }) {
  try {
    const { workOrderId } = await context.params;
    const ctx = await ownerContext(workOrderId);
    if ("error" in ctx) return ctx.error;
    const { data, error } = await ctx.admin
      .from("mindful_inventory_history")
      .select("id,event_type,summary,metadata,created_at")
      .eq("vehicle_id", ctx.work.vehicle_id)
      .eq("entity_type", "work_order")
      .eq("entity_id", workOrderId)
      .in("event_type", threadEvents)
      .order("created_at", { ascending: true });
    if (error) throw new Error(error.message);
    const messages = (data || []).map(messageFromHistory);
    if (ctx.work.partner_parts_note && !messages.some((item) => item.message === ctx.work.partner_parts_note)) {
      messages.unshift({ id: `legacy-${workOrderId}`, authorLabel: "Partner", authorRole: "partner" as const, message: ctx.work.partner_parts_note, createdAt: new Date().toISOString() });
    }
    return NextResponse.json({ status: ctx.work.partner_parts_confirmation_status, messages });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Could not load the parts issue." }, { status: 500 });
  }
}

export async function POST(request: Request, context: { params: Promise<{ workOrderId: string }> }) {
  try {
    const { workOrderId } = await context.params;
    const ctx = await ownerContext(workOrderId);
    if ("error" in ctx) return ctx.error;
    const body = await request.json().catch(() => ({}));
    const action = String(body.action || "");
    const message = String(body.message || "").trim().slice(0, 1000);
    const now = new Date().toISOString();

    if (action === "reply") {
      if (!message) return NextResponse.json({ error: "Enter a reply first." }, { status: 400 });
      const { error } = await ctx.admin.from("mindful_inventory_history").insert({
        company_id: ctx.companyId,
        vehicle_id: ctx.work.vehicle_id,
        event_type: "parts_issue_message",
        entity_type: "work_order",
        entity_id: workOrderId,
        actor_user_id: ctx.access.userId,
        summary: "Owner replied to the Partner parts issue.",
        metadata: { scope: "parts_issue", authorRole: "owner", actorLabel: "Mindful", message },
      });
      if (error) throw new Error(error.message);
      return NextResponse.json({ ok: true });
    }

    if (action === "resolve") {
      if (!ctx.work.assigned_partner_id) return NextResponse.json({ error: "This Work Order is not assigned to an external Partner." }, { status: 409 });
      if (message) {
        const { error: replyError } = await ctx.admin.from("mindful_inventory_history").insert({
          company_id: ctx.companyId,
          vehicle_id: ctx.work.vehicle_id,
          event_type: "parts_issue_message",
          entity_type: "work_order",
          entity_id: workOrderId,
          actor_user_id: ctx.access.userId,
          summary: "Owner replied while resolving the Partner parts issue.",
          metadata: { scope: "parts_issue", authorRole: "owner", actorLabel: "Mindful", message },
        });
        if (replyError) throw new Error(replyError.message);
      }
      const { error: updateError } = await ctx.admin.from("mindful_inventory_work_orders").update({ partner_parts_confirmation_status: "reconfirmation_requested", updated_at: now, updated_by: ctx.access.userId }).eq("id", workOrderId);
      if (updateError) throw new Error(updateError.message);
      const { error: historyError } = await ctx.admin.from("mindful_inventory_history").insert({
        company_id: ctx.companyId,
        vehicle_id: ctx.work.vehicle_id,
        event_type: "partner_parts_issue_resolved",
        entity_type: "work_order",
        entity_id: workOrderId,
        actor_user_id: ctx.access.userId,
        summary: "Owner marked the Partner parts issue resolved; Partner reconfirmation is required.",
        metadata: { scope: "parts_issue", authorRole: "system", actorLabel: "Lot Logic" },
      });
      if (historyError) throw new Error(historyError.message);
      return NextResponse.json({ ok: true, status: "reconfirmation_requested" });
    }

    if (action === "reorder" || action === "not_required") {
      const partId = String(body.partId || "");
      if (!partId) return NextResponse.json({ error: "Choose the affected part first." }, { status: 400 });
      const { data: part, error: partError } = await ctx.admin.from("mindful_inventory_work_order_parts").select("id,description,status").eq("id", partId).eq("work_order_id", workOrderId).maybeSingle();
      if (partError) throw new Error(partError.message);
      if (!part) return NextResponse.json({ error: "Part not found on this Work Order." }, { status: 404 });

      if (action === "reorder") {
        const etaValue = String(body.etaAt || "").trim();
        const etaAt = etaValue ? new Date(`${etaValue}T17:00:00`).toISOString() : null;
        const { error: updateError } = await ctx.admin.from("mindful_inventory_work_order_parts").update({
          status: "ordered",
          dependency_resolution: "mindful_sourced",
          dependency_resolved_at: now,
          dependency_resolved_by: ctx.access.userId,
          ordered_at: now,
          eta_at: etaAt,
          received_at: null,
          installed_at: null,
          updated_at: now,
          updated_by: ctx.access.userId,
        }).eq("id", partId).eq("work_order_id", workOrderId);
        if (updateError) throw new Error(updateError.message);
        const scheduleAtRisk = Boolean(etaAt && ctx.work.scheduled_start_at && new Date(etaAt).getTime() > new Date(ctx.work.scheduled_start_at).getTime());
        const { error: historyError } = await ctx.admin.from("mindful_inventory_history").insert({
          company_id: ctx.companyId,
          vehicle_id: ctx.work.vehicle_id,
          event_type: "parts_issue_reorder",
          entity_type: "work_order",
          entity_id: workOrderId,
          actor_user_id: ctx.access.userId,
          summary: `Owner reordered ${part.description}.`,
          metadata: { scope: "parts_issue", authorRole: "system", actorLabel: "Lot Logic", partId, partDescription: part.description, etaAt, scheduleAtRisk },
        });
        if (historyError) throw new Error(historyError.message);
        return NextResponse.json({ ok: true, scheduleAtRisk, etaAt });
      }

      const { error: updateError } = await ctx.admin.from("mindful_inventory_work_order_parts").update({
        status: "cancelled",
        dependency_resolution: "not_required",
        dependency_resolved_at: now,
        dependency_resolved_by: ctx.access.userId,
        updated_at: now,
        updated_by: ctx.access.userId,
      }).eq("id", partId).eq("work_order_id", workOrderId);
      if (updateError) throw new Error(updateError.message);
      const { error: historyError } = await ctx.admin.from("mindful_inventory_history").insert({
        company_id: ctx.companyId,
        vehicle_id: ctx.work.vehicle_id,
        event_type: "parts_issue_not_required",
        entity_type: "work_order",
        entity_id: workOrderId,
        actor_user_id: ctx.access.userId,
        summary: `Owner marked ${part.description} not required while resolving the parts issue.`,
        metadata: { scope: "parts_issue", authorRole: "system", actorLabel: "Lot Logic", partId, partDescription: part.description },
      });
      if (historyError) throw new Error(historyError.message);
      return NextResponse.json({ ok: true });
    }

    return NextResponse.json({ error: "Unsupported parts issue action." }, { status: 400 });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Could not update the parts issue." }, { status: 500 });
  }
}
