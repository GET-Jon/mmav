"use client";

import { useMemo, useState } from "react";

import type { PartnerPortalPermissions } from "@/lib/partner-portal/access";
import type { PartnerWorkItem } from "@/lib/partner-portal/work";
import { PartnerWorkListV3 } from "@/components/partner/partner-work-list-v3";

function workTime(work: PartnerWorkItem) {
  const value = work.scheduledStartAt || work.proposedStartAt;
  if (!value) return Number.MAX_SAFE_INTEGER;
  const time = new Date(value).getTime();
  return Number.isFinite(time) ? time : Number.MAX_SAFE_INTEGER;
}

function shortDate(value: string | null) {
  if (!value) return "Unscheduled";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "Unscheduled";
  return date.toLocaleString("en-US", {
    weekday: "short",
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

type VehicleGroup = {
  vehicleId: string;
  vehicleLabel: string;
  vin: string | null;
  mileage: number | null;
  items: PartnerWorkItem[];
};

export function PartnerWorkGrouped({
  workItems,
  permissions,
}: {
  workItems: PartnerWorkItem[];
  permissions: PartnerPortalPermissions;
}) {
  const openItems = useMemo(
    () =>
      workItems
        .filter((work) => !["complete", "cancelled"].includes(work.status))
        .sort((a, b) => workTime(a) - workTime(b)),
    [workItems],
  );

  const completedItems = useMemo(
    () =>
      workItems
        .filter((work) => work.status === "complete")
        .sort((a, b) => workTime(b) - workTime(a)),
    [workItems],
  );

  const vehicleGroups = useMemo(() => {
    const groups = new Map<string, VehicleGroup>();
    for (const work of openItems) {
      const existing = groups.get(work.vehicleId);
      if (existing) {
        existing.items.push(work);
      } else {
        groups.set(work.vehicleId, {
          vehicleId: work.vehicleId,
          vehicleLabel: work.vehicleLabel,
          vin: work.vin,
          mileage: work.mileage,
          items: [work],
        });
      }
    }
    return Array.from(groups.values()).sort(
      (a, b) => workTime(a.items[0]) - workTime(b.items[0]),
    );
  }, [openItems]);

  const [expandedVehicles, setExpandedVehicles] = useState<Record<string, boolean>>(() => {
    const first = vehicleGroups[0]?.vehicleId;
    return first ? { [first]: true } : {};
  });
  const [completedOpen, setCompletedOpen] = useState(false);

  if (!workItems.length) {
    return (
      <div className="rounded-2xl border border-dashed border-slate-300 bg-white p-8 text-center">
        <div className="text-lg font-black">No assigned work right now</div>
        <p className="mt-2 text-sm text-slate-500">New Work Orders assigned to you will appear here.</p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {vehicleGroups.map((group) => {
        const expanded = Boolean(expandedVehicles[group.vehicleId]);
        const next = group.items[0];
        const inProgress = group.items.filter((item) => item.status === "in_progress").length;
        const estimateNeeded = group.items.filter((item) =>
          permissions.editEstimate &&
          (!item.latestEstimate || ["awaiting_estimate", "revision_requested"].includes(item.partnerEstimateStatus || "awaiting_estimate")),
        ).length;

        return (
          <section key={group.vehicleId} className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
            <button
              type="button"
              onClick={() =>
                setExpandedVehicles((current) => ({
                  ...current,
                  [group.vehicleId]: !expanded,
                }))
              }
              className="flex w-full items-center justify-between gap-4 px-5 py-4 text-left hover:bg-slate-50"
            >
              <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-2">
                  <h2 className="text-lg font-black text-slate-950">{group.vehicleLabel}</h2>
                  <span className="rounded-full bg-slate-100 px-2.5 py-1 text-[10px] font-black text-slate-600">
                    {group.items.length} job{group.items.length === 1 ? "" : "s"}
                  </span>
                  {inProgress ? (
                    <span className="rounded-full bg-blue-100 px-2.5 py-1 text-[10px] font-black text-blue-700">
                      {inProgress} in progress
                    </span>
                  ) : null}
                  {estimateNeeded ? (
                    <span className="rounded-full bg-violet-100 px-2.5 py-1 text-[10px] font-black text-violet-700">
                      {estimateNeeded} need estimate
                    </span>
                  ) : null}
                </div>
                <div className="mt-1 flex flex-wrap gap-x-3 gap-y-1 text-xs font-semibold text-slate-500">
                  <span>Next: {next.title}</span>
                  <span>{shortDate(next.scheduledStartAt || next.proposedStartAt)}</span>
                  {group.vin ? <span>VIN …{group.vin.slice(-8)}</span> : null}
                </div>
              </div>
              <div className="shrink-0 text-sm font-black text-slate-500">{expanded ? "Collapse ↑" : "Expand ↓"}</div>
            </button>

            {expanded ? (
              <div className="border-t border-slate-200 bg-slate-50/40 p-4 sm:p-5">
                <PartnerWorkListV3 workItems={group.items} permissions={permissions} />
              </div>
            ) : null}
          </section>
        );
      })}

      {!openItems.length ? (
        <div className="rounded-2xl border border-emerald-200 bg-emerald-50 p-5 text-sm font-bold text-emerald-800">
          All assigned work is complete.
        </div>
      ) : null}

      {completedItems.length ? (
        <section className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
          <button
            type="button"
            onClick={() => setCompletedOpen((value) => !value)}
            className="flex w-full items-center justify-between gap-4 px-5 py-4 text-left hover:bg-slate-50"
          >
            <div>
              <div className="text-sm font-black text-slate-800">Completed</div>
              <div className="mt-1 text-xs text-slate-500">
                {completedItems.length} completed job{completedItems.length === 1 ? "" : "s"}
              </div>
            </div>
            <div className="text-sm font-black text-slate-500">{completedOpen ? "Hide ↑" : "Show ↓"}</div>
          </button>
          {completedOpen ? (
            <div className="border-t border-slate-200 bg-slate-50/50 p-4 sm:p-5">
              <div className="space-y-2">
                {completedItems.map((work) => (
                  <div key={work.id} className="flex flex-col gap-2 rounded-xl border border-slate-200 bg-white px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-2">
                        <div className="text-sm font-black text-slate-900">{work.title}</div>
                        <span className="rounded-full bg-emerald-100 px-2 py-0.5 text-[9px] font-black uppercase text-emerald-700">Complete</span>
                      </div>
                      <div className="mt-1 text-xs font-semibold text-slate-500">
                        {work.vehicleLabel} · {shortDate(work.scheduledStartAt || work.proposedStartAt)}
                      </div>
                    </div>
                    {work.vin ? <div className="text-xs font-bold text-slate-400">VIN …{work.vin.slice(-8)}</div> : null}
                  </div>
                ))}
              </div>
            </div>
          ) : null}
        </section>
      ) : null}
    </div>
  );
}
