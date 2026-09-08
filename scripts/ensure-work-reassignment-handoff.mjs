import { readFileSync, writeFileSync } from "node:fs";

function patchFile(path, patcher, label) {
  let source = readFileSync(path, "utf8");
  const original = source;
  source = patcher(source);
  if (source !== original) {
    writeFileSync(path, source, "utf8");
    console.log(`Added ${label}.`);
  } else {
    console.log(`${label} already present.`);
  }
}

function ownerUiPatch(source) {
  const stateAnchor = `  const [partsWorkOrderId, setPartsWorkOrderId] = useState<string | null>(null);`;
  if (!source.includes("const [reassigningId")) {
    source = source.replace(stateAnchor, `${stateAnchor}\n  const [reassigningId, setReassigningId] = useState<string | null>(null);\n  const [reassignDrafts, setReassignDrafts] = useState<Record<string, string>>({});`);
  }

  const actionAnchor = `{!done && work.status !== "in_progress" && !canStart ? <div className="flex-1 rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-center text-[10px] font-black text-slate-500">Complete setup first</div> : null}`;
  if (!source.includes(`Reassign Work`)) {
    source = source.replace(actionAnchor, `${actionAnchor}\n                    {work.assignedPartnerId && !["in_progress", "complete", "cancelled"].includes(work.status) ? <button type="button" onClick={() => { setReassigningId(reassigningId === work.id ? null : work.id); setReassignDrafts((current) => ({ ...current, [work.id]: current[work.id] || "" })); }} className="flex-1 rounded-lg border border-slate-300 bg-white px-3 py-2 text-[10px] font-black text-slate-600 hover:border-slate-400 hover:text-slate-950">Reassign Work</button> : null}`);
  }

  const rowMessageAnchor = `{rowMessage ? <div className={\`mt-3 rounded-lg border px-3 py-2 text-xs font-bold \${rowMessage.type === "error" ? "border-red-200 bg-red-50 text-red-800" : "border-emerald-200 bg-emerald-50 text-emerald-800"}\`}>{rowMessage.text}</div> : null}`;
  if (!source.includes("Choose a new assignee")) {
    source = source.replace(rowMessageAnchor, `{reassigningId === work.id ? <div className="mt-3 rounded-xl border border-blue-200 bg-blue-50/60 p-3"><div className="text-[10px] font-black uppercase tracking-[0.1em] text-blue-700">Reassign Work</div><div className="mt-1 text-xs font-semibold text-slate-600">Move this job off {work.performerName || "the current partner"}'s plate. Partner-specific quote, schedule, and supply confirmations will be reset; prior evidence stays in History.</div><div className="mt-3 flex flex-col gap-2 sm:flex-row"><select value={reassignDrafts[work.id] || ""} onChange={(event) => setReassignDrafts((current) => ({ ...current, [work.id]: event.target.value }))} className="min-w-0 flex-1 rounded-lg border border-slate-300 bg-white px-3 py-2 text-xs font-bold"><option value="">Choose a new assignee</option>{performerOptions.filter((option) => option.key !== performerKey(work)).map((option) => <option key={option.key} value={option.key}>{option.displayName}</option>)}</select><button type="button" disabled={workingId === work.id || !reassignDrafts[work.id]} onClick={() => void patchWork(work.id, { performerKey: reassignDrafts[work.id] }, `Work reassigned.`).then(() => { setReassigningId(null); setReassignDrafts((current) => { const next = { ...current }; delete next[work.id]; return next; }); })} className="rounded-lg bg-slate-950 px-4 py-2 text-xs font-black text-white disabled:opacity-40">Confirm Reassignment</button><button type="button" onClick={() => setReassigningId(null)} className="rounded-lg border border-slate-300 bg-white px-4 py-2 text-xs font-black text-slate-600">Cancel</button></div></div> : null}\n                ${rowMessageAnchor}`);
  }
  return source;
}

function workOrderRoutePatch(source) {
  const existingSelect = `.select("id,vehicle_id,status,actual_start_at,assigned_partner_id,assigned_user_id,location_id,resource_id,scheduled_start_at,scheduled_end_at,parts_review_status,partner_estimate_status")`;
  if (source.includes(existingSelect)) {
    source = source.replace(existingSelect, `.select("id,vehicle_id,status,actual_start_at,assigned_partner_id,assigned_user_id,location_id,resource_id,scheduled_start_at,scheduled_end_at,parts_review_status,partner_estimate_status,partner_confirmation_status")`);
  }

  const patchAnchor = `    const patch: Record<string, unknown> = { updated_by: access.userId, updated_at: new Date().toISOString() };\n    const metadata: Record<string, unknown> = {};`;
  if (!source.includes("let reassignment = false;")) {
    source = source.replace(patchAnchor, `${patchAnchor}\n    let reassignment = false;\n    let previousPartnerName: string | null = null;\n    let newPartnerName: string | null = null;\n    let newPartnerId: string | null = null;`);
  }

  const partnerAssignmentAnchor = `        patch.assigned_partner_id = partnerId;\n        patch.assigned_user_id = null;`;
  if (!source.includes("newPartnerId = partnerId")) {
    source = source.replace(partnerAssignmentAnchor, `${partnerAssignmentAnchor}\n        newPartnerId = partnerId;\n        newPartnerName = partner.name;\n        reassignment = Boolean(existing.assigned_partner_id && existing.assigned_partner_id !== partnerId);`);
  }

  const internalAssignmentAnchor = `        patch.assigned_user_id = userId;\n        patch.assigned_partner_id = null;\n        metadata.performerName = member.display_name;`;
  if (!source.includes("reassignment = Boolean(existing.assigned_partner_id);")) {
    source = source.replace(internalAssignmentAnchor, `${internalAssignmentAnchor}\n        reassignment = Boolean(existing.assigned_partner_id);`);
  }

  const unassignAnchor = `        patch.assigned_partner_id = null;\n        patch.assigned_user_id = null;\n        patch.location_id = null;`;
  if (!source.includes("reassignment = Boolean(existing.assigned_partner_id);\n        patch.location_id")) {
    source = source.replace(unassignAnchor, `        patch.assigned_partner_id = null;\n        patch.assigned_user_id = null;\n        reassignment = Boolean(existing.assigned_partner_id);\n        patch.location_id = null;`);
  }

  const effectiveAnchor = `    const effectiveHasPerformer = Object.prototype.hasOwnProperty.call(patch, "assigned_partner_id") || Object.prototype.hasOwnProperty.call(patch, "assigned_user_id")`;
  if (!source.includes("if (reassignment) {\n      if (existing.assigned_partner_id)")) {
    source = source.replace(effectiveAnchor, `    if (reassignment) {\n      if (existing.assigned_partner_id) {\n        const { data: previousPartner } = await access.supabase.from("mindful_inventory_partners").select("id,name,company_name").eq("id", existing.assigned_partner_id).maybeSingle();\n        previousPartnerName = previousPartner ? (previousPartner.company_name ? \`${"${previousPartner.name} · ${previousPartner.company_name}"}\` : previousPartner.name) : null;\n      }\n      patch.partner_estimate_status = newPartnerId ? "awaiting_estimate" : "not_required";\n      patch.partner_confirmation_status = null;\n      patch.partner_parts_confirmation_status = null;\n      patch.partner_parts_note = null;\n      patch.partner_location_confirmation_status = null;\n      patch.partner_location_request = null;\n      patch.partner_completion_notes = null;\n      metadata.reassignment = true;\n      metadata.previousPartnerName = previousPartnerName;\n      metadata.newPartnerId = newPartnerId;\n      metadata.newPartnerName = newPartnerName || (patch.assigned_user_id ? metadata.performerName : null);\n    }\n\n${effectiveAnchor}`);
  }

  const afterUpdateAnchor = `    if (updateError) return NextResponse.json({ error: updateError.message }, { status: 500 });`;
  if (!source.includes("Reset unresolved partner-supplied parts")) {
    source = source.replace(afterUpdateAnchor, `${afterUpdateAnchor}\n\n    if (reassignment) {\n      // Reset unresolved partner-supplied parts so the new assignee must confirm responsibility.\n      const { error: resetPartsError } = await access.supabase\n        .from("mindful_inventory_work_order_parts")\n        .update({ dependency_resolution: null, dependency_resolved_at: null })\n        .eq("work_order_id", workOrderId)\n        .eq("dependency_resolution", "partner_supplied")\n        .not("status", "in", '("received","installed")');\n      if (resetPartsError) throw new Error(resetPartsError.message);\n    }`);
  }

  const setupHistoryAnchor = `        event_type: "work_order_assignment_changed",`;
  if (source.includes(setupHistoryAnchor) && !source.includes(`event_type: reassignment ? "work_order_reassigned"`)) {
    source = source.replace(setupHistoryAnchor, `        event_type: reassignment ? "work_order_reassigned" : "work_order_assignment_changed",`);
  }
  const setupSummaryAnchor = `        summary: metadata.scheduleCleared ? "Work Order setup changed; previous schedule cleared for revalidation." : "Work Order execution assignment updated.",`;
  if (source.includes(setupSummaryAnchor)) {
    source = source.replace(setupSummaryAnchor, `        summary: reassignment ? \`Work reassigned from ${"${previousPartnerName || \"previous partner\"}"} to ${"${newPartnerName || metadata.performerName || \"new assignee\"}"}.\` : metadata.scheduleCleared ? "Work Order setup changed; previous schedule cleared for revalidation." : "Work Order execution assignment updated.",`);
  }
  return source;
}

function partnerWorkDataPatch(source) {
  if (!source.includes("export type PartnerReassignedWorkItem")) {
    source = source.replace(`export type PartnerWorkItem = {`, `export type PartnerReassignedWorkItem = {\n  id: string;\n  workOrderId: string;\n  title: string;\n  vehicleLabel: string;\n  reassignedAt: string;\n  reassignedToName: string | null;\n};\n\nexport type PartnerWorkItem = {`);
  }

  if (!source.includes("export async function getPartnerReassignedWork")) {
    source += `\n\nexport async function getPartnerReassignedWork(access: PartnerPortalAccess): Promise<PartnerReassignedWorkItem[]> {\n  if (!access.permissions.viewAssignedWork) return [];\n  const admin = createSupabaseAdminClient();\n  const { data: events, error: historyError } = await admin\n    .from("mindful_inventory_history")\n    .select("entity_id,vehicle_id,metadata,created_at")\n    .eq("company_id", access.partner.companyId)\n    .eq("entity_type", "work_order")\n    .eq("event_type", "work_order_reassigned")\n    .order("created_at", { ascending: false })\n    .limit(100);\n  if (historyError) throw new Error(historyError.message);\n  const relevant = (events || []).filter((event) => {\n    const metadata = event.metadata && typeof event.metadata === "object" && !Array.isArray(event.metadata) ? event.metadata as Record<string, unknown> : {};\n    return String(metadata.previousPartnerId || "") === access.partner.id;\n  });\n  if (!relevant.length) return [];\n\n  const latestByWork = new Map<string, NonNullable<typeof relevant>[number]>();\n  for (const event of relevant) if (event.entity_id && !latestByWork.has(event.entity_id)) latestByWork.set(event.entity_id, event);\n  const workIds = [...latestByWork.keys()];\n  const { data: workOrders, error: workError } = await admin.from("mindful_inventory_work_orders").select("id,title,vehicle_id,assigned_partner_id").in("id", workIds);\n  if (workError) throw new Error(workError.message);\n  const historicalWork = (workOrders || []).filter((work) => work.assigned_partner_id !== access.partner.id);\n  if (!historicalWork.length) return [];\n  const vehicleIds = [...new Set(historicalWork.map((work) => work.vehicle_id))];\n  const { data: vehicles, error: vehicleError } = await admin.from("mindful_inventory_vehicles").select("id,year,make,model,trim").eq("company_id", access.partner.companyId).in("id", vehicleIds);\n  if (vehicleError) throw new Error(vehicleError.message);\n  const vehicleMap = new Map((vehicles || []).map((vehicle) => [vehicle.id, vehicleLabel(vehicle)]));\n  return historicalWork.flatMap((work) => {\n    const event = latestByWork.get(work.id);\n    if (!event) return [];\n    const metadata = event.metadata && typeof event.metadata === "object" && !Array.isArray(event.metadata) ? event.metadata as Record<string, unknown> : {};\n    return [{\n      id: \`${"${work.id}:${event.created_at}"}\`,\n      workOrderId: work.id,\n      title: work.title,\n      vehicleLabel: vehicleMap.get(work.vehicle_id) || "Vehicle",\n      reassignedAt: event.created_at,\n      reassignedToName: metadata.newPartnerName ? String(metadata.newPartnerName) : null,\n    } satisfies PartnerReassignedWorkItem];\n  });\n}\n`;
  }
  return source;
}

function partnerPagePatch(source) {
  source = source.replace(`import { getPartnerAssignedWork } from "@/lib/partner-portal/work";`, `import { getPartnerAssignedWork, getPartnerReassignedWork } from "@/lib/partner-portal/work";`);
  const loadAnchor = `  const [workResult, detailingResult, inspectionResult] = await Promise.all([`;
  if (!source.includes("reassignedResult")) {
    source = source.replace(loadAnchor, `  const [workResult, reassignedResult, detailingResult, inspectionResult] = await Promise.all([`);
    source = source.replace(`    safeLoad("Assigned work", () => getPartnerAssignedWork(access), []),\n    safeLoad("Detailing assignments"`, `    safeLoad("Assigned work", () => getPartnerAssignedWork(access), []),\n    safeLoad("Reassigned work", () => getPartnerReassignedWork(access), []),\n    safeLoad("Detailing assignments"`);
    source = source.replace(`  const workItems = workResult.data;\n  const detailingItems`, `  const workItems = workResult.data;\n  const reassignedItems = reassignedResult.data;\n  const detailingItems`);
    source = source.replace(`  const loadErrors = [workResult.error, detailingResult.error, inspectionResult.error]`, `  const loadErrors = [workResult.error, reassignedResult.error, detailingResult.error, inspectionResult.error]`);
  }

  const boardAnchor = `      <PartnerWorkGroupedV2 workItems={workItems} permissions={access.permissions} />`;
  if (!source.includes("No longer assigned")) {
    source = source.replace(boardAnchor, `${boardAnchor}\n      {reassignedItems.length ? <details className="mt-5 overflow-hidden rounded-2xl border border-slate-200 bg-slate-100/70"><summary className="cursor-pointer list-none px-4 py-3 text-xs font-black uppercase tracking-[0.08em] text-slate-500">No longer assigned ({reassignedItems.length})</summary><div className="border-t border-slate-200 bg-white/60">{reassignedItems.map((item) => <div key={item.id} className="flex flex-col gap-1 border-b border-slate-200 px-4 py-3 opacity-70 last:border-b-0 sm:flex-row sm:items-center sm:justify-between"><div><div className="flex items-center gap-2"><span className="rounded-full bg-slate-200 px-2 py-1 text-[9px] font-black uppercase text-slate-600">Reassigned</span><span className="text-sm font-black text-slate-700">{item.title}</span></div><div className="mt-1 text-xs font-semibold text-slate-500">{item.vehicleLabel}</div></div><div className="text-xs font-semibold text-slate-500">{item.reassignedToName ? `Reassigned to ${"${item.reassignedToName}"}` : "Reassigned by Mindful Motor Co."} · {new Date(item.reassignedAt).toLocaleString("en-US", { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" })}</div></div>)}</div></details> : null}`);
  }
  return source;
}

patchFile("components/mindful-inventory/inventory-active-work-v6.tsx", ownerUiPatch, "Owner reassignment controls");
patchFile("app/api/mindful/inventory/work-orders/[workOrderId]/route.ts", workOrderRoutePatch, "reassignment handoff semantics");
patchFile("lib/partner-portal/work.ts", partnerWorkDataPatch, "partner reassignment history data");
patchFile("app/partner/work/page.tsx", partnerPagePatch, "partner reassignment history UI");
