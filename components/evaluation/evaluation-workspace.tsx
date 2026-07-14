"use client";

import Link from "next/link";
import { useEffect, useMemo, useRef, useState } from "react";
import type { ReactNode } from "react";
import { MarketCompsTable } from "@/components/comps/market-comps-table";
import {
  MARKETCHECK_API_CONTROLS_STORAGE_KEY,
  MARKETCHECK_LAST_API_USAGE_STORAGE_KEY,
  defaultMarketCheckApiControls,
  normalizeMarketCheckApiControls,
  type MarketCheckApiControls,
} from "@/lib/marketcheck/api-controls";
import { VinDecodeCard } from "@/components/evaluation/vin-decode-card";
import { AppSidebar } from "@/components/navigation/app-sidebar";
import { calculateCompSummary } from "@/lib/comps";
import { defaultAssumptions } from "@/lib/assumptions";
import { calculateDealerFit } from "@/lib/dealer-fit";
import { calculateValuation } from "@/lib/valuation";
import type { MarketComp } from "@/types/comps";
import type { VinDecodeResult } from "@/types/vin";
import type { EvaluationCosts, ValuationInput } from "@/types/evaluation";

const draftStorageKey = "mmav:evaluationDraft:v1";
const quickEvalSeenStorageKey = "mmav:quickEvalSeen:v1";

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
    <section className="rounded-[20px] border border-slate-200/80 bg-white p-5 shadow-[0_1px_3px_rgba(15,23,42,0.055),0_16px_40px_rgba(15,23,42,0.035)]">
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
      <div className="rounded-xl bg-slate-50/80 px-3 py-2 text-sm font-semibold text-slate-900">
        {value}
      </div>
    </div>
  );
}

type ThesisMode = "financial" | "enthusiast" | "balanced";

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

    const [marketCheckApiControls, setMarketCheckApiControls] = useState(
    defaultMarketCheckApiControls
  );

  function readLocalMarketCheckApiControls() {
    try {
      const stored = window.localStorage.getItem(
        MARKETCHECK_API_CONTROLS_STORAGE_KEY
      );

      if (stored) {
        return normalizeMarketCheckApiControls(JSON.parse(stored));
      }
    } catch {}

    return defaultMarketCheckApiControls;
  }

  function writeLocalMarketCheckApiControls(
    controls: MarketCheckApiControls
  ) {
    try {
      window.localStorage.setItem(
        MARKETCHECK_API_CONTROLS_STORAGE_KEY,
        JSON.stringify(controls)
      );
    } catch {}
  }

  useEffect(() => {
    let cancelled = false;

    async function syncMarketCheckApiControls() {
      await Promise.resolve();

      const localControls = readLocalMarketCheckApiControls();

      if (!cancelled) {
        setMarketCheckApiControls(localControls);
      }

      try {
        const response = await fetch("/api/company/api-settings", {
          method: "GET",
          headers: {
            Accept: "application/json",
          },
        });

        const data = (await response.json()) as {
          controls?: Partial<MarketCheckApiControls>;
          error?: string;
        };

        if (!response.ok) {
          throw new Error(data.error || "Could not load company API settings.");
        }

        const databaseControls = normalizeMarketCheckApiControls(data.controls);

        writeLocalMarketCheckApiControls(databaseControls);

        if (!cancelled) {
          setMarketCheckApiControls(databaseControls);
        }
      } catch {
        if (!cancelled) {
          setMarketCheckApiControls(localControls);
        }
      }
    }

    void syncMarketCheckApiControls();

    window.addEventListener("focus", syncMarketCheckApiControls);
    window.addEventListener("pageshow", syncMarketCheckApiControls);
    window.addEventListener("storage", syncMarketCheckApiControls);

    return () => {
      cancelled = true;
      window.removeEventListener("focus", syncMarketCheckApiControls);
      window.removeEventListener("pageshow", syncMarketCheckApiControls);
      window.removeEventListener("storage", syncMarketCheckApiControls);
    };
  }, []);

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
    marketTiming?: {
      averageDealerDays?: number;
      averageMarketDays?: number;
    };
    marketTimingDebug?: {
      statsKeys?: string[];
      statsSample?: unknown;
      timingListingKeys?: string[];
    };
  } | null>(null);

  const marketCheckInFlightRef = useRef(false);
  const [draftReady, setDraftReady] = useState(false);
  const [vinDecodeLoading, setVinDecodeLoading] = useState(false);
  const [vinDecodeError, setVinDecodeError] = useState("");
  const mileageInputRef = useRef<HTMLInputElement | null>(null);
  const [quickEvalOpen, setQuickEvalOpen] = useState(false);
  const [quickEvalMode, setQuickEvalMode] = useState<"vin" | "manual">("vin");
  const [vehicleDetailsOpen, setVehicleDetailsOpen] = useState(false);
  const [bidLogicOpen, setBidLogicOpen] = useState(false);

  const [savedEvaluationId, setSavedEvaluationId] = useState<string | null>(
    initialSavedEvaluationId
  );

  useEffect(() => {
    if (initialSavedEvaluationId) {
      return;
    }

    try {
      const hasSeenQuickEval =
        window.sessionStorage.getItem(quickEvalSeenStorageKey) === "true";

      if (!hasSeenQuickEval) {
        setQuickEvalOpen(true);
        window.sessionStorage.setItem(quickEvalSeenStorageKey, "true");
      }
    } catch {
      setQuickEvalOpen(true);
    }
  }, [initialSavedEvaluationId]);


  const [saveLoading, setSaveLoading] = useState(false);
  const [saveStatus, setSaveStatus] = useState(
    initialSavedEvaluationId ? "Loaded saved evaluation" : ""
  );

  const [notes, setNotes] = useState(initialSavedPayload?.notes || "");
  const [aiSummaryLoadingMode, setAiSummaryLoadingMode] = useState<ThesisMode | null>(null);
  const [aiSummaryError, setAiSummaryError] = useState("");

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
    [comps, targetMileage, activeAssumptions]
  );

  const marketTimingAverageDealerDays =
    compSummary.averageDealerDays ||
    marketCheckApiUsage?.marketTiming?.averageDealerDays ||
    0;

  const marketTimingAverageMarketDays =
    compSummary.averageMarketDays ||
    marketCheckApiUsage?.marketTiming?.averageMarketDays ||
    0;

  const marketTimingSpeedSignal = (() => {
    const days = marketTimingAverageMarketDays || marketTimingAverageDealerDays;

    if (!days) {
      return "Unknown";
    }

    if (days <= 30) {
      return "Fast";
    }

    if (days <= 75) {
      return "Normal";
    }

    if (days <= 120) {
      return "Slow";
    }

    return "Very Slow";
  })();


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
    [valuationInput, activeAssumptions]
  );

  const vehicleYear = decodedVehicle?.year || manualVehicle.year || "";
  const vehicleMake = decodedVehicle?.make || manualVehicle.make || "";
  const vehicleModel = decodedVehicle?.model || manualVehicle.model || "";
  const vehicleTrim = decodedVehicle?.trim || manualVehicle.trim || "";
  const vehicleBodyClass =
    decodedVehicle?.bodyClass || manualVehicle.bodyClass || "";

  const simplifiedVehicleBodyClass = (() => {
    const normalized = String(vehicleBodyClass || "").toLowerCase();

    if (!normalized.trim()) return "";
    if (normalized.includes("sport utility") || normalized.includes("suv")) return "SUV";
    if (normalized.includes("multipurpose vehicle") || normalized.includes("mpv")) return "MPV";
    if (normalized.includes("sedan")) return "Sedan";
    if (normalized.includes("coupe")) return "Coupe";
    if (normalized.includes("convertible")) return "Convertible";
    if (normalized.includes("hatchback")) return "Hatchback";
    if (normalized.includes("wagon")) return "Wagon";
    if (normalized.includes("pickup") || normalized.includes("truck")) return "Truck";
    if (normalized.includes("van")) return "Van";

    return vehicleBodyClass;
  })();

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
  async function decodeVinFromBasics(vinOverride?: string) {
    const vinToDecode = (vinOverride ?? vin).trim().toUpperCase();

    setVinDecodeLoading(true);
    setVinDecodeError("");

    try {
      const response = await fetch("/api/vin/decode", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          vin: vinToDecode,
        }),
      });

      const data = await response.json();

      setMarketCheckApiUsage(data.apiUsage || null);

      if (data.apiUsage) {
        window.localStorage.setItem(
          MARKETCHECK_LAST_API_USAGE_STORAGE_KEY,
          JSON.stringify({
            ...data.apiUsage,
            savedAt: new Date().toISOString(),
          })
        );
      }

      if (data.apiControls) {
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
      currentBid: valuationInput.currentBid,
      targetResaleUsed: valuationInput.targetResaleUsed,
      targetProfit: valuationInput.targetProfit,
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

    setTargetMileage((previous) => previous);
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

  async function generateAiSummary(thesisMode: ThesisMode) {
    if (aiSummaryLoadingMode) {
      return;
    }

    setAiSummaryLoadingMode(thesisMode);
    setAiSummaryError("");

    try {
      const includedCompCount = comps.filter((comp) => comp.included).length;
      const totalCompCount = comps.length;
      const modeledCostAdders = valuation.totalCostAdders || 0;
      const expectedGrossProfit =
        finalTargetUsed > 0 && evaluation.currentBid > 0
          ? finalTargetUsed - evaluation.currentBid - modeledCostAdders
          : null;

      const compConfidence =
        totalCompCount === 0
          ? "No comps available"
          : includedCompCount === 0
            ? "No included comps"
            : includedCompCount < 3
              ? "Low / limited comp set"
              : "Usable comp set";

      const response = await fetch("/api/evaluations/summary", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          thesisMode,
          vehicleTitle,
          vin: vin || decodedVehicle?.vin || null,
          mileage: targetMileage || null,
          auctionSite,
          currentBid: evaluation.currentBid || null,

          marketCompAverage: compSummary.averageAdjusted || null,
          medianAdjusted:
            (compSummary as { medianAdjusted?: number }).medianAdjusted || null,
          finalRetailTarget: finalTargetUsed || null,
          safeBid: valuation.safeBid || null,
          maxSmartBid: valuation.maxSmartBid || null,
          stretchBid: valuation.stretchBid || null,
          expectedGrossProfit,

          riskGrade: valuation.riskGrade,
          decision: valuation.decision,
          compConfidence,
          includedCompCount,
          totalCompCount,

          dealerFitScore: dealerFitResult.score,
          dealerFitLabel: dealerFitResult.label,
          dealerFitCategory: dealerFitResult.category,
          dealerFitGeneration: dealerFitResult.generation,
          dealerFitReasons: dealerFitResult.reasons,
          dealerFitCautions: dealerFitResult.cautions,

          selectedConditionRules: selectedConditions,
          notes,
        }),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data?.error || "Failed to generate AI summary.");
      }

      const summary =
        typeof data?.summary === "string" ? data.summary.trim() : "";

      if (!summary) {
        throw new Error("AI summary was empty.");
      }

      setNotes((previous) =>
        previous.trim() ? `${summary}\n\n${previous.trim()}` : summary
      );
    } catch (error) {
      setAiSummaryError(
        error instanceof Error
          ? error.message
          : "Failed to generate AI summary."
      );
    } finally {
      setAiSummaryLoadingMode(null);
    }
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
          fuelType: decodedVehicle?.fuelType || null,
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
        setMarketCheckApiUsage(data.apiUsage || null);

      if (data.apiUsage) {
        window.localStorage.setItem(
          MARKETCHECK_LAST_API_USAGE_STORAGE_KEY,
          JSON.stringify({
            ...data.apiUsage,
            savedAt: new Date().toISOString(),
          })
        );
      }
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

      const pulledComps = Array.isArray(data.comps) ? data.comps : [];
      const hasIncludedComps = pulledComps.some(
        (comp: MarketComp) => comp.included === true
      );

      const normalizedComps = pulledComps.map(
        (comp: MarketComp, index: number) => ({
          ...comp,
          included: hasIncludedComps ? comp.included === true : index < 3,
        })
      );

      setComps(normalizedComps);
      setMarketCheckApiUsage(data.apiUsage || null);

      if (data.apiUsage) {
        window.localStorage.setItem(
          MARKETCHECK_LAST_API_USAGE_STORAGE_KEY,
          JSON.stringify({
            ...data.apiUsage,
            savedAt: new Date().toISOString(),
          })
        );
      }
      setMarketCheckSearchMeta({
        loadedCount: normalizedComps.length,
        regionsChecked: data.search?.regionsChecked || [],
        lowConfidenceFallback: Boolean(data.lowConfidenceFallback),
        minimumQualityScore: data.minimumQualityScore,
      });
      const regionsCheckedCount = data.search?.regionsChecked?.length || 0;

      setMarketCheckStatus(
        `${normalizedComps.length} comps loaded${
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
      ? "border-red-200/80 bg-red-50/70 text-red-950"
      : valuation.decision === "Watch / Stretch Only"
      ? "border-amber-200/80 bg-amber-50/70 text-amber-950"
      : "border-emerald-200/80 bg-emerald-50/70 text-emerald-950";

  const decisionTextTone =
    valuation.decision === "Pass"
      ? "text-red-700"
      : valuation.decision === "Watch / Stretch Only"
      ? "text-amber-700"
      : "text-emerald-700";

  const suggestedBid =
    "safeBid" in valuation && typeof valuation.safeBid === "number"
      ? valuation.safeBid
      : valuation.maxSmartBid;

  const targetProfitForScore = Math.max(valuationInput.targetProfit || 0, 1);
  const profitRatio = valuation.expectedGrossProfit / targetProfitForScore;

  const profitabilityScore =
    valuation.expectedGrossProfit <= 0
      ? 30
      : profitRatio >= 1.5
      ? 95
      : profitRatio >= 1.25
      ? 90
      : profitRatio >= 1
      ? 82
      : profitRatio >= 0.75
      ? 68
      : profitRatio >= 0.5
      ? 55
      : 42;

  const profitabilityLabel =
    profitabilityScore >= 90
      ? "Excellent"
      : profitabilityScore >= 82
      ? "Strong"
      : profitabilityScore >= 68
      ? "Workable"
      : profitabilityScore >= 55
      ? "Thin"
      : profitabilityScore >= 42
      ? "Weak"
      : "Avoid";

  const profitabilityWidth = `${profitabilityScore}%`;

  const dealerFitResult = useMemo(
    () =>
      calculateDealerFit({
        vehicle: {
          year: vehicleYear,
          make: vehicleMake,
          model: vehicleModel,
          trim: vehicleTrim,
          bodyClass: simplifiedVehicleBodyClass || vehicleBodyClass,
          fuelType: decodedVehicle?.fuelType || null,
          driveType: decodedVehicle?.driveType || null,
          transmission: null,
          mileage: targetMileage,
          notes: notes || null,
        },
        financial: {
          expectedGrossProfit: valuation.expectedGrossProfit,
          targetProfit: valuationInput.targetProfit,
          finalRetailTarget: finalTargetUsed,
          currentBid: valuationInput.currentBid,
          compConfidence: compSummary.confidence,
          includedCompCount: compSummary.includedCount,
          riskGrade: valuation.riskGrade,
          decision: valuation.decision,
        },
      }),
    [
      vehicleYear,
      vehicleMake,
      vehicleModel,
      vehicleTrim,
      simplifiedVehicleBodyClass,
      vehicleBodyClass,
      decodedVehicle?.fuelType,
      decodedVehicle?.driveType,
      targetMileage,
      valuationInput.targetProfit,
      valuationInput.currentBid,
      notes,
      valuation.expectedGrossProfit,
      valuation.riskGrade,
      valuation.decision,
      finalTargetUsed,
      compSummary.confidence,
      compSummary.includedCount,
    ]
  );

  const dealerFitScore = dealerFitResult.score;
  const dealerFitLabel = dealerFitResult.label;
  const dealerFitWidth = `${dealerFitScore}%`;
  const dealerFitReason =
    dealerFitResult.reasons[0] || "Dealer fit will improve as vehicle details are added.";

  const suggestedBidDisplay =
    valuationInput.currentBid <= 0
      ? "Enter bid to see range"
      : suggestedBid > 0
      ? money(suggestedBid)
      : "No Bid";

  const hasManualQuickEvalBasics =
    String(manualVehicle.year || "").trim().length > 0 &&
    manualVehicle.make.trim().length > 0 &&
    manualVehicle.model.trim().length > 0;

  const hasQuickEvalBasics =
    quickEvalMode === "vin" ? vin.trim().length >= 17 : hasManualQuickEvalBasics;

  function startQuickEvaluation() {
    if (quickEvalMode === "manual") {
      setDecodedVehicle(null);
      setVin("");
      setManualVehicle((previous) => ({
        ...previous,
        year: String(previous.year || "").trim(),
        make: previous.make.trim(),
        model: previous.model.trim(),
        trim: previous.trim.trim(),
        bodyClass: previous.bodyClass.trim(),
      }));
      setQuickEvalOpen(false);
      return;
    }

    const vinToDecode = vin.trim().toUpperCase();

    setVin(vinToDecode);
    setQuickEvalOpen(false);

    if (vinToDecode.length >= 17) {
      decodeVinFromBasics(vinToDecode);
    }
  }

  const vehicleMetaItems = [
    vin ? `VIN ${vin}` : null,
    auctionSite || null,
    targetMileage ? `${formatNumberInput(targetMileage)} miles` : null,
    savedEvaluationId ? "Saved evaluation" : "Draft evaluation",
  ].filter(Boolean);

  return (
    <main className="min-h-screen bg-[#f5f7fb] text-slate-950">
      {quickEvalOpen ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/45 px-4 backdrop-blur-sm">
          <div className="w-full max-w-xl overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-2xl">
            <div className="flex items-start justify-between gap-4 px-6 py-5">
              <div>
                <h2 className="text-[20px] font-extrabold tracking-[-0.025em] text-slate-950">
                  Quick Start Evaluation
                </h2>
                <p className="mt-1 text-sm font-medium text-slate-500">
                  Enter a VIN to start. Mileage and current bid can be added now or later.
                </p>
              </div>

              <button
                type="button"
                onClick={() => setQuickEvalOpen(false)}
                className="rounded-full p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-700"
                aria-label="Close quick evaluation"
              >
                ✕
              </button>
            </div>

            <div className="space-y-4 px-6 pb-5">
              <div className="grid grid-cols-2 rounded-xl border border-slate-200 bg-slate-100 p-1">
                <button
                  type="button"
                  onClick={() => setQuickEvalMode("vin")}
                  className={`rounded-lg px-3 py-2 text-sm font-black transition ${
                    quickEvalMode === "vin"
                      ? "bg-white text-slate-950 shadow-sm"
                      : "text-slate-500 hover:text-slate-800"
                  }`}
                >
                  VIN Lookup
                </button>
                <button
                  type="button"
                  onClick={() => setQuickEvalMode("manual")}
                  className={`rounded-lg px-3 py-2 text-sm font-black transition ${
                    quickEvalMode === "manual"
                      ? "bg-white text-slate-950 shadow-sm"
                      : "text-slate-500 hover:text-slate-800"
                  }`}
                >
                  Manual Vehicle
                </button>
              </div>

              {quickEvalMode === "vin" ? (
                <>
                  <FormRow label="VIN">
                    <input
                      value={vin}
                      onChange={(event) => setVin(event.target.value.toUpperCase())}
                      placeholder="e.g. 5UXCR6C00L9U123456"
                      className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm font-semibold text-slate-900 shadow-sm outline-none"
                    />
                  </FormRow>

                  {vinDecodeError ? (
                    <div className="rounded-xl bg-red-50 px-3 py-2 text-xs font-semibold text-red-700">
                      {vinDecodeError}
                    </div>
                  ) : null}
                </>
              ) : (
                <div className="space-y-4">
                  <div className="grid gap-4 sm:grid-cols-2">
                    <FormRow label="Year">
                      <input
                        value={manualVehicle.year}
                        onChange={(event) =>
                          setManualVehicle((previous) => ({
                            ...previous,
                            year: event.target.value,
                          }))
                        }
                        placeholder="e.g. 2003"
                        className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm font-semibold text-slate-900 shadow-sm outline-none"
                      />
                    </FormRow>

                    <FormRow label="Make">
                      <input
                        value={manualVehicle.make}
                        onChange={(event) =>
                          setManualVehicle((previous) => ({
                            ...previous,
                            make: event.target.value,
                          }))
                        }
                        placeholder="e.g. BMW"
                        className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm font-semibold text-slate-900 shadow-sm outline-none"
                      />
                    </FormRow>
                  </div>

                  <div className="grid gap-4 sm:grid-cols-2">
                    <FormRow label="Model">
                      <input
                        value={manualVehicle.model}
                        onChange={(event) =>
                          setManualVehicle((previous) => ({
                            ...previous,
                            model: event.target.value,
                          }))
                        }
                        placeholder="e.g. M3"
                        className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm font-semibold text-slate-900 shadow-sm outline-none"
                      />
                    </FormRow>

                    <FormRow label="Trim">
                      <input
                        value={manualVehicle.trim}
                        onChange={(event) =>
                          setManualVehicle((previous) => ({
                            ...previous,
                            trim: event.target.value,
                          }))
                        }
                        placeholder="e.g. Competition, 3.0i, G550"
                        className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm font-semibold text-slate-900 shadow-sm outline-none"
                      />
                    </FormRow>
                  </div>

                  <FormRow label="Body Style">
                    <input
                      value={manualVehicle.bodyClass}
                      onChange={(event) =>
                        setManualVehicle((previous) => ({
                          ...previous,
                          bodyClass: event.target.value,
                        }))
                      }
                      placeholder="e.g. Coupe, Sedan, Convertible, SUV"
                      className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm font-semibold text-slate-900 shadow-sm outline-none"
                    />
                  </FormRow>
                </div>
              )}

              <FormRow label="Mileage">
                <div className="flex items-center rounded-xl border border-slate-200 bg-white shadow-sm">
                  <input
                    type="text"
                    inputMode="numeric"
                    value={formatNumberInput(targetMileage)}
                    onFocus={(event) => event.currentTarget.select()}
                    onChange={(event) => setTargetMileage(toNumber(event.target.value))}
                    placeholder="e.g. 68,450"
                    className="w-full rounded-xl bg-transparent px-3 py-2 text-right text-sm font-semibold text-slate-900 outline-none"
                  />
                  <span className="pr-3 text-sm font-semibold text-slate-400">mi</span>
                </div>
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
                      updateEvaluationField("currentBid", toNumber(event.target.value))
                    }
                    placeholder="e.g. 16,250"
                    className="w-full rounded-xl bg-transparent px-3 py-2 text-right text-sm font-semibold text-slate-900 outline-none"
                  />
                </div>
              </FormRow>

              <FormRow label="Vehicle Source">
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
            </div>

            <div className="flex justify-end gap-3 border-t border-slate-200 bg-slate-50 px-6 py-4">
              <button
                type="button"
                onClick={() => setQuickEvalOpen(false)}
                className="rounded-xl border border-slate-300 bg-white px-5 py-2 text-sm font-semibold text-slate-700 shadow-sm hover:bg-slate-50"
              >
                Cancel
              </button>

              <button
                type="button"
                onClick={startQuickEvaluation}
                disabled={!hasQuickEvalBasics}
                className="rounded-xl bg-slate-950 px-5 py-2 text-sm font-semibold text-white shadow-sm hover:bg-slate-800 disabled:cursor-not-allowed disabled:bg-slate-400"
              >
                Start Evaluation
              </button>
            </div>
          </div>
        </div>
      ) : null}

      {vehicleDetailsOpen ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/45 px-4 backdrop-blur-sm">
          <div className="max-h-[88vh] w-full max-w-4xl overflow-y-auto rounded-2xl border border-slate-200 bg-white p-5 shadow-2xl">
            <div className="mb-4 flex items-start justify-between gap-4">
              <div>
                <h2 className="text-[20px] font-extrabold tracking-[-0.025em] text-slate-950">
                  Vehicle Details
                </h2>
                <p className="mt-1 text-sm font-medium text-slate-500">
                  Full decoded identity and applied vehicle profile.
                </p>
              </div>

              <button
                type="button"
                onClick={() => setVehicleDetailsOpen(false)}
                className="rounded-full p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-700"
                aria-label="Close vehicle details"
              >
                ✕
              </button>
            </div>

            <VinDecodeCard
              decoded={decodedVehicle}
              manualVehicle={manualVehicle}
              onManualVehicleChange={updateManualVehicleField}
              appliedVehicleProfile={appliedVehicleProfile}
              onReapplyVehicleProfile={reapplyVehicleProfile}
            />
          </div>
        </div>
      ) : null}

      {bidLogicOpen ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/45 px-4 backdrop-blur-sm">
          <div className="w-full max-w-2xl overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-2xl">
            <div className="flex items-start justify-between gap-4 px-6 py-5">
              <div>
                <h2 className="text-[20px] font-extrabold tracking-[-0.025em] text-slate-950">
                  Adjust Bid Logic
                </h2>
                <p className="mt-1 text-sm font-medium text-slate-500">
                  Tune the key assumptions that drive the suggested bid.
                </p>
              </div>

              <button
                type="button"
                onClick={() => setBidLogicOpen(false)}
                className="rounded-full p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-700"
                aria-label="Close bid logic"
              >
                ✕
              </button>
            </div>

            <div className="space-y-4 px-6 pb-5">
              <FormRow label="Mileage">
                <input
                  type="text"
                  inputMode="numeric"
                  value={formatNumberInput(targetMileage)}
                  onFocus={(event) => event.currentTarget.select()}
                  onChange={(event) => setTargetMileage(toNumber(event.target.value))}
                  className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-right text-sm font-semibold text-slate-900 shadow-sm outline-none"
                />
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
                      updateEvaluationField("currentBid", toNumber(event.target.value))
                    }
                    className="w-full rounded-xl bg-transparent px-3 py-2 text-right text-sm font-semibold text-slate-900 outline-none"
                  />
                </div>
              </FormRow>

              <FormRow label="Vehicle Source">
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

              <FormRow label="Final Retail Target">
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
                      updateEvaluationField("targetProfit", toNumber(event.target.value))
                    }
                    className="w-full rounded-xl bg-transparent px-3 py-2 text-right text-sm font-semibold text-slate-900 outline-none"
                  />
                </div>
              </FormRow>

              <div className="grid grid-cols-2 gap-3 rounded-2xl bg-slate-50 p-4 text-sm">
                <div>
                  <div className="text-[10px] font-extrabold uppercase tracking-[0.16em] text-slate-500">
                    Suggested Bid
                  </div>
                  <div className="mt-1 text-[20px] font-extrabold tracking-[-0.025em] text-emerald-700">
                    {suggestedBidDisplay}
                  </div>
                </div>

                <div>
                  <div className="text-[10px] font-extrabold uppercase tracking-[0.16em] text-slate-500">
                    Expected Gross
                  </div>
                  <div
                    className={`mt-1 text-lg font-black ${
                      valuation.expectedGrossProfit >= 0
                        ? "text-emerald-700"
                        : "text-red-700"
                    }`}
                  >
                    {money(valuation.expectedGrossProfit)}
                  </div>
                </div>
              </div>
            </div>

            <div className="flex justify-end gap-3 border-t border-slate-200 bg-slate-50 px-6 py-4">
              <button
                type="button"
                onClick={() => setBidLogicOpen(false)}
                className="rounded-xl bg-slate-950 px-5 py-2 text-sm font-semibold text-white shadow-sm hover:bg-slate-800"
              >
                Done
              </button>
            </div>
          </div>
        </div>
      ) : null}

      <div className="flex min-h-screen">
        <AppSidebar active="evaluator" userEmail={userEmail} />

        <div className="flex min-w-0 flex-1 flex-col">
          <div className="flex-1 p-6">
            <div className="mb-5 flex flex-col justify-between gap-4 xl:flex-row xl:items-start">
              <div>
                <div className="text-[30px] font-extrabold tracking-[-0.035em]">
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
                  onClick={() => setQuickEvalOpen(true)}
                  className="rounded-xl border border-slate-300 bg-white px-4 py-2 text-sm font-semibold text-slate-800 shadow-sm hover:bg-slate-50"
                >
                  ⚡ New Quick Eval
                </button>

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

            <section className="mb-5 space-y-4">
              <div className="grid grid-cols-1 gap-5 xl:grid-cols-3">
                <div className="rounded-[20px] border border-slate-200/80 bg-white p-5 shadow-[0_1px_3px_rgba(15,23,42,0.055),0_16px_40px_rgba(15,23,42,0.035)]">
                  <div className="flex items-start justify-between gap-4">
                    <div>
                      <div className="text-[11px] font-extrabold uppercase tracking-[0.16em] text-slate-500">
                        Vehicle Snapshot
                      </div>
                      <div className="mt-3 text-[20px] font-extrabold tracking-[-0.025em] text-slate-950">
                        {vehicleTitle}
                      </div>
                    </div>

                    <div className="flex h-16 w-24 shrink-0 flex-col items-center justify-center rounded-2xl border border-slate-200 bg-slate-50">
                      <div className="h-2 w-12 rounded-full bg-slate-300" />
                      <div className="mt-2 h-5 w-16 rounded-lg border-2 border-slate-300" />
                    </div>
                  </div>

                  <div className="mt-4 grid grid-cols-2 gap-2 text-sm font-semibold text-slate-600">
                    <div className="rounded-xl bg-slate-50/80 px-3 py-2">
                      {targetMileage ? `${formatNumberInput(targetMileage)} mi` : "Mileage pending"}
                    </div>
                    <div className="rounded-xl bg-slate-50/80 px-3 py-2">
                      {decodedVehicle?.fuelType || "Fuel pending"}
                    </div>
                    <div className="rounded-xl bg-slate-50/80 px-3 py-2">
                      {simplifiedVehicleBodyClass || "Body pending"}
                    </div>
                    <div className="rounded-xl bg-slate-50/80 px-3 py-2">
                      {auctionSite || "Source pending"}
                    </div>
                  </div>

                  <div className="mt-3 truncate rounded-xl bg-slate-50/80 px-3 py-2 text-xs font-bold text-slate-500">
                    {vin ? `VIN ${vin}` : "VIN pending"}
                  </div>

                  <div className="mt-4 grid grid-cols-2 gap-2">
                    <button
                      type="button"
                      onClick={() => setQuickEvalOpen(true)}
                      className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm font-bold text-slate-700 shadow-sm hover:bg-slate-50"
                    >
                      Edit Basics
                    </button>

                    <button
                      type="button"
                      onClick={() => setVehicleDetailsOpen(true)}
                      className="rounded-xl bg-slate-950 px-3 py-2 text-sm font-bold text-white shadow-sm hover:bg-slate-800"
                    >
                      Details
                    </button>
                  </div>
                </div>

                <div className="rounded-[20px] border border-slate-200/80 bg-white p-5 shadow-[0_1px_3px_rgba(15,23,42,0.055),0_16px_40px_rgba(15,23,42,0.035)]">
                  <div className="flex items-start justify-between gap-4">
                    <div>
                      <div className="text-[11px] font-extrabold uppercase tracking-[0.16em] text-slate-500">
                        Market Read
                      </div>
                      <div className="mt-3 text-sm font-bold text-slate-500">
                        Adjusted Market Avg
                      </div>
                      <div className="mt-1 text-[30px] font-extrabold tracking-[-0.035em] text-slate-950">
                        {comps.length ? money(compSummary.averageAdjusted) : "Pending"}
                      </div>
                    </div>

                    <div className="flex flex-col items-end gap-2">
                      <span className="rounded-full bg-emerald-100 px-3 py-1 text-xs font-extrabold text-emerald-700">
                        {comps.length ? "Comp set found" : "Pull comps to score market"}
                      </span>

                      <button
                        type="button"
                        onClick={pullMarketCheckComps}
                        disabled={marketCheckLoading}
                        className="rounded-xl bg-blue-700 px-3 py-2 text-xs font-extrabold text-white shadow-sm hover:bg-blue-800 disabled:cursor-not-allowed disabled:bg-slate-400"
                      >
                        {marketCheckLoading ? "Pulling..." : "Pull Comps"}
                      </button>
                    </div>
                  </div>

                  <div className="mt-4 grid grid-cols-2 gap-2">
                    <div className="rounded-xl bg-slate-50/80 px-3 py-2">
                      <div className="text-[10px] font-black uppercase tracking-wide text-slate-500">
                        Comps
                      </div>
                      <div className="mt-1 text-[17px] font-extrabold tracking-[-0.02em] text-slate-950">
                        {comps.length || "—"}
                      </div>
                    </div>

                    <div className="rounded-xl bg-slate-50/80 px-3 py-2">
                      <div className="text-[10px] font-black uppercase tracking-wide text-slate-500">
                        Confidence
                      </div>
                      <div className="mt-1 text-[17px] font-extrabold tracking-[-0.02em] text-slate-950">
                        {comps.length >= 10 ? "Good" : comps.length >= 5 ? "Fair" : comps.length > 0 ? "Thin" : "Pending"}
                      </div>
                    </div>

                    <div className="rounded-xl bg-slate-50/80 px-3 py-2">
                      <div className="text-[10px] font-black uppercase tracking-wide text-slate-500">
                        Fuel match
                      </div>
                      <div className="mt-1 text-[17px] font-extrabold tracking-[-0.02em] text-slate-950">
                        {decodedVehicle?.fuelType ? "Enforced" : "Unavailable"}
                      </div>
                    </div>

                    <div className="rounded-xl bg-slate-50/80 px-3 py-2">
                      <div className="text-[10px] font-black uppercase tracking-wide text-slate-500">
                        Timing
                      </div>
                      <div className="mt-1 text-[17px] font-extrabold tracking-[-0.02em] text-slate-950">
                        {marketTimingSpeedSignal}
                      </div>
                    </div>
                  </div>

                  <div className="mt-4 rounded-2xl border border-slate-100 bg-slate-50/80 p-3">
                    <div className="mb-3 text-[10px] font-black uppercase tracking-wide text-slate-500">
                      Deal Scores
                    </div>

                    <div className="space-y-3">
                      <div>
                        <div className="flex items-center justify-between gap-3 text-xs font-bold">
                          <span className="text-slate-600">Profitability</span>
                          <span className="text-slate-950">
                            {profitabilityScore} {profitabilityLabel}
                          </span>
                        </div>
                        <div className="mt-1 h-2 overflow-hidden rounded-full bg-slate-200">
                          <div
                            className="h-full rounded-full bg-emerald-600"
                            style={{
                              width:
                                profitabilityWidth,
                            }}
                          />
                        </div>
                      </div>

                      <div>
                        <div className="flex items-center justify-between gap-3 text-xs font-bold">
                          <span className="text-slate-600">Dealer Fit</span>
                          <span className="text-slate-950">
                            {dealerFitScore} {dealerFitLabel}
                          </span>
                        </div>
                        <div className="mt-1 h-2 overflow-hidden rounded-full bg-slate-200">
                          <div
                            className="h-full rounded-full bg-blue-600"
                            style={{ width: dealerFitWidth }}
                          />
                        </div>
                        <div className="mt-1 text-[11px] font-medium leading-snug text-slate-500">
                          {dealerFitResult.generation ? `${dealerFitResult.generation}: ` : ""}
                          {dealerFitReason}
                        </div>
                      </div>
                    </div>
                  </div>
                </div>

                <div className={`rounded-2xl border p-5 shadow-sm ${decisionBannerTone}`}>
                  <div className="flex items-start justify-between gap-4">
                    <div>
                      <div className="text-[11px] font-extrabold uppercase tracking-[0.16em] text-slate-500">
                        Decision
                      </div>
                      <div className={`mt-3 text-[38px] font-extrabold leading-[0.98] tracking-[-0.045em] ${decisionTextTone}`}>
                        {valuation.decision}
                      </div>
                      <div className="mt-3 flex flex-wrap gap-2">
                        <span className={`rounded-full px-3 py-1 text-xs font-extrabold ${decisionBadgeTone}`}>
                          {valuation.riskGrade} risk
                        </span>
                        <span className="rounded-full bg-white/80 px-3 py-1 text-xs font-extrabold text-slate-700">
                          Current bid {money(valuationInput.currentBid)}
                        </span>
                      </div>
                    </div>

                    <div className="text-right">
                      <div className="text-[10px] font-extrabold uppercase tracking-[0.16em] text-slate-500">
                        Suggested Bid
                      </div>
                      <div className="mt-2 max-w-[170px] text-[25px] font-extrabold leading-[1.05] tracking-[-0.035em] text-emerald-700">
                        {suggestedBidDisplay}
                      </div>
                    </div>
                  </div>

                  <div className="mt-5 grid grid-cols-2 gap-3">
                    <div className="rounded-xl border border-white/70 bg-white/80 px-3 py-3 shadow-[0_1px_2px_rgba(15,23,42,0.05)]">
                      <div className="text-[10px] font-black uppercase tracking-wide text-slate-500">
                        Expected Sale
                      </div>
                      <div className="mt-1 text-[20px] font-extrabold tracking-[-0.025em] text-slate-950">
                        {money(finalTargetUsed)}
                      </div>
                    </div>

                    <div className="rounded-xl border border-white/70 bg-white/80 px-3 py-3 shadow-[0_1px_2px_rgba(15,23,42,0.05)]">
                      <div className="text-[10px] font-black uppercase tracking-wide text-slate-500">
                        Expected Gross
                      </div>
                      <div
                        className={`mt-1 text-lg font-black ${
                          valuation.expectedGrossProfit >= 0
                            ? "text-emerald-700"
                            : "text-red-700"
                        }`}
                      >
                        {money(valuation.expectedGrossProfit)}
                      </div>
                    </div>
                  </div>

                  <div className="mt-4 rounded-xl bg-white/75 px-3 py-2 text-xs font-bold leading-5 text-slate-700">
                    <span className="font-black text-slate-950">Why this call:</span>{" "}
                    {valuation.expectedGrossProfit >= valuationInput.targetProfit
                      ? "Meets target profit with manageable risk."
                      : valuation.expectedGrossProfit > 0
                      ? "Some spread exists, but the bid needs discipline."
                      : "Insufficient spread after costs, risk, and target profit."}
                  </div>

                  <button
                    type="button"
                    onClick={() => setBidLogicOpen(true)}
                    className="mt-4 w-full rounded-xl border border-slate-200 bg-white/85 px-3 py-2 text-sm font-extrabold text-slate-700 shadow-sm hover:bg-white"
                  >
                    Adjust Bid Logic
                  </button>
                </div>
              </div>


            </section>

            <div className="space-y-4">
              <div className="grid grid-cols-1 gap-5 xl:grid-cols-[1.05fr_.8fr_1.15fr]">
                <SectionCard
                  title="AI Deal Thesis"
                  action={
                    <span className="rounded-full bg-slate-100 px-3 py-1 text-xs font-bold text-slate-600">
                      Uses current evaluator data only
                    </span>
                  }
                >
                  <div className="grid grid-cols-2 gap-3">
                    <button
                      type="button"
                      onClick={() => generateAiSummary("financial")}
                      disabled={Boolean(aiSummaryLoadingMode)}
                      className="rounded-xl bg-blue-700 px-4 py-2.5 text-sm font-semibold text-white shadow-sm hover:bg-blue-800 disabled:cursor-not-allowed disabled:bg-slate-400"
                    >
                      {aiSummaryLoadingMode === "financial"
                        ? "Generating..."
                        : "Financial"}
                    </button>

                    <button
                      type="button"
                      onClick={() => generateAiSummary("enthusiast")}
                      disabled={Boolean(aiSummaryLoadingMode)}
                      className="rounded-xl bg-slate-950 px-4 py-2.5 text-sm font-semibold text-white shadow-sm hover:bg-slate-800 disabled:cursor-not-allowed disabled:bg-slate-400"
                    >
                      {aiSummaryLoadingMode === "enthusiast"
                        ? "Generating..."
                        : "Enthusiast"}
                    </button>
                  </div>

                  {aiSummaryError ? (
                    <p className="mt-3 text-sm font-semibold text-red-600">
                      {aiSummaryError}
                    </p>
                  ) : null}

                  <textarea
                    className="mt-4 h-64 w-full resize-none rounded-xl border border-slate-200 p-4 text-sm leading-6"
                    value={notes}
                    onChange={(event) => setNotes(event.target.value)}
                    placeholder="Generate a thesis or add auction notes, recon concerns, seller comments, or follow-up items..."
                  />
                </SectionCard>

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
                            {conditionTotals.riskPoints} / {activeAssumptions.bidSettings.avoidRiskThreshold}
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
                      <div className="rounded-xl bg-slate-50/80 px-3 py-2 text-sm font-bold text-emerald-700">
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
                            {valuationInput.totalRiskPoints} / {activeAssumptions.bidSettings.avoidRiskThreshold}
                          </p>
                        </div>
                      </div>
                    </div>
                  </div>
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
                  <div className="mb-4 rounded-xl border border-blue-100 bg-blue-50 px-4 py-3 text-sm text-blue-900">
                    <span className="font-bold">MarketCheck:</span>{" "}
                    {marketCheckApiControls.liveLookupEnabled
                      ? "Live lookup enabled"
                      : "Live lookup disabled"}
                    {" · "}
                    {marketCheckApiControls.maxApiCallsPerSearch}-call cap
                    {" · stop after "}
                    {marketCheckApiControls.minUsableCompsToStop} usable comps
                    {" · "}
                    {marketCheckApiControls.minInitialRegions} initial region
                    {marketCheckApiControls.minInitialRegions === 1 ? "" : "s"}
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

                      <span>
                        Avg dealer days{" "}
                        <span className="font-bold text-slate-950">
                          {marketTimingAverageDealerDays
                            ? `${marketTimingAverageDealerDays} days`
                            : "—"}
                        </span>
                      </span>

                      <span>
                        Avg market days{" "}
                        <span className="font-bold text-slate-950">
                          {marketTimingAverageMarketDays
                            ? `${marketTimingAverageMarketDays} days`
                            : "—"}
                        </span>
                      </span>

                      <span
                        className={`rounded-full px-2 py-1 text-xs font-bold ${
                          marketTimingSpeedSignal === "Fast"
                            ? "bg-emerald-100 text-emerald-700"
                            : marketTimingSpeedSignal === "Normal"
                            ? "bg-blue-100 text-blue-700"
                            : marketTimingSpeedSignal === "Slow"
                            ? "bg-amber-100 text-amber-700"
                            : marketTimingSpeedSignal === "Very Slow"
                            ? "bg-red-100 text-red-700"
                            : "bg-slate-100 text-slate-600"
                        }`}
                      >
                        {marketTimingSpeedSignal} market
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
