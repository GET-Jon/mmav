"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import type { ReactNode } from "react";
import { MarketCompsTable } from "@/components/comps/market-comps-table";
import { VinDecodeCard } from "@/components/evaluation/vin-decode-card";
import { calculateCompSummary } from "@/lib/comps";
import { defaultAssumptions } from "@/lib/assumptions";
import { calculateValuation } from "@/lib/valuation";
import type { MarketComp } from "@/types/comps";
import type { VinDecodeResult } from "@/types/vin";
import type { EvaluationCosts, ValuationInput } from "@/types/evaluation";

const initialTargetMileage = 68742;

const initialComps: MarketComp[] = [
  {
    id: "comp-1",
    included: true,
    source: "MarketCheck/API",
    distance: 18,
    year: 2020,
    model: "Audi Q7",
    trim: "Premium Plus",
    mileage: 63421,
    askingPrice: 34900,
    qualityScore: 78,
  },
  {
    id: "comp-2",
    included: true,
    source: "CarMax",
    distance: 25,
    year: 2020,
    model: "Audi Q7",
    trim: "Premium Plus",
    mileage: 70118,
    askingPrice: 33998,
    qualityScore: 74,
  },
  {
    id: "comp-3",
    included: true,
    source: "Facebook",
    distance: 12,
    year: 2020,
    model: "Audi Q7",
    trim: "Premium Plus",
    mileage: 66950,
    askingPrice: 32500,
    qualityScore: 68,
  },
  {
    id: "comp-4",
    included: true,
    source: "Manual",
    distance: 90,
    year: 2020,
    model: "Audi Q7",
    trim: "Premium Plus",
    mileage: 71230,
    askingPrice: 31900,
    qualityScore: 66,
  },
  {
    id: "comp-5",
    included: false,
    source: "MarketCheck/API",
    distance: 310,
    year: 2020,
    model: "Audi Q7",
    trim: "Premium Plus",
    mileage: 59880,
    askingPrice: 35900,
    qualityScore: 62,
  },
  {
    id: "comp-6",
    included: false,
    source: "CarMax",
    distance: 200,
    year: 2020,
    model: "Audi Q7",
    trim: "Premium Plus",
    mileage: 82111,
    askingPrice: 29998,
    qualityScore: 58,
  },
];

const initialEvaluation: ValuationInput = {
  currentBid: 18200,
  targetResaleUsed: 31250,
  targetProfit: 3500,
  totalRiskPoints: 0,
  hasAvoidFlag: false,
  costs: {
    auctionFee: 546,
    transport: 800,
    recon: 950,
    detailAdmin: 250,
    generalRiskReserve: 600,
    brandRiskAdd: 250,
    titleHistoryRiskAdd: 500,
    conditionRiskAdd: 0,
  },
};

const initialSelectedConditions: string[] = [];

function money(value: number) {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 0,
  }).format(value);
}

function toNumber(value: string) {
  const cleaned = value.replace(/[^0-9.-]/g, "");
  const parsed = Number(cleaned);
  return Number.isFinite(parsed) ? parsed : 0;
}

function formatNumberInput(value: number) {
  if (!Number.isFinite(value)) {
    return "";
  }

  return Math.round(value).toLocaleString("en-US");
}

function MetricCard({
  label,
  value,
  tone = "default",
}: {
  label: string;
  value: string;
  tone?: "default" | "green" | "blue" | "purple" | "orange" | "red";
}) {
  const toneClass =
    tone === "green"
      ? "text-emerald-600"
      : tone === "blue"
      ? "text-blue-700"
      : tone === "purple"
      ? "text-purple-700"
      : tone === "orange"
      ? "text-amber-600"
      : tone === "red"
      ? "text-red-600"
      : "text-slate-950";

  return (
    <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
      <div className="text-xs font-semibold uppercase tracking-wide text-slate-500">
        {label}
      </div>
      <div className={`mt-2 text-2xl font-bold ${toneClass}`}>{value}</div>
    </div>
  );
}

function SectionCard({
  title,
  children,
  action,
}: {
  title: string;
  children: ReactNode;
  action?: ReactNode;
}) {
  return (
    <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
      <div className="mb-4 flex items-center justify-between gap-4">
        <h2 className="text-base font-bold text-slate-950">{title}</h2>
        {action}
      </div>
      {children}
    </section>
  );
}

function CurrencyInput({
  label,
  value,
  onChange,
}: {
  label: string;
  value: number;
  onChange: (value: number) => void;
}) {
  return (
    <label className="block">
      <div className="mb-1 text-xs font-semibold uppercase tracking-wide text-slate-500">
        {label}
      </div>
      <div className="flex items-center rounded-xl border border-slate-200 bg-white shadow-sm">
        <span className="pl-3 text-sm text-slate-400">$</span>
        <input
          type="text"
          inputMode="numeric"
          value={formatNumberInput(value)}
          onFocus={(event) => event.currentTarget.select()}
          onChange={(event) => onChange(toNumber(event.target.value))}
          className="w-full rounded-xl bg-transparent px-3 py-2 text-right text-sm font-semibold text-slate-900 outline-none"
        />
      </div>
    </label>
  );
}

function NumberInput({
  label,
  value,
  onChange,
}: {
  label: string;
  value: number;
  onChange: (value: number) => void;
}) {
  return (
    <label className="block">
      <div className="mb-1 text-xs font-semibold uppercase tracking-wide text-slate-500">
        {label}
      </div>
      <input
        type="text"
        inputMode="numeric"
        value={formatNumberInput(value)}
        onFocus={(event) => event.currentTarget.select()}
        onChange={(event) => onChange(toNumber(event.target.value))}
        className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-right text-sm font-semibold text-slate-900 shadow-sm outline-none"
      />
    </label>
  );
}

function FormRow({
  label,
  children,
}: {
  label: string;
  children: ReactNode;
}) {
  return (
    <div className="grid grid-cols-[120px_1fr] items-center gap-3">
      <div className="text-sm font-semibold text-slate-700">{label}</div>
      <div>{children}</div>
    </div>
  );
}

function StaticField({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <div className="mb-1 text-xs font-semibold uppercase tracking-wide text-slate-500">
        {label}
      </div>
      <div className="rounded-xl bg-slate-50 px-3 py-2 text-sm font-semibold text-slate-900">
        {value}
      </div>
    </div>
  );
}

type SavedEvaluationPayload = {
  vin?: string;
  auctionSite?: string;
  finalTargetOverride?: number | null;
  decodedVehicle?: VinDecodeResult | null;
  targetMileage?: number;
  evaluation?: ValuationInput;
  comps?: MarketComp[];
  selectedConditions?: string[];
  notes?: string;
};

export function EvaluationWorkspace({
  initialSavedEvaluationId = null,
  initialSavedPayload = null,
}: {
  initialSavedEvaluationId?: string | null;
  initialSavedPayload?: SavedEvaluationPayload | null;
}) {
  const [evaluation, setEvaluation] = useState<ValuationInput>(
    initialSavedPayload?.evaluation || initialEvaluation
  );

  const [vin, setVin] = useState(
    initialSavedPayload?.vin ||
      initialSavedPayload?.decodedVehicle?.vin ||
      "WA1LAAF78LD012345"
  );

  const [auctionSite, setAuctionSite] = useState(
    initialSavedPayload?.auctionSite || "ACV Auctions"
  );

  const [finalTargetOverride, setFinalTargetOverride] = useState<number | null>(
    typeof initialSavedPayload?.finalTargetOverride === "number"
      ? initialSavedPayload.finalTargetOverride
      : null
  );

  const [targetMileage, setTargetMileage] = useState(
    initialSavedPayload?.targetMileage || initialTargetMileage
  );

  const [comps, setComps] = useState<MarketComp[]>(
    initialSavedPayload?.comps?.length ? initialSavedPayload.comps : initialComps
  );

  const [decodedVehicle, setDecodedVehicle] = useState<VinDecodeResult | null>(
    initialSavedPayload?.decodedVehicle || null
  );

  const [marketCheckLoading, setMarketCheckLoading] = useState(false);
  const [marketCheckStatus, setMarketCheckStatus] = useState("");

  const [savedEvaluationId, setSavedEvaluationId] = useState<string | null>(
    initialSavedEvaluationId
  );

  const [saveLoading, setSaveLoading] = useState(false);
  const [saveStatus, setSaveStatus] = useState(
    initialSavedEvaluationId ? "Loaded saved evaluation" : ""
  );

  const [notes, setNotes] = useState(
    initialSavedPayload?.notes ||
      "Clean title Q7 with good service history. Minor cosmetic wear, needs tires. Strong local demand for this trim."
  );

  const [selectedConditions, setSelectedConditions] = useState<string[]>(
    initialSavedPayload?.selectedConditions || initialSelectedConditions
  );

  const compSummary = useMemo(
    () =>
      calculateCompSummary({
        comps,
        targetMileage,
        assumptions: defaultAssumptions,
      }),
    [comps, targetMileage]
  );

  const conditionGroups = useMemo(() => {
    return defaultAssumptions.conditionRules.reduce<
      Record<string, typeof defaultAssumptions.conditionRules>
    >((groups, rule) => {
      if (!groups[rule.category]) {
        groups[rule.category] = [];
      }

      groups[rule.category].push(rule);
      return groups;
    }, {});
  }, []);

  const conditionTotals = useMemo(() => {
    return selectedConditions.reduce(
      (totals, conditionName) => {
        const rule = defaultAssumptions.conditionRules.find(
          (conditionRule) => conditionRule.name === conditionName
        );

        if (!rule) {
          return totals;
        }

        return {
          riskPoints: totals.riskPoints + rule.riskPoints,
          reserveAdd: totals.reserveAdd + rule.reserveAdd,
          hasAvoidFlag: totals.hasAvoidFlag || rule.avoidFlag,
        };
      },
      {
        riskPoints: 0,
        reserveAdd: 0,
        hasAvoidFlag: false,
      }
    );
  }, [selectedConditions]);

  const targetResaleUsed =
    compSummary.fastSaleTarget || evaluation.targetResaleUsed;

  const finalTargetUsed =
    finalTargetOverride && finalTargetOverride > 0
      ? finalTargetOverride
      : targetResaleUsed;

  const valuationInput = useMemo<ValuationInput>(() => {
    return {
      ...evaluation,
      targetResaleUsed: finalTargetUsed,
      totalRiskPoints: conditionTotals.riskPoints,
      hasAvoidFlag: Boolean(evaluation.hasAvoidFlag || conditionTotals.hasAvoidFlag),
      costs: {
        ...evaluation.costs,
        conditionRiskAdd: conditionTotals.reserveAdd,
      },
    };
  }, [evaluation, finalTargetUsed, conditionTotals]);

  const valuation = useMemo(
    () => calculateValuation(valuationInput, defaultAssumptions),
    [valuationInput]
  );

  const vehicleYear = decodedVehicle?.year || "2020";
  const vehicleMake = decodedVehicle?.make || "Audi";
  const vehicleModel = decodedVehicle?.model || "Q7";
  const vehicleTrim = decodedVehicle?.trim || "quattro Premium Plus";
  const vehicleBodyClass = decodedVehicle?.bodyClass || "SUV / 4D";

  const vehicleTitle =
    [vehicleYear, vehicleMake, vehicleModel, vehicleTrim]
      .filter(Boolean)
      .join(" ")
      .trim() || "Auction Vehicle";

  function updateEvaluationField(
    key: keyof Omit<ValuationInput, "costs">,
    value: number | boolean
  ) {
    setEvaluation((previous) => ({
      ...previous,
      [key]: value,
    }));
  }

  function updateCost(key: keyof EvaluationCosts, value: number) {
    setEvaluation((previous) => ({
      ...previous,
      costs: {
        ...previous.costs,
        [key]: value,
      },
    }));
  }

  function toggleCondition(conditionName: string) {
    setSelectedConditions((previous) =>
      previous.includes(conditionName)
        ? previous.filter((name) => name !== conditionName)
        : [...previous, conditionName]
    );
  }

  function handleDecodedVinAndReset(decoded: VinDecodeResult) {
    setDecodedVehicle(decoded);
    setVin(decoded.vin);

    setEvaluation({
      ...initialEvaluation,
      currentBid: 0,
      targetResaleUsed: 0,
      hasAvoidFlag: false,
      costs: {
        ...initialEvaluation.costs,
      },
    });

    setTargetMileage(0);
    setFinalTargetOverride(null);
    setComps([]);
    setSelectedConditions([]);
    setMarketCheckStatus("");
    setSavedEvaluationId(null);
    setSaveStatus("");
    setNotes("");
  }

  function resetForDecodedVin(decoded: VinDecodeResult) {
    setDecodedVehicle(decoded);
    setVin(decoded.vin);

    setEvaluation({
      ...initialEvaluation,
      currentBid: 0,
      targetResaleUsed: 0,
      hasAvoidFlag: false,
      costs: {
        ...initialEvaluation.costs,
      },
    });

    setTargetMileage(0);
    setFinalTargetOverride(null);
    setComps([]);
    setSelectedConditions([]);
    setMarketCheckStatus("");
    setSavedEvaluationId(null);
    setSaveStatus("");
    setNotes("");
  }

  function toggleCompIncluded(id: string) {
    setComps((previous) =>
      previous.map((comp) =>
        comp.id === id
          ? {
              ...comp,
              included: !comp.included,
            }
          : comp
      )
    );
  }

  async function pullMarketCheckComps() {
    const year = vehicleYear;
    const make = vehicleMake;
    const model = vehicleModel;

    setMarketCheckLoading(true);
    setMarketCheckStatus("");

    try {
      const response = await fetch("/api/marketcheck/search", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          year,
          make,
          model,
          trim: vehicleTrim,
          targetMileage,
          zips: ["29412", "29201", "28202", "30303", "31401"],
          radius: 100,
          rows: 10,
        }),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || "MarketCheck search failed.");
      }

      if (!data.comps || data.comps.length === 0) {
        setMarketCheckStatus("No comps found");
        return;
      }

      setComps(data.comps);
      setMarketCheckStatus(`${data.comps.length} comps loaded`);
    } catch (error) {
      setMarketCheckStatus(
        error instanceof Error ? error.message : "MarketCheck search failed."
      );
    } finally {
      setMarketCheckLoading(false);
    }
  }

  async function saveEvaluation() {
    setSaveLoading(true);
    setSaveStatus("");

    try {
      const response = await fetch("/api/evaluations/save", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          id: savedEvaluationId,
          status: "watching",
          vehicleTitle,
          vin,
          auctionSite,
          finalTargetOverride,
          targetResaleFromComps: targetResaleUsed,
          finalTargetUsed,
          decodedVehicle,
          targetMileage,
          evaluation,
          valuationInput,
          valuation,
          compSummary,
          comps,
          selectedConditions,
          notes,
          auctionUrl: "",
          auctionEndsAt: null,
          assumptionsSnapshot: defaultAssumptions,
        }),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || "Save failed.");
      }

      setSavedEvaluationId(data.id);
      setSaveStatus(
        data.mode === "updated" ? "Updated in Supabase" : "Saved to Supabase"
      );
    } catch (error) {
      setSaveStatus(error instanceof Error ? error.message : "Save failed.");
    } finally {
      setSaveLoading(false);
    }
  }

  const decisionTone =
    valuation.decision === "Pass"
      ? "bg-red-600"
      : valuation.decision === "Watch / Stretch Only"
      ? "bg-amber-500"
      : "bg-emerald-600";

  const decisionBadgeTone =
    valuation.decision === "Pass"
      ? "bg-red-100 text-red-700"
      : valuation.decision === "Watch / Stretch Only"
      ? "bg-amber-100 text-amber-700"
      : "bg-emerald-100 text-emerald-700";

  return (
    <main className="min-h-screen bg-slate-100 text-slate-950">
      <div className="flex min-h-screen">
        <aside className="hidden w-64 shrink-0 bg-slate-950 p-5 text-white lg:block">
          <div className="mb-10 flex items-center justify-center">
            <img
              src="/mindful-badge-sm.png"
              alt="Mindful Motors"
              className="h-16 w-auto object-contain"
            />
          </div>

          <nav className="space-y-2 text-sm">
            <Link
              href="/"
              className="block rounded-xl bg-cyan-500/20 px-4 py-3 text-cyan-200"
            >
              Auction Evaluator
            </Link>
            <div className="rounded-xl px-4 py-3 text-slate-300 hover:bg-white/5">
              Market Comps
            </div>
            <div className="rounded-xl px-4 py-3 text-slate-300 hover:bg-white/5">
              Vehicles
            </div>
            <Link
              href="/deals"
              className="block rounded-xl px-4 py-3 text-slate-300 hover:bg-white/5"
            >
              Deal Log
            </Link>
            <Link
              href="/assumptions"
              className="block rounded-xl px-4 py-3 text-slate-300 hover:bg-white/5"
            >
              Rules & Defaults
            </Link>
            <div className="rounded-xl px-4 py-3 text-slate-300 hover:bg-white/5">
              Settings
            </div>
          </nav>
        </aside>

        <div className="flex min-w-0 flex-1 flex-col">
          <header className="flex h-16 items-center justify-between border-b border-slate-200 bg-white px-6">
            <div>
              <div className="text-xl font-bold">Auction Evaluator</div>
              <div className="text-xs text-slate-500">
                Live valuation workspace
              </div>
            </div>

            <div className="hidden w-[420px] rounded-xl border border-slate-200 bg-slate-50 px-4 py-2 text-sm text-slate-500 md:block">
              Enter VIN or search vehicles...
            </div>

            <div className="flex items-center gap-3">
              <div className="rounded-full bg-slate-100 px-3 py-1 text-sm font-medium">
                Buyer
              </div>
              <div className="h-9 w-9 rounded-full bg-slate-900" />
            </div>
          </header>

          <div className="flex-1 p-6">
            <div className="mb-6 flex flex-col justify-between gap-4 xl:flex-row xl:items-end">
              <div>
                <div className="mb-2 text-sm font-medium text-blue-700">
                  Back to Evaluations
                </div>
                <h1 className="text-3xl font-bold tracking-tight">
                  {vehicleTitle}
                </h1>
                <div
                  className={`mt-2 inline-flex rounded-full px-3 py-1 text-sm font-semibold ${decisionBadgeTone}`}
                >
                  {valuation.decision}
                </div>
              </div>

              <div className="flex flex-wrap gap-3">
                <button className="rounded-xl border border-slate-300 bg-white px-4 py-2 text-sm font-semibold shadow-sm">
                  Decode VIN
                </button>
                <button
                  onClick={pullMarketCheckComps}
                  disabled={marketCheckLoading}
                  className="rounded-xl bg-blue-700 px-4 py-2 text-sm font-semibold text-white shadow-sm disabled:cursor-not-allowed disabled:bg-slate-400"
                >
                  {marketCheckLoading ? "Pulling Comps..." : "Pull MarketCheck Comps"}
                </button>
                <button
                  type="button"
                  onClick={saveEvaluation}
                  disabled={saveLoading}
                  className="rounded-xl bg-slate-950 px-4 py-2 text-sm font-semibold text-white shadow-sm disabled:cursor-not-allowed disabled:bg-slate-400"
                >
                  {saveLoading ? "Saving..." : savedEvaluationId ? "Update Evaluation" : "Save Evaluation"}
                </button>
              </div>
            </div>

            <div className="space-y-5">
              <div className="grid grid-cols-1 gap-5 xl:grid-cols-[1.15fr_1.15fr_1fr]">
                <SectionCard title="1. Vehicle Basics">
                    <div className="space-y-4">
                      <FormRow label="VIN">
                        <input
                          value={vin}
                          onChange={(event) =>
                            setVin(event.target.value.toUpperCase())
                          }
                          className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-right text-sm font-semibold text-slate-900 shadow-sm outline-none"
                        />
                      </FormRow>

                      <FormRow label="Mileage">
                          <input
                            type="text"
                            inputMode="numeric"
                            value={formatNumberInput(targetMileage)}
                            onFocus={(event) => event.currentTarget.select()}
                            onChange={(event) =>
                              setTargetMileage(toNumber(event.target.value))
                            }
                            className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-right text-sm font-semibold text-slate-900 shadow-sm outline-none"
                          />
                        </FormRow>

                      <FormRow label="Auction Site">
                        <select
                          value={auctionSite}
                          onChange={(event) => setAuctionSite(event.target.value)}
                          className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-right text-sm font-semibold text-slate-900 shadow-sm outline-none"
                        >
                          <option>ACV Auctions</option>
                          <option>Manheim</option>
                          <option>Cars & Bids</option>
                          <option>Bring a Trailer</option>
                          <option>Facebook</option>
                          <option>Private Party</option>
                          <option>Other</option>
                        </select>
                      </FormRow>

                      <FormRow label="Current Bid">
                          <div className="flex items-center rounded-xl border border-slate-200 bg-white shadow-sm">
                            <span className="pl-3 text-sm text-slate-400">$</span>
                            <input
                              type="text"
                              inputMode="numeric"
                              value={formatNumberInput(valuationInput.currentBid)}
                              onFocus={(event) => event.currentTarget.select()}
                              onChange={(event) =>
                                updateEvaluationField(
                                  "currentBid",
                                  toNumber(event.target.value)
                                )
                              }
                              className="w-full rounded-xl bg-transparent px-3 py-2 text-right text-sm font-semibold text-slate-900 outline-none"
                            />
                          </div>
                        </FormRow>

                      <FormRow label="Target Resale Used">
                        <div className="rounded-xl bg-slate-50 px-3 py-2 text-right text-sm font-bold text-slate-900">
                          {money(targetResaleUsed)}
                        </div>
                      </FormRow>

                      <FormRow label="Final Target">
                          <div className="flex items-center rounded-xl border border-slate-200 bg-white shadow-sm">
                            <span className="pl-3 text-sm text-slate-400">$</span>
                            <input
                              type="text"
                              inputMode="numeric"
                              value={formatNumberInput(finalTargetOverride ?? targetResaleUsed)}
                              onFocus={(event) => event.currentTarget.select()}
                              onChange={(event) =>
                                setFinalTargetOverride(toNumber(event.target.value))
                              }
                              className="w-full rounded-xl bg-transparent px-3 py-2 text-right text-sm font-semibold text-slate-900 outline-none"
                            />
                          </div>
                        </FormRow>

                      <FormRow label="Target Profit">
                          <div className="flex items-center rounded-xl border border-slate-200 bg-white shadow-sm">
                            <span className="pl-3 text-sm text-slate-400">$</span>
                            <input
                              type="text"
                              inputMode="numeric"
                              value={formatNumberInput(valuationInput.targetProfit)}
                              onFocus={(event) => event.currentTarget.select()}
                              onChange={(event) =>
                                updateEvaluationField(
                                  "targetProfit",
                                  toNumber(event.target.value)
                                )
                              }
                              className="w-full rounded-xl bg-transparent px-3 py-2 text-right text-sm font-semibold text-slate-900 outline-none"
                            />
                          </div>
                        </FormRow>

                      <label className="flex items-center gap-2 pt-2 text-sm font-semibold text-slate-700">
                        <input
                          type="checkbox"
                          checked={Boolean(evaluation.hasAvoidFlag)}
                          onChange={(event) =>
                            updateEvaluationField(
                              "hasAvoidFlag",
                              event.target.checked
                            )
                          }
                        />
                        Manual avoid flag
                      </label>
                    </div>
                  </SectionCard>

                <VinDecodeCard
                  vin={vin}
                  onVinChange={setVin}
                  onDecoded={(decoded) => handleDecodedVinAndReset(decoded)}
                />

                <SectionCard title="6. Output / Decision">
                  <div className="grid grid-cols-2 gap-3">
                    <MetricCard
                      label="All-In Cost"
                      value={money(valuation.allInCost)}
                    />
                    <MetricCard
                      label="Gross Profit"
                      value={money(valuation.expectedGrossProfit)}
                      tone={valuation.expectedGrossProfit >= 0 ? "green" : "red"}
                    />
                    <MetricCard
                      label="Safe Bid"
                      value={money(valuation.safeBid)}
                    />
                    <MetricCard
                      label="Max Smart Bid"
                      value={money(valuation.maxSmartBid)}
                      tone="blue"
                    />
                    <MetricCard
                      label="Stretch Bid"
                      value={money(valuation.stretchBid)}
                      tone="purple"
                    />
                    <MetricCard
                      label="Risk Grade"
                      value={valuation.riskGrade}
                      tone={
                        valuation.riskGrade === "Low"
                          ? "green"
                          : valuation.riskGrade === "Medium"
                          ? "orange"
                          : "red"
                      }
                    />
                  </div>

                  <div className={`mt-4 rounded-2xl p-5 text-white ${decisionTone}`}>
                    <div className="text-3xl font-black">{valuation.decision}</div>
                    <p className="mt-2 text-sm text-white/90">
                      Comps, condition rules, costs, and assumptions now feed
                      the valuation.
                    </p>
                  </div>
                </SectionCard>
              </div>

              <div className="grid grid-cols-1 gap-5 xl:grid-cols-[1fr_1.15fr_.9fr]">
                <SectionCard title="3. Condition Checklist">
                    <div className="space-y-4 text-sm">
                      {Object.entries(conditionGroups).map(([category, rules]) => (
                        <div key={category}>
                          <div className="mb-2 font-semibold">{category}</div>
                          <div className="space-y-1">
                            {rules.map((rule) => {
                              const checked = selectedConditions.includes(
                                rule.name
                              );

                              return (
                                <label
                                  key={rule.name}
                                  className="flex items-center justify-between gap-3"
                                >
                                  <span>
                                    <input
                                      className="mr-2"
                                      type="checkbox"
                                      checked={checked}
                                      onChange={() => toggleCondition(rule.name)}
                                    />
                                    {rule.name}
                                  </span>
                                  <span className="text-xs text-slate-500">
                                    +{rule.riskPoints} / {money(rule.reserveAdd)}
                                  </span>
                                </label>
                              );
                            })}
                          </div>
                        </div>
                      ))}

                      <div className="grid grid-cols-2 gap-3 rounded-xl bg-emerald-50 p-3 text-center">
                        <div>
                          <div className="text-xs text-slate-500">
                            Condition Risk Add
                          </div>
                          <div className="font-bold text-emerald-700">
                            {money(conditionTotals.reserveAdd)}
                          </div>
                        </div>
                        <div>
                          <div className="text-xs text-slate-500">
                            Condition Points
                          </div>
                          <div className="font-bold">
                            {conditionTotals.riskPoints} / 300
                          </div>
                        </div>
                      </div>
                    </div>
                  </SectionCard>

                <SectionCard title="5. Cost & Risk">
                  <div className="space-y-3">
                    <CurrencyInput
                      label="Auction Fee"
                      value={valuationInput.costs.auctionFee}
                      onChange={(value) => updateCost("auctionFee", value)}
                    />
                    <CurrencyInput
                      label="Transport"
                      value={valuationInput.costs.transport}
                      onChange={(value) => updateCost("transport", value)}
                    />
                    <CurrencyInput
                      label="Recon"
                      value={valuationInput.costs.recon}
                      onChange={(value) => updateCost("recon", value)}
                    />
                    <CurrencyInput
                      label="Detail/Admin"
                      value={valuationInput.costs.detailAdmin}
                      onChange={(value) => updateCost("detailAdmin", value)}
                    />
                    <CurrencyInput
                      label="General Risk Reserve"
                      value={valuationInput.costs.generalRiskReserve}
                      onChange={(value) =>
                        updateCost("generalRiskReserve", value)
                      }
                    />
                    <CurrencyInput
                      label="Brand Risk Add"
                      value={valuationInput.costs.brandRiskAdd}
                      onChange={(value) => updateCost("brandRiskAdd", value)}
                    />
                    <CurrencyInput
                      label="Title/History Risk Add"
                      value={valuationInput.costs.titleHistoryRiskAdd}
                      onChange={(value) =>
                        updateCost("titleHistoryRiskAdd", value)
                      }
                    />

                    <div>
                      <div className="mb-1 text-xs font-semibold uppercase tracking-wide text-slate-500">
                        Condition Risk Add
                      </div>
                      <div className="rounded-xl bg-slate-50 px-3 py-2 text-sm font-bold text-emerald-700">
                        {money(valuationInput.costs.conditionRiskAdd)}
                      </div>
                    </div>

                    <div className="mt-4 border-t border-slate-200 pt-4">
                      <div className="flex justify-between text-base font-bold">
                        <span>Total Cost Adders</span>
                        <span>{money(valuation.totalCostAdders)}</span>
                      </div>
                      <div className="mt-2 flex justify-between text-base font-bold text-red-600">
                        <span>Total Risk Points</span>
                        <span>{valuationInput.totalRiskPoints} / 300</span>
                      </div>
                    </div>
                  </div>
                </SectionCard>

                <SectionCard title="7. Deal Notes">
                  <textarea
                    className="h-28 w-full rounded-xl border border-slate-200 p-3 text-sm"
                    defaultValue="Clean title Q7 with good service history. Minor cosmetic wear, needs tires. Strong local demand for this trim."
                  />
                  <button className="mt-3 rounded-xl bg-blue-700 px-4 py-2 text-sm font-semibold text-white">
                    Save Note
                  </button>
                </SectionCard>
              </div>

              <SectionCard
                  title="4. Market Comps"
                  action={
                    marketCheckStatus ? (
                      <span className="rounded-full bg-slate-100 px-3 py-1 text-xs font-bold text-slate-700">
                        {marketCheckStatus}
                      </span>
                    ) : null
                  }
                >
                  <div className="mb-4 grid grid-cols-2 gap-3 md:grid-cols-5">
                    <MetricCard
                      label="Comp Count"
                      value={`${compSummary.includedCount}`}
                    />
                    <MetricCard
                      label="Median Adjusted"
                      value={money(compSummary.medianAdjusted)}
                    />
                    <MetricCard
                      label="Fast Sale Target"
                      value={money(compSummary.fastSaleTarget)}
                    />
                    <MetricCard
                      label="Confidence"
                      value={compSummary.confidence}
                      tone={
                        compSummary.confidence === "High"
                          ? "green"
                          : compSummary.confidence === "Medium"
                          ? "orange"
                          : "red"
                      }
                    />
                    <MetricCard label="Search Type" value="Local + Regional" />
                  </div>

                  <MarketCompsTable
                    comps={comps}
                    targetMileage={targetMileage}
                    assumptions={defaultAssumptions}
                    onToggleIncluded={toggleCompIncluded}
                  />
                </SectionCard>
            </div>
          </div>
        </div>
      </div>
    </main>
  );
}
