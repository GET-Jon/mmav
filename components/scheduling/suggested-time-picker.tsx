"use client";

import { useCallback, useEffect, useState } from "react";

type ScheduleSuggestion = { startAt: string; endAt: string };

type Props = {
  endpoint: string;
  selectedStartAt?: string | null;
  onSelect: (startAt: string, endAt: string) => void;
  refreshKey?: string | number | null;
  compact?: boolean;
};

function label(value: string) {
  return new Date(value).toLocaleString("en-US", {
    weekday: "short",
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

export function SuggestedTimePicker({ endpoint, selectedStartAt, onSelect, refreshKey, compact = false }: Props) {
  const [suggestions, setSuggestions] = useState<ScheduleSuggestion[]>([]);
  const [guidance, setGuidance] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const separator = endpoint.includes("?") ? "&" : "?";
      const response = await fetch(`${endpoint}${separator}tzOffset=${new Date().getTimezoneOffset()}`, { cache: "no-store" });
      const payload = await response.json() as { error?: string; guidance?: string | null; suggestions?: ScheduleSuggestion[] };
      if (!response.ok) throw new Error(payload.error || "Could not calculate available times.");
      setSuggestions(payload.suggestions || []);
      setGuidance(payload.guidance || null);
    } catch (cause) {
      setSuggestions([]);
      setGuidance(null);
      setError(cause instanceof Error ? cause.message : "Could not calculate available times.");
    } finally {
      setLoading(false);
    }
  }, [endpoint]);

  useEffect(() => { void load(); }, [load, refreshKey]);

  return <div className={compact ? "mb-2" : "mb-3 rounded-lg border border-blue-100 bg-blue-50/40 p-3"}>
    <div className="flex items-center justify-between gap-2">
      <div className="text-[10px] font-black uppercase tracking-[0.08em] text-blue-700">Suggested times</div>
      <button type="button" disabled={loading} onClick={() => void load()} className="text-[10px] font-black text-blue-700 hover:text-blue-900 disabled:opacity-50">{loading ? "Checking…" : "Refresh"}</button>
    </div>
    {guidance ? <div className="mt-1 text-[10px] font-semibold text-amber-700">{guidance}</div> : null}
    {error ? <div className="mt-2 text-[11px] font-semibold text-red-700">{error}</div> : null}
    {!error && !loading && !suggestions.length ? <div className="mt-2 text-[11px] font-semibold text-slate-500">No conflict-free suggestions found in the next two weeks. You can still choose another time manually.</div> : null}
    {suggestions.length ? <div className="mt-2 flex flex-wrap gap-2">{suggestions.map((slot) => {
      const selected = Boolean(selectedStartAt && new Date(selectedStartAt).getTime() === new Date(slot.startAt).getTime());
      return <button key={slot.startAt} type="button" onClick={() => onSelect(slot.startAt, slot.endAt)} className={`rounded-lg border px-2.5 py-2 text-left text-[11px] font-black transition ${selected ? "border-blue-600 bg-blue-700 text-white" : "border-blue-200 bg-white text-blue-900 hover:border-blue-500 hover:bg-blue-50"}`}>
        {label(slot.startAt)}
      </button>;
    })}</div> : null}
    {!compact ? <div className="mt-2 text-[10px] font-semibold text-slate-400">Suggestions account for the known vehicle, assignee, resource, duration, and current schedule. Manual selection remains available.</div> : null}
  </div>;
}
