import { readFileSync, writeFileSync } from "node:fs";

function patch(path, transform) {
  const source = readFileSync(path, "utf8");
  const updated = transform(source);
  if (updated !== source) writeFileSync(path, updated, "utf8");
  return updated !== source;
}

let changed = false;

changed = patch("lib/ai/work-plan-types.ts", (source) => {
  if (!source.includes("laborEstimateRationale: string | null;")) {
    source = source.replace(
      "  estimatedElapsedHours: number | null;",
      "  estimatedElapsedHours: number | null;\n  /** Why the AI believes the hands-on labor estimate is reasonable. */\n  laborEstimateRationale: string | null;\n  /** Why elapsed turnaround differs from labor, including cure/dry/wait assumptions. */\n  elapsedEstimateRationale: string | null;",
    );
  }
  return source;
}) || changed;

changed = patch("lib/ai/work-plan.ts", (source) => {
  if (!source.includes("const laborEstimateRationale = stringValue(item.laborEstimateRationale)")) {
    source = source.replace(
      "  const elapsed = elapsedInput === null\n    ? (legacy === null ? labor : Math.max(labor ?? 0, legacy))\n    : Math.max(labor ?? 0, elapsedInput);",
      "  const elapsed = elapsedInput === null\n    ? (legacy === null ? labor : Math.max(labor ?? 0, legacy))\n    : Math.max(labor ?? 0, elapsedInput);\n  const laborEstimateRationale = stringValue(item.laborEstimateRationale) || null;\n  const elapsedEstimateRationale = stringValue(item.elapsedEstimateRationale) || null;",
    );
    source = source.replace(
      "    estimatedElapsedHours: elapsed,\n    confidence,",
      "    estimatedElapsedHours: elapsed,\n    laborEstimateRationale,\n    elapsedEstimateRationale,\n    confidence,",
    );
  }
  return source;
}) || changed;

changed = patch("lib/ai/prompts/work-plan.ts", (source) => {
  if (!source.includes("Every non-null time estimate must include a short rationale")) {
    source = source.replace(
      "- estimatedDurationHours is legacy compatibility only: set it equal to estimatedElapsedHours.",
      "- estimatedDurationHours is legacy compatibility only: set it equal to estimatedElapsedHours.\n- Every non-null time estimate must include a short rationale. laborEstimateRationale explains the hands-on work assumptions. elapsedEstimateRationale explains turnaround beyond labor, such as paint cure/dry time, diagnostic observation, or other within-job waiting. Never leave a materially longer elapsed estimate unexplained.",
    );
    source = source.replace(
      '      "estimatedDurationHours": 0,\n      "confidence": 0.0,',
      '      "estimatedDurationHours": 0,\n      "laborEstimateRationale": "brief labor-time basis",\n      "elapsedEstimateRationale": "brief turnaround/cure/wait basis",\n      "confidence": 0.0,',
    );
  }
  return source;
}) || changed;

changed = patch("app/api/mindful/inventory/vehicles/[id]/work-plan/generate/route.ts", (source) => {
  if (!source.includes("labor_estimate_rationale: item.laborEstimateRationale")) {
    source = source.replace(
      "            estimated_elapsed_hours: item.estimatedElapsedHours,",
      "            estimated_elapsed_hours: item.estimatedElapsedHours,\n            labor_estimate_rationale: item.laborEstimateRationale,\n            elapsed_estimate_rationale: item.elapsedEstimateRationale,",
    );
  }
  return source;
}) || changed;

changed = patch("lib/mindful-inventory/active-work.ts", (source) => {
  if (!source.includes("aiEstimatedLaborMinutes: number | null;")) {
    source = source.replace(
      "  estimatedElapsedMinutes: number | null;",
      "  estimatedElapsedMinutes: number | null;\n  aiEstimatedLaborMinutes: number | null;\n  aiEstimatedElapsedMinutes: number | null;\n  laborEstimateRationale: string | null;\n  elapsedEstimateRationale: string | null;",
    );
  }
  source = source.replace(
    "estimated_duration_minutes,estimated_labor_minutes,estimated_elapsed_minutes,scheduled_start_at",
    "estimated_duration_minutes,estimated_labor_minutes,estimated_elapsed_minutes,ai_estimated_labor_minutes,ai_estimated_elapsed_minutes,labor_estimate_rationale,elapsed_estimate_rationale,scheduled_start_at",
  );
  if (!source.includes("aiEstimatedLaborMinutes: nullableNumber(row.ai_estimated_labor_minutes)")) {
    source = source.replace(
      "      estimatedElapsedMinutes: nullableNumber(row.estimated_elapsed_minutes),",
      "      estimatedElapsedMinutes: nullableNumber(row.estimated_elapsed_minutes),\n      aiEstimatedLaborMinutes: nullableNumber(row.ai_estimated_labor_minutes),\n      aiEstimatedElapsedMinutes: nullableNumber(row.ai_estimated_elapsed_minutes),\n      laborEstimateRationale: row.labor_estimate_rationale || null,\n      elapsedEstimateRationale: row.elapsed_estimate_rationale || null,",
    );
  }
  return source;
}) || changed;

changed = patch("app/api/intelligence/work-orders/[workOrderId]/estimate/route.ts", (source) => {
  source = source.replace(
    '.select("id,assigned_partner_id,approved_budget,status")',
    '.select("id,vehicle_id,assigned_partner_id,approved_budget,status,ai_estimated_labor_minutes,ai_estimated_elapsed_minutes,labor_estimate_rationale,elapsed_estimate_rationale")',
  );
  if (!source.includes("requiresTimingConfirmation")) {
    const anchor = "    const result = await submitBlindEstimate(admin, {";
    const guard = `    const timingOverrideConfirmed = body.timingOverrideConfirmed === true;\n    const deviation = (value: number | null, baseline: number | null) => value == null || baseline == null || baseline <= 0 ? null : Math.abs(value - baseline) / baseline;\n    const laborDeviation = deviation(estimatedLaborMinutes, workOrder.ai_estimated_labor_minutes == null ? null : Number(workOrder.ai_estimated_labor_minutes));\n    const elapsedDeviation = deviation(estimatedElapsedMinutes, workOrder.ai_estimated_elapsed_minutes == null ? null : Number(workOrder.ai_estimated_elapsed_minutes));\n    const materialLaborOverride = laborDeviation !== null && laborDeviation > 0.25;\n    const materialElapsedOverride = elapsedDeviation !== null && elapsedDeviation > 0.25;\n    if ((materialLaborOverride || materialElapsedOverride) && !timingOverrideConfirmed) {\n      return NextResponse.json({\n        error: "This timing estimate differs materially from Lot Logic's AI planning estimate.",\n        requiresTimingConfirmation: true,\n        thresholdPercent: 25,\n        aiLaborMinutes: workOrder.ai_estimated_labor_minutes ?? null,\n        aiElapsedMinutes: workOrder.ai_estimated_elapsed_minutes ?? null,\n        proposedLaborMinutes: estimatedLaborMinutes,\n        proposedElapsedMinutes: estimatedElapsedMinutes,\n        laborDeviationPercent: laborDeviation == null ? null : Math.round(laborDeviation * 100),\n        elapsedDeviationPercent: elapsedDeviation == null ? null : Math.round(elapsedDeviation * 100),\n        laborRationale: workOrder.labor_estimate_rationale || "Legacy AI estimate: a detailed labor rationale was not recorded.",\n        elapsedRationale: workOrder.elapsed_estimate_rationale || "Legacy AI estimate: a detailed elapsed-time rationale was not recorded.",\n      }, { status: 409 });\n    }\n\n${anchor}`;
    source = source.replace(anchor, guard);
    source = source.replace(
      "    const hiddenApprovalCeiling = Number(workOrder.approved_budget || 0);",
      `    if (timingOverrideConfirmed && (materialLaborOverride || materialElapsedOverride)) {\n      await admin.from("mindful_inventory_history").insert({\n        company_id: partner.company_id, vehicle_id: workOrder.vehicle_id, event_type: "work_order_timing_override_confirmed", entity_type: "work_order", entity_id: workOrderId, actor_user_id: user.id,\n        summary: "Partner confirmed a material timing override after reviewing Lot Logic's rationale.",\n        metadata: { aiLaborMinutes: workOrder.ai_estimated_labor_minutes ?? null, aiElapsedMinutes: workOrder.ai_estimated_elapsed_minutes ?? null, proposedLaborMinutes: estimatedLaborMinutes, proposedElapsedMinutes: estimatedElapsedMinutes, laborDeviationPercent: laborDeviation == null ? null : Math.round(laborDeviation * 100), elapsedDeviationPercent: elapsedDeviation == null ? null : Math.round(elapsedDeviation * 100), laborRationale: workOrder.labor_estimate_rationale || null, elapsedRationale: workOrder.elapsed_estimate_rationale || null }\n      });\n    }\n\n    const hiddenApprovalCeiling = Number(workOrder.approved_budget || 0);`,
    );
  }
  return source;
}) || changed;

changed = patch("components/partner/partner-work-list-v4.tsx", (source) => {
  if (!source.includes("timingOverrideConfirmed: confirmed")) {
    const oldFn = `  async function submitEstimate(work: PartnerWorkItem) {\n    const draft = estimateDraft(work);\n    setWorkingId(work.id); setMessage((c) => ({ ...c, [work.id]: "" }));\n    try {\n      const response = await fetch(\`/api/intelligence/work-orders/\${work.id}/estimate\`, {\n        method: "POST", headers: { "Content-Type": "application/json" },\n        body: JSON.stringify({ quotedCost: draft.cost ? Number(draft.cost) : null, estimatedLaborMinutes: draft.labor ? Math.round(Number(draft.labor) * 60) : null, estimatedElapsedMinutes: draft.elapsed ? Math.round(Number(draft.elapsed) * 60) : null, notes: draft.notes }),\n      });\n      const data = await payload(response);\n      if (!response.ok) throw new Error(String(data.error || "Estimate could not be submitted."));\n      setEditingEstimateId(null);\n      setMessage((c) => ({ ...c, [work.id]: data.approvalStatus === "approved" ? "Labor estimate approved." : "Labor estimate submitted for approval." }));\n      router.refresh();\n    } catch (error) { setMessage((c) => ({ ...c, [work.id]: error instanceof Error ? error.message : "Estimate could not be submitted." })); }\n    finally { setWorkingId(null); }\n  }`;
    const newFn = `  async function submitEstimate(work: PartnerWorkItem, confirmed = false) {\n    const draft = estimateDraft(work);\n    setWorkingId(work.id); setMessage((c) => ({ ...c, [work.id]: "" }));\n    try {\n      const response = await fetch(\`/api/intelligence/work-orders/\${work.id}/estimate\`, {\n        method: "POST", headers: { "Content-Type": "application/json" },\n        body: JSON.stringify({ quotedCost: draft.cost ? Number(draft.cost) : null, estimatedLaborMinutes: draft.labor ? Math.round(Number(draft.labor) * 60) : null, estimatedElapsedMinutes: draft.elapsed ? Math.round(Number(draft.elapsed) * 60) : null, notes: draft.notes, timingOverrideConfirmed: confirmed }),\n      });\n      const data = await payload(response);\n      if (response.status === 409 && data.requiresTimingConfirmation && !confirmed) {\n        const details = [data.laborDeviationPercent ? \`Labor differs by \${data.laborDeviationPercent}%. AI rationale: \${data.laborRationale}\` : null, data.elapsedDeviationPercent ? \`Turnaround differs by \${data.elapsedDeviationPercent}%. AI rationale: \${data.elapsedRationale}\` : null].filter(Boolean).join("\\n\\n");\n        if (window.confirm(\`Lot Logic flagged a material timing change (>25%).\\n\\n\${details}\\n\\nConfirm your estimate anyway?\`)) {\n          setWorkingId(null);\n          await submitEstimate(work, true);\n          return;\n        }\n        setMessage((c) => ({ ...c, [work.id]: "Timing change was not submitted." }));\n        return;\n      }\n      if (!response.ok) throw new Error(String(data.error || "Estimate could not be submitted."));\n      setEditingEstimateId(null);\n      setMessage((c) => ({ ...c, [work.id]: data.approvalStatus === "approved" ? "Labor estimate approved." : "Labor estimate submitted for approval." }));\n      router.refresh();\n    } catch (error) { setMessage((c) => ({ ...c, [work.id]: error instanceof Error ? error.message : "Estimate could not be submitted." })); }\n    finally { setWorkingId(null); }\n  }`;
    source = source.replace(oldFn, newFn);
  }
  return source;
}) || changed;

changed = patch("app/api/mindful/inventory/work-orders/[workOrderId]/route.ts", (source) => {
  source = source.replace(
    "parts_review_status,partner_estimate_status,partner_confirmation_status,estimated_labor_minutes,internal_labor_value\")",
    "parts_review_status,partner_estimate_status,partner_confirmation_status,estimated_labor_minutes,internal_labor_value,ai_estimated_labor_minutes,ai_estimated_elapsed_minutes,labor_estimate_rationale,elapsed_estimate_rationale\")",
  );
  if (!source.includes("Internal labor differs materially")) {
    const anchor = "    if (internalLaborMinutesProvided) {\n      if (!Number.isFinite(internalLaborMinutes)";
    const replacement = `    if (internalLaborMinutesProvided) {\n      if (!Number.isFinite(internalLaborMinutes) || internalLaborMinutes == null || internalLaborMinutes < 0) return NextResponse.json({ error: "Internal labor time must be zero or greater." }, { status: 400 });\n      const baseline = existing.ai_estimated_labor_minutes == null ? null : Number(existing.ai_estimated_labor_minutes);\n      const deviation = baseline && baseline > 0 ? Math.abs(Math.round(internalLaborMinutes) - baseline) / baseline : null;\n      if (deviation !== null && deviation > 0.25 && body.timingOverrideConfirmed !== true) {\n        return NextResponse.json({ error: "Internal labor differs materially from Lot Logic's AI estimate.", requiresTimingConfirmation: true, thresholdPercent: 25, aiLaborMinutes: baseline, proposedLaborMinutes: Math.round(internalLaborMinutes), laborDeviationPercent: Math.round(deviation * 100), laborRationale: existing.labor_estimate_rationale || "Legacy AI estimate: a detailed labor rationale was not recorded." }, { status: 409 });\n      }\n      if (deviation !== null && deviation > 0.25 && body.timingOverrideConfirmed === true) { metadata.timingOverrideConfirmed = true; metadata.aiLaborMinutes = baseline; metadata.laborDeviationPercent = Math.round(deviation * 100); metadata.laborRationale = existing.labor_estimate_rationale || null; }\n      patch.estimated_labor_minutes = Math.round(internalLaborMinutes);\n      metadata.internalLaborMinutes = Math.round(internalLaborMinutes);\n    }\n    if (false) {\n      if (!Number.isFinite(internalLaborMinutes)`;
    source = source.replace(anchor, replacement);
    source = source.replace(/    if \(false\) \{\n      if \(!Number\.isFinite\(internalLaborMinutes\)[\s\S]*?metadata\.internalLaborMinutes = Math\.round\(internalLaborMinutes\);\n    \}\n/, "");
  }
  return source;
}) || changed;

changed = patch("components/mindful-inventory/inventory-active-work-v6.tsx", (source) => {
  if (!source.includes("timingOverrideConfirmed: true")) {
    source = source.replace(
      '      if (!response.ok) throw new Error(payload.error || "Failed to update Work Order.");',
      `      if (response.status === 409 && (payload as { requiresTimingConfirmation?: boolean }).requiresTimingConfirmation) {\n        const timing = payload as { laborDeviationPercent?: number | null; laborRationale?: string | null };\n        const detail = timing.laborDeviationPercent ? \`The new labor estimate differs by \${timing.laborDeviationPercent}%.\\n\\nAI rationale: \${timing.laborRationale || "No detailed rationale was recorded."}\` : String(payload.error || "Material timing change.");\n        if (window.confirm(\`Lot Logic flagged a material timing change (>25%).\\n\\n\${detail}\\n\\nConfirm this estimate anyway?\`)) {\n          const retry = await fetch(\`/api/mindful/inventory/work-orders/\${workOrderId}\`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ ...body, timingOverrideConfirmed: true }) });\n          const retryPayload = await retry.json() as { error?: string; scheduleCleared?: boolean };\n          if (!retry.ok) throw new Error(retryPayload.error || "Failed to confirm timing override.");\n          setRowMessages((current) => ({ ...current, [workOrderId]: { type: "success", text: success } }));\n          router.refresh();\n          return;\n        }\n        throw new Error("Timing change was not saved.");\n      }\n      if (!response.ok) throw new Error(payload.error || "Failed to update Work Order.");`,
    );
  }
  const oldDescription = "Track our team&apos;s time and the managerial value created separately from vendor cash cost. The value is carried into the vehicle&apos;s projected value.";
  if (source.includes(oldDescription) && !source.includes("AI timing basis")) {
    source = source.replace(
      oldDescription,
      `${oldDescription}</div>{work.aiEstimatedLaborMinutes ? <div className="mt-2 rounded-lg bg-blue-50 px-3 py-2 text-[11px] font-semibold text-blue-800"><span className="font-black">AI timing basis:</span> {hours(work.aiEstimatedLaborMinutes)} labor · {work.laborEstimateRationale || "Legacy estimate; detailed rationale was not recorded."}</div> : null}<div className="hidden">`,
    );
  }
  return source;
}) || changed;

changed = patch("app/api/mindful/inventory/work-orders/[workOrderId]/schedule/route.ts", (source) => {
  source = source.replace(
    "estimated_elapsed_minutes,estimated_duration_minutes,assigned_partner_id",
    "estimated_labor_minutes,estimated_elapsed_minutes,estimated_duration_minutes,assigned_partner_id",
  );
  source = source.replace(
    "    const duration = Number(existing.estimated_elapsed_minutes ?? existing.estimated_duration_minutes ?? 60);\n    const safeDuration = Number.isFinite(duration) && duration > 0 ? duration : 60;\n    const end = new Date(start.getTime() + safeDuration * 60_000);",
    `    const duration = Number(existing.estimated_labor_minutes ?? 60);\n    const safeDuration = Number.isFinite(duration) && duration > 0 ? duration : 60;\n    const offsetRaw = Number(body.tzOffset ?? 0);\n    const offsetMinutes = Number.isFinite(offsetRaw) ? Math.max(-840, Math.min(840, offsetRaw)) : 0;\n    const shifted = new Date(start.getTime() - offsetMinutes * 60_000);\n    let remaining = safeDuration;\n    let cursor = new Date(start);\n    let end = new Date(start);\n    let guard = 0;\n    while (remaining > 0 && guard < 30) {\n      guard += 1;\n      const local = new Date(cursor.getTime() - offsetMinutes * 60_000);\n      const weekday = local.getUTCDay();\n      const hour = local.getUTCHours();\n      const minute = local.getUTCMinutes();\n      if (weekday === 0 || weekday === 6 || hour >= 17) { const add = weekday === 5 ? 3 : weekday === 6 ? 2 : 1; cursor = new Date(Date.UTC(local.getUTCFullYear(), local.getUTCMonth(), local.getUTCDate() + add, 8, 0) + offsetMinutes * 60_000); continue; }\n      if (hour < 8) { cursor = new Date(Date.UTC(local.getUTCFullYear(), local.getUTCMonth(), local.getUTCDate(), 8, 0) + offsetMinutes * 60_000); continue; }\n      const available = 17 * 60 - (hour * 60 + minute);\n      const used = Math.min(remaining, available);\n      end = new Date(cursor.getTime() + used * 60_000);\n      remaining -= used;\n      cursor = new Date(Date.UTC(local.getUTCFullYear(), local.getUTCMonth(), local.getUTCDate() + 1, 8, 0) + offsetMinutes * 60_000);\n    }`,
  );
  source = source.replace("elapsedMinutes: safeDuration", "laborMinutes: safeDuration");
  return source;
}) || changed;

console.log(changed ? "Governed AI timing rationale, material overrides, and labor-based scheduling." : "Time-estimate governance already aligned.");
