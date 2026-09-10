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

let changed = false;

changed = patch("components/mindful-inventory/inventory-schedule-board.tsx", (source) => {
  let updated = source;

  if (!updated.includes("type PartsScheduleState")) {
    const anchor = `function partsLabel(item: InventoryScheduleWork) {
  if (item.partsReadiness === "backordered") return "Backordered";
  if (item.partsReadiness === "ordered") return "Ordered / in transit";
  if (item.partsReadiness === "ready") return "Parts received";
  if (item.partsReadiness === "installed") return "Installed";
  return "Parts needed";
}
`;
    const addition = anchor + `
type PartsScheduleState = { kind: "ready" | "expected" | "conflict" | "unknown" | "issue"; label: string; detail: string };
const PARTS_ETA_BUFFER_MINUTES = 120;

function partsScheduleState(item: InventoryScheduleWork): PartsScheduleState {
  if (item.partnerPartsConfirmationStatus === "issue_reported") {
    return { kind: "issue", label: "Parts issue", detail: "Partner reported an open parts issue." };
  }
  if (item.partsReadyForExecution) return { kind: "ready", label: "Parts ready", detail: partsLabel(item) };
  if (item.partsLatestEtaAt) {
    const eta = new Date(item.partsLatestEtaAt);
    const etaMs = eta.getTime();
    const bufferedEtaMs = Number.isFinite(etaMs) ? etaMs + PARTS_ETA_BUFFER_MINUTES * 60_000 : null;
    const etaLabel = Number.isFinite(etaMs)
      ? eta.toLocaleString("en-US", { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" })
      : "unknown";
    const startMs = item.scheduledStartAt ? new Date(item.scheduledStartAt).getTime() : null;
    if (bufferedEtaMs !== null && startMs !== null && Number.isFinite(startMs) && startMs < bufferedEtaMs) {
      return { kind: "conflict", label: "Parts conflict", detail: "Latest required-part ETA " + etaLabel + " · 2 hr receiving buffer" };
    }
    return { kind: "expected", label: "Parts expected before work", detail: "Latest required-part ETA " + etaLabel + " · 2 hr receiving buffer" };
  }
  return { kind: "unknown", label: "Parts ETA unknown", detail: "A required part has no ETA. Schedule may be at risk." };
}

function partsNeedsAttention(state: PartsScheduleState) {
  return state.kind === "issue" || state.kind === "conflict" || state.kind === "unknown";
}
`;
    if (updated.includes(anchor)) updated = updated.replace(anchor, addition);
  }

  updated = updated.replace(
    "  const waitingOnParts = active.filter((item) => !item.partsReadyForExecution);",
    "  const waitingOnParts = active.filter((item) => partsNeedsAttention(partsScheduleState(item)));",
  );
  updated = updated.replace(
    '    if (viewMode === "parts") return !item.partsReadyForExecution;',
    '    if (viewMode === "parts") return partsNeedsAttention(partsScheduleState(item));',
  );
  updated = updated.replaceAll("Waiting on Parts (", "Parts Attention (");
  updated = updated.replace(
    "    setStarts((current) => ({ ...current, [item.id]: current[item.id] || localInput(item.scheduledStartAt) || localInputDefault() }));",
    "    setStarts((current) => ({ ...current, [item.id]: current[item.id] || localInput(item.proposedStartAt || item.scheduledStartAt) || localInputDefault() }));",
  );

  if (!updated.includes("Schedule change cancelled — an override reason is required.")) {
    const start = updated.indexOf("  async function schedule(item: InventoryScheduleWork) {");
    const end = updated.indexOf("\n\n  async function patchItem", start);
    if (start >= 0 && end > start) {
      const replacement = `  async function schedule(item: InventoryScheduleWork) {
    const localStart = starts[item.id] || localInput(item.proposedStartAt || item.scheduledStartAt) || localInputDefault();
    setWorkingId(item.id);
    setMessage("");
    try {
      const send = async (overrideConflict = false, overrideReason = "") => {
        const response = await fetch("/api/mindful/inventory/work-orders/" + item.id + "/schedule", {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            scheduledStartAt: new Date(localStart).toISOString(),
            tzOffset: new Date().getTimezoneOffset(),
            overrideConflict,
            overrideReason,
          }),
        });
        const payload = (await response.json()) as {
          error?: string;
          warning?: string;
          requiresOverride?: boolean;
          scheduled_start_at?: string | null;
          scheduled_end_at?: string | null;
          proposed_start_at?: string | null;
          proposed_end_at?: string | null;
          partner_confirmation_status?: string | null;
          status?: string;
          schedule_source?: string;
        };
        return { response, payload };
      };

      let result = await send();
      if (!result.response.ok && result.payload.requiresOverride) {
        const warning = result.payload.warning || result.payload.error || "This time has a scheduling risk.";
        if (!window.confirm(warning + "\n\nSchedule it anyway?")) {
          setMessage("Schedule change cancelled.");
          return;
        }
        const reason = window.prompt("Briefly note why this schedule should be used despite the warning:")?.trim();
        if (!reason) {
          setMessage("Schedule change cancelled — an override reason is required.");
          return;
        }
        result = await send(true, reason);
      }
      if (!result.response.ok) throw new Error(result.payload.error || "Failed to schedule work.");

      const payload = result.payload;
      replaceLocalItem(item.id, (current) => ({
        ...current,
        scheduledStartAt: payload.scheduled_start_at ?? current.scheduledStartAt,
        scheduledEndAt: payload.scheduled_end_at ?? current.scheduledEndAt,
        proposedStartAt: payload.proposed_start_at ?? null,
        proposedEndAt: payload.proposed_end_at ?? null,
        partnerConfirmationStatus: payload.partner_confirmation_status ?? current.partnerConfirmationStatus,
        status: payload.status || current.status,
        scheduleSource: payload.schedule_source || current.scheduleSource,
      }));
      setNowMs(Date.now());
      setMessage(payload.partner_confirmation_status === "awaiting_partner"
        ? item.title + ": time proposed to Partner."
        : item.title + " scheduled.");
      router.refresh();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Failed to schedule work.");
    } finally {
      setWorkingId(null);
    }
  }`;
      updated = updated.slice(0, start) + replacement + updated.slice(end);
    }
  }

  updated = updated.replace(
    "    const waitingParts = !complete && !item.partsReadyForExecution;",
    "    const partsState = partsScheduleState(item);\n    const waitingParts = !complete && partsNeedsAttention(partsState);",
  );
  updated = updated.replace(
    '>Waiting on parts</span>',
    '>{partsState.label}</span>',
  );
  updated = updated.replace(
    '{waitingParts ? <div className="mt-2 text-[10px] font-black text-amber-800">{partsLabel(item)}{item.pendingPartCount ? ` · ${item.pendingPartCount} pending` : ""}{item.partsLatestEtaAt ? ` · ETA ${new Date(item.partsLatestEtaAt).toLocaleDateString("en-US", { month: "short", day: "numeric" })}` : ""}</div> : null}',
    '{waitingParts ? <div className="mt-2 text-[10px] font-black text-amber-800">{partsState.detail}</div> : null}',
  );

  if (!updated.includes("const selectedPartsState")) {
    updated = updated.replace(
      "  const selectedHealth = selectedItem ? getScheduleHealth(selectedItem, nowMs) : null;",
      "  const selectedHealth = selectedItem ? getScheduleHealth(selectedItem, nowMs) : null;\n  const selectedPartsState = selectedItem ? partsScheduleState(selectedItem) : null;",
    );
  }

  const oldPartsPanel = '{!selectedItem.partsReadyForExecution ? <div className="rounded-xl border border-amber-300 bg-amber-50 p-3"><div className="text-sm font-black text-amber-950">Waiting on parts</div><div className="mt-1 text-xs font-bold text-amber-800">{partsLabel(selectedItem)}{selectedItem.pendingPartCount ? ` · ${selectedItem.pendingPartCount} pending` : ""}{selectedItem.partsLatestEtaAt ? ` · ETA ${new Date(selectedItem.partsLatestEtaAt).toLocaleDateString("en-US", { month: "short", day: "numeric" })}` : ""}</div><Link href={`/mindful/inventory/${selectedItem.vehicleId}/parts`} className="mt-2 inline-flex text-xs font-black text-amber-900 underline">Manage Parts →</Link></div> : null}';
  const newPartsPanel = '{selectedPartsState && selectedPartsState.kind !== "ready" ? <div className={`rounded-xl border p-3 ${selectedPartsState.kind === "expected" ? "border-emerald-200 bg-emerald-50" : "border-amber-300 bg-amber-50"}`}><div className={`text-sm font-black ${selectedPartsState.kind === "expected" ? "text-emerald-900" : "text-amber-950"}`}>{selectedPartsState.label}</div><div className={`mt-1 text-xs font-bold ${selectedPartsState.kind === "expected" ? "text-emerald-800" : "text-amber-800"}`}>{selectedPartsState.detail}</div><div className="mt-2 flex flex-wrap gap-3"><Link href={`/mindful/inventory/${selectedItem.vehicleId}/parts`} className="text-xs font-black underline">Review parts →</Link>{selectedPartsState.kind === "conflict" ? <button type="button" onClick={() => document.getElementById("selected-schedule-editor")?.scrollIntoView({ behavior: "smooth", block: "center" })} className="cursor-pointer text-xs font-black underline">Reschedule →</button> : null}</div></div> : null}';
  if (updated.includes(oldPartsPanel)) updated = updated.replace(oldPartsPanel, newPartsPanel);

  if (!updated.includes('id="selected-schedule-editor"')) {
    updated = updated.replace(
      '<div className="rounded-xl border border-slate-200 p-4"><SuggestedTimePicker',
      '<div id="selected-schedule-editor" className="rounded-xl border border-slate-200 p-4"><SuggestedTimePicker',
    );
    updated = updated.replace(
      '<div className="rounded-xl border border-slate-200 p-4"><label className="block"><div className="text-[10px] font-black uppercase tracking-[0.08em] text-slate-400">Scheduled start</div>',
      '<div id="selected-schedule-editor" className="rounded-xl border border-slate-200 p-4"><label className="block"><div className="text-[10px] font-black uppercase tracking-[0.08em] text-slate-400">Scheduled start</div>',
    );
  }

  return updated;
}) || changed;

console.log(changed ? "Aligned Schedule command-center parts signals and audited override UX." : "Schedule command-center UX already aligned.");
