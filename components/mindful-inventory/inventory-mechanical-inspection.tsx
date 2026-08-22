"use client";

import { FormEvent, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";

import type { InventoryFindingSeverity, InventoryIntakeInspectionData } from "@/lib/mindful-inventory/intake-inspection";
import type { InventoryOverviewIntakeData } from "@/lib/mindful-inventory/overview-intake";
import type { InventoryVehicleView } from "@/lib/mindful-inventory/types";

type Props = {
  vehicle: InventoryVehicleView;
  data: InventoryIntakeInspectionData;
  overview: InventoryOverviewIntakeData;
};

const inputClass = "w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm font-semibold text-slate-900 outline-none transition focus:border-slate-500";

function FieldLabel({ children }: { children: React.ReactNode }) {
  return <div className="mb-1.5 text-xs font-black uppercase tracking-[0.08em] text-slate-500">{children}</div>;
}

function money(value: number | null | undefined) {
  if (value === null || value === undefined || !Number.isFinite(value)) return "—";
  return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 }).format(value);
}

export function InventoryMechanicalInspection({ vehicle, data, overview }: Props) {
  const router = useRouter();
  const [inspectionSummary, setInspectionSummary] = useState(data.mechanicalInspection?.summary || "");
  const [inspectionComplete, setInspectionComplete] = useState(data.mechanicalInspection?.status === "complete");
  const [inspectionMessage, setInspectionMessage] = useState("");
  const [inspectionSaving, setInspectionSaving] = useState(false);
  const inspectionMounted = useRef(false);
  const saveSequence = useRef(0);
  const [findingTitle, setFindingTitle] = useState("");
  const [findingDescription, setFindingDescription] = useState("");
  const [findingCategory, setFindingCategory] = useState("mechanical");
  const [findingSeverity, setFindingSeverity] = useState<InventoryFindingSeverity | "">("");
  const [costLow, setCostLow] = useState("");
  const [costHigh, setCostHigh] = useState("");
  const [durationHours, setDurationHours] = useState("");
  const [findingMessage, setFindingMessage] = useState("");
  const [findingSaving, setFindingSaving] = useState(false);

  const aiFindings = data.findings.filter((finding) => finding.source === "ai" && finding.status === "open");
  const mechanicFindings = data.findings.filter((finding) => finding.source !== "ai");
  const proposedUpgrades = overview.upgrades.filter((upgrade) => upgrade.status === "proposed");

  async function persistInspection(options?: { quiet?: boolean; complete?: boolean }) {
    const quiet = options?.quiet === true;
    const complete = options?.complete === true;
    const sequence = ++saveSequence.current;

    setInspectionSaving(true);
    if (!quiet) setInspectionMessage("");

    try {
      const response = await fetch(`/api/mindful/inventory/vehicles/${vehicle.id}/inspection`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: complete ? "complete" : "in_progress", summary: inspectionSummary }),
      });
      const payload = (await response.json()) as { error?: string };
      if (!response.ok) throw new Error(payload.error || "Failed to save inspection.");

      if (sequence === saveSequence.current) {
        if (complete) {
          setInspectionComplete(true);
          setInspectionMessage("Mechanical inspection completed.");
        } else {
          setInspectionMessage("Mechanical draft saved.");
        }
      }
      return true;
    } catch (error) {
      if (sequence === saveSequence.current) {
        setInspectionMessage(error instanceof Error ? error.message : "Failed to save inspection.");
      }
      return false;
    } finally {
      if (sequence === saveSequence.current) {
        setInspectionSaving(false);
      }
    }
  }

  useEffect(() => {
    if (!inspectionMounted.current) {
      inspectionMounted.current = true;
      return;
    }

    if (inspectionComplete) return;

    setInspectionMessage("Saving mechanical draft…");

    const timer = window.setTimeout(() => {
      void persistInspection({ quiet: true });
    }, 650);

    return () => window.clearTimeout(timer);
  // persistInspection intentionally reads the latest controlled field state.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [inspectionSummary, inspectionComplete]);

  async function saveInspectionNow() {
    await persistInspection();
    router.refresh();
  }

  async function completeInspection() {
    const saved = await persistInspection({ complete: true });
    if (saved) router.refresh();
  }

  async function addFinding(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setFindingSaving(true);
    setFindingMessage("");
    try {
      const response = await fetch(`/api/mindful/inventory/vehicles/${vehicle.id}/findings`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          source: "inspection",
          intakeId: data.intake?.id || null,
          inspectionId: data.mechanicalInspection?.id || null,
          title: findingTitle,
          description: findingDescription,
          category: findingCategory,
          severity: findingSeverity || null,
          estimatedCostLow: costLow,
          estimatedCostHigh: costHigh,
          estimatedDurationHours: durationHours,
        }),
      });
      const payload = (await response.json()) as { error?: string };
      if (!response.ok) throw new Error(payload.error || "Failed to add finding.");
      setFindingTitle(""); setFindingDescription(""); setFindingSeverity(""); setCostLow(""); setCostHigh(""); setDurationHours("");
      setFindingMessage("Mechanical finding added.");
      router.refresh();
    } catch (error) {
      setFindingMessage(error instanceof Error ? error.message : "Failed to add finding.");
    } finally {
      setFindingSaving(false);
    }
  }

  return (
    <div className="space-y-5">
      <section className="rounded-2xl border border-slate-200 bg-slate-950 p-5 text-white shadow-sm">
        <div className="text-xs font-black uppercase tracking-[0.1em] text-slate-500">Mechanical Inspection</div>
        <h2 className="mt-1 text-xl font-black">Validate the preliminary scope</h2>
        <p className="mt-1 max-w-3xl text-sm font-medium text-slate-300">Use the Lot Logic issues, received-condition notes, and owner-requested upgrades as the starting point. Confirm reality, add discoveries, and document changes before the Work Plan becomes active.</p>
      </section>

      <section className="grid gap-5 xl:grid-cols-3">
        <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
          <div className="flex items-start justify-between gap-3"><div><h3 className="font-black text-slate-950">Known Issues</h3><p className="mt-1 text-sm text-slate-500">AI-parsed from Lot Logic.</p></div><span className="rounded-full bg-slate-100 px-2.5 py-1 text-xs font-black text-slate-600">{aiFindings.length}</span></div>
          <div className="mt-4 space-y-2">{aiFindings.length === 0 ? <div className="text-sm font-semibold text-slate-400">No imported AI issues.</div> : aiFindings.map((finding) => <details key={finding.id} className="rounded-xl border border-slate-200"><summary className="cursor-pointer px-3 py-2.5 text-sm font-black text-slate-800">{finding.title}</summary><div className="border-t border-slate-100 px-3 py-2.5 text-sm text-slate-600">{finding.description || "No description."}<div className="mt-2 text-xs font-bold text-slate-400">Estimate {money(finding.estimatedCostLow)}–{money(finding.estimatedCostHigh)}</div></div></details>)}</div>
        </div>

        <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
          <h3 className="font-black text-slate-950">Intake Notes</h3><p className="mt-1 text-sm text-slate-500">What was observed when the vehicle arrived.</p>
          <dl className="mt-4 space-y-3 text-sm"><div><dt className="text-xs font-black uppercase text-slate-400">Mileage</dt><dd className="mt-1 font-semibold text-slate-700">{data.intake?.mileage?.toLocaleString() || vehicle.mileage?.toLocaleString() || "—"}</dd></div><div><dt className="text-xs font-black uppercase text-slate-400">Visible Damage</dt><dd className="mt-1 font-semibold text-slate-700">{data.intake?.visibleDamageSummary || "None noted"}</dd></div><div><dt className="text-xs font-black uppercase text-slate-400">Additional Notes</dt><dd className="mt-1 font-semibold text-slate-700">{data.intake?.initialObservations || "None noted"}</dd></div></dl>
        </div>

        <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
          <div className="flex items-start justify-between gap-3"><div><h3 className="font-black text-slate-950">Requested Upgrades</h3><p className="mt-1 text-sm text-slate-500">Owner intent to validate.</p></div><span className="rounded-full bg-slate-100 px-2.5 py-1 text-xs font-black text-slate-600">{proposedUpgrades.length}</span></div>
          <div className="mt-4 space-y-2">{proposedUpgrades.length === 0 ? <div className="text-sm font-semibold text-slate-400">No requested upgrades.</div> : proposedUpgrades.map((upgrade) => <details key={upgrade.id} className="rounded-xl border border-slate-200"><summary className="cursor-pointer px-3 py-2.5 text-sm font-black text-slate-800">{upgrade.title}</summary><div className="border-t border-slate-100 px-3 py-2.5 text-sm text-slate-600"><div>{upgrade.description || upgrade.desiredOutcome || "No additional detail."}</div><div className="mt-2 text-xs font-bold text-slate-400">{upgrade.manufacturer || "Manufacturer open"}{upgrade.partNumber ? ` · ${upgrade.partNumber}` : ""} · Budget {money(upgrade.estimatedTotalCost)}</div></div></details>)}</div>
        </div>
      </section>

      <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between"><div><h3 className="text-base font-black text-slate-950">Mechanical Assessment</h3><p className="mt-1 text-sm text-slate-500">This section auto-saves as you work. When the mechanic is finished, complete the inspection to hand the vehicle forward into Work Plan review.</p></div><div className="flex flex-wrap items-center gap-3"><span className="text-sm font-semibold text-slate-500">{inspectionComplete ? "Inspection complete." : inspectionMessage}</span>{inspectionComplete ? <span className="rounded-full bg-emerald-100 px-3 py-1.5 text-xs font-black uppercase tracking-wide text-emerald-700">Complete</span> : <><button type="button" onClick={saveInspectionNow} disabled={inspectionSaving} className="rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-sm font-black text-slate-700 disabled:opacity-50">Save Now</button><button type="button" onClick={completeInspection} disabled={inspectionSaving} className="rounded-xl bg-slate-950 px-4 py-2.5 text-sm font-black text-white disabled:bg-slate-300">Complete Inspection →</button></>}</div></div>
        <div className="mt-5"><label><FieldLabel>Inspection Summary</FieldLabel><textarea className={`${inputClass} min-h-28 resize-y`} value={inspectionSummary} disabled={inspectionComplete} onChange={(e) => setInspectionSummary(e.target.value)} placeholder="Overall mechanical condition, road test, scan results, and recommended scope changes..." /></label></div>
      </section>

      <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
        <div><h3 className="text-base font-black text-slate-950">Mechanical Discoveries</h3><p className="mt-1 text-sm text-slate-500">Add anything found during inspection that was not already represented in the Lot Logic issues.</p></div>
        <form onSubmit={addFinding} className="mt-4 grid gap-4 rounded-2xl bg-slate-50 p-4 md:grid-cols-2 xl:grid-cols-4"><label className="md:col-span-2"><FieldLabel>Finding</FieldLabel><input required disabled={inspectionComplete} className={inputClass} value={findingTitle} onChange={(e) => setFindingTitle(e.target.value)} placeholder="e.g. Left front control arm bushing cracked" /></label><label><FieldLabel>Category</FieldLabel><select disabled={inspectionComplete} className={inputClass} value={findingCategory} onChange={(e) => setFindingCategory(e.target.value)}><option value="mechanical">Mechanical</option><option value="maintenance">Maintenance</option><option value="cosmetic">Cosmetic</option><option value="inspection">Inspection</option><option value="other">Other</option></select></label><label><FieldLabel>Severity</FieldLabel><select disabled={inspectionComplete} className={inputClass} value={findingSeverity} onChange={(e) => setFindingSeverity(e.target.value as InventoryFindingSeverity | "")}><option value="">Unrated</option><option value="green">Green</option><option value="yellow">Yellow</option><option value="red">Red</option></select></label><label className="md:col-span-2 xl:col-span-4"><FieldLabel>Description</FieldLabel><textarea disabled={inspectionComplete} className={`${inputClass} min-h-20 resize-y`} value={findingDescription} onChange={(e) => setFindingDescription(e.target.value)} /></label><label><FieldLabel>Est. Cost Low</FieldLabel><input disabled={inspectionComplete} className={inputClass} inputMode="decimal" value={costLow} onChange={(e) => setCostLow(e.target.value)} /></label><label><FieldLabel>Est. Cost High</FieldLabel><input disabled={inspectionComplete} className={inputClass} inputMode="decimal" value={costHigh} onChange={(e) => setCostHigh(e.target.value)} /></label><label><FieldLabel>Est. Hours</FieldLabel><input disabled={inspectionComplete} className={inputClass} inputMode="decimal" value={durationHours} onChange={(e) => setDurationHours(e.target.value)} /></label><div className="flex items-end"><button disabled={findingSaving || inspectionComplete} className="w-full rounded-xl bg-slate-950 px-4 py-2.5 text-sm font-black text-white disabled:bg-slate-300">Add Discovery</button></div>{findingMessage ? <div className="md:col-span-2 xl:col-span-4 text-sm font-semibold text-slate-600">{findingMessage}</div> : null}</form>
        {mechanicFindings.length > 0 ? <div className="mt-4 space-y-2">{mechanicFindings.map((finding) => <div key={finding.id} className="rounded-xl border border-slate-200 px-4 py-3"><div className="font-black text-slate-800">{finding.title}</div><div className="mt-1 text-sm text-slate-500">{finding.description || "No description."}</div></div>)}</div> : null}
      </section>
    </div>
  );
}
