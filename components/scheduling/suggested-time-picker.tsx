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
  calendarHref?: string | null;
  onManualRequest?: (() => void) | null;
  manualExpanded?: boolean;
};

function timeMs(value: string | null | undefined) {
  if (!value) return null;
  const ms = new Date(value).getTime();
  return Number.isFinite(ms) ? ms : null;
}

function suggestionLabel(startValue: string, endValue: string) {
  const startMs = timeMs(startValue);
  const endMs = timeMs(endValue);
  if (startMs === null) return "Available time";

  const start = new Date(startMs);
  if (endMs === null) {
    return start.toLocaleString("en-US", {
      weekday: "short",
      month: "short",
      day: "numeric",
      hour: "numeric",
      minute: "2-digit",
    });
  }

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

export function SuggestedTimePicker({ endpoint, selectedStartAt, onSelect, refreshKey, compact = false, calendarHref = null, onManualRequest = null, manualExpanded = false }: Props) {
  const [suggestions, setSuggestions] = useState<ScheduleSuggestion[]>([]);
  const [guidance, setGuidance] = useState<string | null>(null);
  const [laborMinutes, setLaborMinutes] = useState<number | null>(null);
  const [elapsedMinutes, setElapsedMinutes] = useState<number | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [calendarOpen, setCalendarOpen] = useState(false);

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
  const visibleSuggestions = suggestions.slice(0, 2);
  const laborText = hoursLabel(laborMinutes);
  const elapsedText = hoursLabel(elapsedMinutes);

  return <>
    <div className={compact ? "mb-2" : "mb-3"}>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <div className="text-[10px] font-black uppercase tracking-[0.08em] text-blue-700">Suggested times</div>
          {!compact && elapsedText && laborText && elapsedMinutes !== null && laborMinutes !== null && elapsedMinutes > laborMinutes
            ? <div className="mt-0.5 text-[10px] font-semibold text-slate-500">{laborText} hands-on labor · {elapsedText} turnaround</div>
            : null}
        </div>
        <div className="flex items-center gap-3">
          {calendarHref ? <button type="button" onClick={() => setCalendarOpen(true)} className="cursor-pointer text-[10px] font-black text-blue-700 hover:text-blue-900">View calendar</button> : null}
          {!compact && onManualRequest ? <button type="button" onClick={onManualRequest} className="cursor-pointer text-[10px] font-black text-blue-700 hover:text-blue-900">
            {manualExpanded ? "Hide time" : "Propose time"}
          </button> : null}
        </div>
      </div>

      {error ? <div className="mt-2 text-[11px] font-semibold text-red-700">{error}</div> : null}
      {!error && loading ? <div className="mt-2 text-[11px] font-semibold text-slate-500">Checking availability…</div> : null}
      {!error && !loading && !suggestions.length ? <div className="mt-2 text-[11px] font-semibold text-slate-500">No conflict-free labor slots found in the next two weeks. You can still choose another time manually.</div> : null}

      {visibleSuggestions.length ? <div className="mt-2 grid gap-2 sm:grid-cols-2">{visibleSuggestions.map((slot) => {
        const slotMs = timeMs(slot.startAt);
        const selected = selectedMs !== null && slotMs !== null && selectedMs === slotMs;
        return <button
          key={slot.startAt}
          type="button"
          onClick={() => onSelect(slot.startAt, slot.endAt)}
          className={`cursor-pointer rounded-lg border px-3 py-2.5 text-left text-[11px] font-black transition ${selected ? "border-blue-600 bg-blue-700 text-white shadow-sm" : "border-slate-200 bg-white text-slate-900 hover:border-blue-400 hover:bg-blue-50"}`}
        >
          {suggestionLabel(slot.startAt, slot.endAt)}
        </button>;
      })}</div> : null}

      {guidance ? <div className="mt-2 text-[10px] font-semibold text-slate-500">{guidance}</div> : null}
    </div>

    {calendarOpen && calendarHref ? <div className="fixed inset-0 z-[100] flex items-center justify-center bg-slate-950/50 p-4" role="dialog" aria-modal="true" aria-label="Schedule calendar">
      <div className="flex h-[86vh] w-full max-w-[1500px] flex-col overflow-hidden rounded-2xl bg-white shadow-2xl">
        <div className="flex items-center justify-between border-b border-slate-200 px-4 py-3">
          <div>
            <div className="text-[10px] font-black uppercase tracking-[0.08em] text-blue-700">Schedule</div>
            <div className="text-sm font-black text-slate-950">Calendar availability</div>
          </div>
          <button type="button" onClick={() => setCalendarOpen(false)} className="cursor-pointer rounded-lg border border-slate-200 px-3 py-1.5 text-[11px] font-black text-slate-600 hover:bg-slate-50">Close</button>
        </div>
        <iframe title="Lot Logic schedule calendar" src={calendarHref} className="min-h-0 flex-1 w-full border-0" />
      </div>
    </div> : null}
  </>;
}
