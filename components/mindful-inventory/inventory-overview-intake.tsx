"use client";

import { FormEvent, useMemo, useState } from "react";
import { useRouter } from "next/navigation";

import type { InventoryIntakeInspectionData } from "@/lib/mindful-inventory/intake-inspection";
import type { InventoryOverviewIntakeData, InventoryUpgradeView } from "@/lib/mindful-inventory/overview-intake";
import type { InventoryVehicleView } from "@/lib/mindful-inventory/types";

type Props = {
  vehicle: InventoryVehicleView;
  overview: InventoryOverviewIntakeData;
  intakeData: InventoryIntakeInspectionData;
};

const inputClass = "w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm font-semibold text-slate-900 outline-none transition focus:border-slate-500";

function money(value: number | null | undefined) {
  if (value === null || value === undefined || !Number.isFinite(value)) return "—";
  return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 }).format(value);
}

function currencyInput(value: number | null | undefined) {
  if (value === null || value === undefined || !Number.isFinite(value)) return "";
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: 0,
    maximumFractionDigits: 2,
  }).format(value);
}

function parseCurrency(value: string) {
  const cleaned = value.replace(/[^0-9.-]/g, "");
  if (!cleaned.trim()) return null;
  const parsed = Number(cleaned);
  return Number.isFinite(parsed) ? Math.max(parsed, 0) : null;
}

function formatCurrencyText(value: string) {
  const parsed = parseCurrency(value);
  return parsed === null ? "" : currencyInput(parsed);
}

function textValue(value: unknown) {
  if (typeof value === "string" && value.trim()) return value.trim();
  if (typeof value === "number" && Number.isFinite(value)) return String(value);
  return null;
}

function numberValue(value: unknown) {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string" && value.trim()) {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : null;
  }
  return null;
}

function FieldLabel({ children }: { children: React.ReactNode }) {
  return <div className="mb-1.5 text-xs font-black uppercase tracking-[0.08em] text-slate-500">{children}</div>;
}

function SummaryCard({ label, value, sub }: { label: string; value: React.ReactNode; sub?: string }) {
  return (
    <div className="rounded-xl border border-slate-200 bg-white px-4 py-3">
      <div className="text-[10px] font-black uppercase tracking-[0.08em] text-slate-400">{label}</div>
      <div className="mt-1 text-base font-black text-slate-950">{value}</div>
      {sub ? <div className="mt-1 text-xs font-semibold text-slate-400">{sub}</div> : null}
    </div>
  );
}

export function InventoryOverviewIntake({ vehicle, overview, intakeData }: Props) {
  const router = useRouter();
  const [ownerId, setOwnerId] = useState(vehicle.projectOwnerUserId || "");
  const [mileage, setMileage] = useState(intakeData.intake?.mileage?.toString() || vehicle.mileage?.toString() || "");
  const [keysCount, setKeysCount] = useState(intakeData.intake?.keysCount?.toString() || "");
  const [visibleDamage, setVisibleDamage] = useState(intakeData.intake?.visibleDamageSummary || "");
  const [observations, setObservations] = useState(intakeData.intake?.initialObservations || "");
  const [grade, setGrade] = useState(intakeData.intake?.preliminaryGrade || vehicle.grade || "");
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState("");

  const [showUpgradeForm, setShowUpgradeForm] = useState(false);
  const [editingUpgradeId, setEditingUpgradeId] = useState<string | null>(null);
  const [upgradeSaving, setUpgradeSaving] = useState(false);
  const [upgradeMessage, setUpgradeMessage] = useState("");
  const [upgradeTitle, setUpgradeTitle] = useState("");
  const [upgradeCategory, setUpgradeCategory] = useState("performance");
  const [upgradeDescription, setUpgradeDescription] = useState("");
  const [upgradeOutcome, setUpgradeOutcome] = useState("");
  const [upgradeManufacturer, setUpgradeManufacturer] = useState("");
  const [upgradePartNumber, setUpgradePartNumber] = useState("");
  const [upgradeQuantity, setUpgradeQuantity] = useState("1");
  const [upgradeVendor, setUpgradeVendor] = useState("");
  const [upgradeUrl, setUpgradeUrl] = useState("");
  const [upgradePartsCost, setUpgradePartsCost] = useState("");
  const [upgradeLaborCost, setUpgradeLaborCost] = useState("");
  const [upgradeTotalCost, setUpgradeTotalCost] = useState("");
  const [totalBudgetOverridden, setTotalBudgetOverridden] = useState(false);
  const [upgradeNotes, setUpgradeNotes] = useState("");
  const [substitutesAllowed, setSubstitutesAllowed] = useState(true);

  const snapshot = vehicle.sourceSnapshot || {};
  const fullEvaluation = (snapshot.lotLogicEvaluationSnapshot && typeof snapshot.lotLogicEvaluationSnapshot === "object")
    ? snapshot.lotLogicEvaluationSnapshot as Record<string, unknown>
    : null;
  const conditionAnalysis = (snapshot.conditionAnalysis && typeof snapshot.conditionAnalysis === "object")
    ? snapshot.conditionAnalysis as Record<string, unknown>
    : null;

  const originalRecon = numberValue(snapshot.conditionPlanningEstimateOverride)
    ?? numberValue(fullEvaluation?.expected_reconditioning_cost)
    ?? numberValue(fullEvaluation?.reconditioning_cost)
    ?? numberValue(conditionAnalysis?.planningEstimate);
  const originalGross = numberValue(snapshot.expectedGrossProfit) ?? numberValue(fullEvaluation?.expected_gross_profit);
  const originalTarget = numberValue(snapshot.targetResaleUsed) ?? vehicle.expectedSalePrice;
  const proposedUpgradeTotal = overview.upgrades
    .filter((item) => item.status === "proposed")
    .reduce((sum, item) => sum + (item.estimatedTotalCost ?? ((item.estimatedPartsCost || 0) + (item.estimatedLaborCost || 0))), 0);
  const findingEstimate = intakeData.findings
    .filter((finding) => finding.status === "open")
    .reduce((sum, finding) => sum + (finding.estimatedCostHigh ?? finding.estimatedCostLow ?? 0), 0);
  const currentProjectedRecon = Math.max(originalRecon || 0, findingEstimate) + proposedUpgradeTotal;
  const acquisitionCost = vehicle.purchasePrice + vehicle.buyerFees + vehicle.transportCost + vehicle.otherAcquisitionCost;
  const projectedAllIn = acquisitionCost + currentProjectedRecon;
  const projectedGross = vehicle.expectedSalePrice === null ? null : vehicle.expectedSalePrice - projectedAllIn;
  const aiFindings = intakeData.findings.filter((finding) => finding.source === "ai");
  const ownerName = overview.ownerOptions.find((owner) => owner.userId === ownerId)?.displayName || "Unassigned";

  const lotLogicDetails = useMemo(() => [
    ["Source", textValue(snapshot.auctionSite) || textValue(fullEvaluation?.auction_site)],
    ["Auction / Listing", textValue(snapshot.auctionUrl) || textValue(fullEvaluation?.auction_url)],
    ["Decision", textValue(snapshot.decision) || textValue(fullEvaluation?.decision)],
    ["Risk Grade", textValue(snapshot.riskGrade) || textValue(fullEvaluation?.risk_grade)],
    ["Safe Bid", money(numberValue(snapshot.safeBid) ?? numberValue(fullEvaluation?.safe_bid))],
    ["Max Smart Bid", money(numberValue(snapshot.maxSmartBid) ?? numberValue(fullEvaluation?.max_smart_bid))],
    ["Stretch Bid", money(numberValue(snapshot.stretchBid) ?? numberValue(fullEvaluation?.stretch_bid))],
  ], [snapshot, fullEvaluation]);

  function vehiclePayload(nextAction = vehicle.nextAction, phase = vehicle.phase) {
    return {
      phase,
      grade: vehicle.grade,
      priority: vehicle.priority,
      health: vehicle.health,
      titleStatus: vehicle.titleStatus,
      projectOwnerUserId: ownerId || null,
      nextAction,
      nextActionDueAt: vehicle.nextActionDueAt?.slice(0, 10) || "",
      targetReadyAt: vehicle.targetReadyAt?.slice(0, 10) || "",
      forecastReadyAt: vehicle.forecastReadyAt?.slice(0, 10) || "",
      holdActive: vehicle.holdActive,
      holdReason: vehicle.holdReason,
      holdFollowUpAt: vehicle.holdFollowUpAt?.slice(0, 10) || "",
    };
  }

  async function saveIntake(status: "draft" | "complete") {
    const response = await fetch(`/api/mindful/inventory/vehicles/${vehicle.id}/intake`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status, mileage, keysCount, visibleDamageSummary: visibleDamage, initialObservations: observations, preliminaryGrade: grade }),
    });
    const payload = (await response.json()) as { error?: string };
    if (!response.ok) throw new Error(payload.error || "Failed to save intake.");
  }

  async function saveOverview() {
    setSaving(true);
    setMessage("");
    try {
      await saveIntake("draft");
      const response = await fetch(`/api/mindful/inventory/vehicles/${vehicle.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(vehiclePayload()),
      });
      const payload = (await response.json()) as { error?: string };
      if (!response.ok) throw new Error(payload.error || "Failed to save Overview / Intake.");
      setMessage("Overview / Intake saved.");
      router.refresh();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Failed to save Overview / Intake.");
    } finally {
      setSaving(false);
    }
  }

  async function proceedToMechanical() {
    if (!ownerId) {
      setMessage("Assign a Vehicle Owner before proceeding to Mechanical Inspection.");
      return;
    }
    setSaving(true);
    setMessage("");
    try {
      await saveIntake("complete");
      const response = await fetch(`/api/mindful/inventory/vehicles/${vehicle.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(vehiclePayload("Complete mechanical inspection", "inspection")),
      });
      const payload = (await response.json()) as { error?: string };
      if (!response.ok) throw new Error(payload.error || "Failed to proceed to Mechanical Inspection.");
      router.push(`/mindful/inventory/${vehicle.id}/intake`);
      router.refresh();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Failed to proceed to Mechanical Inspection.");
    } finally {
      setSaving(false);
    }
  }

  function resetUpgradeForm() {
    setEditingUpgradeId(null);
    setUpgradeTitle("");
    setUpgradeCategory("performance");
    setUpgradeDescription("");
    setUpgradeOutcome("");
    setUpgradeManufacturer("");
    setUpgradePartNumber("");
    setUpgradeQuantity("1");
    setUpgradeVendor("");
    setUpgradeUrl("");
    setUpgradePartsCost("");
    setUpgradeLaborCost("");
    setUpgradeTotalCost("");
    setTotalBudgetOverridden(false);
    setUpgradeNotes("");
    setSubstitutesAllowed(true);
  }

  function openAddUpgrade() {
    resetUpgradeForm();
    setUpgradeMessage("");
    setShowUpgradeForm(true);
  }

  function openEditUpgrade(upgrade: InventoryUpgradeView) {
    const parts = upgrade.estimatedPartsCost ?? 0;
    const labor = upgrade.estimatedLaborCost ?? 0;
    const calculated = parts + labor;
    const savedTotal = upgrade.estimatedTotalCost;

    setEditingUpgradeId(upgrade.id);
    setUpgradeTitle(upgrade.title);
    setUpgradeCategory(upgrade.category || "other");
    setUpgradeDescription(upgrade.description || "");
    setUpgradeOutcome(upgrade.desiredOutcome || "");
    setUpgradeManufacturer(upgrade.manufacturer || "");
    setUpgradePartNumber(upgrade.partNumber || "");
    setUpgradeQuantity(String(upgrade.quantity || 1));
    setUpgradeVendor(upgrade.preferredVendor || "");
    setUpgradeUrl(upgrade.productUrl || "");
    setUpgradePartsCost(upgrade.estimatedPartsCost === null ? "" : currencyInput(upgrade.estimatedPartsCost));
    setUpgradeLaborCost(upgrade.estimatedLaborCost === null ? "" : currencyInput(upgrade.estimatedLaborCost));
    setUpgradeTotalCost(savedTotal === null ? currencyInput(calculated) : currencyInput(savedTotal));
    setTotalBudgetOverridden(savedTotal !== null && Math.abs(savedTotal - calculated) > 0.005);
    setUpgradeNotes(upgrade.notes || "");
    setSubstitutesAllowed(upgrade.substitutesAllowed);
    setUpgradeMessage("");
    setShowUpgradeForm(true);
  }

  function closeUpgradeModal() {
    setShowUpgradeForm(false);
    resetUpgradeForm();
  }

  function syncCalculatedTotal(partsText: string, laborText: string) {
    if (totalBudgetOverridden) return;
    const parts = parseCurrency(partsText) || 0;
    const labor = parseCurrency(laborText) || 0;
    setUpgradeTotalCost(currencyInput(parts + labor));
  }

  function changePartsCost(value: string) {
    const formatted = formatCurrencyText(value);
    setUpgradePartsCost(formatted);
    syncCalculatedTotal(formatted, upgradeLaborCost);
  }

  function changeLaborCost(value: string) {
    const formatted = formatCurrencyText(value);
    setUpgradeLaborCost(formatted);
    syncCalculatedTotal(upgradePartsCost, formatted);
  }

  function useCalculatedBudget() {
    const parts = parseCurrency(upgradePartsCost) || 0;
    const labor = parseCurrency(upgradeLaborCost) || 0;
    setTotalBudgetOverridden(false);
    setUpgradeTotalCost(currencyInput(parts + labor));
  }

  async function saveUpgrade(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setUpgradeSaving(true);
    setUpgradeMessage("");
    try {
      const response = await fetch(`/api/mindful/inventory/vehicles/${vehicle.id}/upgrades`, {
        method: editingUpgradeId ? "PATCH" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          upgradeId: editingUpgradeId,
          title: upgradeTitle,
          category: upgradeCategory,
          description: upgradeDescription,
          desiredOutcome: upgradeOutcome,
          manufacturer: upgradeManufacturer,
          partNumber: upgradePartNumber,
          quantity: upgradeQuantity,
          preferredVendor: upgradeVendor,
          productUrl: upgradeUrl,
          estimatedPartsCost: parseCurrency(upgradePartsCost),
          estimatedLaborCost: parseCurrency(upgradeLaborCost),
          estimatedTotalCost: parseCurrency(upgradeTotalCost),
          notes: upgradeNotes,
          substitutesAllowed,
        }),
      });
      const responseText = await response.text();
      let payload: { error?: string } = {};

      if (responseText.trim()) {
        try {
          payload = JSON.parse(responseText) as { error?: string };
        } catch {
          if (!response.ok) {
            throw new Error(
              `Upgrade request failed (${response.status}). The server returned a non-JSON response. Check the dev-server terminal for the underlying error.`,
            );
          }
        }
      }

      if (!response.ok) {
        throw new Error(
          payload.error ||
            (editingUpgradeId
              ? "Failed to update upgrade."
              : "Failed to add upgrade."),
        );
      }
      const wasEditing = Boolean(editingUpgradeId);
      closeUpgradeModal();
      setUpgradeMessage(wasEditing ? "Upgrade updated." : "Upgrade added.");
      router.refresh();
    } catch (error) {
      setUpgradeMessage(error instanceof Error ? error.message : "Failed to save upgrade.");
    } finally {
      setUpgradeSaving(false);
    }
  }

  return (
    <div className="space-y-5">
      <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
          <div>
            <div className="text-xs font-black uppercase tracking-[0.1em] text-slate-400">Overview / Intake</div>
            <h2 className="mt-1 text-xl font-black text-slate-950">What we know about this car</h2>
            <p className="mt-1 text-sm font-medium text-slate-500">Lot Logic purchase snapshot, received condition, owner intent, and the information Mechanical needs next.</p>
          </div>
          <div className="flex flex-wrap items-center gap-3">
            <div className="text-sm font-semibold text-slate-500">{message}</div>
            <button type="button" onClick={saveOverview} disabled={saving} className="rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-sm font-black text-slate-700 disabled:opacity-50">Save</button>
            <button type="button" onClick={proceedToMechanical} disabled={saving} className="rounded-xl bg-slate-950 px-5 py-2.5 text-sm font-black text-white disabled:bg-slate-300">Proceed to Mechanical →</button>
          </div>
        </div>
      </section>

      <section className="grid gap-5 xl:grid-cols-[minmax(0,1.35fr)_minmax(320px,0.65fr)]">
        <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
          <div className="flex items-start justify-between gap-4">
            <div><h3 className="text-base font-black text-slate-950">Vehicle & Lot Logic Snapshot</h3><p className="mt-1 text-sm text-slate-500">Permanent purchase-time context. Later evaluator changes do not rewrite this record.</p></div>
            <span className="rounded-full bg-slate-100 px-3 py-1 text-xs font-black text-slate-600">Snapshot</span>
          </div>
          <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <SummaryCard label="VIN" value={vehicle.vin || "—"} />
            <SummaryCard label="Mileage" value={vehicle.mileage === null ? "—" : vehicle.mileage.toLocaleString()} />
            <SummaryCard label="Title" value={vehicle.titleStatus.replaceAll("_", " ")} />
            <SummaryCard label="Purchase Date" value={vehicle.purchaseDate || "—"} />
          </div>
          <details className="mt-4 rounded-xl border border-slate-200 bg-slate-50">
            <summary className="cursor-pointer px-4 py-3 text-sm font-black text-slate-700">View Lot Logic evaluation details</summary>
            <div className="grid gap-3 border-t border-slate-200 p-4 sm:grid-cols-2 lg:grid-cols-3">
              {lotLogicDetails.map(([label, value]) => <div key={label}><div className="text-[10px] font-black uppercase text-slate-400">{label}</div><div className="mt-1 break-words text-sm font-semibold text-slate-700">{value || "—"}</div></div>)}
              {fullEvaluation ? <div className="sm:col-span-2 lg:col-span-3"><div className="text-[10px] font-black uppercase text-slate-400">Complete Snapshot</div><div className="mt-1 text-xs font-semibold text-slate-500">The complete Lot Logic evaluation row is preserved in Inventory for audit/history. The interface surfaces the useful fields rather than dumping raw evaluation data.</div></div> : null}
            </div>
          </details>
        </div>

        <div className="rounded-2xl border border-slate-200 bg-slate-950 p-5 text-white shadow-sm">
          <div className="text-xs font-black uppercase tracking-[0.1em] text-slate-500">Vehicle Owner</div>
          <div className="mt-1 text-xl font-black">{ownerName}</div>
          <p className="mt-1 text-sm font-medium text-slate-400">The internal Mindful person accountable for this car and approval decisions.</p>
          <label className="mt-5 block"><FieldLabel>Assign Owner</FieldLabel><select className={`${inputClass} border-slate-700 bg-slate-900 text-white`} value={ownerId} onChange={(e) => setOwnerId(e.target.value)}><option value="">Unassigned</option>{overview.ownerOptions.map((owner) => <option key={owner.userId} value={owner.userId}>{owner.displayName}{owner.email ? ` — ${owner.email}` : ""}</option>)}</select></label>
        </div>
      </section>

      <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
        <div><h3 className="text-base font-black text-slate-950">Financial Picture</h3><p className="mt-1 text-sm text-slate-500">Original Lot Logic thesis beside the current preliminary projection. Work-plan actuals will replace estimates as the car progresses.</p></div>
        <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-4 xl:grid-cols-8">
          <SummaryCard label="Purchase" value={money(vehicle.purchasePrice)} />
          <SummaryCard label="Buyer Fees" value={money(vehicle.buyerFees)} />
          <SummaryCard label="Transport" value={money(vehicle.transportCost)} />
          <SummaryCard label="Other Acquisition" value={money(vehicle.otherAcquisitionCost)} />
          <SummaryCard label="Lot Logic Recon" value={money(originalRecon)} sub="purchase-time estimate" />
          <SummaryCard label="Current Recon" value={money(currentProjectedRecon)} sub="issues + proposed upgrades" />
          <SummaryCard label="Expected Sale" value={money(originalTarget)} />
          <SummaryCard label="Projected Gross" value={money(projectedGross ?? originalGross)} sub={projectedGross !== null ? "current preliminary" : "Lot Logic estimate"} />
        </div>
      </section>

      <section className="grid gap-5 xl:grid-cols-2">
        <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
          <div className="flex items-start justify-between gap-4"><div><h3 className="text-base font-black text-slate-950">AI-Parsed Issues</h3><p className="mt-1 text-sm text-slate-500">Observations imported from Lot Logic. They inform Mechanical; they are not authorized work.</p></div><span className="rounded-full bg-slate-100 px-3 py-1 text-xs font-black text-slate-600">{aiFindings.length} issues</span></div>
          <div className="mt-4 space-y-2">
            {aiFindings.length === 0 ? <div className="rounded-xl border border-dashed border-slate-300 px-4 py-7 text-center text-sm font-semibold text-slate-500">No AI issues were imported for this vehicle.</div> : aiFindings.map((finding) => (
              <details key={finding.id} className="rounded-xl border border-slate-200">
                <summary className="flex cursor-pointer list-none items-center justify-between gap-3 px-4 py-3"><span className="font-black text-slate-800">{finding.title}</span><span className="text-xs font-bold uppercase text-slate-400">{finding.severity || "unrated"}</span></summary>
                <div className="border-t border-slate-100 px-4 py-3 text-sm text-slate-600"><p>{finding.description || "No additional description."}</p><div className="mt-3 flex flex-wrap gap-4 text-xs font-bold text-slate-500"><span>Category: {finding.category}</span><span>Confidence: {finding.confidence || "—"}</span><span>Estimate: {money(finding.estimatedCostLow)}–{money(finding.estimatedCostHigh)}</span></div></div>
              </details>
            ))}
          </div>
        </div>

        <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
          <div><h3 className="text-base font-black text-slate-950">Received Condition / Intake</h3><p className="mt-1 text-sm text-slate-500">What we can confirm when the car physically arrives. Save a draft anytime; proceeding completes Intake.</p></div>
          <div className="mt-4 grid gap-4 sm:grid-cols-2">
            <label><FieldLabel>Mileage Received</FieldLabel><input className={inputClass} inputMode="numeric" value={mileage} onChange={(e) => setMileage(e.target.value)} /></label>
            <label><FieldLabel>Keys</FieldLabel><input className={inputClass} inputMode="numeric" value={keysCount} onChange={(e) => setKeysCount(e.target.value)} /></label>
            <label><FieldLabel>Preliminary Grade</FieldLabel><select className={inputClass} value={grade} onChange={(e) => setGrade(e.target.value)}><option value="">Unassigned</option>{["a","b","c","d","e"].map((value) => <option key={value} value={value}>{value.toUpperCase()}</option>)}</select></label>
            <label className="sm:col-span-2"><FieldLabel>Visible Damage / Differences From Listing</FieldLabel><textarea className={`${inputClass} min-h-20 resize-y`} value={visibleDamage} onChange={(e) => setVisibleDamage(e.target.value)} placeholder="Damage, missing items, or differences from the Lot Logic source material" /></label>
            <label className="sm:col-span-2"><FieldLabel>Additional Intake Notes</FieldLabel><textarea className={`${inputClass} min-h-24 resize-y`} value={observations} onChange={(e) => setObservations(e.target.value)} placeholder="Warning lights, noises, smells, driveability, missing equipment, owner notes..." /></label>
          </div>
        </div>
      </section>

      <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
          <div><h3 className="text-base font-black text-slate-950">Upgrades</h3><p className="mt-1 text-sm text-slate-500">Owner-requested improvements beyond condition-driven repair. These are intent for Mechanical to validate, not authorization to spend.</p></div>
          <button type="button" onClick={openAddUpgrade} className="rounded-xl border border-slate-200 px-4 py-2.5 text-sm font-black text-slate-700">+ Add Upgrade</button>
        </div>
        {upgradeMessage ? <div className="mt-3 text-sm font-semibold text-slate-600">{upgradeMessage}</div> : null}
        <div className="mt-4 space-y-3">
          {overview.upgrades.filter((item) => item.status === "proposed").length === 0 ? (
            <div className="rounded-xl border border-dashed border-slate-300 px-4 py-7 text-center text-sm font-semibold text-slate-500">No owner-requested upgrades yet.</div>
          ) : overview.upgrades.filter((item) => item.status === "proposed").map((upgrade) => (
            <details key={upgrade.id} className="rounded-xl border border-slate-200">
              <summary className="flex cursor-pointer list-none items-center justify-between gap-3 px-4 py-3">
                <div><div className="font-black text-slate-800">{upgrade.title}</div><div className="mt-0.5 text-xs font-bold uppercase text-slate-400">{upgrade.category.replaceAll("_", " ")}</div></div>
                <div className="font-black text-slate-800">{money(upgrade.estimatedTotalCost ?? ((upgrade.estimatedPartsCost || 0) + (upgrade.estimatedLaborCost || 0)))}</div>
              </summary>
              <div className="border-t border-slate-100 px-4 py-3">
                <div className="grid gap-3 text-sm text-slate-600 sm:grid-cols-2 lg:grid-cols-4">
                  <div><strong>Manufacturer:</strong> {upgrade.manufacturer || "—"}</div>
                  <div><strong>Part #:</strong> {upgrade.partNumber || "—"}</div>
                  <div><strong>Vendor:</strong> {upgrade.preferredVendor || "—"}</div>
                  <div><strong>Quantity:</strong> {upgrade.quantity}</div>
                  <div><strong>Parts:</strong> {money(upgrade.estimatedPartsCost)}</div>
                  <div><strong>Labor:</strong> {money(upgrade.estimatedLaborCost)}</div>
                  <div><strong>Total:</strong> {money(upgrade.estimatedTotalCost ?? ((upgrade.estimatedPartsCost || 0) + (upgrade.estimatedLaborCost || 0)))}</div>
                  <div><strong>Substitutes:</strong> {upgrade.substitutesAllowed ? "Allowed" : "Exact item"}</div>
                  {upgrade.description ? <div className="sm:col-span-2 lg:col-span-4">{upgrade.description}</div> : null}
                </div>
                <div className="mt-4 flex justify-end border-t border-slate-100 pt-3">
                  <button type="button" onClick={() => openEditUpgrade(upgrade)} className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs font-black text-slate-700 hover:bg-slate-50">Edit Upgrade</button>
                </div>
              </div>
            </details>
          ))}
        </div>
      </section>

      <section className="rounded-2xl border border-slate-300 bg-slate-50 p-5">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between"><div><div className="text-xs font-black uppercase tracking-[0.1em] text-slate-400">Next Step</div><h3 className="mt-1 text-lg font-black text-slate-950">Ready for Mechanical Inspection?</h3><p className="mt-1 text-sm font-medium text-slate-500">Mechanical will receive the AI issues, these intake notes, and all proposed upgrades as the starting scope.</p></div><button type="button" onClick={proceedToMechanical} disabled={saving} className="rounded-xl bg-slate-950 px-6 py-3 text-sm font-black text-white disabled:bg-slate-300">Proceed to Mechanical Inspection →</button></div>
      </section>

      {showUpgradeForm ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/60 p-4" role="dialog" aria-modal="true" aria-label={editingUpgradeId ? "Edit upgrade" : "Add upgrade"} onMouseDown={(event) => { if (event.target === event.currentTarget) closeUpgradeModal(); }}>
          <div className="max-h-[92vh] w-full max-w-5xl overflow-y-auto rounded-3xl bg-white shadow-2xl">
            <div className="sticky top-0 z-10 flex items-start justify-between gap-4 border-b border-slate-200 bg-white px-5 py-4 sm:px-6">
              <div>
                <div className="text-xs font-black uppercase tracking-[0.1em] text-slate-400">Upgrade</div>
                <h3 className="mt-1 text-xl font-black text-slate-950">{editingUpgradeId ? "Edit Upgrade" : "Add Upgrade"}</h3>
                <p className="mt-1 text-sm text-slate-500">Capture the intended improvement and budget. Mechanical will validate the final scope.</p>
              </div>
              <button type="button" onClick={closeUpgradeModal} className="rounded-xl border border-slate-200 px-3 py-2 text-sm font-black text-slate-600">Close</button>
            </div>

            <form onSubmit={saveUpgrade} className="grid gap-4 p-5 md:grid-cols-2 lg:grid-cols-4 sm:p-6">
              <label className="md:col-span-2"><FieldLabel>Upgrade</FieldLabel><input required className={inputClass} value={upgradeTitle} onChange={(e) => setUpgradeTitle(e.target.value)} placeholder="e.g. Stage 1 engine tune" /></label>
              <label><FieldLabel>Category</FieldLabel><select className={inputClass} value={upgradeCategory} onChange={(e) => setUpgradeCategory(e.target.value)}><option value="performance">Performance</option><option value="exhaust">Exhaust</option><option value="lighting">Lighting</option><option value="wheels_tires">Wheels / Tires</option><option value="audio">Audio</option><option value="suspension">Suspension</option><option value="cosmetic">Cosmetic</option><option value="protection">Protection</option><option value="other">Other</option></select></label>
              <label><FieldLabel>Quantity</FieldLabel><input className={inputClass} inputMode="decimal" value={upgradeQuantity} onChange={(e) => setUpgradeQuantity(e.target.value)} /></label>
              <label className="md:col-span-2"><FieldLabel>Description / Desired Part</FieldLabel><input className={inputClass} value={upgradeDescription} onChange={(e) => setUpgradeDescription(e.target.value)} /></label>
              <label className="md:col-span-2"><FieldLabel>Desired Outcome</FieldLabel><input className={inputClass} value={upgradeOutcome} onChange={(e) => setUpgradeOutcome(e.target.value)} placeholder="What should this change accomplish?" /></label>
              <label><FieldLabel>Manufacturer</FieldLabel><input className={inputClass} value={upgradeManufacturer} onChange={(e) => setUpgradeManufacturer(e.target.value)} /></label>
              <label><FieldLabel>Part Number</FieldLabel><input className={inputClass} value={upgradePartNumber} onChange={(e) => setUpgradePartNumber(e.target.value)} /></label>
              <label><FieldLabel>Preferred Vendor</FieldLabel><input className={inputClass} value={upgradeVendor} onChange={(e) => setUpgradeVendor(e.target.value)} /></label>
              <label><FieldLabel>Product URL</FieldLabel><input className={inputClass} value={upgradeUrl} onChange={(e) => setUpgradeUrl(e.target.value)} /></label>

              <label>
                <FieldLabel>Parts Estimate</FieldLabel>
                <input className={inputClass} inputMode="decimal" value={upgradePartsCost} onChange={(e) => changePartsCost(e.target.value)} placeholder="$0" />
              </label>
              <label>
                <FieldLabel>Labor Estimate</FieldLabel>
                <input className={inputClass} inputMode="decimal" value={upgradeLaborCost} onChange={(e) => changeLaborCost(e.target.value)} placeholder="$0" />
              </label>
              <label className="lg:col-span-2">
                <div className="flex items-center justify-between gap-3"><FieldLabel>Total Budget</FieldLabel>{totalBudgetOverridden ? <button type="button" onClick={useCalculatedBudget} className="mb-1.5 text-[11px] font-black text-slate-500 underline">Use parts + labor</button> : null}</div>
                <input className={inputClass} inputMode="decimal" value={upgradeTotalCost} onChange={(e) => { setTotalBudgetOverridden(true); setUpgradeTotalCost(formatCurrencyText(e.target.value)); }} placeholder="$0" />
                <div className="mt-1 text-xs font-semibold text-slate-400">Auto-calculated from Parts + Labor until manually changed.</div>
              </label>

              <label className="flex items-end pb-3 text-sm font-black text-slate-700"><input type="checkbox" className="mr-2 h-4 w-4" checked={substitutesAllowed} onChange={(e) => setSubstitutesAllowed(e.target.checked)} />Substitutes allowed</label>
              <label className="md:col-span-2 lg:col-span-4"><FieldLabel>Notes</FieldLabel><textarea className={`${inputClass} min-h-20 resize-y`} value={upgradeNotes} onChange={(e) => setUpgradeNotes(e.target.value)} /></label>

              {upgradeMessage ? <div className="md:col-span-2 lg:col-span-4 text-sm font-semibold text-red-600">{upgradeMessage}</div> : null}
              <div className="md:col-span-2 lg:col-span-4 flex justify-end gap-2 border-t border-slate-100 pt-4">
                <button type="button" onClick={closeUpgradeModal} className="rounded-xl border border-slate-200 px-5 py-2.5 text-sm font-black text-slate-700">Cancel</button>
                <button disabled={upgradeSaving} className="rounded-xl bg-slate-950 px-5 py-2.5 text-sm font-black text-white disabled:bg-slate-300">{upgradeSaving ? "Saving..." : editingUpgradeId ? "Save Changes" : "Add Upgrade"}</button>
              </div>
            </form>
          </div>
        </div>
      ) : null}
    </div>
  );
}
