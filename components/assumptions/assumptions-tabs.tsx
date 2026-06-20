"use client";

import { useState } from "react";
import { defaultAssumptions } from "@/lib/assumptions";
import type {
  Assumptions,
  AuctionFeeRule,
  BidSettings,
  CompSettings,
  ConditionRule,
  CostDefault,
  RegionalMarket,
  SourceDiscount,
} from "@/types/assumptions";

type Tab =
  | "bid"
  | "costs"
  | "risk"
  | "auctionFees"
  | "comps"
    | "vehicleRules"
  | "regional";

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
    async function saveAssumptions() {
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
    }

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
    };

  const [activeTab, setActiveTab] = useState<Tab>("bid");
    const [draft, setDraft] = useState<Assumptions>(normalizedAssumptions);
  const [dirty, setDirty] = useState(false);
    const [saveLoading, setSaveLoading] = useState(false);
    const [saveStatus, setSaveStatus] = useState("");

  const tabs: { id: Tab; label: string }[] = [
    { id: "bid", label: "Bid Settings" },
    { id: "costs", label: "Cost Defaults" },
    { id: "risk", label: "Risk Rules" },
    { id: "auctionFees", label: "Auction Fees" },
    { id: "comps", label: "Comp Settings" },
      { id: "vehicleRules", label: "Vehicle Rules" },
    { id: "regional", label: "Regional Search" },
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
    value: string | boolean
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

  function resetDraft() {
      setDraft(normalizedAssumptions);
    setDirty(false);
  }

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
        <div className="flex flex-wrap gap-2">
          {tabs.map((tab) => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={`rounded-xl px-4 py-2 text-sm font-semibold ${
                activeTab === tab.id
                  ? "bg-slate-950 text-white"
                  : "text-slate-600 hover:bg-slate-100"
              }`}
            >
              {tab.label}
            </button>
          ))}
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

      {activeTab === "bid" && (
        <section className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
          <h2 className="text-xl font-bold">Bid Settings</h2>
          <p className="mt-1 text-sm text-slate-500">
            Controls Safe Bid, Stretch Bid, profit targets, and risk thresholds.
          </p>

          <div className="mt-6 grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
            <div>
              <label className="text-sm font-semibold text-slate-600">
                Safe Bid Discount
              </label>
              <NumberInput
                value={draft.bidSettings.safeBidDiscount * 100}
                onChange={(value) => updateBid("safeBidDiscount", value / 100)}
                suffix="%"
                step={0.1}
              />
            </div>

            <div>
              <label className="text-sm font-semibold text-slate-600">
                Stretch Bid Premium
              </label>
              <NumberInput
                value={draft.bidSettings.stretchBidPremium * 100}
                onChange={(value) => updateBid("stretchBidPremium", value / 100)}
                suffix="%"
                step={0.1}
              />
            </div>

            <div>
              <label className="text-sm font-semibold text-slate-600">
                Minimum Target Profit
              </label>
              <NumberInput
                value={draft.bidSettings.minimumTargetProfit}
                onChange={(value) => updateBid("minimumTargetProfit", value)}
                prefix="$"
              />
            </div>

            <div>
              <label className="text-sm font-semibold text-slate-600">
                High Risk Profit Add
              </label>
              <NumberInput
                value={draft.bidSettings.highRiskProfitAdd}
                onChange={(value) => updateBid("highRiskProfitAdd", value)}
                prefix="$"
              />
            </div>

            <div>
              <label className="text-sm font-semibold text-slate-600">
                Medium Risk Threshold
              </label>
              <NumberInput
                value={draft.bidSettings.mediumRiskThreshold}
                onChange={(value) => updateBid("mediumRiskThreshold", value)}
              />
            </div>

            <div>
              <label className="text-sm font-semibold text-slate-600">
                High Risk Threshold
              </label>
              <NumberInput
                value={draft.bidSettings.highRiskThreshold}
                onChange={(value) => updateBid("highRiskThreshold", value)}
              />
            </div>

            <div>
              <label className="text-sm font-semibold text-slate-600">
                Avoid Risk Threshold
              </label>
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
                  <th className="px-3 py-3">Vehicle Type</th>
                  <th className="px-3 py-3">Auction Fee</th>
                  <th className="px-3 py-3">Transport</th>
                  <th className="px-3 py-3">Recon</th>
                  <th className="px-3 py-3">Detail/Admin</th>
                  <th className="px-3 py-3">Risk Reserve</th>
                  <th className="px-3 py-3">Target Profit</th>
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
                  <th className="px-3 py-3">Category</th>
                  <th className="px-3 py-3">Condition</th>
                  <th className="px-3 py-3">Risk Points</th>
                  <th className="px-3 py-3">Reserve Add</th>
                  <th className="px-3 py-3">Avoid</th>
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
                  <th className="px-3 py-3">Auction Site</th>
                  <th className="px-3 py-3">Min Bid</th>
                  <th className="px-3 py-3">Max Bid</th>
                  <th className="px-3 py-3">Fee</th>
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
              <label className="text-sm font-semibold text-slate-600">
                Mileage Adjustment / 1k Miles
              </label>
              <NumberInput
                value={draft.compSettings.mileageAdjustmentPerThousand}
                onChange={(value) =>
                  updateCompSetting("mileageAdjustmentPerThousand", value)
                }
                prefix="$"
              />
            </div>

            <div>
              <label className="text-sm font-semibold text-slate-600">
                Fast Sale Discount
              </label>
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
              <label className="text-sm font-semibold text-slate-600">
                Minimum Quality Score
              </label>
              <NumberInput
                value={draft.compSettings.minimumQualityScore}
                onChange={(value) =>
                  updateCompSetting("minimumQualityScore", value)
                }
              />
            </div>

            <div>
              <label className="text-sm font-semibold text-slate-600">
                Minimum Medium Confidence Comps
              </label>
              <NumberInput
                value={draft.compSettings.minimumCompsForMediumConfidence}
                onChange={(value) =>
                  updateCompSetting("minimumCompsForMediumConfidence", value)
                }
              />
            </div>

            <div>
              <label className="text-sm font-semibold text-slate-600">
                Minimum High Confidence Comps
              </label>
              <NumberInput
                value={draft.compSettings.minimumCompsForHighConfidence}
                onChange={(value) =>
                  updateCompSetting("minimumCompsForHighConfidence", value)
                }
              />
            </div>

            <div>
              <label className="text-sm font-semibold text-slate-600">
                Max Spread for High Confidence
              </label>
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
                  <th className="px-3 py-3">Enabled</th>
                  <th className="px-3 py-3">Rule Name</th>
                  <th className="px-3 py-3">Match Type</th>
                  <th className="px-3 py-3">Match Values</th>
                  <th className="px-3 py-3">Cost Profile</th>
                  <th className="px-3 py-3">Priority</th>
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

      {activeTab === "regional" && (
        <section className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
          <h2 className="text-xl font-bold">Regional Search</h2>
          <p className="mt-1 text-sm text-slate-500">
            MarketCheck regional ZIPs for 100-mile searches.
          </p>

          <div className="mt-6 overflow-hidden rounded-xl border border-slate-200">
            <table className="w-full text-left text-sm">
              <thead className="bg-slate-50 text-xs uppercase text-slate-500">
                <tr>
                  <th className="px-3 py-3">Market</th>
                  <th className="px-3 py-3">ZIP</th>
                  <th className="px-3 py-3">Enabled</th>
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
