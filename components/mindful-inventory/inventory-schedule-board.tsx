"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";

import type { InventoryScheduleWork } from "@/lib/mindful-inventory/schedule";

function labelize(value: string) {
  return value.replaceAll("_", " ").replace(/\b\w/g, (letter) => letter.toUpperCase());
}

function hours(minutes: number | null) {
  if (minutes === null) return "—";
  const value = Math.round((minutes / 60) * 10) / 10;
  return `${value} hr`;
}

function startOfWeek(offset: number) {
  const now = new Date();
  now.setHours(0, 0, 0, 0);
  const day = now.getDay();
  const mondayDistance = day === 0 ? -6 : 1 - day;
  now.setDate(now.getDate() + mondayDistance + offset * 7);
  return now;
}

function dayKey(date: Date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function localInputDefault() {
  const date = new Date();
  date.setMinutes(Math.ceil(date.getMinutes() / 30) * 30, 0, 0);
  const local = new Date(date.getTime() - date.getTimezoneOffset() * 60_000);
  return local.toISOString().slice(0, 16);
}

export function InventoryScheduleBoard({ work }: { work: InventoryScheduleWork[] }) {
  const router = useRouter();
  const [weekOffset, setWeekOffset] = useState(0);
  const [workingId, setWorkingId] = useState<string | null>(null);
  const [message, setMessage] = useState("");
  const [starts, setStarts] = useState<Record<string, string>>({});

  const weekStart = useMemo(() => startOfWeek(weekOffset), [weekOffset]);
  const days = useMemo(
    () => Array.from({ length: 7 }, (_, index) => {
      const date = new Date(weekStart);
      date.setDate(weekStart.getDate() + index);
      return date;
    }),
    [weekStart],
  );

  const scheduled = work.filter((item) => item.scheduledStartAt);
  const unscheduled = work.filter(
    (item) => !item.scheduledStartAt && item.status !== "complete" && item.status !== "cancelled",
  );
  const totalLabor = work.reduce((sum, item) => sum + (item.laborMinutes || 0), 0);
  const scheduledCount = work.filter((item) => item.scheduledStartAt).length;

  async function schedule(item: InventoryScheduleWork) {
    const localStart = starts[item.id] || localInputDefault();
    setWorkingId(item.id);
    setMessage("");
    try {
      const response = await fetch(`/api/mindful/inventory/work-orders/${item.id}/schedule`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ scheduledStartAt: new Date(localStart).toISOString() }),
      });
      const payload = (await response.json()) as { error?: string };
      if (!response.ok) throw new Error(payload.error || "Failed to schedule work.");
      setMessage(`${item.title} scheduled.`);
      router.refresh();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Failed to schedule work.");
    } finally {
      setWorkingId(null);
    }
  }

  return (
    <div className="space-y-5">
      <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
        <div className="flex flex-col gap-4 xl:flex-row xl:items-start xl:justify-between">
          <div>
            <div className="text-xs font-black uppercase tracking-[0.1em] text-slate-400">Operations Schedule</div>
            <h1 className="mt-1 text-2xl font-black text-slate-950">Work across every vehicle</h1>
            <p className="mt-2 max-w-3xl text-sm font-medium leading-6 text-slate-500">
              Calendar blocks use <strong>turnaround time</strong>. Labor load is shown separately so a 3-hour repair that keeps a car for a day does not look like 24 hours of technician labor.
            </p>
          </div>
          <div className="grid min-w-[330px] grid-cols-3 gap-2">
            <div className="rounded-xl bg-slate-50 px-3 py-3"><div className="text-[10px] font-black uppercase text-slate-400">Work Orders</div><div className="mt-1 text-lg font-black">{work.length}</div></div>
            <div className="rounded-xl bg-slate-50 px-3 py-3"><div className="text-[10px] font-black uppercase text-slate-400">Scheduled</div><div className="mt-1 text-lg font-black">{scheduledCount}</div></div>
            <div className="rounded-xl bg-slate-950 px-3 py-3 text-white"><div className="text-[10px] font-black uppercase text-slate-400">Labor Load</div><div className="mt-1 text-lg font-black">{hours(totalLabor)}</div></div>
          </div>
        </div>
        <div className="mt-4 flex flex-wrap items-center gap-3 text-xs font-bold text-slate-500">
          <span className="rounded-full bg-blue-50 px-3 py-1.5 text-blue-700">Labor = hands-on capacity</span>
          <span className="rounded-full bg-violet-50 px-3 py-1.5 text-violet-700">Turnaround = calendar occupancy</span>
          <span>Parts waiting is not included in turnaround; it will become a separate dependency.</span>
        </div>
        {message ? <div className="mt-3 text-sm font-bold text-slate-600">{message}</div> : null}
      </section>

      <section className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
        <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <button type="button" onClick={() => setWeekOffset((value) => value - 1)} className="rounded-lg border border-slate-200 px-3 py-2 text-sm font-black text-slate-600">←</button>
            <button type="button" onClick={() => setWeekOffset(0)} className="rounded-lg border border-slate-200 px-3 py-2 text-sm font-black text-slate-600">This week</button>
            <button type="button" onClick={() => setWeekOffset((value) => value + 1)} className="rounded-lg border border-slate-200 px-3 py-2 text-sm font-black text-slate-600">→</button>
          </div>
          <div className="text-sm font-black text-slate-700">
            {days[0].toLocaleDateString("en-US", { month: "short", day: "numeric" })} – {days[6].toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })}
          </div>
        </div>

        <div className="grid min-w-[1120px] grid-cols-7 gap-2 overflow-x-auto">
          {days.map((day) => {
            const items = scheduled.filter((item) => {
              if (!item.scheduledStartAt) return false;
              return dayKey(new Date(item.scheduledStartAt)) === dayKey(day);
            });
            return (
              <div key={dayKey(day)} className="min-h-[320px] rounded-xl border border-slate-200 bg-slate-50 p-2">
                <div className="border-b border-slate-200 px-1 pb-2">
                  <div className="text-[10px] font-black uppercase text-slate-400">{day.toLocaleDateString("en-US", { weekday: "short" })}</div>
                  <div className="text-base font-black text-slate-900">{day.toLocaleDateString("en-US", { month: "short", day: "numeric" })}</div>
                </div>
                <div className="mt-2 space-y-2">
                  {items.map((item) => {
                    const elapsed = item.elapsedMinutes ?? item.legacyDurationMinutes;
                    return (
                      <Link key={item.id} href={`/mindful/inventory/${item.vehicleId}/work`} className="block rounded-xl border border-slate-200 bg-white p-3 shadow-sm transition hover:border-slate-400">
                        <div className="text-[10px] font-black uppercase tracking-wide text-slate-400">{new Date(item.scheduledStartAt!).toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" })}</div>
                        <div className="mt-1 text-xs font-black text-slate-950">{item.inventoryNumber} · {item.vehicleLabel}</div>
                        <div className="mt-1 text-sm font-black text-slate-800">{item.title}</div>
                        <div className="mt-2 flex flex-wrap gap-1.5 text-[10px] font-black">
                          <span className="rounded-full bg-blue-50 px-2 py-1 text-blue-700">Labor {hours(item.laborMinutes)}</span>
                          <span className="rounded-full bg-violet-50 px-2 py-1 text-violet-700">Turn {hours(elapsed)}</span>
                        </div>
                      </Link>
                    );
                  })}
                  {items.length === 0 ? <div className="px-1 py-4 text-xs font-bold text-slate-300">No scheduled work</div> : null}
                </div>
              </div>
            );
          })}
        </div>
      </section>

      <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
        <div className="flex items-end justify-between gap-4">
          <div><div className="text-xs font-black uppercase tracking-[0.1em] text-slate-400">Unscheduled Queue</div><h2 className="mt-1 text-xl font-black text-slate-950">Work waiting for a calendar slot</h2></div>
          <div className="rounded-full bg-slate-100 px-3 py-1.5 text-xs font-black text-slate-600">{unscheduled.length} waiting</div>
        </div>
        <div className="mt-4 space-y-2">
          {unscheduled.map((item) => {
            const elapsed = item.elapsedMinutes ?? item.legacyDurationMinutes;
            const legacyOnly = item.elapsedMinutes === null && item.legacyDurationMinutes !== null;
            return (
              <div key={item.id} className="grid gap-3 rounded-xl border border-slate-200 p-4 lg:grid-cols-[minmax(0,1fr)_auto] lg:items-center">
                <div>
                  <div className="flex flex-wrap items-center gap-2">
                    <Link href={`/mindful/inventory/${item.vehicleId}/work`} className="font-black text-slate-950 hover:underline">{item.inventoryNumber} · {item.vehicleLabel}</Link>
                    <span className="rounded-full bg-slate-100 px-2 py-1 text-[10px] font-black uppercase text-slate-600">{labelize(item.category)}</span>
                  </div>
                  <div className="mt-1 text-sm font-black text-slate-800">{item.title}</div>
                  <div className="mt-2 flex flex-wrap gap-2 text-xs font-bold">
                    <span className="rounded-full bg-blue-50 px-2.5 py-1 text-blue-700">Hands-on labor: {hours(item.laborMinutes)}</span>
                    <span className="rounded-full bg-violet-50 px-2.5 py-1 text-violet-700">Turnaround: {hours(elapsed)}{legacyOnly ? " (legacy AI estimate)" : ""}</span>
                  </div>
                </div>
                <div className="flex flex-wrap items-end gap-2">
                  <label className="block"><div className="mb-1 text-[10px] font-black uppercase text-slate-400">Start</div><input type="datetime-local" value={starts[item.id] || ""} onChange={(event) => setStarts((current) => ({ ...current, [item.id]: event.target.value }))} className="rounded-lg border border-slate-200 px-3 py-2 text-sm font-bold text-slate-700" /></label>
                  <button type="button" disabled={workingId === item.id} onClick={() => void schedule(item)} className="rounded-lg bg-slate-950 px-4 py-2.5 text-sm font-black text-white disabled:opacity-50">Schedule</button>
                </div>
              </div>
            );
          })}
          {unscheduled.length === 0 ? <div className="rounded-xl border border-dashed border-slate-300 p-6 text-center text-sm font-bold text-slate-400">No unscheduled active work.</div> : null}
        </div>
      </section>
    </div>
  );
}
