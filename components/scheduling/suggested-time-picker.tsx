"use client";

import { useCallback, useEffect, useMemo, useState } from "react";

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
  const sameDay = start.toDateString() === end.toDateString();
  const startLabel = start.toLocaleString("en-US", {
    weekday: "short",
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
  const endLabel = end.toLocaleString("en-US", sameDay
    ? { hour: "numeric", minute: "2-digit" }
    : { weekday: "short", month: "short", day: "numeric", hour: "numeric", minute: "2-digit" });
  return `${startLabel}–${endLabel}`;
}

function hoursLabel(minutes: number | null) {
  if (minutes === null || !Number.isFinite(minutes) || minutes <= 0) return null;
  const hours = Math.round((minutes / 60) * 10) / 10;
  return `${hours} hr`;
}

export function SuggestedTimePicker({ endpoint, selectedStartAt, onSelect, refreshKey, compact = false }: Props) {
  const [suggestions, setSuggestions] = useState<ScheduleSuggestion[]>([]);
  const [guidance, setGuidance] = useState<string | null>(null);
  const [laborMinutes, setLaborMinutes] = useState<number | null>(null);
  const [elapsedMinutes, setElapsedMinutes] = useState<number | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const separator = endpoint.includes("?") ? "&" : "?";
      const response = await fetch(`${endpoint}${separator}tzOffset=${new Date().getTimezoneOffset()}`, { cache: "no-store" });
      const payload = await response.json() as {
        error?: string;
        guidance?: string | null;
        laborMinutes?: number | null;
        elapsedMinutes?: number | null;
        suggestions?: ScheduleSuggestion[];
      };
      if (!response.ok) throw new Error(payload.error || "Could not calculate available times.");
      setSuggestions(payload.suggestions || []);
      setGuidance(payload.guidance || null);
      setLaborMinutes(typeof payload.laborMinutes === "number" ? payload.laborMinutes : null);
      setElapsedMinutes(typeof payload.elapsedMinutes === "number" ? payload.elapsedMinutes : null);
    } catch (cause) {
      setSuggestions([]);
      setGuidance(null);
      setLaborMinutes(null);
      setElapsedMinutes(null);
      setError(cause instanceof Error ? cause.message : "Could not calculate available times.");
    } finally {
      setLoading(false);
    }
  }, [endpoint]);

  useEffect(() => { void load(); }, [load, refreshKey]);

  const selectedMs = timeMs(selectedStartAt);
  const selectedSuggestion = useMemo(() => suggestions.find((slot) => {
    const slotMs = timeMs(slot.startAt);
    return selectedMs !== null && slotMs !== null && selectedMs === slotMs;
  }) || null, [selectedMs, suggestions]);
  const selectedSegments = useMemo(() => (selectedSuggestion?.segments || []).map(segmentLabel).filter(Boolean) as string[], [selectedSuggestion]);
  const laborText = hoursLabel(laborMinutes);
  const elapsedText = hoursLabel(elapsedMinutes);

  return <div className={compact ? "mb-2" : "mb-3"}>
    <div className="flex items-center justify-between gap-3">
      <div>
        <div className="text-[10px] font-black uppercase tracking-[0.08em] text-blue-700">Suggested times</div>
        {!compact && elapsedText && laborText && elapsedMinutes !== null && laborMinutes !== null && elapsedMinutes > laborMinutes
          ? <div className="mt-0.5 text-[10px] font-semibold text-slate-500">{laborText} hands-on labor · {elapsedText} turnaround</div>
          : null}
      </div>
      <button type="button" disabled={loading} onClick={() => void load()} className="cursor-pointer text-[10px] font-black text-blue-700 hover:text-blue-900 disabled:cursor-default disabled:opacity-50">{loading ? "Checking…" : "Refresh"}</button>
    </div>

    {error ? <div className="mt-2 text-[11px] font-semibold text-red-700">{error}</div> : null}
    {!error && !loading && !suggestions.length ? <div className="mt-2 text-[11px] font-semibold text-slate-500">No conflict-free labor slots found in the next two weeks. You can still choose another time manually.</div> : null}

    {suggestions.length ? <div className="mt-2 grid grid-cols-2 gap-2 sm:grid-cols-3 xl:grid-cols-4">{suggestions.map((slot) => {
      const slotMs = timeMs(slot.startAt);
      const selected = selectedMs !== null && slotMs !== null && selectedMs === slotMs;
      return <button
        key={slot.startAt}
        type="button"
        onClick={() => onSelect(slot.startAt, slot.endAt)}
        className={`cursor-pointer rounded-lg border px-3 py-2.5 text-left text-[11px] font-black transition ${selected ? "border-blue-600 bg-blue-700 text-white shadow-sm" : "border-slate-200 bg-white text-slate-900 hover:border-blue-400 hover:bg-blue-50"}`}
      >
        {label(slot.startAt)}
      </button>;
    })}</div> : null}

    {selectedSuggestion && !compact ? <div className="mt-2 rounded-lg bg-slate-50 px-3 py-2.5 text-[10px] text-slate-600">
      <div className="font-black text-slate-800">Selected: {label(selectedSuggestion.startAt)}</div>
      {selectedSegments.length ? <div className="mt-1"><span className="font-black">Labor:</span> {selectedSegments.join(" · ")}</div> : laborText ? <div className="mt-1"><span className="font-black">Labor:</span> {laborText}</div> : null}
      {elapsedText && elapsedMinutes !== null && laborMinutes !== null && elapsedMinutes > laborMinutes ? <div className="mt-1"><span className="font-black">Turnaround:</span> {elapsedText}</div> : null}
    </div> : null}

    {guidance ? <div className="mt-2 text-[10px] font-semibold text-slate-500">{guidance}</div> : null}

    {!compact ? <div className="my-3 flex items-center gap-3 text-[9px] font-black uppercase tracking-[0.08em] text-slate-400">
      <span className="h-px flex-1 bg-slate-200" />
      <span>or choose another time</span>
      <span className="h-px flex-1 bg-slate-200" />
    </div> : null}
  </div>;
}
