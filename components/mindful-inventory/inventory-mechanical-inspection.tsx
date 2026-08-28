"use client";

import { FormEvent, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";

import { MechanicalDiscoveryCard } from "@/components/mindful-inventory/mechanical-discovery-card";
import type {
  InventoryFindingMechanicalValidationStatus,
  InventoryFindingSeverity,
  InventoryIntakeInspectionData,
} from "@/lib/mindful-inventory/intake-inspection";
import type {
  InventoryOverviewIntakeData,
  InventoryUpgradeMechanicalValidationStatus,
} from "@/lib/mindful-inventory/overview-intake";
import type { InventoryVehicleView } from "@/lib/mindful-inventory/types";

type Props = {
  vehicle: InventoryVehicleView;
  data: InventoryIntakeInspectionData;
  overview: InventoryOverviewIntakeData;
};

const inputClass = "w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm font-semibold text-slate-900 outline-none transition focus:border-slate-500 disabled:cursor-not-allowed disabled:bg-slate-100 disabled:text-slate-500";

const findingValidationLabels: Record<InventoryFindingMechanicalValidationStatus, string> = {
  pending: "Needs Review",
  confirmed: "Confirmed",
  not_found: "Not Found",
  changed: "Changed / Different",
  needs_diagnosis: "Needs Diagnosis",
};

const upgradeValidationLabels: Record<InventoryUpgradeMechanicalValidationStatus, string> = {
  pending: "Needs Review",
  feasible: "Feasible as Requested",
  feasible_with_changes: "Feasible with Changes",
  not_recommended: "Not Recommended",
  needs_info: "Needs More Information",
};

function FieldLabel({ children }: { children: React.ReactNode }) {
  return <div className="mb-1.5 text-xs font-black uppercase tracking-[0.08em] text-slate-500">{children}</div>;
}

function money(value: number | null | undefined) {
  if (value === null || value === undefined || !Number.isFinite(value)) return "—";
  return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 }).format(value);
}

function validationBadge(status: string, label: string) {
  const statusClass = (() => {
    switch (status) {
      case "confirmed":
      case "feasible":
        return "bg-emerald-100 text-emerald-700";
      case "not_found":
      case "not_recommended":
        return "bg-red-100 text-red-700";
      case "changed":
      case "feasible_with_changes":
        return "bg-blue-100 text-blue-700";
      case "pending":
      case "needs_diagnosis":
      case "needs_info":
      default:
        return "bg-amber-100 text-amber-700";
    }
  })();

  return (
    <span className={`rounded-full px-2.5 py-1 text-[10px] font-black uppercase tracking-wide ${statusClass}`}>
      {label}
    </span>
  );
}

export function InventoryMechanicalInspection({ vehicle, data, overview }: Props) {
  const router = useRouter();
  const [showNewFindingModal, setShowNewFindingModal] = useState(false);
  const [inspectionSummary, setInspectionSummary] = useState(data.mechanicalInspection?.summary || "");
  const [inspectionComplete, setInspectionComplete] = useState(data.mechanicalInspection?.status === "complete");
  const [inspectionMessage, setInspectionMessage] = useState("");
  const [inspectionSaving, setInspectionSaving] = useState(false);
  const inspectionMounted = useRef(false);
  const saveSequence = useRef(0);
  const [validationSavingId, setValidationSavingId] = useState<string | null>(null);
  const [validationMessage, setValidationMessage] = useState("");
  const [findingNotes, setFindingNotes] = useState<Record<string, string>>(() =>
    Object.fromEntries(data.findings.map((finding) => [finding.id, finding.mechanicalValidationNotes || ""])),
  );
  const [upgradeNotes, setUpgradeNotes] = useState<Record<string, string>>(() =>
    Object.fromEntries(overview.upgrades.map((upgrade) => [upgrade.id, upgrade.mechanicalValidationNotes || ""])),
  );
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
  const mechanicFindings = data.findings.filter((finding) => finding.source === "inspection" || finding.source === "manager");
  const proposedUpgrades = overview.upgrades.filter((upgrade) => upgrade.status === "proposed");

  const reconciliation = useMemo(() => {
    const findingCounts = aiFindings.reduce<Record<string, number>>((counts, finding) => {
      counts[finding.mechanicalValidationStatus] = (counts[finding.mechanicalValidationStatus] || 0) + 1;
      return counts;
    }, {});
    const upgradeCounts = proposedUpgrades.reduce<Record<string, number>>((counts, upgrade) => {
      counts[upgrade.mechanicalValidationStatus] = (counts[upgrade.mechanicalValidationStatus] || 0) + 1;
      return counts;
    }, {});
    const pending = (findingCounts.pending || 0) + (upgradeCounts.pending || 0);
    return {
      findingCounts,
      upgradeCounts,
      pending,
      validated: aiFindings.length + proposedUpgrades.length - pending,
      total: aiFindings.length + proposedUpgrades.length,
    };
  }, [aiFindings, proposedUpgrades]);

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
      if (sequence === saveSequence.current) setInspectionSaving(false);
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

  async function saveValidation(
    kind: "finding" | "upgrade",
    entityId: string,
    status: InventoryFindingMechanicalValidationStatus | InventoryUpgradeMechanicalValidationStatus,
  ) {
    setValidationSavingId(entityId);
    setValidationMessage("");
    try {
      const notes = kind === "finding" ? findingNotes[entityId] || "" : upgradeNotes[entityId] || "";
      const response = await fetch(`/api/mindful/inventory/vehicles/${vehicle.id}/mechanical-validation`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ kind, entityId, status, notes }),
      });
      const payload = (await response.json()) as { error?: string };
      if (!response.ok) throw new Error(payload.error || "Failed to save validation.");
      setValidationMessage("Scope validation saved.");
      router.refresh();
    } catch (error) {
      setValidationMessage(error instanceof Error ? error.message : "Failed to save validation.");
    } finally {
      setValidationSavingId(null);
    }
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
      setFindingMessage("New mechanical issue added.");
      setShowNewFindingModal(false);
      router.refresh();
    } catch (error) {
      setFindingMessage(error instanceof Error ? error.message : "Failed to add finding.");
    } finally {
      setFindingSaving(false);
    }
  }

  const scopeDifferenceCount =
    (reconciliation.findingCounts.changed || 0) +
    (reconciliation.findingCounts.not_found || 0) +
    (reconciliation.upgradeCounts.feasible_with_changes || 0) +
    (reconciliation.upgradeCounts.not_recommended || 0);

  return (
    <div className="space-y-5">
      {inspectionComplete ? (
        <section className="rounded-2xl border border-emerald-200 bg-emerald-50 px-5 py-4">
          <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <div className="text-sm font-black text-emerald-900">Mechanical Inspection completed</div>
              <div className="mt-0.5 text-sm font-medium text-emerald-700">This inspection is locked and is now view-only. Its findings and validation decisions remain part of vehicle history.</div>
            </div>
            <span className="rounded-full bg-emerald-100 px-3 py-1.5 text-xs font-black uppercase tracking-wide text-emerald-700">View Only</span>
          </div>
        </section>
      ) : null}

      <section className="grid gap-5 xl:grid-cols-[minmax(0,1.45fr)_minmax(300px,0.55fr)]">
        <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
          <div className="flex flex-col gap-2 border-b border-slate-100 pb-4 sm:flex-row sm:items-start sm:justify-between">
            <div>
              <div className="text-xs font-black uppercase tracking-[0.1em] text-slate-400">Mechanical Inspection</div>
              <h2 className="mt-1 text-xl font-black text-slate-950">Scope Validation</h2>
              <p className="mt-1 max-w-2xl text-sm text-slate-500">Confirm the preliminary issues and requested upgrades before the Work Plan is built.</p>
            </div>
            <span className={`rounded-full px-3 py-1.5 text-xs font-black ${reconciliation.pending > 0 ? "bg-amber-100 text-amber-700" : "bg-emerald-100 text-emerald-700"}`}>
              {reconciliation.pending > 0 ? `${reconciliation.pending} needs review` : "Scope validated"}
            </span>
          </div>

          <div className="mt-5">
            <div className="flex items-start justify-between gap-3">
              <div>
                <h3 className="font-black text-slate-950">Known Issues</h3>
                <p className="mt-1 text-sm text-slate-500">Confirm whether each Lot Logic issue is actually present.</p>
              </div>
              <span className="rounded-full bg-slate-100 px-2.5 py-1 text-xs font-black text-slate-600">{aiFindings.length}</span>
            </div>

            <div className="mt-4 space-y-3">
              {aiFindings.length === 0 ? (
                <div className="rounded-xl border border-dashed border-slate-200 px-4 py-4 text-sm font-semibold text-slate-400">No imported issues.</div>
              ) : aiFindings.map((finding) => (
                <details
                  key={finding.id}
                  open={finding.mechanicalValidationStatus === "pending" ? true : undefined}
                  className="rounded-xl border border-slate-200 bg-white"
                >
                  <summary className="flex cursor-pointer list-none items-center justify-between gap-3 px-4 py-3">
                    <div className="min-w-0">
                      <span className="text-sm font-black text-slate-800">{finding.title}</span>
                      <span className="ml-2 rounded-full bg-slate-100 px-2 py-0.5 text-[9px] font-black uppercase tracking-wide text-slate-500">Known Issue</span>
                    </div>
                    {validationBadge(finding.mechanicalValidationStatus, findingValidationLabels[finding.mechanicalValidationStatus])}
                  </summary>
                  <div className="border-t border-slate-100 p-4">
                    <div className="text-sm text-slate-600">{finding.description || "No description."}</div>
                    <div className="mt-2 text-xs font-bold text-slate-400">Estimate {money(finding.estimatedCostLow)}–{money(finding.estimatedCostHigh)}</div>
                    <div className="mt-4 grid gap-3 md:grid-cols-[minmax(220px,0.42fr)_minmax(0,1fr)]">
                      <label>
                        <FieldLabel>Status</FieldLabel>
                        <select disabled={inspectionComplete || validationSavingId === finding.id} className={inputClass} value={finding.mechanicalValidationStatus} onChange={(e) => void saveValidation("finding", finding.id, e.target.value as InventoryFindingMechanicalValidationStatus)}>
                          {Object.entries(findingValidationLabels).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
                        </select>
                      </label>
                      <label>
                        <FieldLabel>Notes / What Changed</FieldLabel>
                        <div className="flex gap-2">
                          <input disabled={inspectionComplete} className={inputClass} value={findingNotes[finding.id] || ""} onChange={(e) => setFindingNotes((current) => ({ ...current, [finding.id]: e.target.value }))} placeholder="Optional when confirmed; explain differences, diagnosis, or why it was not found" />
                          <button type="button" disabled={inspectionComplete || validationSavingId === finding.id} onClick={() => void saveValidation("finding", finding.id, finding.mechanicalValidationStatus)} className="shrink-0 rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs font-black text-slate-700 disabled:opacity-50">Save Note</button>
                        </div>
                      </label>
                    </div>
                  </div>
                </details>
              ))}
            </div>
          </div>

          <div className="mt-6 border-t border-slate-100 pt-5">
            <div className="flex items-start justify-between gap-3">
              <div>
                <h3 className="font-black text-slate-950">Requested Upgrades</h3>
                <p className="mt-1 text-sm text-slate-500">Validate build intent with the same priority as the known scope.</p>
              </div>
              <span className="rounded-full bg-slate-100 px-2.5 py-1 text-xs font-black text-slate-600">{proposedUpgrades.length}</span>
            </div>

            <div className="mt-4 space-y-3">
              {proposedUpgrades.length === 0 ? (
                <div className="rounded-xl border border-dashed border-slate-200 px-4 py-4 text-sm font-semibold text-slate-400">No requested upgrades.</div>
              ) : proposedUpgrades.map((upgrade) => (
                <details
                  key={upgrade.id}
                  open={upgrade.mechanicalValidationStatus === "pending" ? true : undefined}
                  className="rounded-xl border border-slate-200 bg-white"
                >
                  <summary className="flex cursor-pointer list-none items-center justify-between gap-3 px-4 py-3">
                    <div className="min-w-0">
                      <span className="text-sm font-black text-slate-800">{upgrade.title}</span>
                      <span className="ml-2 rounded-full bg-violet-50 px-2 py-0.5 text-[9px] font-black uppercase tracking-wide text-violet-600">Requested Upgrade</span>
                    </div>
                    {validationBadge(upgrade.mechanicalValidationStatus, upgradeValidationLabels[upgrade.mechanicalValidationStatus])}
                  </summary>
                  <div className="border-t border-slate-100 p-4 text-sm text-slate-600">
                    <div>{upgrade.description || upgrade.desiredOutcome || "No additional detail."}</div>
                    <div className="mt-2 text-xs font-bold text-slate-400">{upgrade.manufacturer || "Manufacturer open"}{upgrade.partNumber ? ` · ${upgrade.partNumber}` : ""} · Budget {money(upgrade.estimatedTotalCost)}</div>
                    <div className="mt-4 grid gap-3 md:grid-cols-[minmax(220px,0.42fr)_minmax(0,1fr)]">
                      <label>
                        <FieldLabel>Status</FieldLabel>
                        <select disabled={inspectionComplete || validationSavingId === upgrade.id} className={inputClass} value={upgrade.mechanicalValidationStatus} onChange={(e) => void saveValidation("upgrade", upgrade.id, e.target.value as InventoryUpgradeMechanicalValidationStatus)}>
                          {Object.entries(upgradeValidationLabels).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
                        </select>
                      </label>
                      <label>
                        <FieldLabel>Notes / Required Changes</FieldLabel>
                        <div className="flex gap-2">
                          <input disabled={inspectionComplete} className={inputClass} value={upgradeNotes[upgrade.id] || ""} onChange={(e) => setUpgradeNotes((current) => ({ ...current, [upgrade.id]: e.target.value }))} placeholder="Compatibility, substitutions, scope changes, or why it is not recommended" />
                          <button type="button" disabled={inspectionComplete || validationSavingId === upgrade.id} onClick={() => void saveValidation("upgrade", upgrade.id, upgrade.mechanicalValidationStatus)} className="shrink-0 rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs font-black text-slate-700 disabled:opacity-50">Save Note</button>
                        </div>
                      </label>
                    </div>
                  </div>
                </details>
              ))}
            </div>
          </div>
        </div>

        <aside className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm xl:self-start xl:sticky xl:top-5">
          <h3 className="font-black text-slate-950">Intake Reference</h3>
          <p className="mt-1 text-sm text-slate-500">What the owner and intake process observed when the vehicle arrived.</p>
          <dl className="mt-4 space-y-4 text-sm">
            <div><dt className="text-xs font-black uppercase text-slate-400">Mileage</dt><dd className="mt-1 font-semibold text-slate-700">{data.intake?.mileage?.toLocaleString() || vehicle.mileage?.toLocaleString() || "—"}</dd></div>
            <div><dt className="text-xs font-black uppercase text-slate-400">Visible Damage</dt><dd className="mt-1 font-semibold text-slate-700">{data.intake?.visibleDamageSummary || "None noted"}</dd></div>
            <div><dt className="text-xs font-black uppercase text-slate-400">Owner / Intake Notes</dt><dd className="mt-1 whitespace-pre-wrap font-semibold text-slate-700">{data.intake?.initialObservations || "None noted"}</dd></div>
          </dl>
        </aside>
      </section>

      <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
          <div>
            <h3 className="text-base font-black text-slate-950">Mechanic Summary</h3>
            <p className="mt-1 text-sm text-slate-500">Overall condition, road-test/scan observations, and context that does not belong to one specific scope item.</p>
            <div className="mt-3 flex flex-wrap gap-2">
              <span className="rounded-full bg-slate-100 px-3 py-1.5 text-xs font-black text-slate-700">{reconciliation.validated}/{reconciliation.total} Validated</span>
              <span className="rounded-full bg-emerald-50 px-3 py-1.5 text-xs font-black text-emerald-700">{reconciliation.findingCounts.confirmed || 0} Confirmed</span>
              <span className="rounded-full bg-blue-50 px-3 py-1.5 text-xs font-black text-blue-700">{scopeDifferenceCount} Changed</span>
              <span className={`rounded-full px-3 py-1.5 text-xs font-black ${reconciliation.pending > 0 ? "bg-amber-100 text-amber-700" : "bg-emerald-100 text-emerald-700"}`}>{reconciliation.pending} Needs Review</span>
              {validationMessage ? <span className="px-1 py-1.5 text-xs font-semibold text-slate-400">{validationMessage}</span> : null}
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-3">
            <span className="text-sm font-semibold text-slate-500">{inspectionComplete ? "Inspection complete." : inspectionMessage}</span>
            {inspectionComplete ? (
              <span className="rounded-full bg-emerald-100 px-3 py-1.5 text-xs font-black uppercase tracking-wide text-emerald-700">Complete</span>
            ) : (
              <>
                <button type="button" onClick={saveInspectionNow} disabled={inspectionSaving} className="rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-sm font-black text-slate-700 disabled:opacity-50">Save Now</button>
                <button type="button" onClick={completeInspection} disabled={inspectionSaving || reconciliation.pending > 0} className="rounded-xl bg-slate-950 px-4 py-2.5 text-sm font-black text-white disabled:bg-slate-300">Complete Inspection →</button>
              </>
            )}
          </div>
        </div>
        {!inspectionComplete && reconciliation.pending > 0 ? (
          <div className="mt-4 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm font-semibold text-amber-800">Complete the {reconciliation.pending} remaining scope validation{reconciliation.pending === 1 ? "" : "s"} before closing Mechanical.</div>
        ) : null}
        <div className="mt-5">
          <label>
            <FieldLabel>Overall Mechanical Notes</FieldLabel>
            <textarea className={`${inputClass} min-h-28 resize-y`} value={inspectionSummary} disabled={inspectionComplete} onChange={(e) => setInspectionSummary(e.target.value)} placeholder="Overall mechanical condition, road test, scan results, and important context..." />
          </label>
        </div>
      </section>

      <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <h3 className="text-base font-black text-slate-950">New Mechanical Issues</h3>
            <p className="mt-1 text-sm text-slate-500">Issues found during inspection that were not already represented in the preliminary scope.</p>
          </div>
          {!inspectionComplete ? (
            <button type="button" onClick={() => setShowNewFindingModal(true)} className="shrink-0 rounded-xl bg-slate-950 px-4 py-2.5 text-sm font-black text-white">+ Add New Mechanical Issue</button>
          ) : (
            <span className="rounded-full bg-slate-100 px-3 py-1 text-xs font-black text-slate-600">{mechanicFindings.length} new</span>
          )}
        </div>
        {findingMessage ? <div className="mt-3 text-sm font-semibold text-slate-600">{findingMessage}</div> : null}
        {mechanicFindings.length > 0 ? (
          <div className="mt-4 space-y-2">{mechanicFindings.map((finding) => <MechanicalDiscoveryCard key={finding.id} vehicleId={vehicle.id} finding={finding} disabled={inspectionComplete} />)}</div>
        ) : (
          <div className="mt-4 rounded-xl border border-dashed border-slate-200 px-4 py-5 text-center text-sm font-semibold text-slate-400">No new mechanical issues have been added.</div>
        )}
      </section>

      {showNewFindingModal && !inspectionComplete ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/50 px-4 py-6 backdrop-blur-sm">
          <div className="max-h-[92vh] w-full max-w-3xl overflow-y-auto rounded-2xl border border-slate-200 bg-white shadow-2xl">
            <div className="sticky top-0 z-10 flex items-start justify-between gap-4 border-b border-slate-200 bg-white px-6 py-5">
              <div>
                <div className="text-xs font-black uppercase tracking-[0.1em] text-slate-400">Mechanical Inspection</div>
                <h3 className="mt-1 text-xl font-black text-slate-950">Add New Mechanical Issue</h3>
                <p className="mt-1 text-sm text-slate-500">Record something discovered during inspection that was not already in the preliminary scope.</p>
              </div>
              <button type="button" onClick={() => setShowNewFindingModal(false)} className="rounded-full p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-700" aria-label="Close new mechanical issue">✕</button>
            </div>

            <form onSubmit={addFinding} className="grid gap-4 p-6 md:grid-cols-2">
              <label className="md:col-span-2"><FieldLabel>Issue</FieldLabel><input required className={inputClass} value={findingTitle} onChange={(e) => setFindingTitle(e.target.value)} placeholder="e.g. Left front control arm bushing cracked" /></label>
              <label><FieldLabel>Category</FieldLabel><select className={inputClass} value={findingCategory} onChange={(e) => setFindingCategory(e.target.value)}><option value="mechanical">Mechanical</option><option value="maintenance">Maintenance</option><option value="cosmetic">Cosmetic</option><option value="inspection">Inspection</option><option value="other">Other</option></select></label>
              <label><FieldLabel>Severity</FieldLabel><select className={inputClass} value={findingSeverity} onChange={(e) => setFindingSeverity(e.target.value as InventoryFindingSeverity | "")}><option value="">Unrated</option><option value="green">Green</option><option value="yellow">Yellow</option><option value="red">Red</option></select></label>
              <label className="md:col-span-2"><FieldLabel>Description</FieldLabel><textarea className={`${inputClass} min-h-24 resize-y`} value={findingDescription} onChange={(e) => setFindingDescription(e.target.value)} /></label>
              <label><FieldLabel>Est. Cost Low</FieldLabel><input className={inputClass} inputMode="decimal" value={costLow} onChange={(e) => setCostLow(e.target.value)} /></label>
              <label><FieldLabel>Est. Cost High</FieldLabel><input className={inputClass} inputMode="decimal" value={costHigh} onChange={(e) => setCostHigh(e.target.value)} /></label>
              <label><FieldLabel>Est. Hours</FieldLabel><input className={inputClass} inputMode="decimal" value={durationHours} onChange={(e) => setDurationHours(e.target.value)} /></label>
              <div className="flex items-end justify-end gap-2">
                <button type="button" onClick={() => setShowNewFindingModal(false)} className="rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-sm font-black text-slate-700">Cancel</button>
                <button disabled={findingSaving} className="rounded-xl bg-slate-950 px-4 py-2.5 text-sm font-black text-white disabled:bg-slate-300">{findingSaving ? "Adding..." : "Add Issue"}</button>
              </div>
              {findingMessage ? <div className="md:col-span-2 text-sm font-semibold text-slate-600">{findingMessage}</div> : null}
            </form>
          </div>
        </div>
      ) : null}
    </div>
  );
}
