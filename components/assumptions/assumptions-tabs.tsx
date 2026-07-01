"use client";

import { useState } from "react";
import { defaultAssumptions } from "@/lib/assumptions";
import { modelTaxonomyFallbacks } from "@/lib/marketcheck/model-taxonomy";
import type {
  Assumptions,
  AuctionFeeRule,
  BidSettings,
  CompSettings,
  ConditionRule,
  CostDefault,
  RegionalMarket,
  SourceDiscount,
  VehicleClassificationRule,
} from "@/types/assumptions";

type Tab =
  | "overview"
  | "bid"
  | "costs"
  | "risk"
  | "auctionFees"
  | "comps"
  | "vehicleRules"
  | "regional"
  | "taxonomy";

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

function TextInput({
  value,
  onChange,
}: {
  value: string;
  onChange: (value: string) => void;
}) {

  return (
    <input
      value={value}
      onChange={(event) => onChange(event.target.value)}
      className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm font-medium text-slate-900 shadow-sm"
    />
  );
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
      {prefix && <span className="pl-3 text-sm text-slate-400">{prefix}</span>}
      <input
        type="number"
        step={step}
        value={value}
        onChange={(event) => onChange(toNumber(event.target.value))}
        className="w-full rounded-lg bg-transparent px-3 py-2 text-sm font-medium text-slate-900 outline-none"
      />
      {suffix && <span className="pr-3 text-sm text-slate-400">{suffix}</span>}

      

    </div>
  );
}

function OverviewMetric({
  label,
  value,
  helper,
}: {
  label: string;
  value: string;
  helper: string;
}) {
  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
      <div className="text-xs font-bold uppercase tracking-wide text-slate-500">
        {label}
      </div>
      <div className="mt-2 text-2xl font-black text-slate-950">{value}</div>
      <div className="mt-2 text-sm leading-6 text-slate-600">{helper}</div>
    </div>
  );
}

function ExplanationCard({
  title,
  description,
  bullets,
}: {
  title: string;
  description: string;
  bullets: string[];
}) {
  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
      <h3 className="text-lg font-bold text-slate-950">{title}</h3>
      <p className="mt-2 text-sm leading-6 text-slate-600">{description}</p>
      <ul className="mt-4 space-y-2 text-sm text-slate-700">
        {bullets.map((bullet) => (
          <li key={bullet} className="flex gap-2">
            <span className="mt-2 h-1.5 w-1.5 rounded-full bg-slate-400" />
            <span>{bullet}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

function PlainRuleRow({
  label,
  value,
  explanation,
}: {
  label: string;
  value: string;
  explanation: string;
}) {
  return (
    <div className="grid grid-cols-1 gap-2 border-b border-slate-100 py-3 last:border-b-0 md:grid-cols-[220px_180px_1fr]">
      <div className="font-semibold text-slate-700">{label}</div>
      <div className="font-bold text-slate-950">{value}</div>
      <div className="text-slate-600">{explanation}</div>
    </div>
  );
}

function FieldLabelWithHelp({
  label,
  description,
  suggestedRange,
  usedIn,
}: {
  label: string;
  description: string;
  suggestedRange: string;
  usedIn: string;
}) {
  return (
    <div className="mb-1 flex items-center gap-2">
      <label className="text-sm font-semibold text-slate-600">{label}</label>

      <div className="group relative inline-flex">
        <button
          type="button"
          aria-label={`More information about ${label}`}
          className="flex h-5 w-5 items-center justify-center rounded-full border border-slate-300 bg-white text-xs font-black text-slate-500 shadow-sm hover:border-blue-300 hover:text-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-200"
        >
          i
        </button>

        <div className="pointer-events-none absolute bottom-7 left-1/2 z-30 hidden w-80 -translate-x-1/2 rounded-xl border border-slate-200 bg-white p-4 text-left text-xs shadow-xl group-hover:block group-focus-within:block">
          <div className="text-sm font-bold text-slate-950">{label}</div>
          <div className="mt-2 leading-5 text-slate-600">{description}</div>

          <div className="mt-3 rounded-lg bg-slate-50 p-3">
            <div className="font-bold uppercase tracking-wide text-slate-500">
              Suggested Range
            </div>
            <div className="mt-1 font-semibold text-slate-800">
              {suggestedRange}
            </div>
          </div>

          <div className="mt-3 rounded-lg bg-blue-50 p-3">
            <div className="font-bold uppercase tracking-wide text-blue-500">
              Used In
            </div>
            <div className="mt-1 font-semibold text-blue-800">{usedIn}</div>
          </div>
        </div>
      </div>
    </div>
  );
}

function TableHeaderWithHelp({
  label,
  description,
  suggestedRange,
  usedIn,
}: {
  label: string;
  description: string;
  suggestedRange: string;
  usedIn: string;
}) {
  const tooltip = `${label}

${description}

Suggested range: ${suggestedRange}

Used in: ${usedIn}`;

  return (
    <div className="flex items-center gap-2">
      <span>{label}</span>
      <span
        title={tooltip}
        aria-label={tooltip}
        className="inline-flex h-4 w-4 cursor-help items-center justify-center rounded-full border border-slate-300 bg-white text-[10px] font-black text-slate-500 shadow-sm"
      >
        i
      </span>
    </div>
  );
}

export function AssumptionsTabs({
  assumptions,
}: {
  assumptions: Assumptions;
}) {
    const normalizedAssumptions: Assumptions = {
      ...defaultAssumptions,
      ...assumptions,
      vehicleClassificationRules:
        assumptions.vehicleClassificationRules?.length
          ? assumptions.vehicleClassificationRules
          : defaultAssumptions.vehicleClassificationRules,
      regionalMarkets: (
        assumptions.regionalMarkets?.length
          ? assumptions.regionalMarkets
          : defaultAssumptions.regionalMarkets
      ).map((market, index) => ({
        ...market,
        order:
          typeof market.order === "number" && Number.isFinite(market.order)
            ? market.order
            : index + 1,
      })),
    };

  const [activeTab, setActiveTab] = useState<Tab>("overview");
  const [openMenu, setOpenMenu] = useState<string | null>(null);
    const [draft, setDraft] = useState<Assumptions>(normalizedAssumptions);
  const [dirty, setDirty] = useState(false);
    const [saveLoading, setSaveLoading] = useState(false);
    const [saveStatus, setSaveStatus] = useState("");

  const tabGroups: {
    label: string;
    description: string;
    tabs: { id: Tab; label: string }[];
  }[] = [
    {
      label: "Overview",
      description: "Plain-English summary of the current rule profile.",
      tabs: [{ id: "overview", label: "Overview" }],
    },
    {
      label: "Valuation",
      description: "Controls what we can pay, required profit, and default costs.",
      tabs: [
        { id: "bid", label: "Bid Settings" },
        { id: "costs", label: "Cost Defaults" },
        { id: "auctionFees", label: "Auction Fees" },
      ],
    },
    {
      label: "Risk & Decisioning",
      description: "Controls risk scoring, avoid logic, and vehicle classification.",
      tabs: [
        { id: "risk", label: "Risk Rules" },
        { id: "vehicleRules", label: "Vehicle Rules" },
      ],
    },
    {
      label: "Market Data",
      description: "Controls comp quality, regional search, and market behavior.",
      tabs: [
        { id: "comps", label: "Comp Settings" },
        { id: "regional", label: "Regional Search" },
      ],
    },
    {
      label: "Model Taxonomy",
      description: "Documents model-family fallback rules and false-positive filters.",
      tabs: [{ id: "taxonomy", label: "Model Taxonomy" }],
    },
  ];

  function updateBid(key: keyof BidSettings, value: number) {
    setDraft((previous) => ({
      ...previous,
      bidSettings: {
        ...previous.bidSettings,
        [key]: value,
      },
    }));
    setDirty(true);
  }

  function updateCost(
    index: number,
    key: keyof CostDefault,
    value: string | number
  ) {
    setDraft((previous) => ({
      ...previous,
      costDefaults: previous.costDefaults.map((row, rowIndex) =>
        rowIndex === index
          ? {
              ...row,
              [key]: value,
            }
          : row
      ),
    }));
    setDirty(true);
  }

  function updateCondition(
    index: number,
    key: keyof ConditionRule,
    value: string | number | boolean
  ) {
    setDraft((previous) => ({
      ...previous,
      conditionRules: previous.conditionRules.map((row, rowIndex) =>
        rowIndex === index
          ? {
              ...row,
              [key]: value,
            }
          : row
      ),
    }));
    setDirty(true);
  }

  function updateAuctionFee(
    index: number,
    key: keyof AuctionFeeRule,
    value: string | number
  ) {
    setDraft((previous) => ({
      ...previous,
      auctionFeeRules: previous.auctionFeeRules.map((row, rowIndex) =>
        rowIndex === index
          ? {
              ...row,
              [key]: value,
            }
          : row
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

  function updateSourceDiscount(
    index: number,
    key: keyof SourceDiscount,
    value: string | number
  ) {
    setDraft((previous) => ({
      ...previous,
      compSettings: {
        ...previous.compSettings,
        sourceDiscounts: previous.compSettings.sourceDiscounts.map(
          (row, rowIndex) =>
            rowIndex === index
              ? {
                  ...row,
                  [key]: value,
                }
              : row
        ),
      },
    }));
    setDirty(true);
  }

  function updateRegionalMarket(
    index: number,
    key: keyof RegionalMarket,
    value: string | number | boolean
  ) {
    setDraft((previous) => ({
      ...previous,
      regionalMarkets: previous.regionalMarkets.map((row, rowIndex) =>
        rowIndex === index
          ? {
              ...row,
              [key]: value,
            }
          : row
      ),
    }));
    setDirty(true);
  }

    function updateVehicleClassificationRule(
      index: number,
      key: keyof VehicleClassificationRule,
      value: string | number | boolean | string[]
    ) {
      setDraft((previous) => ({
        ...previous,
        vehicleClassificationRules: (
          previous.vehicleClassificationRules || []
        ).map((row, rowIndex) =>
          rowIndex === index
            ? {
                ...row,
                [key]: value,
              }
            : row
        ),
      }));
      setDirty(true);
    }

    function addRegionalMarket() {
      setDraft((previous) => ({
        ...previous,
        regionalMarkets: [
          ...previous.regionalMarkets,
          {
            market: "New Region",
            zip: "",
            order: previous.regionalMarkets.length + 1,
            enabled: true,
          },
        ],
      }));
      setDirty(true);
    }

  function resetDraft() {
      setDraft(normalizedAssumptions);
    setDirty(false);
  }

  const defaultCostProfile = draft.costDefaults[0];
  const enabledRegionalMarkets = draft.regionalMarkets
    .filter((market) => market.enabled)
    .sort((a, b) => a.order - b.order);
  const enabledVehicleRules = (draft.vehicleClassificationRules || []).filter(
    (rule) => rule.enabled
  );
  const avoidConditionRules = draft.conditionRules.filter(
    (rule) => rule.avoidFlag
  );
  const highestTargetProfit = draft.costDefaults.reduce(
    (highest, row) => Math.max(highest, row.targetProfit),
    0
  );
  const highestRiskReserve = draft.costDefaults.reduce(
    (highest, row) => Math.max(highest, row.riskReserve),
    0
  );

  return (
    <div className="space-y-6">
      <div className="rounded-2xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900">
        <div className="font-bold">Local editing mode</div>
        <div>
          These fields are editable in the browser now. They do not persist after
          refresh yet. The next database step will save them to Supabase.
        </div>
      </div>

      <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-slate-200 bg-white p-2 shadow-sm">
        <div className="flex flex-1 flex-wrap items-center gap-2">
          {tabGroups.map((group) => {
            const groupIsActive = group.tabs.some((tab) => tab.id === activeTab);
            const hasDropdown = group.tabs.length > 1;
            const menuIsOpen = openMenu === group.label;

            if (!hasDropdown) {
              const tab = group.tabs[0];

              return (
                <button
                  key={group.label}
                  type="button"
                  onClick={() => {
                    setActiveTab(tab.id);
                    setOpenMenu(null);
                  }}
                  className={`rounded-xl px-4 py-2 text-sm font-semibold ${
                    activeTab === tab.id
                      ? "bg-slate-950 text-white"
                      : "text-slate-700 hover:bg-slate-100"
                  }`}
                >
                  {tab.label}
                </button>
              );
            }

            return (
              <div
                key={group.label}
                className="relative"
                onMouseEnter={() => setOpenMenu(group.label)}
                onMouseLeave={() => setOpenMenu(null)}
              >
                <button
                  type="button"
                  onClick={() => setOpenMenu(menuIsOpen ? null : group.label)}
                  className={`flex items-center gap-2 rounded-xl px-4 py-2 text-sm font-semibold ${
                    groupIsActive || menuIsOpen
                      ? "bg-slate-950 text-white"
                      : "text-slate-700 hover:bg-slate-100"
                  }`}
                >
                  {group.label}
                  <span className="text-xs opacity-70">
                    {menuIsOpen ? "▴" : "▾"}
                  </span>
                </button>

                {menuIsOpen && (
                  <div className="absolute left-0 top-full z-50 min-w-64 pt-2">
                    <div className="rounded-2xl border border-slate-200 bg-white p-2 shadow-xl">
                      <div className="px-3 pb-2 pt-2 text-xs leading-5 text-slate-500">
                        {group.description}
                      </div>

                      <div className="space-y-1">
                        {group.tabs.map((tab) => (
                          <button
                            key={tab.id}
                            type="button"
                            onClick={() => {
                              setActiveTab(tab.id);
                              setOpenMenu(null);
                            }}
                            className={`block w-full rounded-xl px-3 py-2 text-left text-sm font-semibold ${
                              activeTab === tab.id
                                ? "bg-slate-950 text-white"
                                : "text-slate-700 hover:bg-slate-100"
                            }`}
                          >
                            {tab.label}
                          </button>
                        ))}
                      </div>
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>

        <div className="flex items-center gap-2">
          {dirty && (
            <span className="rounded-full bg-blue-50 px-3 py-1 text-xs font-bold text-blue-700">
              Unsaved local changes
            </span>
          )}
          <button
            onClick={resetDraft}
            className="rounded-xl border border-slate-200 px-3 py-2 text-sm font-semibold text-slate-700"
          >
            Reset
          </button>
            <button
              type="button"
              onClick={async () => {
                try {
                  setSaveLoading(true);
                  setSaveStatus("");

                  const response = await fetch("/api/assumptions", {
                    method: "POST",
                    headers: {
                      "Content-Type": "application/json",
                    },
                    body: JSON.stringify({ assumptions: draft }),
                  });

                  if (!response.ok) {
                    throw new Error("Failed to save assumptions.");
                  }

                  setDirty(false);
                  setSaveStatus("Saved to Supabase");
                } catch (error) {
                  console.error(error);
                  setSaveStatus("Save failed");
                } finally {
                  setSaveLoading(false);
                }
              }}
              disabled={saveLoading || !dirty}
              className={`rounded-xl px-3 py-2 text-sm font-semibold text-white ${
                saveLoading || !dirty
                  ? "cursor-not-allowed bg-slate-300"
                  : "bg-emerald-700 hover:bg-emerald-800"
              }`}
            >
              {saveLoading ? "Saving..." : "Save Assumptions"}
            </button>
            {saveStatus && (
              <span className="rounded-full bg-slate-100 px-3 py-1 text-xs font-bold text-slate-700">
                {saveStatus}
              </span>
            )}
        </div>
      </div>


      {activeTab === "overview" && (
        <section className="space-y-6">
          <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
            <div className="flex flex-col justify-between gap-4 md:flex-row md:items-start">
              <div>
                <h2 className="text-2xl font-black">Current Valuation Profile</h2>
                <p className="mt-2 max-w-3xl text-sm leading-6 text-slate-600">
                  This is the plain-English summary of the rules currently
                  loaded into the evaluator. Use it as a sanity check before
                  changing individual assumptions.
                </p>
              </div>

              <div className="rounded-xl border border-blue-200 bg-blue-50 px-4 py-3 text-sm font-semibold text-blue-800">
                This overview is explanatory only. It does not change the
                valuation math.
              </div>
            </div>

            <div className="mt-6 grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-4">
              <OverviewMetric
                label="Minimum Target Profit"
                value={money(draft.bidSettings.minimumTargetProfit)}
                helper="The evaluator will not target less than this profit floor, even if a vehicle profile has a lower target."
              />
              <OverviewMetric
                label="Highest Profile Profit"
                value={money(highestTargetProfit)}
                helper="The largest target profit currently assigned to any vehicle cost profile."
              />
              <OverviewMetric
                label="Comp Quality Floor"
                value={`${draft.compSettings.minimumQualityScore} / 100`}
                helper="Market comps below this quality score should not be auto-included unless the search has low confidence."
              />
              <OverviewMetric
                label="Enabled Markets"
                value={String(enabledRegionalMarkets.length)}
                helper="The number of regional MarketCheck search areas currently enabled."
              />
            </div>
          </div>

          <div className="grid grid-cols-1 gap-5 xl:grid-cols-2">
            <ExplanationCard
              title="How the evaluator thinks about a deal"
              description="The valuation engine combines resale target, costs, profit target, risk reserve, and comp quality into bidding guidance."
              bullets={[
                "Retail target comes from market comps or a manually entered final resale target.",
                "All-in cost includes current bid, auction fee, transport, recon, detail/admin, and risk reserves.",
                "Max Smart Bid is the practical ceiling after required profit and risk adjustments.",
                "Safe Bid and Stretch Bid use the discount/premium settings below."
              ]}
            />

            <ExplanationCard
              title="How vehicle profiles are applied"
              description="Vehicle rules decide which cost profile should be applied when the app can identify make, model, trim, body, fuel type, age, or mileage."
              bullets={[
                `${enabledVehicleRules.length} vehicle classification rules are currently enabled.`,
                defaultCostProfile
                  ? `The first/default cost profile is ${defaultCostProfile.vehicleType}.`
                  : "No default cost profile is currently available.",
                `The highest default risk reserve is ${money(highestRiskReserve)}.`,
                "If no vehicle rule matches, the evaluator falls back to the first cost profile."
              ]}
            />

            <ExplanationCard
              title="How risk affects the answer"
              description="Risk rules add points and reserve dollars based on the condition checklist."
              bullets={[
                `Medium risk starts at ${draft.bidSettings.mediumRiskThreshold} points.`,
                `High risk starts at ${draft.bidSettings.highRiskThreshold} points.`,
                `Avoid starts at ${draft.bidSettings.avoidRiskThreshold} points or an avoid-flag condition.`,
                `${avoidConditionRules.length} condition rules currently carry an avoid flag.`
              ]}
            />

            <ExplanationCard
              title="How comps are controlled"
              description="Comp settings decide which comparable vehicles are trusted and how source reliability affects valuation."
              bullets={[
                `Minimum comp quality score is ${draft.compSettings.minimumQualityScore}.`,
                `${draft.compSettings.sourceDiscounts.length} source-discount rules are configured.`,
                "Higher quality-score requirements produce cleaner but fewer comps.",
                "Lower quality-score requirements produce more comps but may weaken valuation confidence."
              ]}
            />
          </div>

          <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
            <h3 className="text-xl font-bold">Plain-English Rule Summary</h3>
            <p className="mt-1 text-sm text-slate-500">
              These are the main rules operators should understand before
              trusting or changing the evaluator.
            </p>

            <div className="mt-5 text-sm">
              <PlainRuleRow
                label="Safe Bid Discount"
                value={`${(draft.bidSettings.safeBidDiscount * 100).toFixed(1)}%`}
                explanation="Safe Bid is pulled below Max Smart Bid by this percentage to create a more conservative buy number."
              />
              <PlainRuleRow
                label="Stretch Bid Premium"
                value={`${(draft.bidSettings.stretchBidPremium * 100).toFixed(1)}%`}
                explanation="Stretch Bid allows a controlled amount above Max Smart Bid when the deal still may be worth chasing."
              />
              <PlainRuleRow
                label="High-Risk Profit Add"
                value={money(draft.bidSettings.highRiskProfitAdd)}
                explanation="Extra required profit added when a vehicle lands in the high-risk range."
              />
              <PlainRuleRow
                label="Regional Search Order"
                value={
                  enabledRegionalMarkets.length
                    ? enabledRegionalMarkets
                        .map((market) => market.market)
                        .join(" → ")
                    : "No enabled regions"
                }
                explanation="MarketCheck searches should follow this regional order when live comps are pulled."
              />
            </div>
          </div>
        </section>
      )}

      {activeTab === "bid" && (
        <section className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
          <h2 className="text-xl font-bold">Bid Settings</h2>
          <p className="mt-1 text-sm text-slate-500">
            Controls Safe Bid, Stretch Bid, profit targets, and risk thresholds.
          </p>

          <div className="mt-6 grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
            <div>
              <FieldLabelWithHelp
                label="Safe Bid Discount"
                description="Pulls Safe Bid below Max Smart Bid to create a conservative buy number."
                suggestedRange="3%–10%"
                usedIn="Safe Bid calculation"
              />
              <NumberInput
                value={draft.bidSettings.safeBidDiscount * 100}
                onChange={(value) => updateBid("safeBidDiscount", value / 100)}
                suffix="%"
                step={0.1}
              />
            </div>

            <div>
              <FieldLabelWithHelp
                label="Stretch Bid Premium"
                description="Allows a controlled amount above Max Smart Bid when the car is worth chasing."
                suggestedRange="2%–8%"
                usedIn="Stretch Bid calculation"
              />
              <NumberInput
                value={draft.bidSettings.stretchBidPremium * 100}
                onChange={(value) => updateBid("stretchBidPremium", value / 100)}
                suffix="%"
                step={0.1}
              />
            </div>

            <div>
              <FieldLabelWithHelp
                label="Minimum Target Profit"
                description="Sets the minimum gross profit the evaluator should require before a deal can look attractive."
                suggestedRange="$2,000–$6,000 depending on vehicle type"
                usedIn="Target profit and Max Smart Bid"
              />
              <NumberInput
                value={draft.bidSettings.minimumTargetProfit}
                onChange={(value) => updateBid("minimumTargetProfit", value)}
                prefix="$"
              />
            </div>

            <div>
              <FieldLabelWithHelp
                label="High Risk Profit Add"
                description="Adds extra required profit when the vehicle lands in the high-risk range."
                suggestedRange="$1,000–$5,000"
                usedIn="High-risk bid adjustment"
              />
              <NumberInput
                value={draft.bidSettings.highRiskProfitAdd}
                onChange={(value) => updateBid("highRiskProfitAdd", value)}
                prefix="$"
              />
            </div>

            <div>
              <FieldLabelWithHelp
                label="Medium Risk Threshold"
                description="Risk score where the evaluator begins treating a vehicle as medium risk."
                suggestedRange="3–6 risk points"
                usedIn="Risk grade assignment"
              />
              <NumberInput
                value={draft.bidSettings.mediumRiskThreshold}
                onChange={(value) => updateBid("mediumRiskThreshold", value)}
              />
            </div>

            <div>
              <FieldLabelWithHelp
                label="High Risk Threshold"
                description="Risk score where the evaluator begins treating a vehicle as high risk and may require additional profit."
                suggestedRange="7–10 risk points"
                usedIn="Risk grade and high-risk profit add"
              />
              <NumberInput
                value={draft.bidSettings.highRiskThreshold}
                onChange={(value) => updateBid("highRiskThreshold", value)}
              />
            </div>

            <div>
              <FieldLabelWithHelp
                label="Avoid Risk Threshold"
                description="Risk score where the evaluator should strongly recommend avoiding the vehicle unless manually overridden."
                suggestedRange="10–15 risk points"
                usedIn="Avoid / Pass logic"
              />
              <NumberInput
                value={draft.bidSettings.avoidRiskThreshold}
                onChange={(value) => updateBid("avoidRiskThreshold", value)}
              />
            </div>
          </div>
        </section>
      )}

      {activeTab === "costs" && (
        <section className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
          <h2 className="text-xl font-bold">Cost Defaults</h2>
          <p className="mt-1 text-sm text-slate-500">
            Default costs by vehicle type.
          </p>

          <div className="mt-6 overflow-auto rounded-xl border border-slate-200">
            <table className="w-full min-w-[960px] text-left text-sm">
              <thead className="bg-slate-50 text-xs uppercase text-slate-500">
                <tr>
                  <th className="px-3 py-3">
                    <TableHeaderWithHelp
                      label="Vehicle Type"
                      description="The cost profile name applied to a vehicle after classification rules run."
                      suggestedRange="Use clear labels like Standard, Performance, Exotic, Truck/SUV, Motorcycle"
                      usedIn="Vehicle classification and default cost selection"
                    />
                  </th>
                  <th className="px-3 py-3">
                    <TableHeaderWithHelp
                      label="Auction Fee"
                      description="Default buyer fee estimate used when a specific auction fee tier is unavailable or not yet selected."
                      suggestedRange="$300–$1,500 depending on source and vehicle value"
                      usedIn="All-in cost and Max Smart Bid"
                    />
                  </th>
                  <th className="px-3 py-3">
                    <TableHeaderWithHelp
                      label="Transport"
                      description="Default amount reserved to get the vehicle from auction/seller location to your shop or sales location."
                      suggestedRange="$250–$1,500 depending on distance and vehicle type"
                      usedIn="All-in cost and purchase feasibility"
                    />
                  </th>
                  <th className="px-3 py-3">
                    <TableHeaderWithHelp
                      label="Recon"
                      description="Default mechanical or cosmetic reconditioning budget before the vehicle is ready to retail."
                      suggestedRange="$500–$5,000 depending on age, condition, and segment"
                      usedIn="All-in cost, risk reserve, and gross profit"
                    />
                  </th>
                  <th className="px-3 py-3">
                    <TableHeaderWithHelp
                      label="Detail/Admin"
                      description="Default allowance for detail, photos, admin, paperwork, listing prep, and small operating costs."
                      suggestedRange="$150–$750"
                      usedIn="All-in cost"
                    />
                  </th>
                  <th className="px-3 py-3">
                    <TableHeaderWithHelp
                      label="Risk Reserve"
                      description="Default reserve for unknowns, surprises, and condition uncertainty before final inspection."
                      suggestedRange="$500–$3,500 depending on complexity and downside risk"
                      usedIn="All-in cost and risk-adjusted bidding"
                    />
                  </th>
                  <th className="px-3 py-3">
                    <TableHeaderWithHelp
                      label="Target Profit"
                      description="Gross profit target for this vehicle profile before the evaluator recommends a smart maximum bid."
                      suggestedRange="$2,000–$10,000+ depending on vehicle segment"
                      usedIn="Max Smart Bid, Safe Bid, and decision output"
                    />
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {draft.costDefaults.map((row, index) => (
                  <tr key={index}>
                    <td className="px-3 py-3">
                      <TextInput
                        value={row.vehicleType}
                        onChange={(value) =>
                          updateCost(index, "vehicleType", value)
                        }
                      />
                    </td>
                    <td className="px-3 py-3">
                      <NumberInput
                        value={row.auctionFee}
                        onChange={(value) =>
                          updateCost(index, "auctionFee", value)
                        }
                        prefix="$"
                      />
                    </td>
                    <td className="px-3 py-3">
                      <NumberInput
                        value={row.transport}
                        onChange={(value) =>
                          updateCost(index, "transport", value)
                        }
                        prefix="$"
                      />
                    </td>
                    <td className="px-3 py-3">
                      <NumberInput
                        value={row.recon}
                        onChange={(value) => updateCost(index, "recon", value)}
                        prefix="$"
                      />
                    </td>
                    <td className="px-3 py-3">
                      <NumberInput
                        value={row.detailAdmin}
                        onChange={(value) =>
                          updateCost(index, "detailAdmin", value)
                        }
                        prefix="$"
                      />
                    </td>
                    <td className="px-3 py-3">
                      <NumberInput
                        value={row.riskReserve}
                        onChange={(value) =>
                          updateCost(index, "riskReserve", value)
                        }
                        prefix="$"
                      />
                    </td>
                    <td className="px-3 py-3">
                      <NumberInput
                        value={row.targetProfit}
                        onChange={(value) =>
                          updateCost(index, "targetProfit", value)
                        }
                        prefix="$"
                      />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      )}

      {activeTab === "risk" && (
        <section className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
          <h2 className="text-xl font-bold">Risk Rules</h2>
          <p className="mt-1 text-sm text-slate-500">
            Condition checklist risk points and reserve adds.
          </p>

          <div className="mt-6 overflow-auto rounded-xl border border-slate-200">
            <table className="w-full min-w-[860px] text-left text-sm">
              <thead className="bg-slate-50 text-xs uppercase text-slate-500">
                <tr>
                  <th className="px-3 py-3">
                    <TableHeaderWithHelp
                      label="Category"
                      description="Groups related risk rules together, such as title, mechanical, cosmetic, tires, warning lights, or structural concerns."
                      suggestedRange="Use clear operating categories"
                      usedIn="Condition checklist organization"
                    />
                  </th>
                  <th className="px-3 py-3">
                    <TableHeaderWithHelp
                      label="Condition"
                      description="The specific condition, disclosure, or issue that can be selected during evaluation."
                      suggestedRange="Use short, clear labels operators can recognize quickly"
                      usedIn="Condition checklist and risk scoring"
                    />
                  </th>
                  <th className="px-3 py-3">
                    <TableHeaderWithHelp
                      label="Risk Points"
                      description="Adds risk score when this condition is present. Higher points push the vehicle toward Medium, High, or Avoid risk."
                      suggestedRange="1–3 minor, 4–7 meaningful, 8+ severe"
                      usedIn="Risk grade assignment"
                    />
                  </th>
                  <th className="px-3 py-3">
                    <TableHeaderWithHelp
                      label="Reserve Add"
                      description="Adds extra dollars to the risk reserve when this issue is present, protecting margin against unknown repair or resale risk."
                      suggestedRange="$0–$5,000+ depending on severity"
                      usedIn="All-in cost and Max Smart Bid"
                    />
                  </th>
                  <th className="px-3 py-3">
                    <TableHeaderWithHelp
                      label="Avoid"
                      description="Marks this issue as serious enough to recommend avoiding the vehicle, regardless of total risk score."
                      suggestedRange="Use only for hard-stop issues"
                      usedIn="Avoid / Pass decision logic"
                    />
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {draft.conditionRules.map((row, index) => (
                  <tr key={index}>
                    <td className="px-3 py-3">
                      <TextInput
                        value={row.category}
                        onChange={(value) =>
                          updateCondition(index, "category", value)
                        }
                      />
                    </td>
                    <td className="px-3 py-3">
                      <TextInput
                        value={row.name}
                        onChange={(value) =>
                          updateCondition(index, "name", value)
                        }
                      />
                    </td>
                    <td className="px-3 py-3">
                      <NumberInput
                        value={row.riskPoints}
                        onChange={(value) =>
                          updateCondition(index, "riskPoints", value)
                        }
                      />
                    </td>
                    <td className="px-3 py-3">
                      <NumberInput
                        value={row.reserveAdd}
                        onChange={(value) =>
                          updateCondition(index, "reserveAdd", value)
                        }
                        prefix="$"
                      />
                    </td>
                    <td className="px-3 py-3">
                      <input
                        type="checkbox"
                        checked={row.avoidFlag}
                        onChange={(event) =>
                          updateCondition(
                            index,
                            "avoidFlag",
                            event.target.checked
                          )
                        }
                      />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      )}

      {activeTab === "auctionFees" && (
        <section className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
          <h2 className="text-xl font-bold">Auction Fees</h2>
          <p className="mt-1 text-sm text-slate-500">
            Editable auction fee tiers.
          </p>

          <div className="mt-6 overflow-auto rounded-xl border border-slate-200">
            <table className="w-full min-w-[720px] text-left text-sm">
              <thead className="bg-slate-50 text-xs uppercase text-slate-500">
                <tr>
                  <th className="px-3 py-3">
                    <TableHeaderWithHelp
                      label="Auction Site"
                      description="The auction source or marketplace this fee tier applies to."
                      suggestedRange="Use exact source names like ACV Auctions, Manheim, Cars & Bids, Bring a Trailer, Facebook, or Private Party"
                      usedIn="Auction fee lookup and all-in cost"
                    />
                  </th>
                  <th className="px-3 py-3">
                    <TableHeaderWithHelp
                      label="Min Bid"
                      description="The lowest current bid or hammer price where this fee tier begins."
                      suggestedRange="Set non-overlapping tiers starting at $0"
                      usedIn="Auction fee tier matching"
                    />
                  </th>
                  <th className="px-3 py-3">
                    <TableHeaderWithHelp
                      label="Max Bid"
                      description="The highest current bid or hammer price covered by this fee tier."
                      suggestedRange="Set non-overlapping tiers that cover the full expected bid range"
                      usedIn="Auction fee tier matching"
                    />
                  </th>
                  <th className="px-3 py-3">
                    <TableHeaderWithHelp
                      label="Fee"
                      description="The estimated buyer fee added to the vehicle cost when this tier matches."
                      suggestedRange="Use the latest buyer fee schedule from each auction source"
                      usedIn="All-in cost, gross profit, and Max Smart Bid"
                    />
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {draft.auctionFeeRules.map((row, index) => (
                  <tr key={index}>
                    <td className="px-3 py-3">
                      <TextInput
                        value={row.auctionSite}
                        onChange={(value) =>
                          updateAuctionFee(index, "auctionSite", value)
                        }
                      />
                    </td>
                    <td className="px-3 py-3">
                      <NumberInput
                        value={row.minBid}
                        onChange={(value) =>
                          updateAuctionFee(index, "minBid", value)
                        }
                        prefix="$"
                      />
                    </td>
                    <td className="px-3 py-3">
                      <NumberInput
                        value={row.maxBid}
                        onChange={(value) =>
                          updateAuctionFee(index, "maxBid", value)
                        }
                        prefix="$"
                      />
                    </td>
                    <td className="px-3 py-3">
                      <NumberInput
                        value={row.fee}
                        onChange={(value) =>
                          updateAuctionFee(index, "fee", value)
                        }
                        prefix="$"
                      />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      )}

      {activeTab === "comps" && (
        <section className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
          <h2 className="text-xl font-bold">Comp Settings</h2>
          <p className="mt-1 text-sm text-slate-500">
            Settings for converting asking comps into a resale target.
          </p>

          <div className="mt-6 grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
            <div>
              <FieldLabelWithHelp
                label="Mileage Adjustment / 1k Miles"
                description="Adjusts comparable vehicle pricing based on mileage difference. If a comp has meaningfully more or fewer miles than the target vehicle, this setting helps normalize the comp value."
                suggestedRange="$75–$250 per 1,000 miles depending on segment"
                usedIn="Market comp adjustment and resale target"
              />
              <NumberInput
                value={draft.compSettings.mileageAdjustmentPerThousand}
                onChange={(value) =>
                  updateCompSetting("mileageAdjustmentPerThousand", value)
                }
                prefix="$"
              />
            </div>

            <div>
              <FieldLabelWithHelp
                label="Fast Sale Discount"
                description="Reduces the comp-derived resale target to estimate a faster, more conservative exit price instead of assuming full retail ask."
                suggestedRange="3%–12%"
                usedIn="Fast sale target and conservative valuation"
              />
              <NumberInput
                value={draft.compSettings.fastSaleDiscount * 100}
                onChange={(value) =>
                  updateCompSetting("fastSaleDiscount", value / 100)
                }
                suffix="%"
                step={0.1}
              />
            </div>

            <div>
              <FieldLabelWithHelp
                label="Minimum Quality Score"
                description="Sets the minimum comp quality score required before a comp can be automatically trusted. Higher scores mean cleaner comps but fewer included vehicles."
                suggestedRange="50–70 out of 100"
                usedIn="Automatic comp inclusion and confidence"
              />
              <NumberInput
                value={draft.compSettings.minimumQualityScore}
                onChange={(value) =>
                  updateCompSetting("minimumQualityScore", value)
                }
              />
            </div>

            <div>
              <FieldLabelWithHelp
                label="Minimum Medium Confidence Comps"
                description="The number of usable comps needed before the evaluator can treat the comp set as medium confidence."
                suggestedRange="3–5 comps"
                usedIn="Market confidence grade"
              />
              <NumberInput
                value={draft.compSettings.minimumCompsForMediumConfidence}
                onChange={(value) =>
                  updateCompSetting("minimumCompsForMediumConfidence", value)
                }
              />
            </div>

            <div>
              <FieldLabelWithHelp
                label="Minimum High Confidence Comps"
                description="The number of usable comps needed before the evaluator can treat the comp set as high confidence, assuming the spread is also tight enough."
                suggestedRange="5–8 comps"
                usedIn="Market confidence grade"
              />
              <NumberInput
                value={draft.compSettings.minimumCompsForHighConfidence}
                onChange={(value) =>
                  updateCompSetting("minimumCompsForHighConfidence", value)
                }
              />
            </div>

            <div>
              <FieldLabelWithHelp
                label="Max Spread for High Confidence"
                description="Limits how far apart the selected comps can be while still earning a high-confidence grade. A wide spread means the market is less certain."
                suggestedRange="10%–20%"
                usedIn="High-confidence comp validation"
              />
              <NumberInput
                value={draft.compSettings.maxSpreadForHighConfidence * 100}
                onChange={(value) =>
                  updateCompSetting("maxSpreadForHighConfidence", value / 100)
                }
                suffix="%"
                step={0.1}
              />
            </div>
          </div>

          <div className="mt-6 overflow-hidden rounded-xl border border-slate-200">
            <table className="w-full text-left text-sm">
              <thead className="bg-slate-50 text-xs uppercase text-slate-500">
                <tr>
                  <th className="px-3 py-3">Source</th>
                  <th className="px-3 py-3">Ask Discount</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {draft.compSettings.sourceDiscounts.map((row, index) => (
                  <tr key={index}>
                    <td className="px-3 py-3">
                      <TextInput
                        value={row.source}
                        onChange={(value) =>
                          updateSourceDiscount(index, "source", value)
                        }
                      />
                    </td>
                    <td className="px-3 py-3">
                      <NumberInput
                        value={row.askDiscount * 100}
                        onChange={(value) =>
                          updateSourceDiscount(index, "askDiscount", value / 100)
                        }
                        suffix="%"
                        step={0.1}
                      />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      )}

      {activeTab === "vehicleRules" && (
        <section className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
          <h2 className="text-xl font-bold">Vehicle Classification Rules</h2>
          <p className="mt-1 text-sm text-slate-500">
            Match decoded vehicle details to a default cost profile. Highest priority matching rule wins.
          </p>

          <div className="mt-6 overflow-x-auto rounded-xl border border-slate-200">
            <table className="min-w-[1100px] w-full text-left text-sm">
              <thead className="bg-slate-50 text-xs uppercase text-slate-500">
                <tr>
                  <th className="px-3 py-3">
                    <TableHeaderWithHelp
                      label="Enabled"
                      description="Controls whether this vehicle classification rule is active. Disabled rules stay saved but are ignored by the evaluator."
                      suggestedRange="Keep only current, trusted rules enabled"
                      usedIn="Vehicle classification and cost profile selection"
                    />
                  </th>
                  <th className="px-3 py-3">
                    <TableHeaderWithHelp
                      label="Rule Name"
                      description="A human-readable name for the classification rule so operators understand why a vehicle matched a cost profile."
                      suggestedRange="Use names like German Luxury, Truck/SUV, Exotic, Motorcycle, High-Mileage"
                      usedIn="Rule management and auditability"
                    />
                  </th>
                  <th className="px-3 py-3">
                    <TableHeaderWithHelp
                      label="Match Type"
                      description="The vehicle field this rule checks, such as make, model, trim, body, fuel type, or age/mileage."
                      suggestedRange="Use the narrowest field that reliably identifies the vehicle group"
                      usedIn="Automatic cost profile matching"
                    />
                  </th>
                  <th className="px-3 py-3">
                    <TableHeaderWithHelp
                      label="Match Values"
                      description="Comma-separated values that trigger this rule. For example, BMW, Mercedes-Benz, Porsche, Truck, SUV, Hybrid, or mileage thresholds depending on match type."
                      suggestedRange="Use exact, predictable terms and avoid overly broad values"
                      usedIn="Automatic rule matching"
                    />
                  </th>
                  <th className="px-3 py-3">
                    <TableHeaderWithHelp
                      label="Cost Profile"
                      description="The default cost profile assigned when this rule matches. This controls default auction fee, transport, recon, reserve, and target profit."
                      suggestedRange="Choose the profile that best matches the vehicle's expected cost/risk structure"
                      usedIn="Cost Defaults, all-in cost, and Max Smart Bid"
                    />
                  </th>
                  <th className="px-3 py-3">
                    <TableHeaderWithHelp
                      label="Priority"
                      description="Controls which matching rule wins when more than one rule applies. Higher-priority rules should be more specific."
                      suggestedRange="Use lower numbers for general rules and higher priority for specific exceptions"
                      usedIn="Vehicle classification conflict resolution"
                    />
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {(draft.vehicleClassificationRules || []).map((row, index) => (
                  <tr key={index}>
                    <td className="px-3 py-3">
                      <input
                        type="checkbox"
                        checked={row.enabled}
                        onChange={(event) =>
                          updateVehicleClassificationRule(
                            index,
                            "enabled",
                            event.target.checked
                          )
                        }
                      />
                    </td>
                    <td className="px-3 py-3">
                      <TextInput
                        value={row.name}
                        onChange={(value) =>
                          updateVehicleClassificationRule(index, "name", value)
                        }
                      />
                    </td>
                    <td className="px-3 py-3">
                      <select
                        value={row.matchType}
                        onChange={(event) =>
                          updateVehicleClassificationRule(
                            index,
                            "matchType",
                            event.target.value as VehicleClassificationRule["matchType"]
                          )
                        }
                        className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm font-medium text-slate-900 shadow-sm"
                      >
                        <option value="make">Make</option>
                        <option value="model">Model</option>
                        <option value="trim">Trim</option>
                        <option value="body">Body</option>
                        <option value="fuel">Fuel</option>
                        <option value="ageMileage">Age / Mileage</option>
                      </select>
                    </td>
                    <td className="px-3 py-3">
                      <TextInput
                        value={row.matchValues.join(", ")}
                        onChange={(value) =>
                          updateVehicleClassificationRule(
                            index,
                            "matchValues",
                            value
                              .split(",")
                              .map((item) => item.trim())
                              .filter(Boolean)
                          )
                        }
                      />
                    </td>
                    <td className="px-3 py-3">
                      <select
                        value={row.costProfile}
                        onChange={(event) =>
                          updateVehicleClassificationRule(
                            index,
                            "costProfile",
                            event.target.value
                          )
                        }
                        className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm font-medium text-slate-900 shadow-sm"
                      >
                        {draft.costDefaults.map((costDefault) => (
                          <option
                            key={costDefault.vehicleType}
                            value={costDefault.vehicleType}
                          >
                            {costDefault.vehicleType}
                          </option>
                        ))}
                      </select>
                    </td>
                    <td className="px-3 py-3">
                      <NumberInput
                        value={row.priority}
                        onChange={(value) =>
                          updateVehicleClassificationRule(
                            index,
                            "priority",
                            value
                          )
                        }
                      />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      )}


      {activeTab === "taxonomy" && (
        <section className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
          <div className="flex flex-col justify-between gap-4 md:flex-row md:items-start">
            <div>
              <h2 className="text-xl font-bold">Model Taxonomy</h2>
              <p className="mt-1 max-w-3xl text-sm leading-6 text-slate-500">
                These rules document cases where a data provider may group a
                true performance model under a broader model family. The broader
                model should only be used as a candidate retrieval pool. Returned
                listings still need to pass strict include/reject filters before
                they can be trusted as comps.
              </p>
            </div>

            <div className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm font-semibold text-amber-800">
              View-only for now. Editing should come after audit history and
              role permissions.
            </div>
          </div>

          <div className="mt-6 overflow-x-auto rounded-xl border border-slate-200">
            <table className="min-w-[1200px] w-full text-left text-sm">
              <thead className="bg-slate-50 text-xs uppercase text-slate-500">
                <tr>
                  <th className="px-3 py-3">Make</th>
                  <th className="px-3 py-3">User Model</th>
                  <th className="px-3 py-3">Fallback Search</th>
                  <th className="px-3 py-3">Must Include</th>
                  <th className="px-3 py-3">Reject If Includes</th>
                  <th className="px-3 py-3">Notes</th>
                </tr>
              </thead>

              <tbody className="divide-y divide-slate-100">
                {modelTaxonomyFallbacks.map((fallback) => (
                  <tr key={fallback.id} className="align-top">
                    <td className="px-3 py-3 font-semibold text-slate-800">
                      {fallback.make}
                    </td>

                    <td className="px-3 py-3">
                      <div className="flex flex-wrap gap-1">
                        {fallback.requestedModels.map((model) => (
                          <span
                            key={model}
                            className="rounded-full bg-slate-100 px-2 py-1 text-xs font-bold text-slate-700"
                          >
                            {model}
                          </span>
                        ))}
                      </div>
                    </td>

                    <td className="px-3 py-3">
                      <div className="font-semibold text-blue-700">
                        {fallback.fallbackModel}
                      </div>
                      <div className="mt-1 text-xs leading-5 text-slate-500">
                        {fallback.fallbackLabel}
                      </div>
                    </td>

                    <td className="px-3 py-3">
                      <div className="flex flex-wrap gap-1">
                        {fallback.mustInclude.map((term) => (
                          <span
                            key={term}
                            className="rounded-full bg-emerald-50 px-2 py-1 text-xs font-bold text-emerald-700"
                          >
                            {term}
                          </span>
                        ))}
                      </div>
                    </td>

                    <td className="px-3 py-3">
                      <div className="flex flex-wrap gap-1">
                        {fallback.rejectIfIncludes.map((term) => (
                          <span
                            key={term}
                            className="rounded-full bg-red-50 px-2 py-1 text-xs font-bold text-red-700"
                          >
                            {term}
                          </span>
                        ))}
                      </div>
                    </td>

                    <td className="px-3 py-3 leading-6 text-slate-600">
                      {fallback.notes}
cd /workspaces/mmav

echo "----- types/comps.ts -----"
sed -n '1,220p' types/comps.ts

echo "----- marketcheck normalize area -----"
sed -n '180,290p' app/api/marketcheck/search/route.ts

echo "----- comps summary lib -----"
sed -n '1,160p' lib/comps.ts

echo "----- market comps table -----"
sed -n '1,240p' components/comps/market-comps-table.tsx

echo "----- market comps UI section -----"
sed -n '1620,1910p' components/evaluation/evaluation-workspace.tsx                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      )}

      {activeTab === "regional" && (
        <section className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
          <h2 className="text-xl font-bold">Regional Search</h2>
          <div className="mt-1 flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
            <p className="text-sm text-slate-500">
              MarketCheck regional ZIPs for ordered comp expansion.
            </p>
            <button
              type="button"
              onClick={addRegionalMarket}
              className="rounded-xl bg-slate-900 px-4 py-2 text-sm font-bold text-white shadow-sm transition hover:bg-slate-700"
            >
              Add Region
            </button>
          </div>

          <div className="mt-6 overflow-hidden rounded-xl border border-slate-200">
            <table className="w-full text-left text-sm">
              <thead className="bg-slate-50 text-xs uppercase text-slate-500">
                <tr>
                  <th className="px-3 py-3">
                    <TableHeaderWithHelp
                      label="Market"
                      description="The plain-English name of the region being searched."
                      suggestedRange="Use recognizable market names like Charleston, Columbia, Charlotte, Atlanta, Savannah"
                      usedIn="Search log, region order, and operator review"
                    />
                  </th>
                  <th className="px-3 py-3">ZIP</th>
                  <th className="px-3 py-3">
                    <TableHeaderWithHelp
                      label="Enabled"
                      description="Controls whether this regional market is included when pulling MarketCheck comps."
                      suggestedRange="Enable only the regions you actually want searched"
                      usedIn="MarketCheck comp search"
                    />
                  </th>
                  <th className="w-20 px-3 py-3 text-center">Order</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {draft.regionalMarkets.map((row, index) => (
                  <tr key={index}>
                    <td className="px-3 py-3">
                      <TextInput
                        value={row.market}
                        onChange={(value) =>
                          updateRegionalMarket(index, "market", value)
                        }
                      />
                    </td>
                    <td className="px-3 py-3">
                      <TextInput
                        value={row.zip}
                        onChange={(value) =>
                          updateRegionalMarket(index, "zip", value)
                        }
                      />
                    </td>
                    <td className="px-3 py-3">
                      <input
                        type="checkbox"
                        checked={row.enabled}
                        onChange={(event) =>
                          updateRegionalMarket(
                            index,
                            "enabled",
                            event.target.checked
                          )
                        }
                      />
                    </td>
                    <td className="w-20 px-3 py-3">
                      <div className="mx-auto w-16">
                        <NumberInput
                          value={row.order}
                          onChange={(value) =>
                            updateRegionalMarket(index, "order", value)
                          }
                        />
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      )}
    </div>
  );
}
