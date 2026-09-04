import { NextResponse } from "next/server";

import { normalizePartSearchesWithAi } from "@/lib/ai/part-search";
import { buildPartSearchSources } from "@/lib/mindful-inventory/part-suggestions";
import { requirePartnerPortalAccess } from "@/lib/partner-portal/access";
import { createSupabaseAdminClient } from "@/lib/supabase/server";

function optionalText(value: unknown) {
  const text = String(value ?? "").trim();
  return text || null;
}
function optionalNumber(value: unknown) {
  if (value === null || value === undefined || value === "") return null;
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed < 0) throw new Error("Price must be a non-negative number.");
  return parsed;
}

async function assignedWorkIds(admin: ReturnType<typeof createSupabaseAdminClient>, partnerId: string) {
  const { data, error } = await admin
    .from("mindful_inventory_work_orders")
    .select("id,title,description,category,vehicle_id")
    .eq("assigned_partner_id", partnerId)
    .not("status", "in", '("complete","cancelled")');
  if (error) throw new Error(error.message);
  return data || [];
}

export async function GET() {
  try {
    const access = await requirePartnerPortalAccess();
    const admin = createSupabaseAdminClient();
    const works = await assignedWorkIds(admin, access.partner.id);
    if (!works.length) return NextResponse.json({ items: [], workOrders: [] });
    const workIds = works.map((work) => work.id);
    const vehicleIds = [...new Set(works.map((work) => work.vehicle_id))];

    const [requirementsResult, vehiclesResult] = await Promise.all([
      admin.from("mindful_inventory_part_requirements")
        .select("id,work_order_id,description,quantity,part_number,requirement_status,partner_offer_unit_price,partner_offer_note,fulfillment_method,sourcing_owner,owner_target_unit_price_low,owner_target_unit_price_high,owner_decision_note,linked_part_id,created_at")
        .in("work_order_id", workIds)
        .order("created_at", { ascending: true }),
      admin.from("mindful_inventory_vehicles").select("id,year,make,model,trim").in("id", vehicleIds),
    ]);
    if (requirementsResult.error) throw new Error(requirementsResult.error.message);
    if (vehiclesResult.error) throw new Error(vehiclesResult.error.message);

    const requirementIds = (requirementsResult.data || []).map((row) => row.id);
    const { data: messages, error: messagesError } = requirementIds.length
      ? await admin.from("mindful_inventory_part_requirement_messages").select("id,requirement_id,actor_type,message_type,body,unit_price,source_url,created_at").in("requirement_id", requirementIds).order("created_at", { ascending: true })
      : { data: [], error: null };
    if (messagesError) throw new Error(messagesError.message);

    const workById = new Map(works.map((row) => [row.id, row]));
    const vehicleById = new Map((vehiclesResult.data || []).map((row) => [row.id, row]));
    const messagesByRequirement = new Map<string, typeof messages>();
    for (const message of messages || []) {
      const list = messagesByRequirement.get(message.requirement_id) || [];
      list.push(message);
      messagesByRequirement.set(message.requirement_id, list);
    }

    const items = (requirementsResult.data || []).map((row) => {
      const work = workById.get(row.work_order_id);
      const vehicle = work ? vehicleById.get(work.vehicle_id) : null;
      return {
        ...row,
        workTitle: work?.title || "Work Order",
        vehicleLabel: vehicle ? [vehicle.year, vehicle.make, vehicle.model, vehicle.trim].filter(Boolean).join(" ") : "Vehicle",
        messages: messagesByRequirement.get(row.id) || [],
      };
    });

    const workOrders = works.map((work) => {
      const vehicle = vehicleById.get(work.vehicle_id);
      return {
        id: work.id,
        title: work.title,
        description: work.description,
        category: work.category,
        vehicleLabel: vehicle ? [vehicle.year, vehicle.make, vehicle.model, vehicle.trim].filter(Boolean).join(" ") : "Vehicle",
      };
    });

    return NextResponse.json({ items, workOrders });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Could not load parts conversations." }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    const access = await requirePartnerPortalAccess();
    const admin = createSupabaseAdminClient();
    const body = await request.json().catch(() => ({})) as Record<string, unknown>;
    const action = String(body.action || "").trim();
    const works = await assignedWorkIds(admin, access.partner.id);
    const workIds = new Set(works.map((work) => work.id));

    if (action === "ai_suggest") {
      const workOrderId = String(body.workOrderId || "").trim();
      const work = works.find((item) => item.id === workOrderId);
      if (!work) return NextResponse.json({ error: "Choose an assigned Work Order." }, { status: 400 });
      const { data: vehicle, error: vehicleError } = await admin
        .from("mindful_inventory_vehicles")
        .select("year,make,model,trim")
        .eq("id", work.vehicle_id)
        .single();
      if (vehicleError) throw new Error(vehicleError.message);
      const fitmentLabel = [vehicle.year, vehicle.make, vehicle.model, vehicle.trim].filter(Boolean).join(" ");
      const sourceText = [work.title, work.description, work.category].filter(Boolean).join(" ");
      const normalized = await normalizePartSearchesWithAi([{
        workOrderId: work.id,
        workOrderTitle: sourceText || work.title,
        partName: work.title,
        fitmentLabel,
      }]);
      const result = normalized[0];
      if (!result) return NextResponse.json({ items: [] });
      const candidates = (result.recommendedParts.length ? result.recommendedParts : [{ name: result.partName, need: "possible" as const, searchQuery: result.searchQuery }])
        .slice(0, 5)
        .map((part) => ({
          name: part.name,
          need: part.need,
          searchQuery: part.searchQuery,
          sources: buildPartSearchSources(part.searchQuery),
        }));
      return NextResponse.json({ items: candidates });
    }

    if (action === "suggest") {
      const workOrderId = String(body.workOrderId || "").trim();
      const description = String(body.description || "").trim();
      if (!workIds.has(workOrderId) || !description) return NextResponse.json({ error: "Choose an assigned Work Order and enter the part." }, { status: 400 });
      const work = works.find((item) => item.id === workOrderId)!;
      const vehicleId = work.vehicle_id;
      const { data: vehicle, error: vehicleError } = await admin.from("mindful_inventory_vehicles").select("company_id").eq("id", vehicleId).single();
      if (vehicleError) throw new Error(vehicleError.message);
      const quantity = Number(body.quantity || 1);
      const offer = optionalNumber(body.unitPrice);
      const note = optionalText(body.note);
      const sourceUrl = optionalText(body.sourceUrl);
      const { data: requirement, error } = await admin.from("mindful_inventory_part_requirements").insert({
        company_id: vehicle.company_id,
        vehicle_id: vehicleId,
        work_order_id: workOrderId,
        description,
        quantity: Number.isFinite(quantity) && quantity > 0 ? quantity : 1,
        part_number: optionalText(body.partNumber),
        fitment_query: optionalText(body.fitmentQuery),
        origin: body.origin === "ai" ? "ai" : "mechanic",
        requirement_status: "suggested",
        suggested_by_partner_id: access.partner.id,
        partner_offer_unit_price: offer,
        partner_offer_note: note,
        blocking: true,
      }).select("id").single();
      if (error) throw new Error(error.message);
      await admin.from("mindful_inventory_part_requirement_messages").insert({
        requirement_id: requirement.id,
        actor_type: "partner",
        actor_user_id: access.userId,
        actor_partner_id: access.partner.id,
        message_type: offer !== null ? "offer" : "note",
        body: note || `${access.partner.name} suggested ${description}.`,
        unit_price: offer,
        source_url: sourceUrl,
      });
      return NextResponse.json({ id: requirement.id });
    }

    const requirementId = String(body.requirementId || "").trim();
    const { data: requirement, error: requirementError } = await admin.from("mindful_inventory_part_requirements").select("id,work_order_id").eq("id", requirementId).maybeSingle();
    if (requirementError) throw new Error(requirementError.message);
    if (!requirement || !workIds.has(requirement.work_order_id)) return NextResponse.json({ error: "Part requirement is not assigned to this partner." }, { status: 403 });

    if (action === "offer") {
      const unitPrice = optionalNumber(body.unitPrice);
      const note = optionalText(body.note);
      if (unitPrice === null && !note) return NextResponse.json({ error: "Enter a price or sourcing note." }, { status: 400 });
      const { error: updateError } = await admin.from("mindful_inventory_part_requirements").update({
        suggested_by_partner_id: access.partner.id,
        partner_offer_unit_price: unitPrice,
        partner_offer_note: note,
        updated_at: new Date().toISOString(),
      }).eq("id", requirement.id);
      if (updateError) throw new Error(updateError.message);
      const { error: messageError } = await admin.from("mindful_inventory_part_requirement_messages").insert({
        requirement_id: requirement.id,
        actor_type: "partner",
        actor_user_id: access.userId,
        actor_partner_id: access.partner.id,
        message_type: "offer",
        body: note || `I can supply this part for ${unitPrice === null ? "the noted price" : `$${unitPrice}`}.`,
        unit_price: unitPrice,
        source_url: optionalText(body.sourceUrl),
      });
      if (messageError) throw new Error(messageError.message);
      return NextResponse.json({ ok: true });
    }

    if (action === "message") {
      const note = optionalText(body.note);
      if (!note) return NextResponse.json({ error: "Enter a message." }, { status: 400 });
      const { error } = await admin.from("mindful_inventory_part_requirement_messages").insert({
        requirement_id: requirement.id,
        actor_type: "partner",
        actor_user_id: access.userId,
        actor_partner_id: access.partner.id,
        message_type: optionalText(body.sourceUrl) ? "source" : "note",
        body: note,
        unit_price: optionalNumber(body.unitPrice),
        source_url: optionalText(body.sourceUrl),
      });
      if (error) throw new Error(error.message);
      return NextResponse.json({ ok: true });
    }

    return NextResponse.json({ error: "Unsupported parts conversation action." }, { status: 400 });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Could not update parts conversation." }, { status: 500 });
  }
}
