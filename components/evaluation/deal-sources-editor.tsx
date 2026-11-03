"use client";

import { useEffect, useState } from "react";
import { defaultDealSources, normalizeDealSources, type DealSourceProfile } from "@/lib/deal-source-profiles";

type Props = {
  onClose?: () => void;
  onSaved?: (sources: DealSourceProfile[]) => void;
  onApply?: (profile: DealSourceProfile) => void;
  embedded?: boolean;
};

const columns = [
  ["auctionFee", "Auction / Transaction Fee"],
  ["transport", "Transport"],
  ["recon", "Recon Reserve"],
  ["detailAdmin", "Detail / Admin"],
  ["generalRiskReserve", "Contingency Reserve"],
] as const satisfies ReadonlyArray<readonly [keyof DealSourceProfile, string]>;

function TrashIcon() {
  return (
    <svg aria-hidden="true" viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <path d="M4 7h16M10 4h4M6 7l1 13h10l1-13M10 11v5m4-5v5" />
    </svg>
  );
}

export function DealSourcesEditor({ onClose, onSaved, onApply, embedded = false }: Props) {
  const [sources, setSources] = useState<DealSourceProfile[]>(defaultDealSources);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [canEdit, setCanEdit] = useState(false);
  const [dirty, setDirty] = useState(false);
  const [status, setStatus] = useState("");

  useEffect(() => {
    let active = true;
    void (async () => {
      try {
        const res = await fetch("/api/deal-sources", { cache: "no-store" });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || "Unable to load source profiles");
        if (active) {
          setSources(normalizeDealSources(data.sources));
          setCanEdit(Boolean(data.canEdit));
          setDirty(false);
        }
      } catch (error) {
        if (active) setStatus(error instanceof Error ? error.message : "Unable to load source profiles");
      } finally {
        if (active) setLoading(false);
      }
    })();
    return () => { active = false; };
  }, []);

  function changeSource(id: string, key: keyof DealSourceProfile, value: string | number) {
    setSources(rows => rows.map(row => row.id === id ? { ...row, [key]: value } : row));
    setDirty(true);
    setStatus("");
  }

  function addRow() {
    if (sources.length >= 30) return;
    const id = `custom-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
    setSources(rows => [...rows, {
      id, name: "New source", auctionFee: 0, transport: 0, recon: 0,
      detailAdmin: 0, generalRiskReserve: 0,
    }]);
    setDirty(true);
    setStatus("");
  }

  function removeRow(id: string) {
    if (sources.length <= 1) return;
    setSources(rows => rows.filter(row => row.id !== id));
    setDirty(true);
    setStatus("");
  }

  async function save() {
    setSaving(true);
    setStatus("");
    try {
      const names = sources.map(source => source.name.trim().toLowerCase());
      if (names.some(name => !name) || new Set(names).size !== names.length) {
        throw new Error("Each source needs a unique, non-empty name.");
      }
      const res = await fetch("/api/deal-sources", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ sources }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Unable to save sources");
      setSources(data.sources);
      setDirty(false);
      setStatus("Saved dealership defaults");
      onSaved?.(data.sources);
    } catch (error) {
      setStatus(error instanceof Error ? error.message : "Unable to save sources");
    } finally {
      setSaving(false);
    }
  }

  const inputClass = "w-full min-w-0 rounded-lg border border-slate-200 bg-white px-2.5 py-2 text-sm font-semibold text-slate-800 outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100 disabled:bg-slate-50 disabled:text-slate-500";
  return (
    <div className={embedded
      ? "rounded-2xl border border-slate-200 bg-white p-4 sm:p-5"
      : "w-full rounded-2xl bg-white p-4 shadow-2xl sm:p-6"}>
      <div className="mb-4 flex items-start justify-between gap-3">
        <div>
          <h2 className="text-xl font-black text-slate-950">Deal Sources &amp; Costs</h2>
          <p className="mt-1 text-sm text-slate-600">Set defaults for new evaluations. Existing deals will not change.</p>
        </div>
        {onClose ? (
          <button type="button" onClick={onClose} className="shrink-0 rounded-lg border border-slate-200 px-3 py-2 text-xs font-bold text-slate-600 hover:bg-slate-50">Close</button>
        ) : null}
      </div>

      {loading ? <p role="status" className="py-5 text-sm text-slate-600">Loading source profiles…</p> : (
        <div className="space-y-4">
          <div className="overflow-x-auto rounded-xl border border-slate-200" role="region" aria-label="Deal source cost defaults" tabIndex={0}>
            <table className="w-full min-w-[1000px] border-collapse text-left">
              <thead className="bg-slate-50">
                <tr>
                  <th scope="col" className="min-w-[190px] px-3 py-3 text-xs font-black text-slate-700">Acquisition Source</th>
                  {columns.map(([key, label]) => (
                    <th scope="col" key={key} className="min-w-[130px] px-2 py-3 text-xs font-black leading-4 text-slate-700">{label}</th>
                  ))}
                  <th scope="col" className="min-w-[102px] px-2 py-3 text-right text-xs font-black text-slate-700">Actions</th>
                </tr>
              </thead>
              <tbody>
                {sources.map((source, index) => (
                  <tr key={source.id} className={`border-t border-slate-200 ${index % 2 ? "bg-slate-50/40" : "bg-white"}`}>
                    <th scope="row" className="px-3 py-2 font-normal">
                      <label className="sr-only" htmlFor={`source-name-${source.id}`}>Acquisition source name</label>
                      <input
                        id={`source-name-${source.id}`}
                        aria-label={`Source name, row ${index + 1}`}
                        disabled={!canEdit || saving}
                        maxLength={90}
                        value={source.name}
                        onChange={event => changeSource(source.id, "name", event.target.value)}
                        className={inputClass}
                      />
                    </th>
                    {columns.map(([key, label]) => (
                      <td key={key} className="px-2 py-2">
                        <div className="flex items-center rounded-lg border border-slate-200 bg-white focus-within:border-blue-500 focus-within:ring-2 focus-within:ring-blue-100">
                          <span aria-hidden="true" className="pl-2.5 text-xs text-slate-400">$</span>
                          <input
                            aria-label={`${label} for ${source.name || `row ${index + 1}`}`}
                            type="number"
                            inputMode="numeric"
                            min={0}
                            max={1000000}
                            step={1}
                            disabled={!canEdit || saving}
                            value={source[key]}
                            onChange={event => changeSource(source.id, key, Math.max(0, Math.min(1000000, Number(event.target.value) || 0)))}
                            className="w-full min-w-0 bg-transparent px-2 py-2 text-right text-sm font-semibold text-slate-800 outline-none disabled:text-slate-500"
                          />
                        </div>
                      </td>
                    ))}
                    <td className="px-2 py-2 text-right">
                      <div className="flex items-center justify-end gap-1">
                        {onApply ? <button type="button" onClick={() => onApply(source)} title={`Apply ${source.name} to this vehicle`} className="rounded-md px-2 py-2 text-xs font-bold text-blue-700 hover:bg-blue-50">Apply</button> : null}
                        <button
                          type="button"
                          aria-label={`Remove ${source.name}`}
                          title={sources.length <= 1 ? "Keep at least one source" : `Remove ${source.name}`}
                          onClick={() => removeRow(source.id)}
                          disabled={!canEdit || saving || sources.length <= 1}
                          className="inline-flex h-9 w-9 items-center justify-center rounded-lg text-slate-400 hover:bg-red-50 hover:text-red-600 disabled:cursor-not-allowed disabled:opacity-30"
                        >
                          <TrashIcon />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {canEdit ? (
            <div className="flex flex-wrap items-center justify-between gap-3">
              <button type="button" onClick={addRow} disabled={saving || sources.length >= 30} className="rounded-lg border border-slate-200 px-3 py-2 text-xs font-bold text-blue-700 hover:bg-blue-50 disabled:opacity-40">+ Add Row</button>
              <span className="text-xs text-slate-500">{dirty ? "Unsaved changes" : `${sources.length} acquisition source${sources.length === 1 ? "" : "s"}`}</span>
            </div>
          ) : <p className="text-xs text-slate-500">Only dealership administrators can edit these defaults.</p>}
          {status ? <p role="status" className="text-xs font-semibold text-blue-800">{status}</p> : null}
          {canEdit ? (
            <button type="button" onClick={() => void save()} disabled={saving || sources.length === 0} className="w-full rounded-xl bg-blue-700 px-4 py-3 text-sm font-black text-white hover:bg-blue-800 disabled:opacity-50">
              {saving ? "Saving…" : "Save Defaults"}
            </button>
          ) : null}
        </div>
      )}
    </div>
  );
}
