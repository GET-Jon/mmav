"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import type { ReactNode } from "react";
import { MarketCompsTable } from "@/components/comps/market-comps-table";
import { defaultAssumptions } from "@/lib/assumptions";
import { calculateValuation } from "@/lib/valuation";
import type { EvaluationCosts, ValuationInput } from "@/types/evaluation";

const initialEvaluation: ValuationInput = {
  currentBid: 18200,
  targetResaleUsed: 31250,
  targetProfit: 3500,
  totalRiskPoints: 125,
  hasAvoidFlag: false,
  costs: {
    auctionFee: 546,
    transport: 800,
    recon: 950,
    detailAdmin: 250,
    generalRiskReserve: 600,
    brandRiskAdd: 250,
    titleHistoryRiskAdd: 500,
    conditionRiskAdd: 900,
  },
};

function money(value: number) {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 0,
  }).format(value);
}

function number(value: number) {
  return new Intl.NumberFormat("en-US").format(value);
}

function toNumber(value: string) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
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
          type="number"
          value={value}
          onChange={(event) => onChange(toNumber(event.target.value))}
          className="w-full rounded-xl bg-transparent px-3 py-2 text-sm font-semibold text-slate-900 outline-none"
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
        type="number"
        value={value}
        onChange={(event) => onChange(toNumber(event.target.value))}
        className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm font-semibold text-slate-900 shadow-sm outline-none"
      />
    </label>
  );
}

function StaticField({
  label,
  value,
}: {
  label: string;
  value: string;
}) {
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

export function EvaluationWorkspace() {
  const [evaluation, setEvaluation] =
    useState<ValuationInput>(initialEvaluation);

  const valuation = useMemo(
    () => calculateValuation(evaluation, defaultAssumptions),
    [evaluation]
  );

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
          <div className="mb-10 flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-cyan-400 text-xl font-black text-slate-950">
              M
            </div>
            <div>
              <div className="text-lg font-bold leading-tight">Mindful</div>
              <div className="text-lg font-bold leading-tight">Motors</div>
            </div>
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
            <div className="rounded-xl px-4 py-3 text-slate-300 hover:bg-white/5">
              Deal Log
            </div>
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

          <div className="mt-10 rounded-2xl border border-white/10 bg-white/5 p-4 text-sm text-slate-300">
            <div className="font-semibold text-white">Mindful Motors</div>
            <div>Internal Auction Tool</div>
          </div>
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
                  2020 Audi Q7 quattro Premium Plus
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
                <button className="rounded-xl bg-blue-700 px-4 py-2 text-sm font-semibold text-white shadow-sm">
                  Pull MarketCheck Comps
                </button>
                <button className="rounded-xl bg-slate-950 px-4 py-2 text-sm font-semibold text-white shadow-sm">
                  Save Evaluation
                </button>
              </div>
            </div>

            <div className="grid grid-cols-1 gap-5 xl:grid-cols-[1fr_370px]">
              <div className="space-y-5">
                <div className="grid grid-cols-1 gap-5 lg:grid-cols-3">
                  <SectionCard title="1. Vehicle Basics">
                    <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                      <StaticField label="VIN" value="WA1LAAF78LD012345" />
                      <StaticField label="Mileage" value="68,742" />
                      <StaticField label="Auction Site" value="Manheim Phoenix" />
                      <StaticField label="Vehicle Type" value="SUV / 4D" />

                      <CurrencyInput
                        label="Current Bid"
                        value={evaluation.currentBid}
                        onChange={(value) =>
                          updateEvaluationField("currentBid", value)
                        }
                      />

                      <CurrencyInput
                        label="Target Resale"
                        value={evaluation.targetResaleUsed}
                        onChange={(value) =>
                          updateEvaluationField("targetResaleUsed", value)
                        }
                      />

                      <CurrencyInput
                        label="Target Profit"
                        value={evaluation.targetProfit}
                        onChange={(value) =>
                          updateEvaluationField("targetProfit", value)
                        }
                      />

                      <NumberInput
                        label="Risk Points"
                        value={evaluation.totalRiskPoints}
                        onChange={(value) =>
                          updateEvaluationField("totalRiskPoints", value)
                        }
                      />
                    </div>

                    <label className="mt-4 flex items-center gap-2 text-sm font-semibold text-slate-700">
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
                      Avoid flag
                    </label>
                  </SectionCard>

                  <SectionCard
                    title="2. VIN Decode"
                    action={
                      <span className="rounded-full bg-emerald-100 px-2 py-1 text-xs font-bold text-emerald-700">
                        Decoded
                      </span>
                    }
                  >
                    <div className="space-y-2 text-sm">
                      {[
                        ["Year", "2020"],
                        ["Make", "Audi"],
                        ["Model", "Q7"],
                        ["Trim", "Premium Plus"],
                        ["Body Class", "SUV"],
                        ["Drivetrain", "quattro AWD"],
                        ["Fuel", "Gasoline"],
                        ["Engine", "3.0L V6 TFSI"],
                        ["Plant Country", "Slovakia"],
                      ].map(([label, value]) => (
                        <div key={label} className="flex justify-between gap-4">
                          <span className="text-slate-500">{label}</span>
                          <span className="font-semibold">{value}</span>
                        </div>
                      ))}
                    </div>
                  </SectionCard>

                  <SectionCard title="3. Condition Checklist">
                    <div className="space-y-4 text-sm">
                      <div>
                        <div className="mb-2 font-semibold">Mechanical</div>
                        <label className="flex items-center justify-between">
                          <span>
                            <input className="mr-2" type="checkbox" checked readOnly />
                            Warning Light
                          </span>
                          <span className="text-slate-500">+25</span>
                        </label>
                        <label className="flex items-center justify-between">
                          <span>
                            <input className="mr-2" type="checkbox" readOnly />
                            Mechanical Concern
                          </span>
                          <span className="text-slate-500">+35</span>
                        </label>
                        <label className="flex items-center justify-between">
                          <span>
                            <input className="mr-2" type="checkbox" readOnly />
                            Transmission Concern
                          </span>
                          <span className="text-slate-500">+40</span>
                        </label>
                      </div>

                      <div>
                        <div className="mb-2 font-semibold">Exterior / Wear</div>
                        <label className="flex items-center justify-between">
                          <span>
                            <input className="mr-2" type="checkbox" checked readOnly />
                            Minor Cosmetics
                          </span>
                          <span className="text-slate-500">+10</span>
                        </label>
                        <label className="flex items-center justify-between">
                          <span>
                            <input className="mr-2" type="checkbox" checked readOnly />
                            Needs Tires
                          </span>
                          <span className="text-slate-500">+15</span>
                        </label>
                      </div>

                      <div className="grid grid-cols-2 gap-3 rounded-xl bg-emerald-50 p-3 text-center">
                        <div>
                          <div className="text-xs text-slate-500">
                            Condition Risk Add
                          </div>
                          <div className="font-bold text-emerald-700">
                            {money(evaluation.costs.conditionRiskAdd)}
                          </div>
                        </div>
                        <div>
                          <div className="text-xs text-slate-500">
                            Condition Points
                          </div>
                          <div className="font-bold">
                            {evaluation.totalRiskPoints} / 300
                          </div>
                        </div>
                      </div>
                    </div>
                  </SectionCard>
                </div>

                <SectionCard title="4. Market Comps">
                  <div className="mb-4 grid grid-cols-2 gap-3 md:grid-cols-5">
                    <MetricCard label="Comp Count" value="6" />
                    <MetricCard label="Median Adjusted" value="$33,750" />
                    <MetricCard
                      label="Fast Sale Target"
                      value={money(evaluation.targetResaleUsed)}
                    />
                    <MetricCard label="Confidence" value="72%" tone="green" />
                    <MetricCard label="Search Type" value="Local + Regional" />
                  </div>

                  <MarketCompsTable />
                </SectionCard>
              </div>

              <aside className="space-y-5">
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
                      Calculated live from the editable fields.
                    </p>
                  </div>
                </SectionCard>

                <SectionCard title="5. Cost & Risk">
                  <div className="space-y-3">
                    <CurrencyInput
                      label="Auction Fee"
                      value={evaluation.costs.auctionFee}
                      onChange={(value) => updateCost("auctionFee", value)}
                    />
                    <CurrencyInput
                      label="Transport"
                      value={evaluation.costs.transport}
                      onChange={(value) => updateCost("transport", value)}
                    />
                    <CurrencyInput
                      label="Recon"
                      value={evaluation.costs.recon}
                      onChange={(value) => updateCost("recon", value)}
                    />
                    <CurrencyInput
                      label="Detail/Admin"
                      value={evaluation.costs.detailAdmin}
                      onChange={(value) => updateCost("detailAdmin", value)}
                    />
                    <CurrencyInput
                      label="General Risk Reserve"
                      value={evaluation.costs.generalRiskReserve}
                      onChange={(value) =>
                        updateCost("generalRiskReserve", value)
                      }
                    />
                    <CurrencyInput
                      label="Brand Risk Add"
                      value={evaluation.costs.brandRiskAdd}
                      onChange={(value) => updateCost("brandRiskAdd", value)}
                    />
                    <CurrencyInput
                      label="Title/History Risk Add"
                      value={evaluation.costs.titleHistoryRiskAdd}
                      onChange={(value) =>
                        updateCost("titleHistoryRiskAdd", value)
                      }
                    />
                    <CurrencyInput
                      label="Condition Risk Add"
                      value={evaluation.costs.conditionRiskAdd}
                      onChange={(value) => updateCost("conditionRiskAdd", value)}
                    />

                    <div className="mt-4 border-t border-slate-200 pt-4">
                      <div className="flex justify-between text-base font-bold">
                        <span>Total Cost Adders</span>
                        <span>{money(valuation.totalCostAdders)}</span>
                      </div>
                      <div className="mt-2 flex justify-between text-base font-bold text-red-600">
                        <span>Total Risk Points</span>
                        <span>{evaluation.totalRiskPoints} / 300</span>
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
              </aside>
            </div>
          </div>
        </div>
      </div>
    </main>
  );
}
