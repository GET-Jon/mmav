"use client";

import Link from "next/link";
import { useEffect, useMemo, useRef, useState } from "react";
import type { ReactNode } from "react";
import { MarketCompsTable } from "@/components/comps/market-comps-table";
import { VinDecodeCard } from "@/components/evaluation/vin-decode-card";
import { AppSidebar } from "@/components/navigation/app-sidebar";
import { calculateCompSummary } from "@/lib/comps";
import { defaultAssumptions } from "@/lib/assumptions";
import { calculateValuation } from "@/lib/valuation";
import type { MarketComp } from "@/types/comps";
import type { VinDecodeResult } from "@/types/vin";
import type { EvaluationCosts, ValuationInput } from "@/types/evaluation";

const draftStorageKey = "mmav:evaluationDraft:v1";

const initialTargetMileage = 0;

const initialComps: MarketComp[] = [];

const initialEvaluation: ValuationInput = {
  currentBid: 0,
  targetResaleUsed: 0,
  targetProfit: 0,
  totalRiskPoints: 0,
  hasAvoidFlag: false,
  costs: {
    auctionFee: 0,
    transport: 0,
    recon: 0,
    detailAdmin: 0,
    generalRiskReserve: 0,
    brandRiskAdd: 0,
    titleHistoryRiskAdd: 0,
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
      ""
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
  const [marketCheckSearchMeta, setMarketCheckSearchMeta] = useState<{
    loadedCount: number;
    regionsChecked: string[];
    lowConfidenceFallback: boolean;
    minimumQualityScore?: number;
  } | null>(null);
  const marketCheckInFlightRef = useRef(false);
  const [draftReady, setDraftReady] = useState(false);
  const [vinDecodeLoading, setVinDecodeLoading] = useState(false);
  const [vinDecodeError, setVinDecodeError] = useState("");
  const mileageInputRef = useRef<HTMLInputElement | null>(null);

  const [savedEvaluationId, setSavedEvaluationId] = useState<string | null>(
    initialSavedEvaluationId
  );

  const [saveLoading, setSaveLoading] = useState(false);
  const [saveStatus, setSaveStatus] = useState(
    initialSavedEvaluationId ? "Loaded saved evaluation" : ""
  );

  const [notes, setNotes] = useState(initialSavedPayload?.notes || "");

  const [selectedConditions, setSelectedConditions] = useState<string[]>(
    initialSavedPayload?.selectedConditions || initialSelectedConditions
  );

  const [activeAssumptions, setActiveAssumptions] = useState(defaultAssumptions);
  const [assumptionsSource, setAssumptionsSource] = useState<"default" | "saved">(
    "default"
  );

  const [appliedVehicleProfile, setAppliedVehicleProfile] = useState<{
    profile: string;
    ruleName: string;
    source: string;
    reason: string;
  } | null>(null);

  useEffect(() => {
    let cancelled = false;

    async function loadSavedAssumptions() {
      try {
        const response = await fetch("/api/assumptions", {
          cache: "no-store",
        });

        if (!response.ok) {
          throw new Error("Failed to load assumptions.");
        }

        const data = await response.json();

        if (!cancelled && data?.assumptions) {
          setActiveAssumptions(data.assumptions);
          setAssumptionsSource(data.source === "saved" ? "saved" : "default");

            if (!initialSavedEvaluationId && decodedVehicle) {
              const profileMatch = getAppliedVehicleProfile(
                data.assumptions,
                decodedVehicle,
                targetMileage
              );

              const matchingCostDefault = profileMatch?.costDefault;

              setAppliedVehicleProfile(
                profileMatch
                  ? {
                      profile: profileMatch.profile,
                      ruleName: profileMatch.ruleName,
                      source: profileMatch.source,
                      reason: profileMatch.reason,
                    }
                  : null
              );

              if (matchingCostDefault) {
                setEvaluation((previous) =>
                  applyCostDefaultToEvaluation(
                    previous,
                    matchingCostDefault,
                    data.assumptions
                  )
                );
              }
            }
        }
      } catch (error) {
        console.error("Failed to load saved assumptions:", error);
      }
    }

    loadSavedAssumptions();

    return () => {
      cancelled = true;
    };
  }, []);


  useEffect(() => {
    if (initialSavedEvaluationId || initialSavedPayload) {
      setDraftReady(true);
      return;
    }

    try {
      const rawDraft =
        typeof window !== "undefined"
          ? window.localStorage.getItem(draftStorageKey)
          : null;

      if (!rawDraft) {
        setDraftReady(true);
        return;
      }

      const draft = JSON.parse(rawDraft);

      if (typeof draft.vin === "string") {
        setVin(draft.vin);
      }

      if (typeof draft.auctionSite === "string") {
        setAuctionSite(draft.auctionSite);
      }

      if (
        typeof draft.finalTargetOverride === "number" ||
        draft.finalTargetOverride === null
      ) {
        setFinalTargetOverride(draft.finalTargetOverride);
      }

      if (draft.decodedVehicle) {
        setDecodedVehicle(draft.decodedVehicle);
      }

      if (typeof draft.targetMileage === "number") {
        setTargetMileage(draft.targetMileage);
      }

      if (draft.evaluation) {
        setEvaluation(draft.evaluation);
      }

      if (Array.isArray(draft.comps)) {
        setComps(draft.comps);
      }

      if (Array.isArray(draft.selectedConditions)) {
        setSelectedConditions(draft.selectedConditions);
      }

      if (typeof draft.notes === "string") {
        setNotes(draft.notes);
      }

      setMarketCheckStatus(draft.marketCheckStatus || "");
      setMarketCheckSearchMeta(draft.marketCheckSearchMeta || null);
    } catch (error) {
      console.error("Failed to load local evaluator draft:", error);
    } finally {
      setDraftReady(true);
    }
  }, []);

  useEffect(() => {
    if (!draftReady || initialSavedEvaluationId) {
      return;
    }

    try {
      window.localStorage.setItem(
        draftStorageKey,
        JSON.stringify({
          vin,
          auctionSite,
          finalTargetOverride,
          decodedVehicle,
          targetMileage,
          evaluation,
          comps,
          selectedConditions,
          notes,
          marketCheckStatus,
          marketCheckSearchMeta,
        })
      );
    } catch (error) {
      console.error("Failed to save local evaluator draft:", error);
    }
  }, [
    vin,
    auctionSite,
    finalTargetOverride,
    decodedVehicle,
    targetMileage,
    evaluation,
    comps,
    selectedConditions,
    notes,
    marketCheckStatus,
    marketCheckSearchMeta,
    draftReady,
    initialSavedEvaluationId,
  ]);

  const compSummary = useMemo(
    () =>
      calculateCompSummary({
        comps,
        targetMileage,
        assumptions: activeAssumptions,
      }),
    [comps, targetMileage]
  );

  const conditionGroups = useMemo(() => {
    return activeAssumptions.conditionRules.reduce<
      Record<string, typeof activeAssumptions.conditionRules>
    >((groups, rule) => {
      if (!groups[rule.category]) {
        groups[rule.category] = [];
      }

      groups[rule.category].push(rule);
      return groups;
    }, {});
  }, [activeAssumptions]);

  const conditionTotals = useMemo(() => {
    return selectedConditions.reduce(
      (totals, conditionName) => {
        const rule = activeAssumptions.conditionRules.find(
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
  }, [selectedConditions, activeAssumptions]);

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
    () => calculateValuation(valuationInput, activeAssumptions),
    [valuationInput]
  );

  const vehicleYear = decodedVehicle?.year || "";
  const vehicleMake = decodedVehicle?.make || "";
  const vehicleModel = decodedVehicle?.model || "";
  const vehicleTrim = decodedVehicle?.trim || "";
  const vehicleBodyClass = decodedVehicle?.bodyClass || "";

  const vehicleTitle =
    [vehicleYear, vehicleMake, vehicleModel, vehicleTrim]
      .filter(Boolean)
      .join(" ")
      .trim() || "Auction Vehicle";

  function normalizeMatchText(value: string | number | null | undefined) {
    return String(value || "").toLowerCase();
  }

  function getMatchingCostDefault(
    assumptions: typeof defaultAssumptions,
    decoded: VinDecodeResult | null,
    mileage: number
  ) {
    const enabledRules = (assumptions.vehicleClassificationRules || [])
      .filter((rule) => rule.enabled)
      .sort((a, b) => b.priority - a.priority);

    const currentYear = new Date().getFullYear();
    const decodedYear = Number(decoded?.year || vehicleYear || 0);
    const vehicleAge = decodedYear > 0 ? currentYear - decodedYear : 0;

    const fields = {
      make: normalizeMatchText(decoded?.make || vehicleMake),
      model: normalizeMatchText(decoded?.model || vehicleModel),
      trim: normalizeMatchText(decoded?.trim || vehicleTrim),
      body: normalizeMatchText(decoded?.bodyClass || vehicleBodyClass),
      fuel: normalizeMatchText(decoded?.fuelType),
    };

    const matchingRule = enabledRules.find((rule) => {
      if (rule.matchType === "ageMileage") {
        return vehicleAge >= 10 || mileage >= 120000;
      }

      const fieldValue = fields[rule.matchType] || "";

      return rule.matchValues.some((matchValue) =>
        fieldValue.includes(normalizeMatchText(matchValue))
      );
    });

    return (
      assumptions.costDefaults.find(
        (costDefault) => costDefault.vehicleType === matchingRule?.costProfile
      ) || assumptions.costDefaults[0]
    );
  }

  function applyCostDefaultToEvaluation(
    previous: ValuationInput,
    costDefault: typeof defaultAssumptions.costDefaults[number],
    assumptions: typeof defaultAssumptions
  ): ValuationInput {
    return {
      ...previous,
      targetProfit: Math.max(
        costDefault.targetProfit,
        assumptions.bidSettings.minimumTargetProfit || 0
      ),
      costs: {
        ...previous.costs,
        auctionFee: costDefault.auctionFee,
        transport: costDefault.transport,
        recon: costDefault.recon,
        detailAdmin: costDefault.detailAdmin,
        generalRiskReserve: costDefault.riskReserve,
      },
    };
  }


  function getAppliedVehicleProfile(
    assumptions: typeof defaultAssumptions,
    decoded: VinDecodeResult | null,
    mileage: number
  ) {
    const enabledRules = (assumptions.vehicleClassificationRules || [])
      .filter((rule) => rule.enabled)
      .sort((a, b) => b.priority - a.priority);

    const currentYear = new Date().getFullYear();
    const decodedYear = Number(decoded?.year || vehicleYear || 0);
    const vehicleAge = decodedYear > 0 ? currentYear - decodedYear : 0;

    const fields = {
      make: normalizeMatchText(decoded?.make || vehicleMake),
      model: normalizeMatchText(decoded?.model || vehicleModel),
      trim: normalizeMatchText(decoded?.trim || vehicleTrim),
      body: normalizeMatchText(decoded?.bodyClass || vehicleBodyClass),
      fuel: normalizeMatchText(decoded?.fuelType),
    };

    const matchingRule = enabledRules.find((rule) => {
      if (rule.matchType === "ageMileage") {
        return vehicleAge >= 10 || mileage >= 120000;
      }

      const fieldValue = fields[rule.matchType] || "";

      return rule.matchValues.some((matchValue) =>
        fieldValue.includes(normalizeMatchText(matchValue))
      );
    });

    const costDefault =
      assumptions.costDefaults.find(
        (row) => row.vehicleType === matchingRule?.costProfile
      ) || assumptions.costDefaults[0];

    if (!costDefault) {
      return null;
    }

    const matchedFieldValue =
      matchingRule && matchingRule.matchType !== "ageMileage"
        ? fields[matchingRule.matchType]
        : "";

    return {
      costDefault,
      profile: costDefault.vehicleType,
      ruleName: matchingRule?.name || "Default cost profile",
      source: matchingRule ? "Vehicle Rules" : "Default",
      reason: matchingRule
        ? matchingRule.matchType === "ageMileage"
          ? `Age ${vehicleAge} years or mileage ${mileage.toLocaleString()} triggered this profile.`
          : `${matchingRule.matchType} matched ${matchedFieldValue || "decoded vehicle"}`
        : "No enabled vehicle rule matched; using first cost profile.",
    };
  }
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


  function reapplyVehicleProfile() {
    const profileMatch = getAppliedVehicleProfile(
      activeAssumptions,
      decodedVehicle,
      targetMileage
    );

    if (!profileMatch) {
      setAppliedVehicleProfile(null);
      return;
    }

    setEvaluation((previous) =>
      applyCostDefaultToEvaluation(
        previous,
        profileMatch.costDefault,
        activeAssumptions
      )
    );

    setAppliedVehicleProfile({
      profile: profileMatch.profile,
      ruleName: profileMatch.ruleName,
      source: profileMatch.source,
      reason: profileMatch.reason,
    });
  }
  async function decodeVinFromBasics() {
    setVinDecodeLoading(true);
    setVinDecodeError("");

    try {
      const response = await fetch("/api/vin/decode", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          vin,
        }),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || "VIN decode failed.");
      }

      handleDecodedVinAndReset(data);

      window.setTimeout(() => {
        mileageInputRef.current?.focus();
        mileageInputRef.current?.select();
      }, 0);
    } catch (error) {
      setVinDecodeError(
        error instanceof Error ? error.message : "VIN decode failed."
      );
    } finally {
      setVinDecodeLoading(false);
    }
  }

  function handleDecodedVinAndReset(decoded: VinDecodeResult) {
    setDecodedVehicle(decoded);
    setVin(decoded.vin);

    const profileMatch = getAppliedVehicleProfile(activeAssumptions, decoded, 0);
    const matchingCostDefault = profileMatch?.costDefault;

    setAppliedVehicleProfile(
      profileMatch
        ? {
            profile: profileMatch.profile,
            ruleName: profileMatch.ruleName,
            source: profileMatch.source,
            reason: profileMatch.reason,
          }
        : null
    );

    const baseEvaluation: ValuationInput = {
      ...initialEvaluation,
      currentBid: 0,
      targetResaleUsed: 0,
      hasAvoidFlag: false,
      costs: {
        ...initialEvaluation.costs,
      },
    };

    setEvaluation(
      matchingCostDefault
        ? applyCostDefaultToEvaluation(
            baseEvaluation,
            matchingCostDefault,
            activeAssumptions
          )
        : baseEvaluation
    );

    setTargetMileage(0);
    setFinalTargetOverride(null);
    setComps([]);
    setSelectedConditions([]);
    setMarketCheckStatus("");
    setMarketCheckSearchMeta(null);
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
    if (marketCheckInFlightRef.current || marketCheckLoading) {
      setMarketCheckStatus("MarketCheck search already in progress.");
      return;
    }

    marketCheckInFlightRef.current = true;

    const year = vehicleYear;
    const make = vehicleMake;
    const model = vehicleModel;

    setMarketCheckLoading(true);
    setMarketCheckStatus("Searching MarketCheck comps...");

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
          regions: activeAssumptions.regionalMarkets
            .filter((market) => market.enabled)
            .map((market, index) => ({
              market: market.market,
              zip: market.zip,
              order:
                typeof market.order === "number" && Number.isFinite(market.order)
                  ? market.order
                  : index + 1,
              enabled: market.enabled,
            })),
          radius: 100,
          rows: 10,
        }),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || "MarketCheck search failed.");
      }

      if (!data.comps || data.comps.length === 0) {
        setComps([]);
        setMarketCheckSearchMeta({
          loadedCount: 0,
          regionsChecked: data.search?.regionsChecked || [],
          lowConfidenceFallback: false,
          minimumQualityScore: data.minimumQualityScore,
        });
        setMarketCheckStatus("No comps found");
        return;
      }

      setComps(data.comps);
      setMarketCheckSearchMeta({
        loadedCount: data.comps.length,
        regionsChecked: data.search?.regionsChecked || [],
        lowConfidenceFallback: Boolean(data.lowConfidenceFallback),
        minimumQualityScore: data.minimumQualityScore,
      });
      const regionsCheckedCount = data.search?.regionsChecked?.length || 0;

      setMarketCheckStatus(
        `${data.comps.length} comps loaded${
          regionsCheckedCount ? ` · ${regionsCheckedCount} regions checked` : ""
        }${data.cache?.hit ? " from cache" : ""}`
      );
    } catch (error) {
      setMarketCheckStatus(
        error instanceof Error ? error.message : "MarketCheck search failed."
      );
    } finally {
      marketCheckInFlightRef.current = false;
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
          assumptionsSnapshot: activeAssumptions,
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


  function clearLocalDraft() {
    try {
      window.localStorage.removeItem(draftStorageKey);
    } catch (error) {
      console.error("Failed to clear local evaluator draft:", error);
    }

    setVin("");
    setAuctionSite("ACV Auctions");
    setFinalTargetOverride(null);
    setDecodedVehicle(null);
    setTargetMileage(initialTargetMileage);
    setEvaluation(initialEvaluation);
    setComps(initialComps);
    setSelectedConditions(initialSelectedConditions);
    setMarketCheckStatus("");
    setMarketCheckSearchMeta(null);
    setSavedEvaluationId(null);
    setSaveStatus("");
    setNotes("");
    setAppliedVehicleProfile(null);
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
        <AppSidebar active="evaluator" />

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
                <button
                  type="button"
                  onClick={saveEvaluation}
                  disabled={saveLoading}
                  className="rounded-xl bg-slate-950 px-4 py-2 text-sm font-semibold text-white shadow-sm disabled:cursor-not-allowed disabled:bg-slate-400"
                >
                  {saveLoading ? "Saving..." : savedEvaluationId ? "Update Evaluation" : "Save Evaluation"}
                </button>
                <button
                  type="button"
                  onClick={clearLocalDraft}
                  className="rounded-xl border border-slate-300 bg-white px-4 py-2 text-sm font-semibold text-slate-700 shadow-sm hover:bg-slate-50"
                >
                  Clear Draft
                </button>
              </div>
            </div>

            <div className="space-y-5">
              <div className="grid grid-cols-1 gap-5 xl:grid-cols-[1.15fr_1.15fr_1fr]">
                <SectionCard title="1. Vehicle Basics">
                  <div className="space-y-5">
                    <div className="space-y-4">
                      <FormRow label="VIN">
                        <div className="space-y-2">
                          <div className="flex gap-2">
                            <input
                              value={vin}
                              onChange={(event) =>
                                setVin(event.target.value.toUpperCase())
                              }
                              placeholder="Enter VIN"
                              className="min-w-0 flex-1 rounded-xl border border-slate-200 bg-white px-3 py-2 text-right text-sm font-semibold text-slate-900 shadow-sm outline-none"
                            />
                            <button
                              type="button"
                              onClick={decodeVinFromBasics}
                              disabled={vinDecodeLoading || vin.trim().length < 17}
                              className="shrink-0 rounded-xl bg-blue-700 px-4 py-2 text-sm font-bold text-white shadow-sm disabled:cursor-not-allowed disabled:bg-slate-400"
                            >
                              {vinDecodeLoading ? "Decoding..." : "Decode"}
                            </button>
                          </div>

                          {vinDecodeError ? (
                            <div className="rounded-xl bg-red-50 px-3 py-2 text-xs font-semibold text-red-700">
                              {vinDecodeError}
                            </div>
                          ) : null}
                        </div>
                      </FormRow>

                      <FormRow label="Mileage">
                        <input
                          ref={mileageInputRef}
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
                    </div>

                    <div className="border-t border-slate-200 pt-5">
                      <div className="mb-4 flex items-center justify-between gap-3">
                        <div>
                          <h3 className="text-base font-bold text-slate-950">
                            Market Pricing
                          </h3>

                          {marketCheckStatus ? (
                            <div className="mt-1 text-xs font-semibold text-slate-500">
                              {marketCheckStatus}
                            </div>
                          ) : null}
                        </div>

                        <button
                          type="button"
                          onClick={pullMarketCheckComps}
                          disabled={marketCheckLoading}
                          className="shrink-0 rounded-xl bg-blue-700 px-4 py-2 text-sm font-bold text-white shadow-sm disabled:cursor-not-allowed disabled:bg-slate-400"
                        >
                          {marketCheckLoading ? "Pulling..." : "Pull Comps"}
                        </button>
                      </div>

                      <div className="space-y-4">
                        <FormRow label="Market Comp Avg">
                          <div className="rounded-xl bg-slate-50 px-3 py-2 text-right text-sm font-bold text-slate-900">
                            {money(compSummary.averageAdjusted)}
                          </div>
                        </FormRow>

                        <FormRow label="Final Retail Target">
                          <div className="flex items-center rounded-xl border border-slate-200 bg-white shadow-sm">
                            <span className="pl-3 text-sm text-slate-400">$</span>
                            <input
                              type="text"
                              inputMode="numeric"
                              value={formatNumberInput(
                                finalTargetOverride ?? targetResaleUsed
                              )}
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
                      </div>
                    </div>
                  </div>
                  </SectionCard>

                <VinDecodeCard
                  decoded={decodedVehicle}
                  appliedVehicleProfile={appliedVehicleProfile}
                  onReapplyVehicleProfile={reapplyVehicleProfile}
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
                  <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
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

                    <div className="md:col-span-2 rounded-xl bg-emerald-50 px-4 py-4">
                      <div className="grid grid-cols-2 gap-4 text-center">
                        <div>
                          <p className="text-sm text-slate-500">Total Cost Adders</p>
                          <p className="mt-1 text-base font-bold text-emerald-700">
                            {money(valuation.totalCostAdders)}
                          </p>
                        </div>

                        <div>
                          <p className="text-sm text-slate-500">Total Risk Points</p>
                          <p className="mt-1 text-base font-bold text-slate-950">
                            {valuationInput.totalRiskPoints} / 300
                          </p>
                        </div>
                      </div>
                    </div>
                  </div>
                </SectionCard>

                <SectionCard title="7. Deal Notes">
                  <textarea
                    className="h-28 w-full rounded-xl border border-slate-200 p-3 text-sm"
                    value={notes}
                    onChange={(event) => setNotes(event.target.value)}
                    placeholder="Add auction notes, recon concerns, seller comments, or follow-up items..."
                  />
                  <button className="mt-3 rounded-xl bg-blue-700 px-4 py-2 text-sm font-semibold text-white">
                    Save Note
                  </button>
                </SectionCard>
              </div>

              <div id="market-comps" className="scroll-mt-6">
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
                  <div className="mb-4 rounded-xl border border-slate-200 bg-slate-50 px-4 py-3">
                    <div className="flex flex-wrap items-center gap-x-5 gap-y-2 text-sm text-slate-600">
                      <span>
                        <span className="font-bold text-slate-950">
                          {marketCheckSearchMeta?.loadedCount ?? comps.length}
                        </span>{" "}
                        loaded
                      </span>

                      <span>
                        <span className="font-bold text-slate-950">
                          {compSummary.includedCount}
                        </span>{" "}
                        included
                      </span>

                      <span>
                        Median{" "}
                        <span className="font-bold text-slate-950">
                          {money(compSummary.medianAdjusted)}
                        </span>
                      </span>

                      <span>
                        Fast sale{" "}
                        <span className="font-bold text-slate-950">
                          {money(compSummary.fastSaleTarget)}
                        </span>
                      </span>

                      <span
                        className={`rounded-full px-2 py-1 text-xs font-bold ${
                          compSummary.confidence === "High"
                            ? "bg-emerald-100 text-emerald-700"
                            : compSummary.confidence === "Medium"
                            ? "bg-amber-100 text-amber-700"
                            : "bg-red-100 text-red-700"
                        }`}
                      >
                        {compSummary.confidence} confidence
                      </span>

                    </div>

                    {marketCheckSearchMeta?.regionsChecked.length ? (
                      <div className="mt-2 text-sm text-slate-500">
                        <span className="font-semibold text-slate-700">
                          Regions checked:
                        </span>{" "}
                        {marketCheckSearchMeta.regionsChecked.join(" → ")}
                      </div>
                    ) : null}

                    {marketCheckSearchMeta?.lowConfidenceFallback ? (
                      <div className="mt-2 rounded-lg bg-amber-50 px-3 py-2 text-sm font-semibold text-amber-800">
                        Low-confidence fallback: no comps met the quality
                        threshold
                        {marketCheckSearchMeta.minimumQualityScore
                          ? ` (${marketCheckSearchMeta.minimumQualityScore})`
                          : ""}
                        , so the top 3 available comps were included.
                      </div>
                    ) : null}
                  </div>

                  <MarketCompsTable
                    comps={comps}
                    targetMileage={targetMileage}
                    assumptions={activeAssumptions}
                    onToggleIncluded={toggleCompIncluded}
                  />
                </SectionCard>
              </div>
            </div>
          </div>
        </div>
      </div>
    </main>
  );
}
