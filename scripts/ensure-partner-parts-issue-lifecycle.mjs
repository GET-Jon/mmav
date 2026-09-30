import { readFileSync, writeFileSync } from "node:fs";

function patch(path, transform, label) {
  let source = readFileSync(path, "utf8");
  const original = source;
  source = transform(source);
  if (source !== original) {
    writeFileSync(path, source, "utf8");
    console.log(`Aligned ${label}.`);
  } else {
    console.log(`${label} already aligned.`);
  }
}

function replaceOnce(source, oldText, newText) {
  if (source.includes(newText)) return source;
  if (!source.includes(oldText)) return source;
  return source.replace(oldText, newText);
}

// Owner data model: carry Partner parts confirmation state and note into Active Work.
patch("lib/mindful-inventory/active-work.ts", (source) => {
  source = replaceOnce(
    source,
    `  partnerEstimateStatus: string | null;\n  scheduleSource: "suggested" | "manual" | null;`,
    `  partnerEstimateStatus: string | null;\n  partnerPartsConfirmationStatus: string | null;\n  partnerPartsNote: string | null;\n  scheduleSource: "suggested" | "manual" | null;`,
  );
  source = source.replace(
    `partner_confirmation_status,partner_estimate_status,schedule_source`,
    `partner_confirmation_status,partner_estimate_status,partner_parts_confirmation_status,partner_parts_note,schedule_source`,
  );
  source = replaceOnce(
    source,
    `      partnerEstimateStatus: row.partner_estimate_status || null,\n      scheduleSource: row.schedule_source as "suggested" | "manual" | null,`,
    `      partnerEstimateStatus: row.partner_estimate_status || null,\n      partnerPartsConfirmationStatus: row.partner_parts_confirmation_status || null,\n      partnerPartsNote: row.partner_parts_note || null,\n      scheduleSource: row.schedule_source as "suggested" | "manual" | null,`,
  );
  return source;
}, "Owner Active Work Partner-parts data");

// Owner command center: an issue is a first-class attention state, and the Parts tile says so.
patch("components/mindful-inventory/inventory-active-work-v6.tsx", (source) => {
  source = replaceOnce(
    source,
    `  if (!work.partsReviewComplete) return "Review required parts";`,
    `  if (work.partnerPartsConfirmationStatus === "issue_reported") return "Partner reported a parts issue";\n  if (work.partnerPartsConfirmationStatus === "reconfirmation_requested") return "Waiting for Partner to reconfirm updated parts";\n  if (!work.partsReviewComplete) return "Review required parts";`,
  );
  source = replaceOnce(
    source,
    `  if (!work.partsReviewComplete) return { label: "Needs Parts", cls: "bg-amber-100 text-amber-800" };`,
    `  if (work.partnerPartsConfirmationStatus === "issue_reported") return { label: "Parts Issue", cls: "bg-red-100 text-red-800" };\n  if (work.partnerPartsConfirmationStatus === "reconfirmation_requested") return { label: "Parts Recheck", cls: "bg-amber-100 text-amber-800" };\n  if (!work.partsReviewComplete) return { label: "Needs Parts", cls: "bg-amber-100 text-amber-800" };`,
  );

  source = source.replaceAll(
    `detail={work.partsReviewComplete ? (work.partsReadyForExecution ? (jobParts.length ? "Ready" : "None required") : \`${'${work.pendingPartCount}'} pending\`) : "Review"}`,
    `detail={work.partnerPartsConfirmationStatus === "issue_reported" ? "Partner issue" : work.partnerPartsConfirmationStatus === "reconfirmation_requested" ? "Awaiting reconfirmation" : work.partsReviewComplete ? (work.partsReadyForExecution ? (jobParts.length ? "Ready" : "None required") : \`${'${work.pendingPartCount}'} pending\`) : "Review"}`,
  );

  source = source.replace(
    `suggestion={modalSuggestion} parts={parts} open onClose={() => setPartsWorkOrderId(null)} />`,
    `suggestion={modalSuggestion} parts={parts} partnerName={modalWork.performerName} partnerPartsConfirmationStatus={modalWork.partnerPartsConfirmationStatus} partnerPartsNote={modalWork.partnerPartsNote} open onClose={() => setPartsWorkOrderId(null)} />`,
  );
  return source;
}, "Owner command-center Partner parts issue state");

// Owner Parts modal: surface the Partner report and require an explicit Owner resolution.
patch("components/mindful-inventory/work-order-parts-modal.tsx", (source) => {
  source = replaceOnce(source, `import { InventoryPartSuggestionsV4 }`, `import { useState } from "react";\nimport { useRouter } from "next/navigation";\n\nimport { InventoryPartSuggestionsV4 }`);
  source = source.replace(
    `export function WorkOrderPartsModal({ vehicleId, workOrderId, workOrderTitle: _workOrderTitle, suggestion, parts, open, onClose }: {`,
    `export function WorkOrderPartsModal({ vehicleId, workOrderId, workOrderTitle: _workOrderTitle, suggestion, parts, partnerName, partnerPartsConfirmationStatus, partnerPartsNote, open, onClose }: {`,
  );
  source = replaceOnce(
    source,
    `  parts: InventoryPartView[];\n  open: boolean;`,
    `  parts: InventoryPartView[];\n  partnerName?: string | null;\n  partnerPartsConfirmationStatus?: string | null;\n  partnerPartsNote?: string | null;\n  open: boolean;`,
  );
  source = replaceOnce(
    source,
    `  if (!open) return null;\n\n  const workOrderParts = parts.filter((part) => part.workOrderId === workOrderId);`,
    `  const router = useRouter();\n  const [resolving, setResolving] = useState(false);\n  const [resolutionError, setResolutionError] = useState<string | null>(null);\n  if (!open) return null;\n\n  const workOrderParts = parts.filter((part) => part.workOrderId === workOrderId);\n  const issueReported = partnerPartsConfirmationStatus === "issue_reported";\n  const awaitingReconfirmation = partnerPartsConfirmationStatus === "reconfirmation_requested";\n\n  async function resolvePartnerIssue() {\n    setResolving(true);\n    setResolutionError(null);\n    try {\n      const response = await fetch(\`/api/mindful/inventory/work-orders/\${workOrderId}\`, {\n        method: "PATCH",\n        headers: { "Content-Type": "application/json" },\n        body: JSON.stringify({ resolvePartnerPartsIssue: true }),\n      });\n      const payload = await response.json().catch(() => ({}));\n      if (!response.ok) throw new Error(payload.error || "Could not resolve the Partner parts issue.");\n      router.refresh();\n    } catch (error) {\n      setResolutionError(error instanceof Error ? error.message : "Could not resolve the Partner parts issue.");\n    } finally {\n      setResolving(false);\n    }\n  }`,
  );
  source = replaceOnce(
    source,
    `        <div className="p-4 sm:p-5">\n          <InventoryPartSuggestionsV4`,
    `        <div className="p-4 sm:p-5">\n          {issueReported ? <div className="mb-4 rounded-xl border border-red-200 bg-red-50 p-4"><div className="text-[10px] font-black uppercase tracking-[0.1em] text-red-700">Partner parts issue</div><div className="mt-1 text-sm font-black text-red-950">{partnerName || "The assigned Partner"} reported a problem with the parts plan.</div>{partnerPartsNote ? <div className="mt-2 rounded-lg bg-white px-3 py-2 text-sm font-semibold text-slate-700">“{partnerPartsNote}”</div> : null}<div className="mt-3 text-xs font-semibold text-red-900">Update the affected part or sourcing information below. When the correction is complete, mark the issue resolved so the Partner can reconfirm the revised plan.</div><div className="mt-3"><button type="button" disabled={resolving} onClick={() => void resolvePartnerIssue()} className="rounded-lg bg-slate-950 px-4 py-2 text-xs font-black text-white disabled:opacity-50">{resolving ? "Resolving…" : "Mark issue resolved"}</button></div>{resolutionError ? <div className="mt-2 text-xs font-bold text-red-700">{resolutionError}</div> : null}</div> : awaitingReconfirmation ? <div className="mb-4 rounded-xl border border-amber-200 bg-amber-50 p-4"><div className="text-[10px] font-black uppercase tracking-[0.1em] text-amber-700">Awaiting Partner reconfirmation</div><div className="mt-1 text-sm font-black text-amber-950">The Owner marked the reported parts issue resolved. {partnerName || "The assigned Partner"} must reconfirm the updated parts plan.</div>{partnerPartsNote ? <div className="mt-2 text-xs font-semibold text-amber-900">Original report: “{partnerPartsNote}”</div> : null}</div> : null}\n          <InventoryPartSuggestionsV4`,
  );
  return source;
}, "Owner Parts issue modal");

// Partner UI: keep the submitted issue visible until the Owner resolves it; then ask for reconfirmation.
patch("components/partner/partner-work-list-v4.tsx", (source) => {
  source = replaceOnce(
    source,
    `    const partsConfirmed = work.partnerPartsConfirmationStatus === "confirmed";`,
    `    const partsConfirmed = work.partnerPartsConfirmationStatus === "confirmed";\n    const partsIssueReported = work.partnerPartsConfirmationStatus === "issue_reported";\n    const partsReconfirmationRequested = work.partnerPartsConfirmationStatus === "reconfirmation_requested";`,
  );
  source = source.replace(
    `const currentAction = needsEstimate ? "Submit your labor estimate" : estimateStatus === "awaiting_review" ? "Waiting for estimate approval" : !partsConfirmed ? "Confirm the parts plan"`,
    `const currentAction = needsEstimate ? "Submit your labor estimate" : estimateStatus === "awaiting_review" ? "Waiting for estimate approval" : partsIssueReported ? "Parts issue sent to Mindful · awaiting resolution" : partsReconfirmationRequested ? "Review the updated parts plan and reconfirm" : !partsConfirmed ? "Confirm the parts plan"`,
  );

  source = source.replace(
    `{partsConfirmed ? "✓ Parts plan confirmed" : "Confirm the parts are correct."}`,
    `{partsConfirmed ? "✓ Parts plan confirmed" : partsIssueReported ? "Issue reported · Mindful has been notified." : partsReconfirmationRequested ? "Mindful updated the parts plan · please reconfirm." : "Confirm the parts are correct."}`,
  );
  source = source.replace(
    `{!partsConfirmed ? <button disabled={workingId === work.id} onClick={() => void updateLogistics(work, "parts", "confirm")}`,
    `{!partsConfirmed && !partsIssueReported ? <button disabled={workingId === work.id} onClick={() => void updateLogistics(work, "parts", "confirm")}`,
  );

  const partsEnd = `</div> : null}</div>\n\n          <div className="rounded-xl border border-slate-200 p-4"><div className="flex items-start justify-between gap-3"><div><div className="text-[10px] font-black uppercase tracking-[0.1em] text-slate-400">3 · Location</div>`;
  if (source.includes(partsEnd) && !source.includes("Your reported parts issue")) {
    source = source.replace(
      partsEnd,
      `</div> : null}{partsIssueReported ? <div className="mt-3 rounded-lg border border-red-200 bg-red-50 px-3 py-3"><div className="text-[10px] font-black uppercase tracking-[0.08em] text-red-700">Your reported parts issue</div><div className="mt-1 text-sm font-bold text-red-950">{work.partnerPartsNote || "Parts issue reported to Mindful."}</div><div className="mt-1 text-xs font-semibold text-red-800">This stays open until Mindful resolves the issue.</div></div> : partsReconfirmationRequested ? <div className="mt-3 rounded-lg border border-amber-200 bg-amber-50 px-3 py-3"><div className="text-[10px] font-black uppercase tracking-[0.08em] text-amber-700">Parts updated by Mindful</div><div className="mt-1 text-sm font-bold text-amber-950">Review the revised parts plan above, then confirm it when correct.</div>{work.partnerPartsNote ? <div className="mt-1 text-xs font-semibold text-amber-800">Your original report: {work.partnerPartsNote}</div> : null}</div> : null}</div>\n\n          <div className="rounded-xl border border-slate-200 p-4"><div className="flex items-start justify-between gap-3"><div><div className="text-[10px] font-black uppercase tracking-[0.1em] text-slate-400">3 · Location</div>`,
    );
  }
  return source;
}, "Partner persistent parts issue state");

// Partner logistics endpoint: persist an auditable lifecycle event for reports and confirmations.
patch("app/api/partner/work-orders/[workOrderId]/logistics/route.ts", (source) => {
  source = source.replace(
    `.select("id,assigned_partner_id,status")`,
    `.select("id,vehicle_id,assigned_partner_id,status")`,
  );
  source = source.replace(
    `.select("id,user_id,active")`,
    `.select("id,user_id,active,company_id,name")`,
  );
  if (!source.includes('event_type: kind === "parts"')) {
    source = source.replace(
      `    if (updateError) throw new Error(updateError.message);\n\n    return NextResponse.json({ ok: true, kind, status: action === "confirm" ? "confirmed" : "adjustment_requested" });`,
      `    if (updateError) throw new Error(updateError.message);\n\n    await admin.from("mindful_inventory_history").insert({\n      company_id: partner.company_id,\n      vehicle_id: work.vehicle_id,\n      event_type: kind === "parts" ? (action === "confirm" ? "partner_parts_confirmed" : "partner_parts_issue_reported") : (action === "confirm" ? "partner_location_confirmed" : "partner_location_change_requested"),\n      entity_type: "work_order",\n      entity_id: workOrderId,\n      actor_user_id: user.id,\n      summary: kind === "parts" ? (action === "confirm" ? "Partner confirmed the parts plan." : "Partner reported a parts issue.") : (action === "confirm" ? "Partner confirmed the work location." : "Partner requested a location change."),\n      metadata: { partnerId: partner.id, partnerName: partner.name, note },\n    });\n\n    return NextResponse.json({ ok: true, kind, status: action === "confirm" ? "confirmed" : "adjustment_requested" });`,
    );
  }
  return source;
}, "Partner logistics History");

// Owner work-order endpoint: explicit issue resolution moves the lifecycle into Partner reconfirmation.
patch("app/api/mindful/inventory/work-orders/[workOrderId]/route.ts", (source) => {
  source = replaceOnce(
    source,
    `    const blockerReason = String(body.blockerReason || "").trim() || null;`,
    `    const blockerReason = String(body.blockerReason || "").trim() || null;\n    const resolvePartnerPartsIssue = body.resolvePartnerPartsIssue === true;`,
  );
  source = source.replace(
    `if (!requestedStatus && performerKey === undefined && !locationProvided && !resourceProvided)`,
    `if (!requestedStatus && performerKey === undefined && !locationProvided && !resourceProvided && !resolvePartnerPartsIssue)`,
  );
  source = replaceOnce(
    source,
    `    const metadata: Record<string, unknown> = {};`,
    `    const metadata: Record<string, unknown> = {};\n\n    if (resolvePartnerPartsIssue) {\n      if (!existing.assigned_partner_id) return NextResponse.json({ error: "This Work Order is not assigned to an external Partner." }, { status: 409 });\n      patch.partner_parts_confirmation_status = "reconfirmation_requested";\n    }`,
  );
  if (!source.includes('event_type: "partner_parts_issue_resolved"')) {
    source = source.replace(
      `    if (requestedStatus) {\n      await access.supabase.from("mindful_inventory_history").insert({`,
      `    if (resolvePartnerPartsIssue) {\n      await access.supabase.from("mindful_inventory_history").insert({\n        company_id: access.company.companyId,\n        vehicle_id: existing.vehicle_id,\n        event_type: "partner_parts_issue_resolved",\n        entity_type: "work_order",\n        entity_id: workOrderId,\n        actor_user_id: access.userId,\n        summary: "Owner marked the Partner-reported parts issue resolved; Partner reconfirmation requested.",\n        metadata: { partnerId: existing.assigned_partner_id },\n      });\n    }\n\n    if (requestedStatus) {\n      await access.supabase.from("mindful_inventory_history").insert({`,
    );
  }
  return source;
}, "Owner Partner-parts issue resolution");
