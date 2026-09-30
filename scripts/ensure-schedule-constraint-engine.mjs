import { readFileSync, writeFileSync } from "node:fs";

function patch(path, transform) {
  const source = readFileSync(path, "utf8");
  const updated = transform(source);
  if (updated !== source) {
    writeFileSync(path, updated, "utf8");
    return true;
  }
  return false;
}

function replaceOnce(source, before, after) {
  return source.includes(before) ? source.replace(before, after) : source;
}

const ETA_BUFFER_MINUTES = 120;
let changed = false;

for (const path of [
  "app/api/mindful/inventory/work-orders/[workOrderId]/availability/route.ts",
  "app/api/partner/work-orders/[workOrderId]/availability/route.ts",
]) {
  changed = patch(path, (source) => {
    let updated = source;
    updated = replaceOnce(
      updated,
      "    const etaFloor = parts.latestEtaAt ? new Date(parts.latestEtaAt).getTime() : null;",
      `    const etaRaw = parts.latestEtaAt ? new Date(parts.latestEtaAt).getTime() : null;\n    const etaFloor = etaRaw !== null && Number.isFinite(etaRaw) ? etaRaw + ${ETA_BUFFER_MINUTES} * 60_000 : null;`,
    );
    updated = updated.replaceAll(
      '"suggestions begin after the latest known parts ETA"',
      '"suggestions begin after the latest known parts ETA + 2 hr receiving buffer"',
    );
    updated = updated.replaceAll(
      '"parts readiness unknown"',
      '"parts ETA unknown · suggestions use known availability constraints only"',
    );
    return updated;
  }) || changed;
}

changed = patch("lib/mindful-inventory/schedule.ts", (source) => {
  let updated = source;
  if (!updated.includes("proposedStartAt: string | null;")) {
    updated = replaceOnce(
      updated,
      "  scheduledEndAt: string | null;\n",
      "  scheduledEndAt: string | null;\n  proposedStartAt: string | null;\n  proposedEndAt: string | null;\n  partnerConfirmationStatus: string | null;\n",
    );
  }
  if (!updated.includes("partnerPartsConfirmationStatus: string | null;")) {
    updated = replaceOnce(
      updated,
      "  partsReadyForExecution: boolean;\n",
      "  partsReadyForExecution: boolean;\n  partnerPartsConfirmationStatus: string | null;\n",
    );
  }
  updated = updated.replace(
    "scheduled_start_at,scheduled_end_at,actual_start_at,actual_end_at,assigned_partner_id,assigned_user_id,location_id,resource_id,schedule_source",
    "scheduled_start_at,scheduled_end_at,proposed_start_at,proposed_end_at,partner_confirmation_status,partner_parts_confirmation_status,actual_start_at,actual_end_at,assigned_partner_id,assigned_user_id,location_id,resource_id,schedule_source",
  );
  if (!updated.includes("proposedStartAt: work.proposed_start_at")) {
    updated = replaceOnce(
      updated,
      "        scheduledEndAt: work.scheduled_end_at,\n",
      "        scheduledEndAt: work.scheduled_end_at,\n        proposedStartAt: work.proposed_start_at || null,\n        proposedEndAt: work.proposed_end_at || null,\n        partnerConfirmationStatus: work.partner_confirmation_status || null,\n",
    );
  }
  if (!updated.includes("partnerPartsConfirmationStatus: work.partner_parts_confirmation_status")) {
    updated = replaceOnce(
      updated,
      "        partsReadyForExecution: parts.readyForExecution,\n",
      "        partsReadyForExecution: parts.readyForExecution,\n        partnerPartsConfirmationStatus: work.partner_parts_confirmation_status || null,\n",
    );
  }
  return updated;
}) || changed;

changed = patch("app/api/mindful/inventory/work-orders/[workOrderId]/schedule/route.ts", (source) => {
  let updated = source;

  if (!updated.includes("schedule-constraint-engine:v1")) {
    updated = replaceOnce(
      updated,
      "function parseDateTime(value: unknown) {\n  const clean = String(value ?? \"\").trim();\n  if (!clean) return null;\n  const date = new Date(clean);\n  return Number.isNaN(date.getTime()) ? null : date;\n}\n",
      `function parseDateTime(value: unknown) {\n  const clean = String(value ?? \"\").trim();\n  if (!clean) return null;\n  const date = new Date(clean);\n  return Number.isNaN(date.getTime()) ? null : date;\n}\n\n// schedule-constraint-engine:v1\nconst PARTS_ETA_BUFFER_MINUTES = ${ETA_BUFFER_MINUTES};\n\nfunction sameInstant(a: string | null | undefined, b: Date) {\n  if (!a) return false;\n  return new Date(a).getTime() === b.getTime();\n}\n\nfunction localParts(date: Date, offsetMinutes: number) {\n  const shifted = new Date(date.getTime() - offsetMinutes * 60_000);\n  return { year: shifted.getUTCFullYear(), month: shifted.getUTCMonth(), day: shifted.getUTCDate(), weekday: shifted.getUTCDay(), hour: shifted.getUTCHours(), minute: shifted.getUTCMinutes() };\n}\n\nfunction fromLocal(year: number, month: number, day: number, hour: number, minute: number, offsetMinutes: number) {\n  return new Date(Date.UTC(year, month, day, hour, minute) + offsetMinutes * 60_000);\n}\n\nfunction laborSegments(startValue: Date, laborMinutes: number, offsetMinutes: number) {\n  let remaining = Math.max(1, Math.round(laborMinutes));\n  let cursor = new Date(startValue);\n  const segments: Array<{ start: Date; end: Date }> = [];\n  let guard = 0;\n  while (remaining > 0 && guard < 30) {\n    guard += 1;\n    let p = localParts(cursor, offsetMinutes);\n    if (p.weekday === 0 || p.weekday === 6 || p.hour >= 17) {\n      const daysToAdd = p.weekday === 5 ? 3 : p.weekday === 6 ? 2 : 1;\n      cursor = fromLocal(p.year, p.month, p.day + daysToAdd, 8, 0, offsetMinutes);\n      continue;\n    }\n    if (p.hour < 8) {\n      cursor = fromLocal(p.year, p.month, p.day, 8, 0, offsetMinutes);\n      p = localParts(cursor, offsetMinutes);\n    }\n    const available = Math.max(0, 17 * 60 - (p.hour * 60 + p.minute));\n    if (!available) {\n      cursor = fromLocal(p.year, p.month, p.day + 1, 8, 0, offsetMinutes);\n      continue;\n    }\n    const used = Math.min(remaining, available);\n    const end = new Date(cursor.getTime() + used * 60_000);\n    segments.push({ start: new Date(cursor), end });\n    remaining -= used;\n    cursor = fromLocal(p.year, p.month, p.day + 1, 8, 0, offsetMinutes);\n  }\n  return remaining > 0 ? [] : segments;\n}\n`,
    );
  }

  updated = replaceOnce(
    updated,
    "    const start = parseDateTime(body.scheduledStartAt);\n    if (!start) return NextResponse.json({ error: \"A valid scheduled start is required.\" }, { status: 400 });",
    "    const start = parseDateTime(body.scheduledStartAt);\n    if (!start) return NextResponse.json({ error: \"A valid scheduled start is required.\" }, { status: 400 });\n    const offsetRaw = Number(body.tzOffset ?? 0);\n    const offsetMinutes = Number.isFinite(offsetRaw) ? Math.max(-840, Math.min(840, offsetRaw)) : 0;",
  );

  updated = updated.replace(
    "id,vehicle_id,status,estimated_elapsed_minutes,estimated_duration_minutes,assigned_partner_id,assigned_user_id,location_id,resource_id,parts_review_status,partner_estimate_status",
    "id,vehicle_id,status,estimated_labor_minutes,estimated_elapsed_minutes,estimated_duration_minutes,assigned_partner_id,assigned_user_id,location_id,resource_id,parts_review_status,partner_estimate_status,partner_confirmation_status,partner_parts_confirmation_status,scheduled_start_at,scheduled_end_at,proposed_start_at,proposed_end_at",
  );

  const setupBlock = /    if \(existing\.parts_review_status !== "resolved"\) \{[\s\S]*?    if \(existing\.assigned_partner_id && !\["approved", "not_required"\]\.includes\(existing\.partner_estimate_status \|\| ""\)\) \{\n      return NextResponse\.json\(\{ error: "Approve the partner labor estimate before scheduling this Work Order\." \}, \{ status: 409 \}\);\n    \}\n/;
  if (setupBlock.test(updated)) {
    updated = updated.replace(setupBlock, `    const scheduleRisks: string[] = [];\n    const riskKinds: string[] = [];\n    if (existing.parts_review_status !== "resolved") { scheduleRisks.push("Parts review is not complete."); riskKinds.push("parts_review"); }\n    if (!existing.assigned_partner_id && !existing.assigned_user_id) { scheduleRisks.push("No assignee is selected yet."); riskKinds.push("assignee"); }\n    if (!existing.location_id) { scheduleRisks.push("The work location is still TBD."); riskKinds.push("location"); }\n    if (existing.assigned_partner_id && !["approved", "not_required"].includes(existing.partner_estimate_status || "")) { scheduleRisks.push("The partner labor quote is not approved yet."); riskKinds.push("quote"); }\n`);
  }

  const partsBlock = /    const parts = summarizePartsReadiness\(partRows \|\| \[\]\);\n    if \(!parts\.readyForExecution\) \{[\s\S]*?    \}\n\n    const duration = Number\(existing\.estimated_elapsed_minutes \?\? existing\.estimated_duration_minutes \?\? 60\);\n    const safeDuration = Number\.isFinite\(duration\) && duration > 0 \? duration : 60;\n    const end = new Date\(start\.getTime\(\) \+ safeDuration \* 60_000\);/;
  if (partsBlock.test(updated)) {
    updated = updated.replace(partsBlock, `    const parts = summarizePartsReadiness(partRows || []);\n    const etaMs = parts.latestEtaAt ? new Date(parts.latestEtaAt).getTime() : null;\n    const bufferedEtaMs = etaMs !== null && Number.isFinite(etaMs) ? etaMs + PARTS_ETA_BUFFER_MINUTES * 60_000 : null;\n    if (existing.partner_parts_confirmation_status === "issue_reported") {\n      scheduleRisks.push("The Partner has an open parts issue.");\n      riskKinds.push("parts_issue");\n    } else if (!parts.readyForExecution && bufferedEtaMs !== null && start.getTime() < bufferedEtaMs) {\n      scheduleRisks.push(`Required parts are expected after this slot once the ${PARTS_ETA_BUFFER_MINUTES / 60} hr receiving buffer is applied.`);\n      riskKinds.push("parts_eta_conflict");\n    } else if (!parts.readyForExecution && bufferedEtaMs === null) {\n      scheduleRisks.push("A required part does not have a known ETA.");\n      riskKinds.push("parts_eta_unknown");\n    }\n\n    const laborRaw = Number(existing.estimated_labor_minutes ?? existing.estimated_duration_minutes ?? 60);\n    const laborMinutes = Number.isFinite(laborRaw) && laborRaw > 0 ? laborRaw : 60;\n    const elapsedRaw = Number(existing.estimated_elapsed_minutes ?? existing.estimated_duration_minutes ?? laborMinutes);\n    const elapsedMinutes = Number.isFinite(elapsedRaw) && elapsedRaw > 0 ? elapsedRaw : laborMinutes;\n    const segments = laborSegments(start, laborMinutes, offsetMinutes);\n    const end = segments.length ? segments[segments.length - 1].end : new Date(start.getTime() + laborMinutes * 60_000);`);
  }

  updated = updated.replace(
    '        return NextResponse.json({ error: `Schedule conflict: this ${check.label} is already assigned to “${conflict.title}” during that time.` }, { status: 409 });',
    '        scheduleRisks.push(`Schedule conflict: this ${check.label} is already assigned to “${conflict.title}” during that time.`);\n        riskKinds.push(`conflict_${check.field}`);',
  );

  if (!updated.includes("requiresOverride: true")) {
    updated = replaceOnce(
      updated,
      "    const now = new Date().toISOString();",
      `    const uniqueRisks = Array.from(new Set(scheduleRisks));\n    const uniqueRiskKinds = Array.from(new Set(riskKinds));\n    const overrideConflict = body.overrideConflict === true;\n    const overrideReason = String(body.overrideReason || "").trim();\n    if (uniqueRisks.length && !overrideConflict) {\n      return NextResponse.json({\n        error: "This time can still be used, but it has scheduling risks.",\n        requiresOverride: true,\n        warning: uniqueRisks.join(" "),\n        risks: uniqueRisks,\n        riskKinds: uniqueRiskKinds,\n        partsReadiness: parts.readiness,\n        pendingPartCount: parts.pendingPartCount,\n        partsLatestEtaAt: parts.latestEtaAt,\n        partsEtaBufferMinutes: PARTS_ETA_BUFFER_MINUTES,\n      }, { status: 409 });\n    }\n    if (uniqueRisks.length && overrideConflict && !overrideReason) {\n      return NextResponse.json({ error: "Add a brief reason for scheduling through the warning." }, { status: 400 });\n    }\n\n    const now = new Date().toISOString();`,
    );
  }

  const updateBlock = /    const isPartnerWork = Boolean\(existing\.assigned_partner_id\);\n    const update = isPartnerWork[\s\S]*?          updated_at: now,\n        \};/;
  if (updateBlock.test(updated)) {
    updated = updated.replace(updateBlock, `    const isPartnerWork = Boolean(existing.assigned_partner_id);\n    const acceptingPartnerProposal = isPartnerWork\n      && existing.partner_confirmation_status === "awaiting_owner"\n      && sameInstant(existing.proposed_start_at, start);\n    const update = acceptingPartnerProposal\n      ? {\n          scheduled_start_at: start.toISOString(),\n          scheduled_end_at: end.toISOString(),\n          proposed_start_at: null,\n          proposed_end_at: null,\n          partner_confirmation_status: "confirmed",\n          schedule_source: "partner",\n          status: "scheduled",\n          updated_by: access.userId,\n          updated_at: now,\n        }\n      : isPartnerWork\n        ? {\n            proposed_start_at: start.toISOString(),\n            proposed_end_at: end.toISOString(),\n            scheduled_start_at: existing.scheduled_start_at,\n            scheduled_end_at: existing.scheduled_end_at,\n            partner_confirmation_status: "awaiting_partner",\n            schedule_source: "suggested",\n            status: existing.scheduled_start_at ? existing.status : "ready_to_schedule",\n            updated_by: access.userId,\n            updated_at: now,\n          }\n        : {\n            scheduled_start_at: start.toISOString(),\n            scheduled_end_at: end.toISOString(),\n            proposed_start_at: null,\n            proposed_end_at: null,\n            partner_confirmation_status: null,\n            schedule_source: "manual",\n            status: existing.status === "complete" ? "complete" : "scheduled",\n            updated_by: access.userId,\n            updated_at: now,\n          };`);
  }

  const historyBlock = /    await access\.supabase\.from\("mindful_inventory_history"\)\.insert\(\{[\s\S]*?    \}\);\n\n    return NextResponse\.json\(updated\);/;
  if (historyBlock.test(updated)) {
    updated = updated.replace(historyBlock, `    await access.supabase.from("mindful_inventory_history").insert({\n      company_id: access.company.companyId,\n      vehicle_id: existing.vehicle_id,\n      event_type: acceptingPartnerProposal ? "work_order_schedule_confirmed" : isPartnerWork ? "work_order_schedule_proposed" : "work_order_scheduled",\n      entity_type: "work_order",\n      entity_id: workOrderId,\n      actor_user_id: access.userId,\n      summary: acceptingPartnerProposal\n        ? "Owner accepted the Partner-proposed work time."\n        : isPartnerWork\n          ? "Owner proposed a work time to the assigned Partner."\n          : "Owner scheduled the Work Order.",\n      metadata: {\n        previousScheduledStartAt: existing.scheduled_start_at || null,\n        previousScheduledEndAt: existing.scheduled_end_at || null,\n        previousProposedStartAt: existing.proposed_start_at || null,\n        previousProposedEndAt: existing.proposed_end_at || null,\n        proposedStartAt: isPartnerWork && !acceptingPartnerProposal ? start.toISOString() : null,\n        scheduledStartAt: !isPartnerWork || acceptingPartnerProposal ? start.toISOString() : existing.scheduled_start_at || null,\n        endAt: end.toISOString(),\n        laborMinutes,\n        elapsedMinutes,\n        scheduleRisks: uniqueRisks,\n        scheduleRiskKinds: uniqueRiskKinds,\n        override: uniqueRisks.length > 0,\n        overrideReason: uniqueRisks.length ? overrideReason : null,\n        partsEtaBufferMinutes: PARTS_ETA_BUFFER_MINUTES,\n      },\n    });\n\n    return NextResponse.json(updated);`);
  }

  return updated;
}) || changed;

changed = patch("app/api/partner/work-orders/[workOrderId]/schedule/route.ts", (source) => {
  let updated = source;
  updated = updated.replace(
    "id,vehicle_id,status,assigned_partner_id,scheduled_start_at,scheduled_end_at,proposed_start_at,proposed_end_at",
    "id,vehicle_id,status,assigned_partner_id,scheduled_start_at,scheduled_end_at,proposed_start_at,proposed_end_at,partner_confirmation_status",
  );

  if (!updated.includes("acceptingOwnerProposal")) {
    updated = replaceOnce(
      updated,
      "    const scheduleChanged = !sameInstant(requestedStartAt, startAt) || !sameInstant(requestedEndAt, endAt);\n",
      "    const scheduleChanged = !sameInstant(requestedStartAt, startAt) || !sameInstant(requestedEndAt, endAt);\n    const acceptingOwnerProposal = work.partner_confirmation_status === \"awaiting_partner\" && Boolean(requestedStartAt && requestedEndAt) && !scheduleChanged;\n",
    );
  }

  const partnerUpdateBlock = /    const \{ data: updated, error: updateError \} = await admin[\s\S]*?    if \(scheduleChanged\) \{[\s\S]*?    \}\n\n    return NextResponse\.json\(\{ \.\.\.updated, timezone: timeZone, scheduleChanged \}\);/;
  if (partnerUpdateBlock.test(updated)) {
    updated = updated.replace(partnerUpdateBlock, `    const update = acceptingOwnerProposal\n      ? {\n          proposed_start_at: null,\n          proposed_end_at: null,\n          scheduled_start_at: startAt,\n          scheduled_end_at: endAt,\n          partner_confirmation_status: "confirmed",\n          schedule_source: "manual",\n          status: "scheduled",\n          updated_at: now,\n          updated_by: user.id,\n        }\n      : {\n          proposed_start_at: startAt,\n          proposed_end_at: endAt,\n          scheduled_start_at: work.scheduled_start_at,\n          scheduled_end_at: work.scheduled_end_at,\n          partner_confirmation_status: "awaiting_owner",\n          schedule_source: "partner",\n          status: work.scheduled_start_at ? work.status : "ready_to_schedule",\n          updated_at: now,\n          updated_by: user.id,\n        };\n\n    const { data: updated, error: updateError } = await admin\n      .from("mindful_inventory_work_orders")\n      .update(update)\n      .eq("id", workOrderId)\n      .eq("assigned_partner_id", partner.id)\n      .select("id,status,scheduled_start_at,scheduled_end_at,proposed_start_at,proposed_end_at,partner_confirmation_status,schedule_source")\n      .single();\n    if (updateError) throw new Error(updateError.message);\n\n    const partnerLabel = partner.company_name ? `${partner.name} · ${partner.company_name}` : partner.name;\n    const { error: historyError } = await admin.from("mindful_inventory_history").insert({\n      company_id: partner.company_id,\n      vehicle_id: work.vehicle_id,\n      event_type: acceptingOwnerProposal ? "partner_schedule_confirmed" : "partner_schedule_proposed",\n      entity_type: "work_order",\n      entity_id: workOrderId,\n      actor_user_id: user.id,\n      summary: acceptingOwnerProposal\n        ? `${partnerLabel} confirmed the Owner-proposed work time.`\n        : `${partnerLabel} proposed a different work time for Owner confirmation.`,\n      metadata: {\n        partnerId: partner.id,\n        partnerName: partnerLabel,\n        previousScheduledStartAt: work.scheduled_start_at,\n        previousScheduledEndAt: work.scheduled_end_at,\n        previousProposedStartAt: work.proposed_start_at,\n        previousProposedEndAt: work.proposed_end_at,\n        partnerProposedStartAt: acceptingOwnerProposal ? null : startAt,\n        partnerProposedEndAt: acceptingOwnerProposal ? null : endAt,\n        confirmedStartAt: acceptingOwnerProposal ? startAt : null,\n        confirmedEndAt: acceptingOwnerProposal ? endAt : null,\n        timezone: timeZone,\n      },\n    });\n    if (historyError) throw new Error(historyError.message);\n\n    return NextResponse.json({ ...updated, timezone: timeZone, scheduleChanged, awaitingOwner: !acceptingOwnerProposal });`);
  }
  return updated;
}) || changed;

changed = patch("components/mindful-inventory/inventory-schedule-board.tsx", (source) => {
  let updated = source;

  if (!updated.includes("type PartsScheduleState")) {
    updated = replaceOnce(
      updated,
      "function partsLabel(item: InventoryScheduleWork) {\n  if (item.partsReadiness === \"backordered\") return \"Backordered\";\n  if (item.partsReadiness === \"ordered\") return \"Ordered / in transit\";\n  if (item.partsReadiness === \"ready\") return \"Parts received\";\n  if (item.partsReadiness === \"installed\") return \"Installed\";\n  return \"Parts needed\";\n}\n",
      `function partsLabel(item: InventoryScheduleWork) {\n  if (item.partsReadiness === "backordered") return "Backordered";\n  if (item.partsReadiness === "ordered") return "Ordered / in transit";\n  if (item.partsReadiness === "ready") return "Parts received";\n  if (item.partsReadiness === "installed") return "Installed";\n  return "Parts needed";\n}\n\ntype PartsScheduleState = { kind: "ready" | "expected" | "conflict" | "unknown" | "issue"; label: string; detail: string };\nconst PARTS_ETA_BUFFER_MINUTES = ${ETA_BUFFER_MINUTES};\n\nfunction partsScheduleState(item: InventoryScheduleWork): PartsScheduleState {\n  if (item.partnerPartsConfirmationStatus === "issue_reported") {\n    return { kind: "issue", label: "Parts issue", detail: "Partner reported an open parts issue." };\n  }\n  if (item.partsReadyForExecution) return { kind: "ready", label: "Parts ready", detail: partsLabel(item) };\n  if (item.partsLatestEtaAt) {\n    const eta = new Date(item.partsLatestEtaAt);\n    const etaMs = eta.getTime();\n    const bufferedEtaMs = Number.isFinite(etaMs) ? etaMs + PARTS_ETA_BUFFER_MINUTES * 60_000 : null;\n    const etaLabel = Number.isFinite(etaMs) ? eta.toLocaleString("en-US", { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" }) : "unknown";\n    const startMs = item.scheduledStartAt ? new Date(item.scheduledStartAt).getTime() : null;\n    if (bufferedEtaMs !== null && startMs !== null && Number.isFinite(startMs) && startMs < bufferedEtaMs) {\n      return { kind: "conflict", label: "Parts conflict", detail: `Latest required-part ETA ${etaLabel} · ${PARTS_ETA_BUFFER_MINUTES / 60} hr receiving buffer` };\n    }\n    return { kind: "expected", label: "Parts expected before work", detail: `Latest required-part ETA ${etaLabel} · ${PARTS_ETA_BUFFER_MINUTES / 60} hr receiving buffer` };\n  }\n  return { kind: "unknown", label: "Parts ETA unknown", detail: "A required part has no ETA. Schedule may be at risk." };\n}\n\nfunction partsNeedsAttention(state: PartsScheduleState) {\n  return state.kind === "issue" || state.kind === "conflict" || state.kind === "unknown";\n}\n`,
    );
  }

  updated = replaceOnce(
    updated,
    "  const waitingOnParts = active.filter((item) => !item.partsReadyForExecution);",
    "  const waitingOnParts = active.filter((item) => partsNeedsAttention(partsScheduleState(item)));",
  );
  updated = replaceOnce(
    updated,
    '    if (viewMode === "parts") return !item.partsReadyForExecution;',
    '    if (viewMode === "parts") return partsNeedsAttention(partsScheduleState(item));',
  );
  updated = updated.replaceAll("Waiting on Parts (", "Parts Attention (");

  updated = replaceOnce(
    updated,
    "    setStarts((current) => ({ ...current, [item.id]: current[item.id] || localInput(item.scheduledStartAt) || localInputDefault() }));",
    "    setStarts((current) => ({ ...current, [item.id]: current[item.id] || localInput(item.proposedStartAt || item.scheduledStartAt) || localInputDefault() }));",
  );

  const scheduleFn = /  async function schedule\(item: InventoryScheduleWork\) \{[\s\S]*?\n  \}\n\n  async function patchItem/;
  if (scheduleFn.test(updated) && !updated.includes("Schedule change cancelled.")) {
    updated = updated.replace(scheduleFn, `  async function schedule(item: InventoryScheduleWork) {\n    const localStart = starts[item.id] || localInput(item.proposedStartAt || item.scheduledStartAt) || localInputDefault();\n    setWorkingId(item.id);\n    setMessage("");\n    try {\n      const send = async (overrideConflict = false, overrideReason = "") => {\n        const response = await fetch(`/api/mindful/inventory/work-orders/${item.id}/schedule`, {\n          method: "PATCH",\n          headers: { "Content-Type": "application/json" },\n          body: JSON.stringify({\n            scheduledStartAt: new Date(localStart).toISOString(),\n            tzOffset: new Date().getTimezoneOffset(),\n            overrideConflict,\n            overrideReason,\n          }),\n        });\n        const payload = (await response.json()) as {\n          error?: string; warning?: string; requiresOverride?: boolean; risks?: string[];\n          scheduled_start_at?: string | null; scheduled_end_at?: string | null; proposed_start_at?: string | null; proposed_end_at?: string | null;\n          partner_confirmation_status?: string | null; status?: string; schedule_source?: string;\n        };\n        return { response, payload };\n      };\n\n      let result = await send();\n      if (!result.response.ok && result.payload.requiresOverride) {\n        const warning = result.payload.warning || result.payload.error || "This time has a scheduling risk.";\n        if (!window.confirm(`${warning}\\n\\nSchedule it anyway?`)) {\n          setMessage("Schedule change cancelled.");\n          return;\n        }\n        const reason = window.prompt("Briefly note why this schedule should be used despite the warning:")?.trim();\n        if (!reason) {\n          setMessage("Schedule change cancelled — an override reason is required.");\n          return;\n        }\n        result = await send(true, reason);\n      }\n      if (!result.response.ok) throw new Error(result.payload.error || "Failed to schedule work.");\n\n      const payload = result.payload;\n      replaceLocalItem(item.id, (current) => ({\n        ...current,\n        scheduledStartAt: payload.scheduled_start_at ?? current.scheduledStartAt,\n        scheduledEndAt: payload.scheduled_end_at ?? current.scheduledEndAt,\n        proposedStartAt: payload.proposed_start_at ?? null,\n        proposedEndAt: payload.proposed_end_at ?? null,\n        partnerConfirmationStatus: payload.partner_confirmation_status ?? current.partnerConfirmationStatus,\n        status: payload.status || current.status,\n        scheduleSource: payload.schedule_source || current.scheduleSource,\n      }));\n      setNowMs(Date.now());\n      setMessage(payload.partner_confirmation_status === "awaiting_partner"\n        ? `${item.title}: time proposed to Partner.`\n        : payload.partner_confirmation_status === "confirmed"\n          ? `${item.title} scheduled.`\n          : `${item.title} scheduled.`);\n      router.refresh();\n    } catch (error) {\n      setMessage(error instanceof Error ? error.message : "Failed to schedule work.");\n    } finally {\n      setWorkingId(null);\n    }\n  }\n\n  async function patchItem`);
  }

  updated = replaceOnce(
    updated,
    "    const waitingParts = !complete && !item.partsReadyForExecution;",
    "    const partsState = partsScheduleState(item);\n    const waitingParts = !complete && partsNeedsAttention(partsState);",
  );
  updated = updated.replaceAll(
    '>Waiting on parts</span>',
    '>{partsState.label}</span>',
  );
  updated = replaceOnce(
    updated,
    '{waitingParts ? <div className="mt-2 text-[10px] font-black text-amber-800">{partsLabel(item)}{item.pendingPartCount ? ` · ${item.pendingPartCount} pending` : ""}{item.partsLatestEtaAt ? ` · ETA ${new Date(item.partsLatestEtaAt).toLocaleDateString("en-US", { month: "short", day: "numeric" })}` : ""}</div> : null}',
    '{waitingParts ? <div className="mt-2 text-[10px] font-black text-amber-800">{partsState.detail}</div> : null}',
  );

  if (!updated.includes("const selectedPartsState")) {
    updated = replaceOnce(
      updated,
      "  const selectedHealth = selectedItem ? getScheduleHealth(selectedItem, nowMs) : null;",
      "  const selectedHealth = selectedItem ? getScheduleHealth(selectedItem, nowMs) : null;\n  const selectedPartsState = selectedItem ? partsScheduleState(selectedItem) : null;",
    );
  }

  const oldModalParts = '{!selectedItem.partsReadyForExecution ? <div className="rounded-xl border border-amber-300 bg-amber-50 p-3"><div className="text-sm font-black text-amber-950">Waiting on parts</div><div className="mt-1 text-xs font-bold text-amber-800">{partsLabel(selectedItem)}{selectedItem.pendingPartCount ? ` · ${selectedItem.pendingPartCount} pending` : ""}{selectedItem.partsLatestEtaAt ? ` · ETA ${new Date(selectedItem.partsLatestEtaAt).toLocaleDateString("en-US", { month: "short", day: "numeric" })}` : ""}</div><Link href={`/mindful/inventory/${selectedItem.vehicleId}/parts`} className="mt-2 inline-flex text-xs font-black text-amber-900 underline">Manage Parts →</Link></div> : null}';
  const newModalParts = '{selectedPartsState && selectedPartsState.kind !== "ready" ? <div className={`rounded-xl border p-3 ${selectedPartsState.kind === "expected" ? "border-emerald-200 bg-emerald-50" : "border-amber-300 bg-amber-50"}`}><div className={`text-sm font-black ${selectedPartsState.kind === "expected" ? "text-emerald-900" : "text-amber-950"}`}>{selectedPartsState.label}</div><div className={`mt-1 text-xs font-bold ${selectedPartsState.kind === "expected" ? "text-emerald-800" : "text-amber-800"}`}>{selectedPartsState.detail}</div><div className="mt-2 flex flex-wrap gap-3"><Link href={`/mindful/inventory/${selectedItem.vehicleId}/parts`} className="text-xs font-black underline">Review parts →</Link>{selectedPartsState.kind === "conflict" ? <button type="button" onClick={() => document.getElementById("selected-schedule-editor")?.scrollIntoView({ behavior: "smooth", block: "center" })} className="cursor-pointer text-xs font-black underline">Reschedule →</button> : null}</div></div> : null}';
  updated = replaceOnce(updated, oldModalParts, newModalParts);

  updated = updated.replace(
    '<div className="rounded-xl border border-slate-200 p-4"><SuggestedTimePicker',
    '<div id="selected-schedule-editor" className="rounded-xl border border-slate-200 p-4"><SuggestedTimePicker',
  );
  updated = updated.replace(
    '<div className="rounded-xl border border-slate-200 p-4"><label className="block"><div className="text-[10px] font-black uppercase tracking-[0.08em] text-slate-400">Scheduled start</div>',
    '<div id="selected-schedule-editor" className="rounded-xl border border-slate-200 p-4"><label className="block"><div className="text-[10px] font-black uppercase tracking-[0.08em] text-slate-400">Scheduled start</div>',
  );

  return updated;
}) || changed;

console.log(changed ? "Aligned Schedule around constraints, parts ETA risk, two-sided confirmation, and audited overrides." : "Schedule constraint engine already aligned.");
