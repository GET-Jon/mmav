"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

import type { InventoryPartView } from "@/lib/mindful-inventory/parts-transport";

function localDateTime(value: string | null) {
  if (!value) return "";
  const date = new Date(value);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

function shortDate(value: string | null) {
  if (!value) return "Not entered";
  return new Date(value).toLocaleString("en-US", {
    weekday: "short",
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

type Draft = {
  supplier: string;
  price: string;
  eta: string;
  url: string;
  tracking: string;
};

export function TrackedPartDetailsEditor({ vehicleId, parts, compact = false }: {
  vehicleId: string;
  parts: InventoryPartView[];
  compact?: boolean;
}) {
  const router = useRouter();
  const activeParts = parts.filter((part) => part.status !== "cancelled");
  const [editingId, setEditingId] = useState<string | null>(null);
  const [drafts, setDrafts] = useState<Record<string, Draft>>({});
  const [workingId, setWorkingId] = useState<string | null>(null);
  const [message, setMessage] = useState("");

  function draftFor(part: InventoryPartView): Draft {
    return drafts[part.id] || {
      supplier: part.supplier || "",
      price: part.quotedUnitPrice == null ? "" : String(part.quotedUnitPrice),
      eta: localDateTime(part.etaAt),
      url: part.sourceUrl || "",
      tracking: part.trackingReference || "",
    };
  }

  function beginEdit(part: InventoryPartView) {
    setDrafts((current) => ({ ...current, [part.id]: draftFor(part) }));
    setEditingId(part.id);
    setMessage("");
  }

  function patchDraft(part: InventoryPartView, patch: Partial<Draft>) {
    setDrafts((current) => ({ ...current, [part.id]: { ...draftFor(part), ...patch } }));
  }

  async function save(part: InventoryPartView) {
    const draft = draftFor(part);
    setWorkingId(part.id);
    setMessage("");
    try {
      const response = await fetch(`/api/mindful/inventory/vehicles/${vehicleId}/parts`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          partId: part.id,
          supplier: draft.supplier || null,
          quotedUnitPrice: draft.price || null,
          etaAt: draft.eta ? new Date(draft.eta).toISOString() : null,
          sourceUrl: draft.url || null,
          sourceType: draft.url ? "marketplace" : part.sourceType,
          trackingReference: draft.tracking || null,
        }),
      });
      const text = await response.text();
      const payload = text.trim() ? JSON.parse(text) as { error?: string } : {};
      if (!response.ok) throw new Error(payload.error || "Part details could not be saved.");
      setEditingId(null);
      setMessage(`${part.description} updated.`);
      router.refresh();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Part details could not be saved.");
    } finally {
      setWorkingId(null);
    }
  }

  if (!activeParts.length) return null;

  return <section className={`rounded-2xl border border-slate-200 bg-white shadow-sm ${compact ? "p-4" : "p-5"}`}>
    <div className="flex items-start justify-between gap-3">
      <div>
        <div className="text-[10px] font-black uppercase tracking-[0.1em] text-slate-400">Tracked part details</div>
        <div className="mt-1 text-sm font-black">ETA, supplier and tracking stay editable after a part is tracked.</div>
      </div>
      <span className="rounded-full bg-slate-100 px-2.5 py-1 text-[10px] font-black text-slate-600">{activeParts.length} active</span>
    </div>
    {message ? <div className="mt-3 rounded-lg bg-slate-50 px-3 py-2 text-xs font-bold text-slate-700">{message}</div> : null}
    <div className="mt-3 space-y-2">
      {activeParts.map((part) => {
        const editing = editingId === part.id;
        const draft = draftFor(part);
        return <div key={part.id} className="rounded-xl border border-slate-200 p-3">
          <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
            <div className="min-w-0">
              <div className="text-sm font-black text-slate-900">{part.description}</div>
              <div className="mt-1 text-xs font-semibold text-slate-500">ETA: <span className={part.etaAt ? "text-slate-700" : "text-amber-700"}>{shortDate(part.etaAt)}</span>{part.supplier ? ` · ${part.supplier}` : ""}{part.trackingReference ? ` · Tracking ${part.trackingReference}` : ""}</div>
            </div>
            {!editing ? <button type="button" onClick={() => beginEdit(part)} className="shrink-0 rounded-lg border border-slate-300 bg-white px-3 py-2 text-xs font-black">Edit details</button> : null}
          </div>
          {editing ? <div className="mt-3 grid gap-2 border-t border-slate-200 pt-3 sm:grid-cols-2 lg:grid-cols-5">
            <input value={draft.supplier} onChange={(e) => patchDraft(part, { supplier: e.target.value })} placeholder="Supplier" className="rounded-lg border border-slate-200 px-3 py-2 text-xs" />
            <input value={draft.price} onChange={(e) => patchDraft(part, { price: e.target.value })} type="number" min="0" step="0.01" placeholder="Price" className="rounded-lg border border-slate-200 px-3 py-2 text-xs" />
            <input value={draft.eta} onChange={(e) => patchDraft(part, { eta: e.target.value })} type="datetime-local" aria-label="Part ETA" className="rounded-lg border border-slate-200 px-3 py-2 text-xs" />
            <input value={draft.tracking} onChange={(e) => patchDraft(part, { tracking: e.target.value })} placeholder="Tracking #" className="rounded-lg border border-slate-200 px-3 py-2 text-xs" />
            <input value={draft.url} onChange={(e) => patchDraft(part, { url: e.target.value })} type="url" placeholder="Part URL" className="rounded-lg border border-slate-200 px-3 py-2 text-xs" />
            <div className="flex gap-2 sm:col-span-2 lg:col-span-5">
              <button type="button" disabled={workingId === part.id} onClick={() => void save(part)} className="rounded-lg bg-slate-950 px-4 py-2 text-xs font-black text-white disabled:opacity-50">{workingId === part.id ? "Saving…" : "Save details"}</button>
              <button type="button" onClick={() => setEditingId(null)} className="rounded-lg border border-slate-300 bg-white px-4 py-2 text-xs font-black">Cancel</button>
            </div>
          </div> : null}
        </div>;
      })}
    </div>
  </section>;
}
