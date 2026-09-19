"use client";

import { useState } from "react";

import { normalizeAssumptions } from "@/lib/assumptions";
import type {
  Assumptions,
  CompSettings,
  CostDefault,
} from "@/types/assumptions";

type Tab = "strategy" | "market" | "advanced";

function money(value: number) {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 0,
  }).format(value);
}

function toNumber(value: string) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

function NumberInput({
  value,
  onChange,
  prefix,
  suffix,
  step = 1,
}: {
  value: number;
  onChange: (value: number) => void;
  prefix?: string;
  suffix?: string;
  step?: number;
}) {
  return (
    <div className="flex items-center rounded-lg border border-slate-200 bg-white shadow-sm">
      {prefix ? <span className="pl-3 text-sm text-slate-400">{prefix}</span> : null}
      <input
        type="number"
        step={step}
        value={value}
        onChange={(event) => onChange(toNumber(event.target.value))}
        className="w-full rounded-lg bg-transparent px-3 py-2 text-sm font-semibold text-slate-900 outline-none"
      />
      {suffix ? <span className="pr-3 text-sm text-slate-400">{suffix}</span> : null}
    </div>
  );
}

function SettingCard({
  title,
  description,
  children,
}: {
  title: string;
  description: string;
  children: React.ReactNode;
}) {
  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
      <h3 className="text-base font-black text-slate-950">{title}</h3>
      <p className="mt-1 text-sm font-semibold leading-6 text-slate-500">
        {description}
      </p>
      <div className="mt-4">{children}</div>
    </div>
  );
}

function Field({
  label,
  helper,
  children,
}: {
  label: string;
  helper: string;
  children: React.ReactNode;
}) {
  return (
    <label className="block">
      <div className="text-sm font-black text-slate-800">{label}</div>
      <div className="mt-0.5 text-xs font-semibold leading-5 text-slate-500">
        {helper}
      </div>
      <div className="mt-2">{children}</div>
    </label>
  );
}

export function AssumptionsTabs({
  assumptions,
}: {
  assumptions: Assumptions;
}) {
  const normalizedAssumptions = normalizeAssumptions(assumptions);

  const [activeTab, setActiveTab] = useState<Tab>("strategy");
  const [draft, setDraft] = useState<Assumptions>(normalizedAssumptions);
  const [dirty, setDirty] = useState(false);
  const [saveLoading, setSaveLoading] = useState(false);
  const [saveStatus, setSaveStatus] = useState("");

  function updateCost(
    index: number,
    key: "auctionFee" | "transport" | "detailAdmin",
    value: number,
  ) {
    setDraft((previous) => ({
      ...previous,
      costDefaults: previous.costDefaults.map((row, rowIndex) =>
        rowIndex === index ? { ...row, [key]: value } : row,
      ),
    }));
    setDirty(true);
  }

  function updateCompSetting(key: keyof CompSettings, value: number) {
    setDraft((previous) => ({
      ...previous,
      compSettings: {
        ...previous.compSettings,
        [key]: value,
      },
    }));
    setDirty(true);
  }

  function updateRiskThreshold(
    key: "mediumRiskThreshold" | "highRiskThreshold" | "avoidRiskThreshold",
    value: number,
  ) {
    setDraft((previous) => ({
      ...previous,
      bidSettings: {
        ...previous.bidSettings,
        [key]: value,
      },
    }));
    setDirty(true);
  }

  function resetDraft() {
    setDraft(normalizedAssumptions);
    setDirty(false);
    setSaveStatus("");
  }

  async function saveDraft() {
    try {
      setSaveLoading(true);
      setSaveStatus("");

      const response = await fetch("/api/assumptions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ assumptions: draft }),
      });

      const payload = await response.json().catch(() => ({}));

      if (!response.ok) {
        throw new Error(payload.error || "Failed to save evaluator settings.");
      }

      setDirty(false);
      setSaveStatus("Saved");
    } catch (error) {
      setSaveStatus(
        error instanceof Error ? error.message : "Save failed",
      );
    } finally {
      setSaveLoading(false);
    }
  }

  const tabs: Array<{ id: Tab; label: string; description: string }> = [
    {
      id: "strategy",
      label: "Buying Strategy",
      description: "Profit logic and default acquisition costs.",
    },
    {
      id: "market",
      label: "Market & Comps",
      description: "How Lot Logic normalizes and underwrites comparable vehicles.",
    },
    {
      id: "advanced",
      label: "Advanced Guardrails",
      description: "Thresholds used by the evaluator that most dealers should rarely change.",
    },
  ];

  return (
    <div>
      <div className="mb-5 flex flex-col gap-3 rounded-2xl border border-slate-200 bg-white p-3 shadow-sm lg:flex-row lg:items-center lg:justify-between">
        <div className="flex flex-wrap gap-2">
          {tabs.map((tab) => (
            <button
              key={tab.id}
              type="button"
              onClick={() => setActiveTab(tab.id)}
              title={tab.description}
              className={
                activeTab === tab.id
                  ? "rounded-xl bg-slate-950 px-4 py-2 text-sm font-black text-white"
                  : "rounded-xl px-4 py-2 text-sm font-bold text-slate-600 hover:bg-slate-100 hover:text-slate-950"
              }
            >
              {tab.label}
            </button>
          ))}
        </div>

        <div className="flex items-center gap-2">
          {dirty ? (
            <span className="rounded-full bg-amber-50 px-3 py-1 text-xs font-black text-amber-700">
              Unsaved changes
            </span>
          ) : null}
          {saveStatus ? (
            <span className="max-w-[260px] truncate rounded-full bg-slate-100 px-3 py-1 text-xs font-bold text-slate-600">
              {saveStatus}
            </span>
          ) : null}
          <button
            type="button"
            onClick={resetDraft}
            disabled={!dirty || saveLoading}
            className="rounded-xl border border-slate-200 px-3 py-2 text-sm font-bold text-slate-600 disabled:opacity-35"
          >
            Reset
          </button>
          <button
            type="button"
            onClick={() => void saveDraft()}
            disabled={!dirty || saveLoading}
            className="rounded-xl bg-emerald-700 px-4 py-2 text-sm font-black text-white hover:bg-emerald-800 disabled:cursor-not-allowed disabled:bg-slate-300"
          >
            {saveLoading ? "Saving..." : "Save Settings"}
          </button>
        </div>
      </div>

      {activeTab === "strategy" ? (
        <div className="space-y-5">
          <div className="grid gap-5 lg:grid-cols-2">
            <SettingCard
              title="Profit Strategy"
              description="Lot Logic now uses one clear profit target instead of separate Safe, Smart, and Stretch bid cushions."
            >
              <div className="grid gap-3 sm:grid-cols-2">
                <div className="rounded-xl bg-emerald-50 p-4">
                  <div className="text-[10px] font-black uppercase tracking-[0.12em] text-emerald-700">
                    Minimum desired profit
                  </div>
                  <div className="mt-1 text-2xl font-black text-slate-950">
                    $2,500
                  </div>
                  <p className="mt-1 text-xs font-semibold leading-5 text-slate-600">
                    Lot Logic will not underwrite a deal below this baseline profit target.
                  </p>
                </div>
                <div className="rounded-xl bg-blue-50 p-4">
                  <div className="text-[10px] font-black uppercase tracking-[0.12em] text-blue-700">
                    Dynamic target
                  </div>
                  <div className="mt-1 text-2xl font-black text-slate-950">
                    ~20%
                  </div>
                  <p className="mt-1 text-xs font-semibold leading-5 text-slate-600">
                    The desired profit rises with the vehicle's pre-recon acquisition basis.
                  </p>
                </div>
              </div>
              <div className="mt-4 rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 text-xs font-semibold leading-5 text-slate-600">
                These values currently describe the active Lot Logic profit engine. They are intentionally not editable here so a legacy setting cannot silently conflict with the current economics model.
              </div>
            </SettingCard>

            <SettingCard
              title="How Recon Is Handled"
              description="Reconditioning is vehicle-specific now, not a generic cost-profile assumption."
            >
              <div className="space-y-3 text-sm font-semibold leading-6 text-slate-600">
                <p>
                  AI Recon and manual condition inputs estimate likely mechanical, cosmetic, and history-related costs for the actual vehicle being evaluated.
                </p>
                <p>
                  A user recon override remains authoritative and immediately updates deal economics.
                </p>
                <p>
                  Lot Logic also carries a small general contingency for ordinary undisclosed needs.
                </p>
              </div>
            </SettingCard>
          </div>

          <SettingCard
            title="Default Acquisition Costs"
            description="These are the baseline costs Lot Logic applies before it knows the exact transaction details. Recon and profit targets are deliberately excluded."
          >
            <div className="overflow-x-auto rounded-xl border border-slate-200">
              <table className="w-full min-w-[760px] text-left text-sm">
                <thead className="bg-slate-50 text-[10px] font-black uppercase tracking-wide text-slate-500">
                  <tr>
                    <th className="px-4 py-3">Vehicle group</th>
                    <th className="px-4 py-3">Buyer fee</th>
                    <th className="px-4 py-3">Transport</th>
                    <th className="px-4 py-3">Retail prep / admin</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {draft.costDefaults.map((row, index) => (
                    <tr key={row.vehicleType}>
                      <td className="px-4 py-3 font-black text-slate-800">
                        {row.vehicleType}
                      </td>
                      <td className="px-4 py-3">
                        <NumberInput
                          value={row.auctionFee}
                          onChange={(value) => updateCost(index, "auctionFee", value)}
                          prefix="$"
                        />
                      </td>
                      <td className="px-4 py-3">
                        <NumberInput
                          value={row.transport}
                          onChange={(value) => updateCost(index, "transport", value)}
                          prefix="$"
                        />
                      </td>
                      <td className="px-4 py-3">
                        <NumberInput
                          value={row.detailAdmin}
                          onChange={(value) => updateCost(index, "detailAdmin", value)}
                          prefix="$"
                        />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <p className="mt-3 text-xs font-semibold leading-5 text-slate-500">
              Lot Logic automatically selects a vehicle group from decoded vehicle information. Exact vehicle-specific recon is handled separately by AI Recon.
            </p>
          </SettingCard>
        </div>
      ) : null}

      {activeTab === "market" ? (
        <div className="space-y-5">
          <div className="grid gap-5 lg:grid-cols-3">
            <SettingCard
              title="Mileage Value Adjustment"
              description="Normalizes comp values when the comparable car has meaningfully different mileage."
            >
              <Field
                label="Value per 1,000 miles"
                helper="Higher values make mileage differences influence comp value more strongly."
              >
                <NumberInput
                  value={draft.compSettings.mileageAdjustmentPerThousand}
                  onChange={(value) =>
                    updateCompSetting("mileageAdjustmentPerThousand", value)
                  }
                  prefix="$"
                />
              </Field>
            </SettingCard>

            <SettingCard
              title="Conservative Sale Cushion"
              description="Keeps the underwriting sale estimate below the raw comp-supported market value."
            >
              <Field
                label="Reduction from comp-supported value"
                helper="This protects the buy decision from assuming every car achieves full asking-price economics."
              >
                <NumberInput
                  value={draft.compSettings.fastSaleDiscount * 100}
                  onChange={(value) =>
                    updateCompSetting("fastSaleDiscount", value / 100)
                  }
                  suffix="%"
                  step={0.1}
                />
              </Field>
            </SettingCard>

            <SettingCard
              title="Minimum Comp Match"
              description="Sets the normal Match Score floor for comps used in valuation."
            >
              <Field
                label="Minimum Match Score"
                helper="Higher values demand closer vehicle matches but can reduce the number of usable comps."
              >
                <NumberInput
                  value={draft.compSettings.minimumQualityScore}
                  onChange={(value) =>
                    updateCompSetting("minimumQualityScore", value)
                  }
                  suffix="/100"
                />
              </Field>
            </SettingCard>
          </div>

          <div className="rounded-2xl border border-blue-100 bg-blue-50/50 p-5">
            <div className="text-[10px] font-black uppercase tracking-[0.14em] text-blue-700">
              Geography
            </div>
            <div className="mt-1 text-base font-black text-slate-950">
              Comp geography is managed dynamically by the evaluator.
            </div>
            <p className="mt-2 max-w-4xl text-sm font-semibold leading-6 text-slate-600">
              Lot Logic starts from the dealership's market, searches relevant nearby regions, and lets the buyer expand or broaden the comp search when necessary. Static regional ZIP lists are no longer a normal evaluator setting.
            </p>
          </div>
        </div>
      ) : null}

      {activeTab === "advanced" ? (
        <div className="space-y-5">
          <div className="rounded-2xl border border-amber-200 bg-amber-50/60 p-4 text-sm font-semibold leading-6 text-amber-900">
            Most dealerships should leave these settings alone. They control confidence and risk guardrails, not ordinary buying preferences. Dealership preferences belong in <strong>Insights → Teach Lot Logic</strong>.
          </div>

          <div className="grid gap-5 lg:grid-cols-2">
            <SettingCard
              title="Market Confidence"
              description="Controls when Lot Logic calls a comp set medium or high confidence."
            >
              <div className="grid gap-4 sm:grid-cols-2">
                <Field
                  label="Medium confidence"
                  helper="Minimum usable comp count."
                >
                  <NumberInput
                    value={draft.compSettings.minimumCompsForMediumConfidence}
                    onChange={(value) =>
                      updateCompSetting("minimumCompsForMediumConfidence", value)
                    }
                  />
                </Field>

                <Field
                  label="High confidence"
                  helper="Minimum usable comp count before spread is considered."
                >
                  <NumberInput
                    value={draft.compSettings.minimumCompsForHighConfidence}
                    onChange={(value) =>
                      updateCompSetting("minimumCompsForHighConfidence", value)
                    }
                  />
                </Field>

                <Field
                  label="Maximum high-confidence spread"
                  helper="A wider comp-price spread reduces confidence."
                >
                  <NumberInput
                    value={draft.compSettings.maxSpreadForHighConfidence * 100}
                    onChange={(value) =>
                      updateCompSetting("maxSpreadForHighConfidence", value / 100)
                    }
                    suffix="%"
                    step={0.1}
                  />
                </Field>
              </div>
            </SettingCard>

            <SettingCard
              title="Risk Thresholds"
              description="These thresholds convert the evaluator's internal condition-risk score into Low, Medium, High, or Avoid."
            >
              <div className="grid gap-4 sm:grid-cols-3">
                <Field label="Medium" helper="Risk score where caution begins.">
                  <NumberInput
                    value={draft.bidSettings.mediumRiskThreshold}
                    onChange={(value) =>
                      updateRiskThreshold("mediumRiskThreshold", value)
                    }
                  />
                </Field>
                <Field label="High" helper="Risk score considered high risk.">
                  <NumberInput
                    value={draft.bidSettings.highRiskThreshold}
                    onChange={(value) =>
                      updateRiskThreshold("highRiskThreshold", value)
                    }
                  />
                </Field>
                <Field label="Avoid" helper="Risk score that creates a hard-stop recommendation.">
                  <NumberInput
                    value={draft.bidSettings.avoidRiskThreshold}
                    onChange={(value) =>
                      updateRiskThreshold("avoidRiskThreshold", value)
                    }
                  />
                </Field>
              </div>
            </SettingCard>
          </div>

          <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
            <div className="text-[10px] font-black uppercase tracking-[0.14em] text-slate-400">
              Managed by Lot Logic
            </div>
            <h3 className="mt-1 text-base font-black text-slate-950">
              Vehicle taxonomy, model-family equivalence, and regional expansion rules
            </h3>
            <p className="mt-2 max-w-4xl text-sm font-semibold leading-6 text-slate-500">
              These are product-engine rules rather than dealership preferences. They are intentionally not editable here. Lot Logic maintains them so users do not have to understand fallback model families, trim parsing, generation boundaries, or ZIP-search ordering.
            </p>
          </div>
        </div>
      ) : null}
    </div>
  );
}
