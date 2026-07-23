"use client";

import Link from "next/link";
import { useEffect, useMemo, useRef, useState } from "react";
import type { ReactNode } from "react";
import { AppTopNav } from "@/components/navigation/app-top-nav";
import { MarketCompsTable } from "@/components/comps/market-comps-table";
import {
  MARKETCHECK_API_CONTROLS_STORAGE_KEY,
  MARKETCHECK_LAST_API_USAGE_STORAGE_KEY,
  defaultMarketCheckApiControls,
  normalizeMarketCheckApiControls,
  type MarketCheckApiControls,
} from "@/lib/marketcheck/api-controls";
import { VinDecodeCard } from "@/components/evaluation/vin-decode-card";
import { calculateCompSummary } from "@/lib/comps";
import { defaultAssumptions } from "@/lib/assumptions";
import { calculateDealerFit } from "@/lib/dealer-fit";
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

type MarketCheckVehicleOverride = {
  year?: string;
  make?: string;
  model?: string;
  trim?: string;
  fuelType?: string | null;
};

type ConditionSeverity = "none" | "minor" | "moderate" | "severe";
type ConditionAssessmentKey = "mechanical" | "cosmetic" | "history";

type ConditionAssessment = {
  severity: ConditionSeverity;
  reserve: number;
  riskPoints: number;
};

type ConditionAssessments = Record<ConditionAssessmentKey, ConditionAssessment>;

const conditionSeverityDefaults: Record<
  ConditionAssessmentKey,
  Record<
    ConditionSeverity,
    {
      reserve: number;
      riskPoints: number;
    }
  >
> = {
  mechanical: {
    none: { reserve: 0, riskPoints: 0 },
    minor: { reserve: 500, riskPoints: 2 },
    moderate: { reserve: 1500, riskPoints: 6 },
    severe: { reserve: 4000, riskPoints: 10 },
  },
  cosmetic: {
    none: { reserve: 0, riskPoints: 0 },
    minor: { reserve: 400, riskPoints: 2 },
    moderate: { reserve: 1000, riskPoints: 6 },
    severe: { reserve: 2500, riskPoints: 10 },
  },
  history: {
    none: { reserve: 0, riskPoints: 0 },
    minor: { reserve: 500, riskPoints: 2 },
    moderate: { reserve: 2000, riskPoints: 6 },
    severe: { reserve: 5000, riskPoints: 10 },
  },
};

const initialConditionAssessments: ConditionAssessments = {
  mechanical: {
    severity: "none",
    reserve: 0,
    riskPoints: 0,
  },
  cosmetic: {
    severity: "none",
    reserve: 0,
    riskPoints: 0,
  },
  history: {
    severity: "none",
    reserve: 0,
    riskPoints: 0,
  },
};

const conditionAssessmentDefinitions: Array<{
  key: ConditionAssessmentKey;
  title: string;
  description: string;
}> = [
  {
    key: "mechanical",
    title: "Mechanical",
    description:
      "Engine, transmission, warning lights, leaks, cooling, suspension, drivetrain, and mechanical uncertainty.",
  },
  {
    key: "cosmetic",
    title: "Cosmetic & Wear",
    description:
      "Tires, brakes, paint, body, glass, wheels, interior wear, detailing, and ordinary sale preparation.",
  },
  {
    key: "history",
    title: "History & Structural",
    description:
      "Title, accident, structural, mileage, disclosure, ownership-history, and resale-stigma concerns.",
  },
];

function assessmentFromReserve(
  category: ConditionAssessmentKey,
  reserve: number,
): ConditionAssessment {
  const normalizedReserve = Math.max(0, reserve);
  const defaults = conditionSeverityDefaults[category];

  const severity: ConditionSeverity =
    normalizedReserve <= 0
      ? "none"
      : normalizedReserve <= defaults.minor.reserve
        ? "minor"
        : normalizedReserve <= defaults.moderate.reserve
          ? "moderate"
          : "severe";

  return {
    severity,
    reserve: normalizedReserve,
    riskPoints: defaults[severity].riskPoints,
  };
}

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

function ScoreRing({
  label,
  score,
  tone,
}: {
  label: string;
  score: number;
  tone: "green" | "blue";
}) {
  const normalizedScore = Math.max(0, Math.min(100, score));

  const ringColor =
    normalizedScore < 40
      ? "#dc2626"
      : normalizedScore < 65
        ? "#d97706"
        : tone === "green"
          ? "#059669"
          : "#2563eb";

  return (
    <div className="flex flex-col items-center text-center">
      <div className="mb-2 text-xs font-extrabold text-slate-600">{label}</div>

      <div
        className="relative grid h-[86px] w-[86px] place-items-center rounded-full"
        style={{
          background: `conic-gradient(${ringColor} ${
            normalizedScore * 3.6
          }deg, #e2e8f0 0deg)`,
        }}
      >
        <div className="grid h-[68px] w-[68px] place-items-center rounded-full bg-white shadow-inner">
          <div>
            <div className="text-[25px] font-black leading-none tracking-[-0.04em] text-slate-950">
              {normalizedScore}
            </div>
            <div className="mt-1 text-[10px] font-bold text-slate-400">
              /100
            </div>
          </div>
        </div>
      </div>
    </div>
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

function FormRow({ label, children }: { label: string; children: ReactNode }) {
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
  conditionAssessments?: ConditionAssessments;
  conditionAssessmentsTouched?: boolean;
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
    initialSavedPayload?.evaluation || initialEvaluation,
  );

  const [vin, setVin] = useState(
    initialSavedPayload?.vin || initialSavedPayload?.decodedVehicle?.vin || "",
  );

  const [auctionSite, setAuctionSite] = useState(
    initialSavedPayload?.auctionSite || "ACV Auctions",
  );

  const [finalTargetOverride, setFinalTargetOverride] = useState<number | null>(
    typeof initialSavedPayload?.finalTargetOverride === "number"
      ? initialSavedPayload.finalTargetOverride
      : null,
  );

  const [targetMileage, setTargetMileage] = useState(
    initialSavedPayload?.targetMileage || initialTargetMileage,
  );

  const [comps, setComps] = useState<MarketComp[]>(
    initialSavedPayload?.comps?.length
      ? initialSavedPayload.comps
      : initialComps,
  );

  const [decodedVehicle, setDecodedVehicle] = useState<VinDecodeResult | null>(
    initialSavedPayload?.decodedVehicle || null,
  );

  const [manualVehicle, setManualVehicle] = useState<ManualVehicleBasics>(
    initialSavedPayload?.manualVehicle || initialManualVehicle,
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
    defaultMarketCheckApiControls,
  );

  function readLocalMarketCheckApiControls() {
    try {
      const stored = window.localStorage.getItem(
        MARKETCHECK_API_CONTROLS_STORAGE_KEY,
      );

      if (stored) {
        return normalizeMarketCheckApiControls(JSON.parse(stored));
      }
    } catch {}

    return defaultMarketCheckApiControls;
  }

  function writeLocalMarketCheckApiControls(controls: MarketCheckApiControls) {
    try {
      window.localStorage.setItem(
        MARKETCHECK_API_CONTROLS_STORAGE_KEY,
        JSON.stringify(controls),
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
    filterDiagnostics?: {
      returnedListings?: number;
      mappedListings?: number;
      usableListings?: number;
      rejectedListings?: number;
      rejectedByReason?: {
        fuelMismatch?: number;
        missingPriceOrMileage?: number;
        qualityBelowThreshold?: number;
        generationMismatch?: number;
        other?: number;
      };
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
  const [vehicleThumbnailUrl, setVehicleThumbnailUrl] = useState("");
  const [vehicleThumbnailLoading, setVehicleThumbnailLoading] = useState(false);
  const [vehicleThumbnailError, setVehicleThumbnailError] = useState("");
  const [bidLogicOpen, setBidLogicOpen] = useState(false);
  const [conditionProfitabilityOpen, setConditionProfitabilityOpen] =
    useState(false);
  const [conditionAssessments, setConditionAssessments] =
    useState<ConditionAssessments>(
      initialSavedPayload?.conditionAssessments || initialConditionAssessments,
    );
  const [conditionAssessmentsTouched, setConditionAssessmentsTouched] =
    useState(
      Boolean(
        initialSavedPayload?.conditionAssessmentsTouched ||
        initialSavedPayload?.conditionAssessments,
      ),
    );
  const [methodologyOpen, setMethodologyOpen] = useState(false);
  const [methodologyControls, setMethodologyControls] =
    useState<MarketCheckApiControls>(defaultMarketCheckApiControls);
  const [methodologySaving, setMethodologySaving] = useState(false);
  const [methodologyStatus, setMethodologyStatus] = useState("");

  const [savedEvaluationId, setSavedEvaluationId] = useState<string | null>(
    initialSavedEvaluationId,
  );

  const [saveLoading, setSaveLoading] = useState(false);
  const [saveStatus, setSaveStatus] = useState(
    initialSavedEvaluationId ? "Loaded saved evaluation" : "",
  );

  const [notes, setNotes] = useState(initialSavedPayload?.notes || "");
  const [aiSummaryLoadingMode, setAiSummaryLoadingMode] =
    useState<ThesisMode | null>(null);
  const [activeThesisMode, setActiveThesisMode] = useState<
    "financial" | "enthusiast"
  >("financial");
  const [aiSummaryError, setAiSummaryError] = useState("");

  const [selectedConditions, setSelectedConditions] = useState<string[]>(
    initialSavedPayload?.selectedConditions || initialSelectedConditions,
  );

  const [activeAssumptions, setActiveAssumptions] =
    useState(defaultAssumptions);
  const [assumptionsSource, setAssumptionsSource] = useState<
    "default" | "saved"
  >("default");

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
              targetMileage,
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
                : null,
            );

            if (matchingCostDefault) {
              setEvaluation((previous) =>
                applyCostDefaultToEvaluation(
                  previous,
                  matchingCostDefault,
                  data.assumptions,
                ),
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

      if (draft.conditionAssessments) {
        setConditionAssessments(draft.conditionAssessments);
      }

      if (typeof draft.conditionAssessmentsTouched === "boolean") {
        setConditionAssessmentsTouched(draft.conditionAssessmentsTouched);
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
          conditionAssessments,
          conditionAssessmentsTouched,
          notes,
          marketCheckStatus,
          marketCheckSearchMeta,
          marketCheckApiUsage,
        }),
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
    conditionAssessments,
    conditionAssessmentsTouched,
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
    [comps, targetMileage, activeAssumptions],
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
    return conditionAssessmentDefinitions.reduce(
      (totals, definition) => {
        const assessment = conditionAssessments[definition.key];

        return {
          riskPoints: totals.riskPoints + assessment.riskPoints,
          reserveAdd: totals.reserveAdd + assessment.reserve,
        };
      },
      {
        riskPoints: 0,
        reserveAdd: 0,
      },
    );
  }, [conditionAssessments]);

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
      hasAvoidFlag: Boolean(evaluation.hasAvoidFlag),
      costs: {
        ...evaluation.costs,
        recon: conditionAssessmentsTouched
          ? conditionAssessments.mechanical.reserve
          : evaluation.costs.recon,
        detailAdmin: conditionAssessmentsTouched
          ? conditionAssessments.cosmetic.reserve
          : evaluation.costs.detailAdmin,
        titleHistoryRiskAdd: conditionAssessmentsTouched
          ? conditionAssessments.history.reserve
          : evaluation.costs.titleHistoryRiskAdd,
        conditionRiskAdd: 0,
      },
    };
  }, [
    evaluation,
    finalTargetUsed,
    conditionTotals,
    conditionAssessments,
    conditionAssessmentsTouched,
  ]);

  const valuation = useMemo(
    () => calculateValuation(valuationInput, activeAssumptions),
    [valuationInput, activeAssumptions],
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
    if (normalized.includes("sport utility") || normalized.includes("suv"))
      return "SUV";
    if (
      normalized.includes("multipurpose vehicle") ||
      normalized.includes("mpv")
    )
      return "MPV";
    if (normalized.includes("sedan")) return "Sedan";
    if (normalized.includes("coupe")) return "Coupe";
    if (normalized.includes("convertible")) return "Convertible";
    if (normalized.includes("hatchback")) return "Hatchback";
    if (normalized.includes("wagon")) return "Wagon";
    if (normalized.includes("pickup") || normalized.includes("truck"))
      return "Truck";
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
    mileage: number,
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
        fieldValue.includes(normalizeMatchText(matchValue)),
      );
    });

    return (
      assumptions.costDefaults.find(
        (costDefault) => costDefault.vehicleType === matchingRule?.costProfile,
      ) || assumptions.costDefaults[0]
    );
  }

  function applyCostDefaultToEvaluation(
    previous: ValuationInput,
    costDefault: (typeof defaultAssumptions.costDefaults)[number],
    assumptions: typeof defaultAssumptions,
  ): ValuationInput {
    return {
      ...previous,
      targetProfit: Math.max(
        costDefault.targetProfit,
        assumptions.bidSettings.minimumTargetProfit || 0,
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
    mileage: number,
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
        fieldValue.includes(normalizeMatchText(matchValue)),
      );
    });

    const costDefault =
      assumptions.costDefaults.find(
        (row) => row.vehicleType === matchingRule?.costProfile,
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
    value: string,
  ) {
    setManualVehicle((previous) => ({
      ...previous,
      [key]: key === "make" ? value.toUpperCase() : value,
    }));
  }

  function updateEvaluationField(
    key: keyof Omit<ValuationInput, "costs">,
    value: number | boolean,
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
        : [...previous, conditionName],
    );
  }

  function reapplyVehicleProfile() {
    const profileMatch = getAppliedVehicleProfile(
      activeAssumptions,
      decodedVehicle,
      targetMileage,
    );

    if (!profileMatch) {
      setAppliedVehicleProfile(null);
      return;
    }

    setEvaluation((previous) =>
      applyCostDefaultToEvaluation(
        previous,
        profileMatch.costDefault,
        activeAssumptions,
      ),
    );

    setAppliedVehicleProfile({
      profile: profileMatch.profile,
      ruleName: profileMatch.ruleName,
      source: profileMatch.source,
      reason: profileMatch.reason,
    });
  }
  async function decodeVinFromBasics(
    vinOverride?: string,
  ): Promise<VinDecodeResult | null> {
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
          }),
        );
      }

      if (data.apiControls) {
      }

      if (!response.ok) {
        throw new Error(data.error || "VIN decode failed.");
      }

      const decoded = data as VinDecodeResult;

      handleDecodedVinAndReset(decoded);

      window.setTimeout(() => {
        mileageInputRef.current?.focus();
        mileageInputRef.current?.select();
      }, 0);

      return decoded;
    } catch (error) {
      setVinDecodeError(
        error instanceof Error ? error.message : "VIN decode failed.",
      );
    } finally {
      setVinDecodeLoading(false);
    }

    return null;
  }

  function handleDecodedVinAndReset(decoded: VinDecodeResult) {
    setDecodedVehicle(decoded);
    setManualVehicle(initialManualVehicle);
    setVin(decoded.vin);

    const profileMatch = getAppliedVehicleProfile(
      activeAssumptions,
      decoded,
      0,
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
        : null,
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
            activeAssumptions,
          )
        : baseEvaluation,
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
          : comp,
      ),
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
        previous.trim() ? `${summary}\n\n${previous.trim()}` : summary,
      );
    } catch (error) {
      setAiSummaryError(
        error instanceof Error
          ? error.message
          : "Failed to generate AI summary.",
      );
    } finally {
      setAiSummaryLoadingMode(null);
    }
  }

  async function generateVehicleThumbnail(vehicle: {
    year?: string | number | null;
    make?: string | null;
    model?: string | null;
    trim?: string | null;
    bodyClass?: string | null;
  }) {
    const year = String(vehicle.year || "").trim();
    const make = String(vehicle.make || "").trim();
    const model = String(vehicle.model || "").trim();

    if (!year || !make || !model) {
      setVehicleThumbnailUrl("");
      setVehicleThumbnailError("");
      return;
    }

    setVehicleThumbnailLoading(true);
    setVehicleThumbnailError("");

    try {
      const response = await fetch("/api/vehicles/generate-thumbnail", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Accept: "application/json",
        },
        body: JSON.stringify({
          year,
          make,
          model,
          trim: String(vehicle.trim || "").trim(),
          bodyClass: String(vehicle.bodyClass || "").trim(),
        }),
      });

      const data = (await response.json()) as {
        imageUrl?: string;
        error?: string;
      };

      if (!response.ok) {
        throw new Error(data.error || "Vehicle image generation failed.");
      }

      if (!data.imageUrl) {
        throw new Error("No generated vehicle image was returned.");
      }

      setVehicleThumbnailUrl(data.imageUrl);
    } catch (error) {
      setVehicleThumbnailUrl("");
      setVehicleThumbnailError(
        error instanceof Error
          ? error.message
          : "Vehicle image generation failed.",
      );
    } finally {
      setVehicleThumbnailLoading(false);
    }
  }

  async function pullMarketCheckComps(
    vehicleOverride?: VinDecodeResult | MarketCheckVehicleOverride | null,
  ) {
    if (marketCheckInFlightRef.current || marketCheckLoading) {
      setMarketCheckStatus("MarketCheck search already in progress.");
      return;
    }

    const year = vehicleOverride?.year || vehicleYear;
    const make = vehicleOverride?.make || vehicleMake;
    const model = vehicleOverride?.model || vehicleModel;
    const trim = vehicleOverride?.trim || vehicleTrim;
    const fuelType =
      vehicleOverride?.fuelType || decodedVehicle?.fuelType || null;

    if (!year || !make || !model) {
      setMarketCheckStatus(
        "Enter a VIN or enter Year, Make, and Model before pulling comps.",
      );
      marketCheckInFlightRef.current = false;
      return;
    }

    marketCheckInFlightRef.current = true;
    setMarketCheckLoading(true);
    setMarketCheckStatus(
      marketCheckApiControls.liveLookupEnabled
        ? "Searching MarketCheck comps..."
        : "Live MarketCheck lookup is disabled. Running safe no-call check...",
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
          trim,
          fuelType,
          targetMileage,
          regions: activeAssumptions.regionalMarkets
            .filter((market) => market.enabled)
            .map((market, index) => ({
              market: market.market,
              zip: market.zip,
              order:
                typeof market.order === "number" &&
                Number.isFinite(market.order)
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
            }),
          );
        }
        setMarketCheckSearchMeta({
          loadedCount: 0,
          regionsChecked: data.search?.regionsChecked || [],
          lowConfidenceFallback: false,
          minimumQualityScore: data.minimumQualityScore,
        });
        setMarketCheckStatus(
          data.apiUsage?.stopReason || data.error || "No comps found",
        );
        return;
      }

      const pulledComps = Array.isArray(data.comps) ? data.comps : [];
      const hasIncludedComps = pulledComps.some(
        (comp: MarketComp) => comp.included === true,
      );

      const normalizedComps = pulledComps.map(
        (comp: MarketComp, index: number) => ({
          ...comp,
          included: hasIncludedComps ? comp.included === true : index < 3,
        }),
      );

      setComps(normalizedComps);
      setMarketCheckApiUsage(data.apiUsage || null);

      if (data.apiUsage) {
        window.localStorage.setItem(
          MARKETCHECK_LAST_API_USAGE_STORAGE_KEY,
          JSON.stringify({
            ...data.apiUsage,
            savedAt: new Date().toISOString(),
          }),
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
        }${data.cache?.hit ? " from cache" : ""}`,
      );
    } catch (error) {
      setMarketCheckStatus(
        error instanceof Error ? error.message : "MarketCheck search failed.",
      );
    } finally {
      marketCheckInFlightRef.current = false;
      setMarketCheckLoading(false);
    }
  }

  function openMethodology() {
    setMethodologyControls(marketCheckApiControls);
    setMethodologyStatus("");
    setMethodologyOpen(true);
  }

  function updateMethodologyControl(next: Partial<MarketCheckApiControls>) {
    setMethodologyControls((previous) =>
      normalizeMarketCheckApiControls({
        ...previous,
        ...next,
      }),
    );
  }

  async function saveMethodologyControls() {
    setMethodologySaving(true);
    setMethodologyStatus("");

    const normalized = normalizeMarketCheckApiControls(methodologyControls);

    try {
      const response = await fetch("/api/company/api-settings", {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
          Accept: "application/json",
        },
        body: JSON.stringify(normalized),
      });

      const data = (await response.json()) as {
        controls?: Partial<MarketCheckApiControls>;
        error?: string;
      };

      if (!response.ok) {
        throw new Error(data.error || "Could not save API settings.");
      }

      const savedControls = normalizeMarketCheckApiControls(data.controls);

      setMarketCheckApiControls(savedControls);
      setMethodologyControls(savedControls);
      writeLocalMarketCheckApiControls(savedControls);
      setMethodologyStatus("Saved API settings.");
    } catch (error) {
      setMarketCheckApiControls(normalized);
      setMethodologyControls(normalized);
      writeLocalMarketCheckApiControls(normalized);
      setMethodologyStatus(
        error instanceof Error
          ? `Saved in this browser only. ${error.message}`
          : "Saved in this browser only.",
      );
    } finally {
      setMethodologySaving(false);
    }
  }

  function openConditionProfitability() {
    if (!conditionAssessmentsTouched) {
      setConditionAssessments({
        mechanical: assessmentFromReserve("mechanical", evaluation.costs.recon),
        cosmetic: assessmentFromReserve(
          "cosmetic",
          evaluation.costs.detailAdmin,
        ),
        history: assessmentFromReserve(
          "history",
          evaluation.costs.titleHistoryRiskAdd,
        ),
      });
    }

    setConditionProfitabilityOpen(true);
  }

  function updateConditionSeverity(
    category: ConditionAssessmentKey,
    severity: ConditionSeverity,
  ) {
    const defaults = conditionSeverityDefaults[category][severity];

    setConditionAssessments((previous) => ({
      ...previous,
      [category]: {
        severity,
        reserve: defaults.reserve,
        riskPoints: defaults.riskPoints,
      },
    }));

    setConditionAssessmentsTouched(true);
  }

  function updateConditionReserve(
    category: ConditionAssessmentKey,
    reserve: number,
  ) {
    setConditionAssessments((previous) => ({
      ...previous,
      [category]: {
        ...previous[category],
        reserve: Math.max(0, reserve),
      },
    }));

    setConditionAssessmentsTouched(true);
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
          conditionAssessments,
          conditionAssessmentsTouched,
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
        data.mode === "updated" ? "Updated in Supabase" : "Saved to Supabase",
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
    setVehicleThumbnailUrl("");
    setVehicleThumbnailError("");
    setVehicleThumbnailLoading(false);
    setTargetMileage(initialTargetMileage);
    setEvaluation(initialEvaluation);
    setComps(initialComps);
    setSelectedConditions(initialSelectedConditions);
    setConditionAssessments(initialConditionAssessments);
    setConditionAssessmentsTouched(false);
    setConditionProfitabilityOpen(false);
    setMarketCheckStatus("");
    setMarketCheckSearchMeta(null);
    setMarketCheckApiUsage(null);
    setSavedEvaluationId(null);
    setSaveStatus("");
    setNotes("");
    setAppliedVehicleProfile(null);
  }

  const representativeCompImage = useMemo(() => {
    const compWithImage = [...comps]
      .filter(
        (comp) =>
          typeof comp.imageUrl === "string" && comp.imageUrl.trim().length > 0,
      )
      .sort((a, b) => {
        if (a.included !== b.included) {
          return a.included ? -1 : 1;
        }

        return b.qualityScore - a.qualityScore;
      })[0];

    return compWithImage?.imageUrl?.trim() || "";
  }, [comps]);

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

  const hasEvaluationData = Boolean(
    (vehicleYear && vehicleMake && vehicleModel) ||
    valuationInput.currentBid > 0 ||
    comps.length > 0,
  );

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
    ],
  );

  const dealerFitScore = dealerFitResult.score;

  const profitabilityScoreDisplay = hasEvaluationData ? profitabilityScore : 0;

  const dealerFitScoreDisplay = hasEvaluationData ? dealerFitScore : 0;
  const dealerFitLabel = dealerFitResult.label;
  const dealerFitWidth = `${dealerFitScore}%`;
  const dealerFitReason =
    dealerFitResult.reasons[0] ||
    "Dealer fit will improve as vehicle details are added.";

  const suggestedBidDisplay =
    valuationInput.currentBid <= 0
      ? "Enter bid to see range"
      : suggestedBid > 0
        ? money(suggestedBid)
        : "No Bid";

  const currentBidDifference =
    valuationInput.currentBid > 0 && suggestedBid > 0
      ? valuationInput.currentBid - suggestedBid
      : 0;

  const currentBidPosition =
    valuationInput.currentBid <= 0 || suggestedBid <= 0
      ? null
      : currentBidDifference > 0
        ? {
            tone: "over" as const,
            text: `Current bid is ${money(
              currentBidDifference,
            )} above the Max Smart Bid.`,
          }
        : currentBidDifference < 0
          ? {
              tone: "under" as const,
              text: `${money(
                Math.abs(currentBidDifference),
              )} remains before reaching the Max Smart Bid.`,
            }
          : {
              tone: "at" as const,
              text: "Current bid is at the Max Smart Bid.",
            };

  const hasManualQuickEvalBasics =
    String(manualVehicle.year || "").trim().length > 0 &&
    manualVehicle.make.trim().length > 0 &&
    manualVehicle.model.trim().length > 0;

  const hasQuickEvalBasics =
    quickEvalMode === "vin"
      ? vin.trim().length >= 17
      : hasManualQuickEvalBasics;

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

  const lotLogicLabel =
    valuation.decision === "Pass"
      ? "PASS"
      : valuation.decision === "Watch / Stretch Only"
        ? "WATCH CLOSELY"
        : "WORTH PURSUING";

  const compConfidenceDisplay =
    comps.length > 0
      ? `${compSummary.confidence}${
          compSummary.includedCount
            ? ` (${compSummary.includedCount} included)`
            : ""
        }`
      : "Pending";

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
                  Enter a VIN to start. Mileage and current bid can be added now
                  or later.
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
                      onChange={(event) =>
                        setVin(event.target.value.toUpperCase())
                      }
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
                    onChange={(event) =>
                      setTargetMileage(toNumber(event.target.value))
                    }
                    placeholder="e.g. 68,450"
                    className="w-full rounded-xl bg-transparent px-3 py-2 text-right text-sm font-semibold text-slate-900 outline-none"
                  />
                  <span className="pr-3 text-sm font-semibold text-slate-400">
                    mi
                  </span>
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
                      updateEvaluationField(
                        "currentBid",
                        toNumber(event.target.value),
                      )
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

      {methodologyOpen ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/45 px-4 py-6 backdrop-blur-sm">
          <div className="max-h-[92vh] w-full max-w-5xl overflow-y-auto rounded-2xl border border-slate-200 bg-white shadow-2xl">
            <div className="sticky top-0 z-10 flex items-start justify-between gap-4 border-b border-slate-200 bg-white px-6 py-5">
              <div>
                <h2 className="text-[20px] font-extrabold tracking-[-0.025em] text-slate-950">
                  MarketCheck Methodology
                </h2>
                <p className="mt-1 text-sm font-medium text-slate-500">
                  Adjust how comp searches run and review diagnostics from this
                  evaluation.
                </p>
              </div>

              <button
                type="button"
                onClick={() => setMethodologyOpen(false)}
                className="rounded-full p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-700"
                aria-label="Close methodology"
              >
                ✕
              </button>
            </div>

            <div className="space-y-5 p-6">
              <section>
                <div className="mb-3 flex items-center justify-between gap-4">
                  <div>
                    <h3 className="text-base font-black text-slate-950">
                      Search Controls
                    </h3>
                    <p className="mt-1 text-xs font-medium text-slate-500">
                      Changes apply to the next comp pull and are saved to your
                      API settings.
                    </p>
                  </div>

                  <button
                    type="button"
                    onClick={saveMethodologyControls}
                    disabled={methodologySaving}
                    className="rounded-xl bg-blue-700 px-4 py-2 text-sm font-black text-white shadow-sm hover:bg-blue-800 disabled:cursor-not-allowed disabled:bg-slate-400"
                  >
                    {methodologySaving ? "Saving..." : "Save Settings"}
                  </button>
                </div>

                <div className="grid gap-3 md:grid-cols-4">
                  <label className="flex items-center justify-between gap-3 rounded-xl border border-slate-200 bg-slate-50 px-4 py-3">
                    <span>
                      <span className="block text-[10px] font-black uppercase tracking-[0.1em] text-slate-500">
                        Live Lookup
                      </span>
                      <span className="mt-1 block text-sm font-semibold text-slate-700">
                        Allow live calls
                      </span>
                    </span>

                    <input
                      type="checkbox"
                      checked={methodologyControls.liveLookupEnabled}
                      onChange={(event) =>
                        updateMethodologyControl({
                          liveLookupEnabled: event.target.checked,
                        })
                      }
                      className="h-4 w-4 accent-blue-700"
                    />
                  </label>

                  <label className="block rounded-xl border border-slate-200 bg-slate-50 px-4 py-3">
                    <div className="text-[10px] font-black uppercase tracking-[0.1em] text-slate-500">
                      Max API Calls
                    </div>
                    <input
                      type="number"
                      min={1}
                      max={10}
                      value={methodologyControls.maxApiCallsPerSearch}
                      onChange={(event) =>
                        updateMethodologyControl({
                          maxApiCallsPerSearch: Number(event.target.value),
                        })
                      }
                      className="mt-2 w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-right text-sm font-bold shadow-sm outline-none"
                    />
                  </label>

                  <label className="block rounded-xl border border-slate-200 bg-slate-50 px-4 py-3">
                    <div className="text-[10px] font-black uppercase tracking-[0.1em] text-slate-500">
                      Stop After Usable Comps
                    </div>
                    <input
                      type="number"
                      min={1}
                      max={50}
                      value={methodologyControls.minUsableCompsToStop}
                      onChange={(event) =>
                        updateMethodologyControl({
                          minUsableCompsToStop: Number(event.target.value),
                        })
                      }
                      className="mt-2 w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-right text-sm font-bold shadow-sm outline-none"
                    />
                  </label>

                  <label className="block rounded-xl border border-slate-200 bg-slate-50 px-4 py-3">
                    <div className="text-[10px] font-black uppercase tracking-[0.1em] text-slate-500">
                      Minimum Initial Regions
                    </div>
                    <input
                      type="number"
                      min={1}
                      max={10}
                      value={methodologyControls.minInitialRegions}
                      onChange={(event) =>
                        updateMethodologyControl({
                          minInitialRegions: Number(event.target.value),
                        })
                      }
                      className="mt-2 w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-right text-sm font-bold shadow-sm outline-none"
                    />
                  </label>
                </div>

                {methodologyStatus ? (
                  <div className="mt-3 rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm font-semibold text-slate-700">
                    {methodologyStatus}
                  </div>
                ) : null}
              </section>

              <section className="border-t border-slate-200 pt-5">
                <h3 className="text-base font-black text-slate-950">
                  Current Run
                </h3>

                <div className="mt-3 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
                  {[
                    [
                      "Cache",
                      marketCheckApiUsage
                        ? marketCheckApiUsage.cacheHit
                          ? "Hit"
                          : "Miss"
                        : "—",
                    ],
                    [
                      "API Calls",
                      String(marketCheckApiUsage?.apiCallsMade ?? 0),
                    ],
                    [
                      "Usable Comps",
                      String(
                        marketCheckApiUsage?.usableCompCount ??
                          compSummary.includedCount,
                      ),
                    ],
                    ["Comp Confidence", compSummary.confidence || "—"],
                  ].map(([label, value]) => (
                    <div
                      key={label}
                      className="rounded-xl bg-slate-50 px-4 py-3"
                    >
                      <div className="text-[10px] font-black uppercase tracking-[0.1em] text-slate-500">
                        {label}
                      </div>
                      <div className="mt-1 text-lg font-black text-slate-950">
                        {value}
                      </div>
                    </div>
                  ))}
                </div>

                {marketCheckApiUsage?.stopReason ? (
                  <div className="mt-3 rounded-xl border border-slate-200 px-4 py-3 text-sm font-bold text-slate-800">
                    {marketCheckApiUsage.stopReason}
                  </div>
                ) : null}
              </section>

              <section className="border-t border-slate-200 pt-5">
                <div className="grid gap-3 sm:grid-cols-2">
                  <div className="rounded-xl bg-slate-50 px-4 py-3">
                    <div className="text-[10px] font-black uppercase tracking-[0.1em] text-slate-500">
                      Regions Checked
                    </div>
                    <div className="mt-1 text-sm font-bold text-slate-900">
                      {marketCheckSearchMeta?.regionsChecked.length
                        ? marketCheckSearchMeta.regionsChecked.join(" → ")
                        : "—"}
                    </div>
                  </div>

                  <div className="rounded-xl bg-slate-50 px-4 py-3">
                    <div className="text-[10px] font-black uppercase tracking-[0.1em] text-slate-500">
                      Fallback Status
                    </div>
                    <div className="mt-1 text-sm font-bold text-slate-900">
                      {marketCheckSearchMeta?.lowConfidenceFallback
                        ? "Low-confidence fallback applied"
                        : "None"}
                    </div>
                  </div>
                </div>
              </section>
            </div>

            <div className="sticky bottom-0 flex flex-wrap items-center justify-between gap-3 border-t border-slate-200 bg-slate-50 px-6 py-4">
              <Link
                href="/settings?tab=api"
                className="text-sm font-extrabold text-blue-700 hover:text-blue-900"
              >
                View full API usage details →
              </Link>

              <button
                type="button"
                onClick={() => setMethodologyOpen(false)}
                className="rounded-xl bg-slate-950 px-5 py-2 text-sm font-bold text-white hover:bg-slate-800"
              >
                Done
              </button>
            </div>
          </div>
        </div>
      ) : null}

      {conditionProfitabilityOpen ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/45 px-4 py-6 backdrop-blur-sm">
          <div className="max-h-[92vh] w-full max-w-4xl overflow-y-auto rounded-2xl border border-slate-200 bg-white shadow-2xl">
            <div className="sticky top-0 z-10 flex items-start justify-between gap-4 border-b border-slate-200 bg-white px-6 py-5">
              <div>
                <h2 className="text-[20px] font-extrabold tracking-[-0.025em] text-slate-950">
                  Condition &amp; Profitability
                </h2>
                <p className="mt-1 max-w-2xl text-sm font-medium text-slate-500">
                  Judge severity by category. MMAV proposes a reserve that you
                  can adjust for this specific vehicle.
                </p>
              </div>

              <button
                type="button"
                onClick={() => setConditionProfitabilityOpen(false)}
                className="rounded-full p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-700"
                aria-label="Close condition and profitability"
              >
                ✕
              </button>
            </div>

            <div className="space-y-5 p-6">
              <section>
                <h3 className="text-sm font-black uppercase tracking-[0.08em] text-slate-500">
                  Transaction Costs
                </h3>

                <div className="mt-3 grid gap-3 sm:grid-cols-2">
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
                </div>
              </section>

              <section className="space-y-3 border-t border-slate-200 pt-5">
                {conditionAssessmentDefinitions.map((definition) => {
                  const assessment = conditionAssessments[definition.key];

                  const severityTone =
                    assessment.severity === "severe"
                      ? "bg-red-100 text-red-700"
                      : assessment.severity === "moderate"
                        ? "bg-amber-100 text-amber-700"
                        : assessment.severity === "minor"
                          ? "bg-emerald-100 text-emerald-700"
                          : "bg-slate-100 text-slate-600";

                  return (
                    <div
                      key={definition.key}
                      className="rounded-2xl border border-slate-200 p-4"
                    >
                      <div className="flex flex-col justify-between gap-3 md:flex-row md:items-start">
                        <div className="max-w-xl">
                          <div className="flex items-center gap-2">
                            <h3 className="font-black text-slate-950">
                              {definition.title}
                            </h3>

                            <span
                              className={`rounded-full px-2.5 py-1 text-[10px] font-black uppercase tracking-[0.08em] ${severityTone}`}
                            >
                              {assessment.severity}
                            </span>
                          </div>

                          <p className="mt-1 text-xs font-medium leading-5 text-slate-500">
                            {definition.description}
                          </p>
                        </div>

                        <div className="w-full md:w-[170px]">
                          <div className="mb-1 text-[10px] font-black uppercase tracking-[0.08em] text-slate-500">
                            Estimated Reserve
                          </div>

                          <div className="flex items-center rounded-xl border border-slate-200 bg-white shadow-sm">
                            <span className="pl-3 text-sm text-slate-400">
                              $
                            </span>

                            <input
                              type="text"
                              inputMode="numeric"
                              value={formatNumberInput(assessment.reserve)}
                              onFocus={(event) => event.currentTarget.select()}
                              onChange={(event) =>
                                updateConditionReserve(
                                  definition.key,
                                  toNumber(event.target.value),
                                )
                              }
                              className="min-w-0 flex-1 rounded-xl bg-transparent px-3 py-2 text-right text-sm font-bold outline-none"
                            />
                          </div>
                        </div>
                      </div>

                      <div className="mt-4 grid grid-cols-4 gap-2">
                        {(
                          [
                            "none",
                            "minor",
                            "moderate",
                            "severe",
                          ] as ConditionSeverity[]
                        ).map((severity) => {
                          const selected = assessment.severity === severity;

                          const selectedTone =
                            severity === "severe"
                              ? "border-red-600 bg-red-600 text-white"
                              : severity === "moderate"
                                ? "border-amber-500 bg-amber-500 text-white"
                                : severity === "minor"
                                  ? "border-emerald-600 bg-emerald-600 text-white"
                                  : "border-slate-500 bg-slate-600 text-white";

                          return (
                            <button
                              key={severity}
                              type="button"
                              onClick={() =>
                                updateConditionSeverity(
                                  definition.key,
                                  severity,
                                )
                              }
                              className={`rounded-xl border px-2 py-2 text-xs font-black capitalize transition ${
                                selected
                                  ? selectedTone
                                  : "border-slate-200 bg-white text-slate-500 hover:bg-slate-50"
                              }`}
                            >
                              {severity}
                            </button>
                          );
                        })}
                      </div>

                      <div className="mt-2 text-right text-[10px] font-bold text-slate-400">
                        {assessment.riskPoints} risk points
                      </div>
                    </div>
                  );
                })}
              </section>

              <section className="grid gap-3 border-t border-slate-200 pt-5 sm:grid-cols-2 lg:grid-cols-4">
                <div className="rounded-xl bg-slate-50 px-4 py-3">
                  <div className="text-[10px] font-black uppercase tracking-[0.08em] text-slate-500">
                    Condition Reserve
                  </div>
                  <div className="mt-1 text-lg font-black text-slate-950">
                    {money(conditionTotals.reserveAdd)}
                  </div>
                </div>

                <div className="rounded-xl bg-slate-50 px-4 py-3">
                  <div className="text-[10px] font-black uppercase tracking-[0.08em] text-slate-500">
                    Total Risk
                  </div>
                  <div className="mt-1 text-lg font-black text-slate-950">
                    {conditionTotals.riskPoints} / 30
                  </div>
                </div>

                <div className="rounded-xl bg-emerald-50 px-4 py-3">
                  <div className="text-[10px] font-black uppercase tracking-[0.08em] text-emerald-700">
                    Max Smart Bid
                  </div>
                  <div className="mt-1 text-lg font-black text-emerald-700">
                    {suggestedBidDisplay}
                  </div>
                </div>

                <div className="rounded-xl bg-blue-50 px-4 py-3">
                  <div className="text-[10px] font-black uppercase tracking-[0.08em] text-blue-700">
                    Profit at Current Bid
                  </div>
                  <div
                    className={`mt-1 text-lg font-black ${
                      valuation.expectedGrossProfit >= 0
                        ? "text-blue-800"
                        : "text-red-700"
                    }`}
                  >
                    {money(valuation.expectedGrossProfit)}
                  </div>
                </div>
              </section>
            </div>

            <div className="sticky bottom-0 flex justify-end border-t border-slate-200 bg-slate-50 px-6 py-4">
              <button
                type="button"
                onClick={() => setConditionProfitabilityOpen(false)}
                className="rounded-xl bg-slate-950 px-5 py-2 text-sm font-bold text-white hover:bg-slate-800"
              >
                Apply &amp; Close
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
                  onChange={(event) =>
                    setTargetMileage(toNumber(event.target.value))
                  }
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
                      updateEvaluationField(
                        "currentBid",
                        toNumber(event.target.value),
                      )
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
                    value={formatNumberInput(
                      finalTargetOverride ?? targetResaleUsed,
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
                        toNumber(event.target.value),
                      )
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

      <div className="min-h-screen bg-[#f5f7fb]">
        <AppTopNav
          active="evaluator"
          userEmail={userEmail}
          onNewEvaluation={() => {
            clearLocalDraft();
            setQuickEvalMode("vin");
            setQuickEvalOpen(true);
          }}
        />

        <div className="mx-auto max-w-[1380px] px-4 py-5 sm:px-5 lg:px-7">
          <section className="mb-5 rounded-[18px] border border-slate-200 bg-white p-4 shadow-[0_1px_3px_rgba(15,23,42,0.05)]">
            <div className="grid items-end gap-3 lg:grid-cols-[170px_minmax(360px,1fr)_135px_135px_165px]">
              <div>
                <div className="text-sm font-black text-slate-950">
                  Quick Eval
                </div>

                <div className="mt-2 flex flex-nowrap gap-4 text-xs font-extrabold">
                  <button
                    type="button"
                    onClick={() => setQuickEvalMode("vin")}
                    className={
                      quickEvalMode === "vin"
                        ? "whitespace-nowrap border-b-2 border-blue-700 pb-1 text-blue-700"
                        : "whitespace-nowrap pb-1 text-slate-400"
                    }
                  >
                    VIN Scan
                  </button>

                  <span className="pb-1 text-slate-300">/</span>

                  <button
                    type="button"
                    onClick={() => setQuickEvalMode("manual")}
                    className={
                      quickEvalMode === "manual"
                        ? "whitespace-nowrap border-b-2 border-blue-700 pb-1 text-blue-700"
                        : "whitespace-nowrap pb-1 text-slate-400"
                    }
                  >
                    Manual Entry
                  </button>
                </div>
              </div>

              <div>
                {quickEvalMode === "vin" ? (
                  <label>
                    <span className="mb-1 block text-[10px] font-black uppercase tracking-[0.1em] text-slate-500">
                      VIN
                    </span>

                    <div className="flex items-center rounded-xl border border-slate-200 bg-white shadow-sm">
                      <input
                        value={vin}
                        onChange={(event) =>
                          setVin(event.target.value.toUpperCase())
                        }
                        placeholder="Enter 17-character VIN"
                        className="min-w-0 flex-1 rounded-xl bg-transparent px-3 py-2 text-sm font-semibold outline-none"
                      />

                      <button
                        type="button"
                        onClick={() => {
                          setQuickEvalMode("vin");
                          setQuickEvalOpen(true);
                        }}
                        className="mr-2 grid h-7 w-7 place-items-center rounded-lg text-slate-400 hover:bg-slate-100 hover:text-blue-700"
                        aria-label="Open VIN entry options"
                        title="More VIN options"
                      >
                        ⌗
                      </button>
                    </div>
                  </label>
                ) : (
                  <div>
                    <span className="mb-1 block text-[10px] font-black uppercase tracking-[0.1em] text-slate-500">
                      Vehicle
                    </span>

                    <div className="grid grid-cols-[76px_112px_minmax(120px,1fr)_36px] gap-2">
                      <input
                        value={manualVehicle.year}
                        onChange={(event) =>
                          updateManualVehicleField("year", event.target.value)
                        }
                        inputMode="numeric"
                        maxLength={4}
                        placeholder="Year"
                        aria-label="Vehicle year"
                        className="min-w-0 rounded-xl border border-slate-200 bg-white px-2 py-2 text-center text-sm font-semibold shadow-sm outline-none focus:border-blue-300"
                      />

                      <input
                        value={manualVehicle.make}
                        onChange={(event) =>
                          updateManualVehicleField("make", event.target.value)
                        }
                        placeholder="Make"
                        aria-label="Vehicle make"
                        className="min-w-0 rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm font-semibold shadow-sm outline-none focus:border-blue-300"
                      />

                      <input
                        value={manualVehicle.model}
                        onChange={(event) =>
                          updateManualVehicleField("model", event.target.value)
                        }
                        placeholder="Model"
                        aria-label="Vehicle model"
                        className="min-w-0 rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm font-semibold shadow-sm outline-none focus:border-blue-300"
                      />

                      <button
                        type="button"
                        onClick={() => {
                          setQuickEvalMode("manual");
                          setQuickEvalOpen(true);
                        }}
                        className="grid h-[38px] w-9 place-items-center rounded-xl border border-slate-200 bg-white text-sm font-black text-slate-500 shadow-sm hover:bg-slate-50 hover:text-blue-700"
                        aria-label="Open full manual vehicle entry"
                        title="More vehicle details"
                      >
                        ⋯
                      </button>
                    </div>
                  </div>
                )}
              </div>

              <label>
                <span className="mb-1 block text-[10px] font-black uppercase tracking-[0.1em] text-slate-500">
                  Mileage
                </span>

                <div className="flex items-center rounded-xl border border-slate-200 bg-white shadow-sm">
                  <input
                    ref={mileageInputRef}
                    type="text"
                    inputMode="numeric"
                    value={formatNumberInput(targetMileage)}
                    onChange={(event) =>
                      setTargetMileage(toNumber(event.target.value))
                    }
                    className="min-w-0 flex-1 rounded-xl bg-transparent px-3 py-2 text-right text-sm font-semibold outline-none"
                  />

                  <span className="pr-3 text-xs font-bold text-slate-400">
                    mi
                  </span>
                </div>
              </label>

              <label>
                <span className="mb-1 block text-[10px] font-black uppercase tracking-[0.1em] text-slate-500">
                  Current Bid
                </span>

                <div className="flex items-center rounded-xl border border-slate-200 bg-white shadow-sm">
                  <span className="pl-3 text-sm text-slate-400">$</span>

                  <input
                    type="text"
                    inputMode="numeric"
                    value={formatNumberInput(valuationInput.currentBid)}
                    onChange={(event) =>
                      updateEvaluationField(
                        "currentBid",
                        toNumber(event.target.value),
                      )
                    }
                    className="min-w-0 flex-1 rounded-xl bg-transparent px-3 py-2 text-right text-sm font-semibold outline-none"
                  />
                </div>
              </label>

              <button
                type="button"
                onClick={async () => {
                  setComps([]);
                  setMarketCheckSearchMeta(null);
                  setMarketCheckApiUsage(null);
                  setMarketCheckStatus("");
                  setVinDecodeError("");
                  setVehicleThumbnailUrl("");
                  setVehicleThumbnailError("");

                  if (quickEvalMode === "manual") {
                    const manualOverride = {
                      year: String(manualVehicle.year || "").trim(),
                      make: manualVehicle.make.trim().toUpperCase(),
                      model: manualVehicle.model.trim(),
                      trim: manualVehicle.trim.trim(),
                      fuelType: null,
                    };

                    if (
                      !manualOverride.year ||
                      !manualOverride.make ||
                      !manualOverride.model
                    ) {
                      setMarketCheckStatus(
                        "Enter Year, Make, and Model before running the evaluation.",
                      );
                      return;
                    }

                    setDecodedVehicle(null);
                    setVin("");
                    setManualVehicle((previous) => ({
                      ...previous,
                      year: manualOverride.year,
                      make: manualOverride.make,
                      model: manualOverride.model,
                      trim: manualOverride.trim,
                    }));

                    setSavedEvaluationId(null);
                    setSaveStatus("");
                    setFinalTargetOverride(null);

                    void generateVehicleThumbnail({
                      year: manualOverride.year,
                      make: manualOverride.make,
                      model: manualOverride.model,
                      trim: manualOverride.trim,
                      bodyClass: manualVehicle.bodyClass,
                    });

                    await pullMarketCheckComps(manualOverride);
                    return;
                  }

                  const newlyDecodedVehicle = await decodeVinFromBasics();

                  if (!newlyDecodedVehicle) {
                    return;
                  }

                  void generateVehicleThumbnail({
                    year: newlyDecodedVehicle.year,
                    make: newlyDecodedVehicle.make,
                    model: newlyDecodedVehicle.model,
                    trim: newlyDecodedVehicle.trim,
                    bodyClass: newlyDecodedVehicle.bodyClass,
                  });

                  await pullMarketCheckComps(newlyDecodedVehicle);
                }}
                disabled={
                  vinDecodeLoading ||
                  marketCheckLoading ||
                  (quickEvalMode === "vin"
                    ? vin.trim().length < 17
                    : !hasManualQuickEvalBasics)
                }
                className="rounded-xl bg-blue-700 px-4 py-2.5 text-sm font-extrabold text-white shadow-sm hover:bg-blue-800 disabled:cursor-not-allowed disabled:bg-slate-400"
              >
                {vinDecodeLoading || marketCheckLoading
                  ? "Evaluating..."
                  : "▶ Run Evaluation"}
              </button>
            </div>

            {vinDecodeError ? (
              <div className="mt-3 text-xs font-semibold">
                <span className="rounded-full bg-red-50 px-3 py-1 text-red-700">
                  {vinDecodeError}
                </span>
              </div>
            ) : null}
          </section>

          <section className="grid gap-4 lg:grid-cols-[1.05fr_1.1fr_1fr]">
            <article className="rounded-[20px] border border-slate-200 bg-white p-5 shadow-[0_1px_3px_rgba(15,23,42,0.05),0_14px_34px_rgba(15,23,42,0.035)]">
              <div className="flex items-start justify-between gap-3">
                <h2 className="text-base font-black text-slate-950">
                  Vehicle Snapshot
                </h2>

                <button
                  type="button"
                  onClick={() => setVehicleDetailsOpen(true)}
                  className="rounded-lg border border-slate-200 px-3 py-1.5 text-xs font-extrabold text-slate-600 hover:bg-slate-50"
                >
                  Details
                </button>
              </div>

              <div className="mt-4 flex items-center gap-4">
                <div className="relative h-[76px] w-[116px] shrink-0 overflow-hidden rounded-xl border border-slate-200 bg-gradient-to-br from-slate-50 to-slate-100">
                  {representativeCompImage ? (
                    <>
                      <img
                        src={representativeCompImage}
                        alt={`Representative comp image of ${vehicleTitle}`}
                        className="h-full w-full object-cover"
                        referrerPolicy="no-referrer"
                        onError={(event) => {
                          event.currentTarget.style.display = "none";
                        }}
                      />

                      <div className="absolute inset-x-0 bottom-0 bg-slate-950/65 px-1.5 py-0.5 text-center text-[8px] font-bold text-white">
                        Representative comp
                      </div>
                    </>
                  ) : (
                    <div className="flex h-full items-center justify-center">
                      <div className="relative h-8 w-20">
                        <div className="absolute bottom-1 left-1 h-4 w-[72px] rounded-[45%_55%_20%_20%] border-2 border-slate-400 bg-slate-200" />
                        <div className="absolute bottom-0 left-3 h-3 w-3 rounded-full border-2 border-slate-500 bg-white" />
                        <div className="absolute bottom-0 right-3 h-3 w-3 rounded-full border-2 border-slate-500 bg-white" />
                      </div>
                    </div>
                  )}
                </div>

                <div className="min-w-0">
                  <div className="text-lg font-black leading-tight tracking-[-0.025em] text-blue-700">
                    {vehicleTitle}
                  </div>

                  <div className="mt-1 text-xs font-semibold text-slate-500">
                    {[simplifiedVehicleBodyClass, decodedVehicle?.fuelType]
                      .filter(Boolean)
                      .join(" • ") || "Vehicle details pending"}
                  </div>
                </div>
              </div>

              {comps.length > 0 && !representativeCompImage ? (
                <div className="mt-3 text-[10px] font-semibold text-slate-500">
                  No comp photo available
                </div>
              ) : null}

              <dl className="mt-5 space-y-2.5 text-sm">
                {[
                  ["VIN", vin || "Pending"],
                  [
                    "Mileage",
                    targetMileage
                      ? `${formatNumberInput(targetMileage)} mi`
                      : "Pending",
                  ],
                  ["Drivetrain", decodedVehicle?.driveType || "Pending"],
                  ["Body Style", simplifiedVehicleBodyClass || "Pending"],
                  ["Trim", vehicleTrim || "Pending"],
                  ["Source", auctionSite || "Pending"],
                ].map(([label, value]) => (
                  <div key={label} className="grid grid-cols-[105px_1fr] gap-3">
                    <dt className="font-semibold text-slate-500">{label}</dt>
                    <dd className="truncate text-right font-bold text-slate-900">
                      {value}
                    </dd>
                  </div>
                ))}
              </dl>
            </article>

            <article
              className={`rounded-[20px] border p-5 shadow-[0_1px_3px_rgba(15,23,42,0.05),0_14px_34px_rgba(15,23,42,0.035)] ${decisionBannerTone}`}
            >
              <div className="flex items-start justify-between gap-4">
                <div className="flex items-center gap-2">
                  <h2 className="text-base font-black text-slate-950">
                    Lot Logic Verdict
                  </h2>

                  <span className="grid h-4 w-4 place-items-center rounded-full bg-white/70 text-[10px] font-black text-slate-500">
                    i
                  </span>
                </div>

                <span
                  className={`inline-flex shrink-0 items-center rounded-full px-3 py-1.5 text-xs font-black ${decisionBadgeTone}`}
                >
                  ✓ {lotLogicLabel}
                </span>
              </div>

              <div className="mt-4 grid grid-cols-3 gap-3 border-t border-current/10 pt-4 text-center">
                <div>
                  <div className="text-[10px] font-black uppercase tracking-[0.1em] text-slate-500">
                    Max Smart Bid
                  </div>

                  <div
                    className={`mt-2 text-[25px] font-black tracking-[-0.04em] ${decisionTextTone}`}
                  >
                    {suggestedBidDisplay}
                  </div>
                </div>

                <div>
                  <div className="text-[10px] font-black uppercase tracking-[0.1em] text-slate-500">
                    Expected Sale
                  </div>

                  <div className="mt-2 text-[25px] font-black tracking-[-0.04em] text-slate-950">
                    {finalTargetUsed > 0 ? money(finalTargetUsed) : "Pending"}
                  </div>
                </div>

                <div>
                  <div className="text-[10px] font-black uppercase tracking-[0.1em] text-slate-500">
                    Profit at Current Bid
                  </div>

                  <div
                    className={`mt-2 text-[25px] font-black tracking-[-0.04em] ${
                      valuation.expectedGrossProfit >= 0
                        ? "text-slate-950"
                        : "text-red-700"
                    }`}
                  >
                    {money(valuation.expectedGrossProfit)}
                  </div>
                </div>
              </div>

              {currentBidPosition ? (
                <div
                  className={`mt-4 rounded-xl px-3 py-2 text-center text-xs font-extrabold ${
                    currentBidPosition.tone === "over"
                      ? "bg-red-100 text-red-700"
                      : currentBidPosition.tone === "under"
                        ? "bg-emerald-100 text-emerald-700"
                        : "bg-amber-100 text-amber-700"
                  }`}
                >
                  {currentBidPosition.text}
                </div>
              ) : null}

              <button
                type="button"
                onClick={saveEvaluation}
                disabled={saveLoading}
                className={`mt-5 w-full rounded-xl px-4 py-3 text-sm font-black text-white shadow-sm disabled:cursor-not-allowed disabled:bg-slate-400 ${
                  valuation.decision === "Pass"
                    ? "bg-red-700 hover:bg-red-800"
                    : valuation.decision === "Watch / Stretch Only"
                      ? "bg-amber-600 hover:bg-amber-700"
                      : "bg-emerald-700 hover:bg-emerald-800"
                }`}
              >
                {saveLoading
                  ? "Saving..."
                  : savedEvaluationId
                    ? "Update Evaluation"
                    : "▣ Save Evaluation"}
              </button>

              <button
                type="button"
                onClick={openConditionProfitability}
                className="mt-2 w-full rounded-xl border border-current/15 bg-white/75 px-4 py-2.5 text-sm font-extrabold text-slate-700 shadow-sm hover:bg-white"
              >
                Condition &amp; Profitability
              </button>

              <div className="mt-2 text-center text-[10px] font-semibold text-slate-500">
                Based on market data, condition, reconditioning, and risk.
              </div>

              {saveStatus ? (
                <div className="mt-2 text-center text-xs font-bold text-slate-600">
                  {saveStatus}
                </div>
              ) : null}
            </article>

            <article className="rounded-[20px] border border-slate-200 bg-white p-5 shadow-[0_1px_3px_rgba(15,23,42,0.05),0_14px_34px_rgba(15,23,42,0.035)]">
              <h2 className="text-base font-black text-slate-950">
                Market &amp; Fit Summary
              </h2>

              <dl className="mt-4 space-y-3 text-sm">
                <div className="flex justify-between gap-4">
                  <dt className="font-semibold text-slate-500">
                    Comp Confidence:
                  </dt>
                  <dd className="text-right font-black text-emerald-700">
                    {compConfidenceDisplay}
                  </dd>
                </div>

                <div className="flex justify-between gap-4">
                  <dt className="font-semibold text-slate-500">
                    Comp Average:
                  </dt>
                  <dd className="text-right font-black text-slate-950">
                    {comps.length
                      ? money(compSummary.averageAdjusted)
                      : "Pending"}
                  </dd>
                </div>

                <div className="flex justify-between gap-4">
                  <dt className="font-semibold text-slate-500">
                    Adj. Retail Value:
                  </dt>
                  <dd className="text-right font-black text-emerald-700">
                    {finalTargetUsed > 0 ? money(finalTargetUsed) : "Pending"}
                  </dd>
                </div>
              </dl>

              <div className="mt-5 grid grid-cols-2 gap-4 border-t border-slate-100 pt-5">
                <ScoreRing
                  label="Profitability Score"
                  score={profitabilityScoreDisplay}
                  tone="green"
                />

                <ScoreRing
                  label="Dealer-Fit Score"
                  score={dealerFitScoreDisplay}
                  tone="blue"
                />
              </div>

              <button
                type="button"
                onClick={() => setBidLogicOpen(true)}
                className="mx-auto mt-4 block text-xs font-extrabold text-blue-700 hover:text-blue-900"
              >
                View Scoring details →
              </button>
            </article>
          </section>

          <section className="mt-4 grid items-start gap-4 xl:grid-cols-[minmax(0,1.75fr)_minmax(330px,.85fr)]">
            <SectionCard
              title="Comparable Vehicles"
              action={
                <div className="flex items-center gap-2">
                  <span className="rounded-full bg-blue-50 px-3 py-1 text-xs font-black text-blue-700">
                    {compSummary.includedCount} Usable Comps
                  </span>

                  <button
                    type="button"
                    onClick={openMethodology}
                    className="rounded-lg border border-slate-200 px-3 py-1.5 text-xs font-extrabold text-slate-600 hover:bg-slate-50"
                  >
                    View Methodology
                  </button>
                </div>
              }
            >
              <MarketCompsTable
                comps={comps}
                targetMileage={targetMileage}
                assumptions={activeAssumptions}
                onToggleIncluded={toggleCompIncluded}
              />

              <div className="mt-4 grid gap-3 rounded-2xl bg-slate-50 p-3 text-center sm:grid-cols-5">
                {[
                  [
                    "Regions Searched",
                    marketCheckSearchMeta?.regionsChecked.length
                      ? String(marketCheckSearchMeta.regionsChecked.length)
                      : "—",
                  ],
                  [
                    "Usable Comps",
                    `${compSummary.includedCount} / ${comps.length}`,
                  ],
                  [
                    "Fallback Status",
                    marketCheckSearchMeta?.lowConfidenceFallback
                      ? "Applied"
                      : "None",
                  ],
                  [
                    "Live Lookup",
                    marketCheckApiControls.liveLookupEnabled
                      ? "Active"
                      : "Disabled",
                  ],
                  ["Market Timing", marketTimingSpeedSignal],
                ].map(([label, value]) => (
                  <div key={label}>
                    <div className="text-[9px] font-black uppercase tracking-[0.1em] text-slate-400">
                      {label}
                    </div>
                    <div className="mt-1 text-xs font-extrabold text-slate-800">
                      {value}
                    </div>
                  </div>
                ))}
              </div>

              {marketCheckSearchMeta?.regionsChecked.length ? (
                <div className="mt-3 text-xs font-medium text-slate-500">
                  <span className="font-bold text-slate-700">
                    Regions checked:
                  </span>{" "}
                  {marketCheckSearchMeta.regionsChecked.join(" → ")}
                </div>
              ) : null}

              <div className="mt-3 text-[10px] font-semibold leading-4 text-slate-400">
                Values are adjusted using the active mileage, market, and
                company-assumption rules. Toggle individual comps to include or
                exclude them from the valuation.
              </div>
            </SectionCard>

            <SectionCard
              title="AI Deal Thesis"
              action={
                <span className="rounded-full bg-slate-100 px-2.5 py-1 text-[10px] font-bold text-slate-500">
                  Uses current evaluator data only
                </span>
              }
            >
              <div className="grid grid-cols-2 gap-2">
                <button
                  type="button"
                  onClick={() => {
                    setActiveThesisMode("financial");
                    void generateAiSummary("financial");
                  }}
                  disabled={Boolean(aiSummaryLoadingMode)}
                  className={`rounded-xl px-3 py-2.5 text-sm font-black transition disabled:cursor-not-allowed disabled:opacity-60 ${
                    activeThesisMode === "financial"
                      ? "bg-blue-700 text-white"
                      : "bg-slate-100 text-slate-600 hover:bg-slate-200"
                  }`}
                >
                  {aiSummaryLoadingMode === "financial"
                    ? "Generating..."
                    : "Financial"}
                </button>

                <button
                  type="button"
                  onClick={() => {
                    setActiveThesisMode("enthusiast");
                    void generateAiSummary("enthusiast");
                  }}
                  disabled={Boolean(aiSummaryLoadingMode)}
                  className={`rounded-xl px-3 py-2.5 text-sm font-black transition disabled:cursor-not-allowed disabled:opacity-60 ${
                    activeThesisMode === "enthusiast"
                      ? "bg-slate-950 text-white"
                      : "bg-slate-100 text-slate-600 hover:bg-slate-200"
                  }`}
                >
                  {aiSummaryLoadingMode === "enthusiast"
                    ? "Generating..."
                    : "Enthusiast"}
                </button>
              </div>

              {aiSummaryError ? (
                <div className="mt-3 rounded-xl bg-red-50 px-3 py-2 text-xs font-bold text-red-700">
                  {aiSummaryError}
                </div>
              ) : null}

              <textarea
                value={notes}
                onChange={(event) => setNotes(event.target.value)}
                placeholder="Generate a financial or enthusiast thesis using the current evaluator data."
                className="mt-4 min-h-[265px] w-full resize-y rounded-2xl border border-slate-200 bg-slate-50/60 p-4 text-sm font-medium leading-6 text-slate-700 outline-none focus:border-blue-300 focus:bg-white"
              />

              <div className="mt-3 flex items-center justify-between text-[10px] font-semibold text-slate-400">
                <span>
                  {activeThesisMode === "financial"
                    ? "Financial thesis"
                    : "Enthusiast thesis"}
                </span>
                <span>{notes.trim().length} characters</span>
              </div>
            </SectionCard>
          </section>

          <div className="mt-4 flex justify-end">
            <button
              type="button"
              onClick={clearLocalDraft}
              className="rounded-xl border border-slate-200 bg-white px-4 py-2 text-xs font-bold text-slate-500 hover:bg-slate-50 hover:text-red-600"
            >
              Clear Draft
            </button>
          </div>
        </div>
      </div>
    </main>
  );
}
