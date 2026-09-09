"use client";

import { useCallback, useEffect, useState } from "react";

type ScheduleSegment = { startAt: string; endAt: string };
type ScheduleSuggestion = { startAt: string; endAt: string; segments?: ScheduleSegment[] };

type Props = {
  endpoint: string;
  selectedStartAt?: string | null;
  onSelect: (startAt: string, endAt: string) => void;
  refreshKey?: string | number | null;
  compact?: boolean;
};

function timeMs(value: string | null | undefined) {
  if (!value) return null;
  const ms = new Date(value).getTime();
  return Number.isFinite(ms) ? ms : null;
}

function label(value: string) {
  const ms = timeMs(value);
  if (ms === null) return "Available time";
  return new Date(ms).toLocaleString("en-US", {
    weekday: "short",
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

function segmentLabel(segment: ScheduleSegment) {
  const startMs = timeMs(segment.startAt);
  const endMs = timeMs(segment.endAt);
  if (startMs === null || endMs === null) return null;
  const start = new Date(startMs);
  const end = new Date(endMs);
  return `${start.toLocaleString("en-US", { weekday: "short", hour: "numeric", minute: "2-digit" })}–${end.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" })}`;
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

  const selectedMs = timeMs(selectedStartAt);

  return <div className={compact ? "mb-2" : "mb-3 rounded-lg border border-blue-100 bg-blue-50/40 p-3"}>
    <div className="flex items-center justify-between gap-2">
      <div className="text-[10px] font-black uppercase tracking-[0.08em] text-blue-700">Suggested times</div>
      <button type="button" disabled={loading} onClick={() => void load()} className="text-[10px] font-black text-blue-700 hover:text-blue-900 disabled:opacity-50">{loading ? "Checking…" : "Refresh"}</button>
    </div>
    {guidance ? <div className="mt-1 text-[10px] font-semibold text-amber-700">{guidance}</div> : null}
    {error ? <div className="mt-2 text-[11px] font-semibold text-red-700">{error}</div> : null}
    {!error && !loading && !suggestions.length ? <div className="mt-2 text-[11px] font-semibold text-slate-500">No conflict-free labor slots found in the next two weeks. You can still choose another time manually.</div> : null}
    {suggestions.length ? <div className="mt-2 flex flex-wrap gap-2">{suggestions.map((slot) => {
      const slotMs = timeMs(slot.startAt);
      const selected = selectedMs !== null && slotMs !== null && selectedMs === slotMs;
      const segments = (slot.segments || []).map(segmentLabel).filter(Boolean) as string[];
      return <button key={slot.startAt} type="button" onClick={() => onSelect(slot.startAt, slot.endAt)} className={`rounded-lg border px-2.5 py-2 text-left text-[11px] font-black transition ${selected ? "border-blue-600 bg-blue-700 text-white" : "border-blue-200 bg-white text-blue-900 hover:border-blue-500 hover:bg-blue-50"}`}>
        <div>{label(slot.startAt)}</div>
        {segments.length > 1 ? <div className={`mt-1 text-[9px] font-semibold ${selected ? "text-blue-100" : "text-slate-500"}`}>{segments.join(" · ")}</div> : null}
      </button>;
    })}</div> : null}
    {!compact ? <div className="mt-2 text-[10px] font-semibold text-slate-400">Suggestions use hands-on labor capacity. Elapsed turnaround is tracked separately; long labor jobs are split across workdays.</div> : null}
  </div>;
}
