"use client";

import Link from "next/link";
import { useEffect, useMemo, useRef, useState } from "react";
import type { ReactNode } from "react";
import { AccountStatus } from "@/components/auth/account-status";
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

type ManualVehicleBasics = {
  year: string;
  make: string;
  model: string;
  trim: string;
  bodyClass: string;
};

const initialManualVehicle: ManualVehicleBasics = {
  year: "",
  make: "",
  model: "",
  trim: "",
  bodyClass: "",
};

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
  help,
}: {
  label: string;
  value: string;
  tone?: "default" | "green" | "blue" | "purple" | "orange" | "red";
  help?: string;
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
      <div className="flex items-center gap-1 text-xs font-semibold uppercase tracking-wide text-slate-500">
        <span>{label}</span>
        {help ? (
          <span
            title={help}
            className="inline-flex h-4 w-4 cursor-help items-center justify-center rounded-full bg-slate-100 text-[10px] font-black normal-case text-slate-500"
          >
            i
          </span>
        ) : null}
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
  help,
}: {
  label: string;
  value: number;
  onChange: (value: number) => void;
  help?: string;
}) {
  return (
    <label className="block">
      <div className="mb-1 flex items-center gap-1 text-xs font-semibold uppercase tracking-wide text-slate-500">
        <span>{label}</span>
        {help ? (
          <span
            title={help}
            className="inline-flex h-4 w-4 cursor-help items-center justify-center rounded-full bg-slate-100 text-[10px] font-black normal-case text-slate-500"
          >
            i
          </span>
        ) : null}
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
  manualVehicle?: ManualVehicleBasics;
  targetMileage?: number;
  evaluation?: ValuationInput;
  comps?: MarketComp[];
  selectedConditions?: string[];
  notes?: string;
};

export function EvaluationWorkspace({
  initialSavedEvaluationId = null,
  initialSavedPayload = null,
  userEmail = null,
}: {
  initialSavedEvaluationId?: string | null;
  initialSavedPayload?: SavedEvaluationPayload | null;
  userEmail?: string | null;
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

  const [manualVehicle, setManualVehicle] = useState<ManualVehicleBasics>(
    initialSavedPayload?.manualVehicle || initialManualVehicle
  );

  const [marketCheckLoading, setMarketCheckLoading] = useState(false);
  const [marketCheckStatus, setMarketCheckStatus] = useState("");
  const [marketCheckSearchMeta, setMarketCheckSearchMeta] = useState<{
    loadedCount: number;
    regionsChecked: string[];
    lowConfidenceFallback: boolean;
    minimumQualityScore?: number;
  } | null>(null);

  const [marketCheckApiControls, setMarketCheckApiControls] = useState({
    liveLookupEnabled: false,
    maxApiCallsPerSearch: 3,
    minUsableCompsToStop: 10,
    minInitialRegions: 2,
  });

  const [marketCheckApiUsage, setMarketCheckApiUsage] = useState<{
    apiCallsMade?: number;
    cacheHit?: boolean;
    stopReason?: string;
    usableCompCount?: number;
    failedStatus?: number;
    retryAfter?: string | null;
    searchLog?: {
      attemptName?: string;
      label?: string;
      market?: string;
      zip?: string;
      ok?: boolean;
      status?: number;
      numFound?: number;
      listingCount?: number;
      usableComps?: number;
      cumulativeUsableComps?: number;
    }[];
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

      if (draft.manualVehicle) {
        setManualVehicle(draft.manualVehicle);
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
      setMarketCheckApiUsage(draft.marketCheckApiUsage || null);

      if (draft.marketCheckApiControls) {
        setMarketCheckApiControls((previous) => ({
          ...previous,
          ...draft.marketCheckApiControls,
        }));
      }
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
          manualVehicle,
          targetMileage,
          evaluation,
          comps,
          selectedConditions,
          notes,
          marketCheckStatus,
          marketCheckSearchMeta,
          marketCheckApiControls,
          marketCheckApiUsage,
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
    manualVehicle,
    targetMileage,
    evaluation,
    comps,
    selectedConditions,
    notes,
    marketCheckStatus,
    marketCheckSearchMeta,
    marketCheckApiControls,
    marketCheckApiUsage,
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

  const vehicleYear = decodedVehicle?.year || manualVehicle.year || "";
  const vehicleMake = decodedVehicle?.make || manualVehicle.make || "";
  const vehicleModel = decodedVehicle?.model || manualVehicle.model || "";
  const vehicleTrim = decodedVehicle?.trim || manualVehicle.trim || "";
  const vehicleBodyClass =
    decodedVehicle?.bodyClass || manualVehicle.bodyClass || "";

  const vehicleTitle =
    [vehicleYear, vehicleMake, vehicleModel, vehicleTrim]
      .filter(Boolean)
      .join(" ")
      .trim() || "New Auction Evaluation";

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
  function updateManualVehicleField(
    key: keyof ManualVehicleBasics,
    value: string
  ) {
    setManualVehicle((previous) => ({
      ...previous,
      [key]: key === "make" ? value.toUpperCase() : value,
    }));
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

      setMarketCheckApiUsage(data.apiUsage || null);

      if (data.apiControls) {
        setMarketCheckApiControls((previous) => ({
          ...previous,
          liveLookupEnabled:
            typeof data.apiControls.liveLookupEnabled === "boolean"
              ? data.apiControls.liveLookupEnabled
              : previous.liveLookupEnabled,
          maxApiCallsPerSearch:
            typeof data.apiControls.maxApiCallsPerSearch === "number"
              ? data.apiControls.maxApiCallsPerSearch
              : previous.maxApiCallsPerSearch,
          minUsableCompsToStop:
            typeof data.apiControls.minUsableCompsToStop === "number"
              ? data.apiControls.minUsableCompsToStop
              : previous.minUsableCompsToStop,
          minInitialRegions:
            typeof data.apiControls.minInitialRegions === "number"
              ? data.apiControls.minInitialRegions
              : previous.minInitialRegions,
        }));
      }

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
    setManualVehicle(initialManualVehicle);
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
    setMarketCheckApiUsage(null);
    setSavedEvaluationId(null);
    setSaveStatus("");
    setNotes("");
  }

  function resetForDecodedVin(decoded: VinDecodeResult) {
    setDecodedVehicle(decoded);
    setManualVehicle(initialManualVehicle);
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
    setMarketCheckSearchMeta(null);
    setMarketCheckApiUsage(null);
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

    const year = vehicleYear;
    const make = vehicleMake;
    const model = vehicleModel;

    if (!year || !make || !model) {
      setMarketCheckStatus(
        "Enter a VIN or enter Year, Make, and Model before pulling comps."
      );
      marketCheckInFlightRef.current = false;
      return;
    }

    marketCheckInFlightRef.current = true;
    setMarketCheckLoading(true);
    setMarketCheckStatus(
      marketCheckApiControls.liveLookupEnabled
        ? "Searching MarketCheck comps..."
        : "Live MarketCheck lookup is disabled. Running safe no-call check..."
    );

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
          liveLookupEnabled: marketCheckApiControls.liveLookupEnabled,
          maxApiCallsPerSearch: marketCheckApiControls.maxApiCallsPerSearch,
          minUsableCompsToStop: marketCheckApiControls.minUsableCompsToStop,
          minInitialRegions: marketCheckApiControls.minInitialRegions,
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
        setMarketCheckStatus(
          data.apiUsage?.stopReason || data.error || "No comps found"
        );
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
          manualVehicle,
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
    setManualVehicle(initialManualVehicle);
    setTargetMileage(initialTargetMileage);
    setEvaluation(initialEvaluation);
    setComps(initialComps);
    setSelectedConditions(initialSelectedConditions);
    setMarketCheckStatus("");
    setMarketCheckSearchMeta(null);
    setMarketCheckApiUsage(null);
    setSavedEvaluationId(null);
    setSaveStatus("");
    setNotes("");
    setAppliedVehicleProfile(null);
  }

  const decisionBadgeTone =
    valuation.decision === "Pass"
      ? "bg-red-100 text-red-700"
      : valuation.decision === "Watch / Stretch Only"
      ? "bg-amber-100 text-amber-700"
      : "bg-emerald-100 text-emerald-700";

  const decisionBannerTone =
    valuation.decision === "Pass"
      ? "border-red-200 bg-red-50 text-red-950"
      : valuation.decision === "Watch / Stretch Only"
      ? "border-amber-200 bg-amber-50 text-amber-950"
      : "border-emerald-200 bg-emerald-50 text-emerald-950";

  const decisionTextTone =
    valuation.decision === "Pass"
      ? "text-red-700"
      : valuation.decision === "Watch / Stretch Only"
      ? "text-amber-700"
      : "text-emerald-700";

  const vehicleMetaItems = [
    vin ? `VIN ${vin}` : null,
    auctionSite || null,
    targetMileage ? `${formatNumberInput(targetMileage)} miles` : null,
    savedEvaluationId ? "Saved evaluation" : "Draft evaluation",
  ].filter(Boolean);

  return (
    <main className="min-h-screen bg-slate-100 text-slate-950">
      <div className="flex min-h-screen">
        <AppSidebar active="evaluator" userEmail={userEmail} />

        <div className="flex min-w-0 flex-1 flex-col">
          <header className="flex h-14 items-center justify-between border-b border-slate-200 bg-white px-6">
            <div>
              <div className="text-sm font-black uppercase tracking-wide text-slate-500">
                Evaluator
              </div>
            </div>

            <AccountStatus userEmail={userEmail} />
          </header>

          <div className="flex-1 p-6">
            <div className="mb-5 flex flex-col justify-between gap-4 xl:flex-row xl:items-start">
              <div>
                <div className="text-3xl font-bold tracking-tight">
                  {vehicleTitle}
                </div>
                <div className="mt-2 text-sm font-medium text-slate-500">
                  {vehicleMetaItems.length
                    ? vehicleMetaItems.join(" · ")
                    : "Start by entering a VIN, mileage, auction site, and current bid."}
                </div>
              </div>

              <div className="flex flex-wrap gap-3">
                <button
                  type="button"
                  onClick={saveEvaluation}
                  disabled={saveLoading}
                  className="rounded-xl bg-slate-950 px-4 py-2 text-sm font-semibold text-white shadow-sm disabled:cursor-not-allowed disabled:bg-slate-400"
                >
                  {saveLoading
                    ? "Saving..."
                    : savedEvaluationId
                    ? "Update Evaluation"
                    : "Save Evaluation"}
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

            <section className={`mb-5 rounded-2xl border px-5 py-4 shadow-sm ${decisionBannerTone}`}>
              <div className="flex flex-col gap-4 xl:flex-row xl:items-center">
                <div className="shrink-0 xl:w-60">
                  <div className={`text-3xl font-black leading-none tracking-tight ${decisionTextTone}`}>
                    {valuation.decision}
                  </div>

                  <div className="mt-3 flex flex-wrap items-center gap-2">
                    <span className={`rounded-full px-3 py-1 text-sm font-bold ${decisionBadgeTone}`}>
                      {valuation.riskGrade} risk
                    </span>

                    <span className="text-sm font-bold text-slate-600">
                      Current bid {money(valuationInput.currentBid)}
                    </span>
                  </div>
                </div>

                <div className="hidden h-16 w-px shrink-0 bg-emerald-200/70 xl:block" />

                <div className="grid min-w-0 flex-1 grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-4">
                  {[
                    {
                      label: "All-in cost",
                      value: money(valuation.allInCost),
                      tone: "text-slate-950",
                    },
                    {
                      label: "Gross profit",
                      value: money(valuation.expectedGrossProfit),
                      tone:
                        valuation.expectedGrossProfit >= 0
                          ? "text-emerald-700"
                          : "text-red-700",
                    },
                    {
                      label: "Max smart bid",
                      value: money(valuation.maxSmartBid),
                      tone: "text-blue-700",
                    },
                    {
                      label: "Stretch bid",
                      value: money(valuation.stretchBid),
                      tone: "text-purple-700",
                    },
                  ].map((metric) => (
                    <div
                      key={metric.label}
                      className="rounded-xl border border-slate-200/70 bg-white/85 px-4 py-3 shadow-sm"
                    >
                      <div className="text-[11px] font-black uppercase tracking-wide text-slate-500">
                        {metric.label}
                      </div>
                      <div className={`mt-1 text-lg font-black leading-tight ${metric.tone}`}>
                        {metric.value}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </section>

            <div className="space-y-5">
              <div className="grid grid-cols-1 gap-5 xl:grid-cols-[1.15fr_1fr]">
                <SectionCard title="Vehicle & Bid">
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
                  manualVehicle={manualVehicle}
                  onManualVehicleChange={updateManualVehicleField}
                  appliedVehicleProfile={appliedVehicleProfile}
                  onReapplyVehicleProfile={reapplyVehicleProfile}
                />
              </div>

              <div className="grid grid-cols-1 gap-5 xl:grid-cols-[1fr_1.15fr_.9fr]">
                <SectionCard title="Condition Checklist">
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

                <SectionCard title="Cost & Risk">
                  <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                    <CurrencyInput
                      label="Auction Fee"
                      help="Estimated auction buyer fee. This is usually based on the auction platform and the current bid or purchase price."
                      value={valuationInput.costs.auctionFee}
                      onChange={(value) => updateCost("auctionFee", value)}
                    />
                    <CurrencyInput
                      label="Transport"
                      help="Estimated cost to move the vehicle from the auction or seller location to your store, shop, or staging point."
                      value={valuationInput.costs.transport}
                      onChange={(value) => updateCost("transport", value)}
                    />
                    <CurrencyInput
                      label="Recon"
                      help="Estimated reconditioning budget for mechanical, cosmetic, tires, brakes, paint correction, parts, and other sale-prep work."
                      value={valuationInput.costs.recon}
                      onChange={(value) => updateCost("recon", value)}
                    />
                    <CurrencyInput
                      label="Detail/Admin"
                      help="Baseline internal handling cost for detail, photos, listing prep, paperwork, admin time, and small operational costs."
                      value={valuationInput.costs.detailAdmin}
                      onChange={(value) => updateCost("detailAdmin", value)}
                    />
                    <CurrencyInput
                      label="General Risk Reserve"
                      help="Baseline unknowns buffer from the selected cost profile. It protects against normal auction surprises not already captured by recon, transport, title, brand, or condition-specific risk adds."
                      value={valuationInput.costs.generalRiskReserve}
                      onChange={(value) =>
                        updateCost("generalRiskReserve", value)
                      }
                    />
                    <CurrencyInput
                      label="Brand Risk Add"
                      help="Additional reserve for brand-specific exposure, such as expensive parts, known failure points, luxury-brand repair costs, or weaker buyer demand."
                      value={valuationInput.costs.brandRiskAdd}
                      onChange={(value) => updateCost("brandRiskAdd", value)}
                    />
                    <CurrencyInput
                      label="Title/History Risk Add"
                      help="Additional reserve for title, accident, ownership, mileage, disclosure, or history issues that may reduce resale value or slow the sale."
                      value={valuationInput.costs.titleHistoryRiskAdd}
                      onChange={(value) =>
                        updateCost("titleHistoryRiskAdd", value)
                      }
                    />

                    <div>
                      <div className="mb-1 flex items-center gap-1 text-xs font-semibold uppercase tracking-wide text-slate-500">
                        <span>Condition Risk Add</span>
                        <span
                          title="Reserve automatically added from the selected condition checklist items. Unlike General Risk Reserve, this is driven by specific visible issues selected in the Condition Checklist."
                          className="inline-flex h-4 w-4 cursor-help items-center justify-center rounded-full bg-slate-100 text-[10px] font-black normal-case text-slate-500"
                        >
                          i
                        </span>
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

                <SectionCard title="Deal Notes">
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
                  title="Market Comps"
                  action={
                    marketCheckStatus ? (
                      <span className="rounded-full bg-slate-100 px-3 py-1 text-xs font-bold text-slate-700">
                        {marketCheckStatus}
                      </span>
                    ) : null
                  }
                >
                  <div className="mb-4 rounded-xl border border-blue-100 bg-blue-50 px-4 py-3">
                    <div className="flex flex-wrap items-start justify-between gap-4">
                      <div>
                        <div className="text-sm font-bold text-blue-950">
                          MarketCheck API Controls
                        </div>
                        <div className="mt-1 text-xs leading-5 text-blue-800">
                          Live lookups are off by default while the API quota is
                          limited. Turning this on may consume MarketCheck calls.
                        </div>
                      </div>

                      <label className="flex items-center gap-2 rounded-xl bg-white px-3 py-2 text-sm font-bold text-slate-800 shadow-sm">
                        <input
                          type="checkbox"
                          checked={marketCheckApiControls.liveLookupEnabled}
                          onChange={(event) =>
                            setMarketCheckApiControls((previous) => ({
                              ...previous,
                              liveLookupEnabled: event.target.checked,
                            }))
                          }
                        />
                        Live lookup enabled
                      </label>
                    </div>

                    <div className="mt-4 grid grid-cols-1 gap-3 md:grid-cols-3">
                      <label className="block">
                        <div className="mb-1 text-xs font-bold uppercase tracking-wide text-blue-800">
                          Max API Calls
                        </div>
                        <input
                          type="number"
                          min={1}
                          max={10}
                          value={marketCheckApiControls.maxApiCallsPerSearch}
                          onChange={(event) =>
                            setMarketCheckApiControls((previous) => ({
                              ...previous,
                              maxApiCallsPerSearch: Math.max(
                                1,
                                Math.min(10, toNumber(event.target.value))
                              ),
                            }))
                          }
                          className="w-full rounded-xl border border-blue-100 bg-white px-3 py-2 text-right text-sm font-bold text-slate-900 shadow-sm outline-none"
                        />
                      </label>

                      <label className="block">
                        <div className="mb-1 text-xs font-bold uppercase tracking-wide text-blue-800">
                          Stop After Usable Comps
                        </div>
                        <input
                          type="number"
                          min={1}
                          max={50}
                          value={marketCheckApiControls.minUsableCompsToStop}
                          onChange={(event) =>
                            setMarketCheckApiControls((previous) => ({
                              ...previous,
                              minUsableCompsToStop: Math.max(
                                1,
                                Math.min(50, toNumber(event.target.value))
                              ),
                            }))
                          }
                          className="w-full rounded-xl border border-blue-100 bg-white px-3 py-2 text-right text-sm font-bold text-slate-900 shadow-sm outline-none"
                        />
                      </label>

                      <label className="block">
                        <div className="mb-1 text-xs font-bold uppercase tracking-wide text-blue-800">
                          Minimum Initial Regions
                        </div>
                        <input
                          type="number"
                          min={1}
                          max={10}
                          value={marketCheckApiControls.minInitialRegions}
                          onChange={(event) =>
                            setMarketCheckApiControls((previous) => ({
                              ...previous,
                              minInitialRegions: Math.max(
                                1,
                                Math.min(10, toNumber(event.target.value))
                              ),
                            }))
                          }
                          className="w-full rounded-xl border border-blue-100 bg-white px-3 py-2 text-right text-sm font-bold text-slate-900 shadow-sm outline-none"
                        />
                      </label>
                    </div>
                  </div>

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

                    {marketCheckApiUsage ? (
                      <div className="mt-3 rounded-xl border border-slate-200 bg-white px-3 py-3">
                        <div className="flex flex-wrap items-center gap-x-5 gap-y-2 text-sm text-slate-700">
                          <span>
                            Cache{" "}
                            <span className="font-bold text-slate-950">
                              {marketCheckApiUsage.cacheHit ? "Hit" : "Miss"}
                            </span>
                          </span>

                          <span>
                            API calls{" "}
                            <span className="font-bold text-slate-950">
                              {marketCheckApiUsage.apiCallsMade ?? 0}
                            </span>
                            {" / "}
                            <span className="font-bold text-slate-950">
                              {marketCheckApiControls.maxApiCallsPerSearch}
                            </span>
                          </span>

                          {typeof marketCheckApiUsage.usableCompCount === "number" ? (
                            <span>
                              Usable comps{" "}
                              <span className="font-bold text-slate-950">
                                {marketCheckApiUsage.usableCompCount}
                              </span>
                            </span>
                          ) : null}

                          {marketCheckApiUsage.failedStatus ? (
                            <span className="rounded-full bg-red-50 px-2 py-1 text-xs font-bold text-red-700">
                              Failed status {marketCheckApiUsage.failedStatus}
                            </span>
                          ) : null}
                        </div>

                        {marketCheckApiUsage.stopReason ? (
                          <div className="mt-2 text-sm font-semibold text-slate-700">
                            {marketCheckApiUsage.stopReason}
                          </div>
                        ) : null}

                        {marketCheckApiUsage.searchLog?.length ? (
                          <details className="mt-2">
                            <summary className="cursor-pointer text-sm font-bold text-slate-700">
                              Search log
                            </summary>

                            <div className="mt-2 overflow-x-auto rounded-lg border border-slate-200">
                              <table className="min-w-[760px] w-full text-left text-xs">
                                <thead className="bg-slate-50 uppercase text-slate-500">
                                  <tr>
                                    <th className="px-2 py-2">Attempt</th>
                                    <th className="px-2 py-2">Region</th>
                                    <th className="px-2 py-2">Status</th>
                                    <th className="px-2 py-2">Found</th>
                                    <th className="px-2 py-2">Returned</th>
                                    <th className="px-2 py-2">Usable</th>
                                  </tr>
                                </thead>
                                <tbody className="divide-y divide-slate-100 bg-white">
                                  {marketCheckApiUsage.searchLog.map((entry, index) => (
                                    <tr key={`${entry.attemptName || "search"}-${entry.zip || index}`}>
                                      <td className="px-2 py-2 font-semibold text-slate-700">
                                        {entry.attemptName || "—"}
                                      </td>
                                      <td className="px-2 py-2 text-slate-600">
                                        {entry.label || entry.zip || "—"}
                                      </td>
                                      <td className="px-2 py-2">
                                        <span
                                          className={`rounded-full px-2 py-1 font-bold ${
                                            entry.ok
                                              ? "bg-emerald-50 text-emerald-700"
                                              : "bg-red-50 text-red-700"
                                          }`}
                                        >
                                          {entry.status || "—"}
                                        </span>
                                      </td>
                                      <td className="px-2 py-2 text-slate-600">
                                        {entry.numFound ?? "—"}
                                      </td>
                                      <td className="px-2 py-2 text-slate-600">
                                        {entry.listingCount ?? "—"}
                                      </td>
                                      <td className="px-2 py-2 text-slate-600">
                                        {entry.usableComps ?? entry.cumulativeUsableComps ?? "—"}
                                      </td>
                                    </tr>
                                  ))}
                                </tbody>
                              </table>
                            </div>
                          </details>
                        ) : null}
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
