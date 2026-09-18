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
import { buildExpansionMarkets } from "@/lib/marketcheck/metro-expansion";
import { calculateCompSummary } from "@/lib/comps";
import { defaultAssumptions } from "@/lib/assumptions";
import { calculateDealerFit } from "@/lib/dealer-fit";
import { findPrimaryMindfulIntelligenceMatch } from "@/lib/mindful-intelligence";
import { calculateDealEconomicsScore, calculateValuation } from "@/lib/valuation";
import type { MarketComp } from "@/types/comps";
import type { VinDecodeResult } from "@/types/vin";
import type { EvaluationCosts, ValuationInput } from "@/types/evaluation";
import type {
  ConditionAnalysis,
  ConditionAnalysisIssue,
} from "@/lib/ai/condition-analysis-types";

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
  isEmpty = false,
}: {
  label: string;
  score: number;
  tone: "green" | "blue";
  isEmpty?: boolean;
}) {
  const normalizedScore = Math.max(0, Math.min(100, score));

  const ringColor = isEmpty
    ? "#cbd5e1"
    : normalizedScore < 40
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
          background: isEmpty
            ? "#e2e8f0"
            : `conic-gradient(${ringColor} ${
                normalizedScore * 3.6
              }deg, #e2e8f0 0deg)`,
        }}
      >
        <div className="grid h-[70px] w-[70px] place-items-center rounded-full bg-white shadow-inner">
          <div>
            <div className={`text-[25px] font-black leading-none tracking-[-0.04em] ${
              isEmpty ? "text-slate-400" : "text-slate-950"
            }`}>
              {isEmpty ? "—" : normalizedScore}
            </div>

            {!isEmpty ? (
              <div className="mt-1 text-[10px] font-bold text-slate-400">
                /100
              </div>
            ) : null}
          </div>
        </div>
      </div>

      {isEmpty ? (
        <div className="mt-2 text-[10px] font-bold text-slate-400">
          Not calculated
        </div>
      ) : null}
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
  conditionSourceText?: string;
  conditionAnalysis?: ConditionAnalysis | null;
  originalConditionAnalysis?: ConditionAnalysis | null;
  conditionPlanningEstimateOverride?: number | null;
  conditionReadyDaysLowOverride?: number | null;
  conditionReadyDaysHighOverride?: number | null;
  conditionAnalysisApplied?: boolean;
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
    searchedZips: string[];
    searchStage: "initial" | "expanded" | "metro";
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
  const compSectionRef = useRef<HTMLElement | null>(null);
  const [quickEvalOpen, setQuickEvalOpen] = useState(false);
  const [quickEvalMode, setQuickEvalMode] = useState<"vin" | "manual">("vin");
  const [vehicleDetailsOpen, setVehicleDetailsOpen] = useState(false);
  const [vehicleThumbnailUrl, setVehicleThumbnailUrl] = useState("");
  const [vehicleThumbnailLoading, setVehicleThumbnailLoading] = useState(false);
  const [vehicleThumbnailError, setVehicleThumbnailError] = useState("");
  const [bidLogicOpen, setBidLogicOpen] = useState(false);
  const [compMarketEditorOpen, setCompMarketEditorOpen] = useState(false);
  const [compEditorTab, setCompEditorTab] = useState<"geography" | "vehicle">("geography");
  const [selectedCompMarketZips, setSelectedCompMarketZips] = useState<string[]>([]);
  const [compSuggestionCount, setCompSuggestionCount] = useState(3);
  const [customCompZip, setCustomCompZip] = useState("");
  const [customCompMarkets, setCustomCompMarkets] = useState<Array<{ market: string; zip: string }>>([]);
  const [compTrimRelaxed, setCompTrimRelaxed] = useState(false);
  const [dealerProfileOpen, setDealerProfileOpen] = useState(false);
  const [conditionProfitabilityOpen, setConditionProfitabilityOpen] =
    useState(false);
  const [conditionModalTab, setConditionModalTab] = useState<"ai" | "manual">(
    "ai",
  );
  const [conditionSourceText, setConditionSourceText] = useState(
    initialSavedPayload?.conditionSourceText || "",
  );
  const [conditionAnalysis, setConditionAnalysis] =
    useState<ConditionAnalysis | null>(
      initialSavedPayload?.conditionAnalysis || null,
    );
  const [originalConditionAnalysis, setOriginalConditionAnalysis] =
    useState<ConditionAnalysis | null>(
      initialSavedPayload?.originalConditionAnalysis ||
        initialSavedPayload?.conditionAnalysis ||
        null,
    );
  const [
    conditionPlanningEstimateOverride,
    setConditionPlanningEstimateOverride,
  ] = useState<number | null>(
    typeof initialSavedPayload?.conditionPlanningEstimateOverride === "number"
      ? initialSavedPayload.conditionPlanningEstimateOverride
      : null,
  );
  const [conditionReadyDaysLowOverride, setConditionReadyDaysLowOverride] =
    useState<number | null>(
      typeof initialSavedPayload?.conditionReadyDaysLowOverride === "number"
        ? initialSavedPayload.conditionReadyDaysLowOverride
        : null,
    );
  const [conditionReadyDaysHighOverride, setConditionReadyDaysHighOverride] =
    useState<number | null>(
      typeof initialSavedPayload?.conditionReadyDaysHighOverride === "number"
        ? initialSavedPayload.conditionReadyDaysHighOverride
        : null,
    );
  const [conditionReconOverrideEditing, setConditionReconOverrideEditing] = useState(false);
  const [conditionAnalysisLoading, setConditionAnalysisLoading] =
    useState(false);
  const [conditionAnalysisError, setConditionAnalysisError] = useState("");
  const [conditionAnalysisApplied, setConditionAnalysisApplied] = useState(
    Boolean(initialSavedPayload?.conditionAnalysisApplied),
  );
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
  const [activeMindfulIntelligenceTab, setActiveMindfulIntelligenceTab] =
    useState<"verdict" | "thesis" | "checks">("verdict");
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

      if (typeof draft.conditionSourceText === "string") {
        setConditionSourceText(draft.conditionSourceText);
      }

      if (draft.conditionAnalysis) {
        setConditionAnalysis(draft.conditionAnalysis);
      }

      if (draft.originalConditionAnalysis) {
        setOriginalConditionAnalysis(draft.originalConditionAnalysis);
      } else if (draft.conditionAnalysis) {
        setOriginalConditionAnalysis(draft.conditionAnalysis);
      }

      if (
        typeof draft.conditionPlanningEstimateOverride === "number" ||
        draft.conditionPlanningEstimateOverride === null
      ) {
        setConditionPlanningEstimateOverride(
          draft.conditionPlanningEstimateOverride,
        );
      }

      if (
        typeof draft.conditionReadyDaysLowOverride === "number" ||
        draft.conditionReadyDaysLowOverride === null
      ) {
        setConditionReadyDaysLowOverride(draft.conditionReadyDaysLowOverride);
      }

      if (
        typeof draft.conditionReadyDaysHighOverride === "number" ||
        draft.conditionReadyDaysHighOverride === null
      ) {
        setConditionReadyDaysHighOverride(draft.conditionReadyDaysHighOverride);
      }

      if (typeof draft.conditionAnalysisApplied === "boolean") {
        setConditionAnalysisApplied(draft.conditionAnalysisApplied);
      }

      if (typeof draft.notes === "string") {
        setNotes(draft.notes);
      }

      setMarketCheckStatus(draft.marketCheckStatus || "");
      setMarketCheckSearchMeta(
        draft.marketCheckSearchMeta
          ? {
              ...draft.marketCheckSearchMeta,
              searchedZips: draft.marketCheckSearchMeta.searchedZips || [],
              searchStage: draft.marketCheckSearchMeta.searchStage || "initial",
            }
          : null,
      );
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
          conditionSourceText,
          conditionAnalysis,
          originalConditionAnalysis,
          conditionPlanningEstimateOverride,
          conditionReadyDaysLowOverride,
          conditionReadyDaysHighOverride,
          conditionAnalysisApplied,
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
    conditionSourceText,
    conditionAnalysis,
    originalConditionAnalysis,
    conditionPlanningEstimateOverride,
    conditionReadyDaysLowOverride,
    conditionReadyDaysHighOverride,
    conditionAnalysisApplied,
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
    const baseMechanicalReserve = conditionAssessmentsTouched
      ? conditionAssessments.mechanical.reserve
      : 0;
    const baseCosmeticReserve = conditionAssessmentsTouched
      ? conditionAssessments.cosmetic.reserve
      : 0;
    const baseHistoryReserve = conditionAssessmentsTouched
      ? conditionAssessments.history.reserve
      : 0;
    const baseConditionReserveTotal =
      baseMechanicalReserve + baseCosmeticReserve + baseHistoryReserve;

    const hasUserReconOverride =
      typeof conditionPlanningEstimateOverride === "number" &&
      Number.isFinite(conditionPlanningEstimateOverride);
    const effectiveConditionReserveTotal = hasUserReconOverride
      ? Math.max(0, conditionPlanningEstimateOverride)
      : baseConditionReserveTotal;
    const reserveScale =
      baseConditionReserveTotal > 0
        ? effectiveConditionReserveTotal / baseConditionReserveTotal
        : 0;

    const mechanicalReserve =
      baseConditionReserveTotal > 0
        ? Math.round(baseMechanicalReserve * reserveScale)
        : effectiveConditionReserveTotal;
    const historyReserve =
      baseConditionReserveTotal > 0
        ? Math.round(baseHistoryReserve * reserveScale)
        : 0;
    const cosmeticReserve = Math.max(
      0,
      effectiveConditionReserveTotal - mechanicalReserve - historyReserve,
    );

    return {
      ...evaluation,
      targetResaleUsed: finalTargetUsed,
      totalRiskPoints: conditionTotals.riskPoints,
      hasAvoidFlag: Boolean(evaluation.hasAvoidFlag),
      costs: {
        ...evaluation.costs,

        // Fixed detailing and ordinary sale preparation remain separate.
        detailAdmin: evaluation.costs.detailAdmin,

        // A user-entered total recon override is authoritative immediately.
        // Preserve the AI category mix proportionally so downstream risk context
        // remains intact while the total economics use the user's reserve.
        recon: mechanicalReserve,
        conditionRiskAdd: cosmeticReserve,
        titleHistoryRiskAdd: historyReserve,
      },
    };
  }, [
    evaluation,
    finalTargetUsed,
    conditionTotals,
    conditionAssessments,
    conditionAssessmentsTouched,
    conditionPlanningEstimateOverride,
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
      // The user's selected desired profit is authoritative.
      // Vehicle profiles must not silently increase it.
      targetProfit: previous.targetProfit,
      costs: {
        ...previous.costs,

        // Baseline acquisition and sale-preparation costs.
        auctionFee: costDefault.auctionFee,
        transport: costDefault.transport,
        detailAdmin: costDefault.detailAdmin,

        // Do not create speculative repair costs from a vehicle profile.
        // Reconditioning costs must come from actual AI/manual condition issues.
        recon: 0,

        // Small transparent contingency for incidental undisclosed needs.
        generalRiskReserve: 500,

        // These remain zero unless supported by an actual identified issue.
        brandRiskAdd: 0,
        titleHistoryRiskAdd: 0,
        conditionRiskAdd: 0,
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

      const responseText = await response.text();
      const contentType = response.headers.get("content-type") || "";

      if (!contentType.includes("application/json")) {
        if (response.redirected || response.url.includes("/login")) {
          throw new Error(
            "Your session has expired or this development URL requires a new login.",
          );
        }

        throw new Error(
          `VIN decode returned an unexpected ${response.status} response.`,
        );
      }

      const data = JSON.parse(responseText);

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
      targetProfit: valuation.desiredProfitTarget,
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

          mindfulIntelligenceMatched: Boolean(mindfulIntelligencePreview),
          mindfulIntelligenceTitle: mindfulIntelligencePreview?.title || null,
          mindfulIntelligenceMatchLevel:
            mindfulIntelligencePreview?.matchLevel || null,
          mindfulIntelligenceConfidence:
            mindfulIntelligencePreview?.confidence || null,
          mindfulIntelligenceVerdict:
            mindfulIntelligencePreview?.verdict || null,
          mindfulIntelligenceRationale:
            mindfulIntelligencePreview?.rationale || null,
          mindfulIntelligenceOpportunityTypes:
            mindfulIntelligencePreview?.opportunityTypes || [],
          mindfulIntelligenceStrengths:
            mindfulIntelligencePreview?.strengths || [],
          mindfulIntelligenceLimitations:
            mindfulIntelligencePreview?.limitations || [],
          mindfulIntelligenceKnownIssues:
            mindfulIntelligencePreview?.knownIssues || [],
          mindfulIntelligenceVerificationItems:
            mindfulIntelligencePreview?.verificationItems || [],
          mindfulIntelligenceSourceSection:
            mindfulIntelligencePreview?.source.sectionTitle || null,

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
    options?: {
      searchStage?: "initial" | "expanded" | "metro";
      regions?: Array<{
        market: string;
        zip: string;
        order: number;
        enabled: boolean;
      }>;
      mergeResults?: boolean;
      maxApiCallsPerSearch?: number;
    },
  ) {
    if (marketCheckInFlightRef.current || marketCheckLoading) {
      setMarketCheckStatus("MarketCheck search already in progress.");
      return;
    }

    const year = vehicleOverride?.year || vehicleYear;
    const make = vehicleOverride?.make || vehicleMake;
    const model = vehicleOverride?.model || vehicleModel;
    const trim =
      vehicleOverride && Object.prototype.hasOwnProperty.call(vehicleOverride, "trim")
        ? String(vehicleOverride.trim || "")
        : vehicleTrim;
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

    // Initial searches replace the prior vehicle's MarketCheck state.
    // Expansion searches preserve existing comps and merge new geography.
    if (!options?.mergeResults) {
      setComps([]);
      setMarketCheckSearchMeta(null);
      setMarketCheckApiUsage(null);
    }

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
          regions:
            options?.regions ||
            activeAssumptions.regionalMarkets
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
          // Pull the full standard MarketCheck candidate pool per region before
      // spending another API call. Lot Logic still qualifies/ranks strictly.
      rows: 50,
          liveLookupEnabled: marketCheckApiControls.liveLookupEnabled,
          maxApiCallsPerSearch:
            options?.maxApiCallsPerSearch ??
            (options?.searchStage === "expanded" ||
            options?.searchStage === "metro"
              ? 3
              : marketCheckApiControls.maxApiCallsPerSearch),
          minUsableCompsToStop: marketCheckApiControls.minUsableCompsToStop,
          minInitialRegions:
            options?.searchStage === "expanded" ||
            options?.searchStage === "metro"
              ? 3
              : marketCheckApiControls.minInitialRegions,
        }),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || "MarketCheck search failed.");
      }

      if (!data.comps || data.comps.length === 0) {
        if (!options?.mergeResults) {
          setComps([]);
        }

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

        const previousRegionsChecked = options?.mergeResults
          ? marketCheckSearchMeta?.regionsChecked || []
          : [];
        const previousSearchedZips = options?.mergeResults
          ? marketCheckSearchMeta?.searchedZips || []
          : [];

        setMarketCheckSearchMeta({
          loadedCount: options?.mergeResults ? comps.length : 0,
          regionsChecked: Array.from(
            new Set([
              ...previousRegionsChecked,
              ...(data.search?.regionsChecked || []),
            ]),
          ),
          searchedZips: Array.from(
            new Set([
              ...previousSearchedZips,
              ...(data.search?.searchedZips || []),
            ]),
          ),
          searchStage: options?.searchStage || "initial",
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

      const mergedComps = options?.mergeResults
        ? [
            ...comps,
            ...normalizedComps.filter(
              (newComp: MarketComp) =>
                !comps.some((existingComp) => existingComp.id === newComp.id),
            ),
          ]
        : normalizedComps;

      setComps(mergedComps);
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

      const previousRegionsChecked = options?.mergeResults
        ? marketCheckSearchMeta?.regionsChecked || []
        : [];
      const previousSearchedZips = options?.mergeResults
        ? marketCheckSearchMeta?.searchedZips || []
        : [];

      const combinedRegionsChecked = Array.from(
        new Set([
          ...previousRegionsChecked,
          ...(data.search?.regionsChecked || []),
        ]),
      );
      const combinedSearchedZips = Array.from(
        new Set([
          ...previousSearchedZips,
          ...(data.search?.searchedZips || []),
        ]),
      );

      setMarketCheckSearchMeta({
        loadedCount: mergedComps.length,
        regionsChecked: combinedRegionsChecked,
        searchedZips: combinedSearchedZips,
        searchStage: options?.searchStage || "initial",
        lowConfidenceFallback: Boolean(data.lowConfidenceFallback),
        minimumQualityScore: data.minimumQualityScore,
      });

      setMarketCheckStatus(
        `${mergedComps.length} comps loaded${
          combinedRegionsChecked.length
            ? ` · ${combinedRegionsChecked.length} regions checked`
            : ""
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

  function getCompExpansionMarkets() {
    return buildExpansionMarkets(
      activeAssumptions.regionalMarkets,
      marketCheckSearchMeta?.searchedZips || [],
      marketCheckSearchMeta?.regionsChecked || [],
    );
  }

  function openCompMarketEditor() {
    const searched = new Set(marketCheckSearchMeta?.searchedZips || []);
    const suggested = getCompExpansionMarkets()
      .filter((market) => !searched.has(market.zip))
      .slice(0, 3)
      .map((market) => market.zip);

    setCompSuggestionCount(3);
    setCompEditorTab("geography");
    setSelectedCompMarketZips(suggested);
    setCustomCompZip("");
    setCompMarketEditorOpen(true);
  }

  function suggestMoreCompMarkets() {
    const searched = new Set(marketCheckSearchMeta?.searchedZips || []);
    const available = getCompExpansionMarkets()
      .filter((market) => !searched.has(market.zip));
    const nextCount = Math.min(available.length, compSuggestionCount + 3);
    const nextSuggested = available.slice(0, nextCount).map((market) => market.zip);
    setCompSuggestionCount(nextCount);
    setSelectedCompMarketZips((current) => Array.from(new Set([...current, ...nextSuggested])));
  }

  function addCustomCompZip() {
    const zip = customCompZip.trim();
    if (!/^\d{5}$/.test(zip)) {
      setMarketCheckStatus("Enter a valid 5-digit ZIP code.");
      return;
    }
    if ((marketCheckSearchMeta?.searchedZips || []).includes(zip)) {
      setMarketCheckStatus(`${zip} has already been searched.`);
      return;
    }
    setCustomCompMarkets((current) =>
      current.some((market) => market.zip === zip)
        ? current
        : [...current, { market: `Custom market ${zip}`, zip }],
    );
    setSelectedCompMarketZips((current) => Array.from(new Set([...current, zip])));
    setCustomCompZip("");
  }

  async function searchSelectedCompMarkets() {
    const searched = new Set(marketCheckSearchMeta?.searchedZips || []);
    const configuredRegions = getCompExpansionMarkets()
      .filter(
        (market) =>
          selectedCompMarketZips.includes(market.zip) &&
          !searched.has(market.zip),
      )
      .sort((a, b) => a.order - b.order)
      .map((market) => ({
        market: market.market,
        zip: market.zip,
        order: market.order,
        enabled: true,
      }));

    const customRegions = customCompMarkets
      .filter(
        (market) =>
          selectedCompMarketZips.includes(market.zip) &&
          !searched.has(market.zip),
      )
      .map((market, index) => ({
        ...market,
        order: configuredRegions.length + index + 1,
        enabled: true,
      }));

    const regions = [...configuredRegions, ...customRegions];

    if (!regions.length) {
      setMarketCheckStatus('Choose at least one new market to search.');
      return;
    }

    setCompMarketEditorOpen(false);
    await pullMarketCheckComps(null, {
      searchStage: 'expanded',
      regions,
      mergeResults: true,
    });
  }

  function getPreviouslySearchedCompRegions() {
    const labels = marketCheckSearchMeta?.regionsChecked || [];
    const searchedZips = marketCheckSearchMeta?.searchedZips || [];

    return searchedZips.map((zip, index) => {
      const label = labels[index] || "";
      const match = label.match(/^(.*)\s+\((\d{5})\)$/);
      return {
        market: match?.[1]?.trim() || `Previously searched market ${index + 1}`,
        zip,
        order: index + 1,
        enabled: true,
      };
    });
  }

  async function broadenCompVehicleMatch() {
    if (!vehicleMake || !vehicleModel || !vehicleTrim) {
      setMarketCheckStatus("There is no trim-level specificity to relax for this vehicle.");
      return;
    }

    // When the user deliberately relaxes trim, rerun the geography they actually
    // searched — including generated and custom markets — rather than falling
    // back to the original configured-region list.
    const regions = getPreviouslySearchedCompRegions();

    setCompTrimRelaxed(true);
    setMarketCheckStatus(`Broadening the vehicle match from ${vehicleMake} ${vehicleModel} ${vehicleTrim} to ${vehicleMake} ${vehicleModel}.`);

    await pullMarketCheckComps(
      {
        year: String(vehicleYear || ""),
        make: vehicleMake,
        model: vehicleModel,
        trim: "",
        fuelType: decodedVehicle?.fuelType || null,
      },
      {
        searchStage: "expanded",
        regions: regions.length ? regions : undefined,
        mergeResults: false,
        maxApiCallsPerSearch: Math.min(10, Math.max(3, regions.length)),
      },
    );
  }

  async function expandMarketCheckSearch() {
    const searchedZips = new Set(marketCheckSearchMeta?.searchedZips || []);

    const nextRegions = activeAssumptions.regionalMarkets
      .filter((market) => market.enabled)
      .map((market, index) => ({
        market: market.market,
        zip: market.zip,
        order:
          typeof market.order === "number" && Number.isFinite(market.order)
            ? market.order
            : index + 1,
        enabled: market.enabled,
      }))
      .sort((a, b) => a.order - b.order)
      .filter((market) => !searchedZips.has(market.zip))
      .slice(0, 3);

    if (nextRegions.length === 0) {
      setMarketCheckStatus(
        "Nearby configured markets have been searched. Major reference markets are available as the final expansion step.",
      );
      return;
    }

    await pullMarketCheckComps(null, {
      searchStage: "expanded",
      regions: nextRegions,
      mergeResults: true,
    });
  }

  async function searchMajorMetropolitanAreas() {
    const searchedZips = new Set(marketCheckSearchMeta?.searchedZips || []);

    const metroRegions = [
      {
        market: "Los Angeles",
        zip: "90012",
        order: 1,
        enabled: true,
      },
      {
        market: "Miami",
        zip: "33130",
        order: 2,
        enabled: true,
      },
      {
        market: "Atlanta",
        zip: "30303",
        order: 3,
        enabled: true,
      },
    ].filter((market) => !searchedZips.has(market.zip));

    if (metroRegions.length === 0) {
      setMarketCheckStatus(
        "Major reference markets have already been searched for this vehicle.",
      );
      return;
    }

    await pullMarketCheckComps(null, {
      searchStage: "metro",
      regions: metroRegions,
      mergeResults: true,
    });
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

  function openConditionAnalysis() {
    if (!conditionAssessmentsTouched) {
      setConditionAssessments(initialConditionAssessments);
    }

    setConditionModalTab("ai");
    setConditionAnalysisError("");
    setConditionProfitabilityOpen(true);
  }

  function getEffectiveConditionPlanningEstimate() {
    if (!conditionAnalysis) {
      return 0;
    }

    return (
      conditionPlanningEstimateOverride ?? conditionAnalysis.planningEstimate
    );
  }

  function getEffectiveConditionReadyDaysLow() {
    if (!conditionAnalysis) {
      return 0;
    }

    return (
      conditionReadyDaysLowOverride ?? conditionAnalysis.estimatedReadyDaysLow
    );
  }

  function getEffectiveConditionReadyDaysHigh() {
    if (!conditionAnalysis) {
      return 0;
    }

    const low = getEffectiveConditionReadyDaysLow();
    const requestedHigh =
      conditionReadyDaysHighOverride ??
      conditionAnalysis.estimatedReadyDaysHigh;

    return Math.max(low, requestedHigh);
  }

  function resetConditionEstimateOverrides() {
    setConditionPlanningEstimateOverride(null);
    setConditionReadyDaysLowOverride(null);
    setConditionReadyDaysHighOverride(null);
    setConditionAnalysisApplied(false);
  }

  function recalculateConditionAnalysis(
    analysis: ConditionAnalysis,
    issues: ConditionAnalysisIssue[],
  ): ConditionAnalysis {
    const includedIssues = issues.filter((issue) => issue.includeInValuation);

    return {
      ...analysis,
      issues,
      estimatedCostLow: includedIssues.reduce(
        (sum, issue) => sum + issue.estimatedCostLow,
        0,
      ),
      estimatedCostHigh: includedIssues.reduce(
        (sum, issue) => sum + issue.estimatedCostHigh,
        0,
      ),
      planningEstimate: includedIssues.reduce(
        (sum, issue) => sum + issue.planningEstimate,
        0,
      ),
    };
  }

  function toggleConditionAnalysisIssue(issueId: string) {
    setConditionAnalysis((previous) => {
      if (!previous) {
        return previous;
      }

      const issues = previous.issues.map((issue) =>
        issue.id === issueId
          ? {
              ...issue,
              includeInValuation: !issue.includeInValuation,
            }
          : issue,
      );

      return recalculateConditionAnalysis(previous, issues);
    });

    setConditionAnalysisApplied(false);
  }

  async function analyzeConditionInformation() {
    const rawIssueText = conditionSourceText.trim();

    if (!rawIssueText) {
      setConditionAnalysisError(
        "Paste auction announcements, seller disclosures, or condition notes first.",
      );
      return;
    }

    setConditionAnalysisLoading(true);
    setConditionAnalysisError("");
    setConditionAnalysisApplied(false);

    try {
      const response = await fetch("/api/evaluations/condition-analysis", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          vehicle: {
            year: vehicleYear || null,
            make: vehicleMake || null,
            model: vehicleModel || null,
            trim: vehicleTrim || null,
            mileage: targetMileage || null,
            vin: vin || null,
            location: null,
          },
          auctionSite,
          sourceType: "auction_or_seller_condition_text",
          rawIssueText,
        }),
      });

      const data = (await response.json()) as {
        analysis?: ConditionAnalysis;
        error?: string;
      };

      if (!response.ok || !data.analysis) {
        throw new Error(data.error || "Condition analysis failed.");
      }

      setConditionAnalysis(data.analysis);
      setOriginalConditionAnalysis(
        JSON.parse(JSON.stringify(data.analysis)) as ConditionAnalysis,
      );
      setConditionPlanningEstimateOverride(null);
      setConditionReadyDaysLowOverride(null);
      setConditionReadyDaysHighOverride(null);
    } catch (error) {
      setConditionAnalysisError(
        error instanceof Error ? error.message : "Condition analysis failed.",
      );
    } finally {
      setConditionAnalysisLoading(false);
    }
  }

  function applyConditionAnalysis() {
    if (!conditionAnalysis) {
      return;
    }

    const includedIssues = conditionAnalysis.issues.filter(
      (issue) => issue.includeInValuation,
    );

    const baseMechanicalReserve = includedIssues
      .filter((issue) => issue.category === "mechanical")
      .reduce((sum, issue) => sum + issue.planningEstimate, 0);

    const baseCosmeticReserve = includedIssues
      .filter(
        (issue) =>
          issue.category === "cosmetic" ||
          issue.category === "wear" ||
          issue.category === "transportation" ||
          issue.category === "other",
      )
      .reduce((sum, issue) => sum + issue.planningEstimate, 0);

    const baseHistoryReserve = includedIssues
      .filter(
        (issue) =>
          issue.category === "history" ||
          issue.category === "structural" ||
          issue.category === "title",
      )
      .reduce((sum, issue) => sum + issue.planningEstimate, 0);

    const basePlanningTotal =
      baseMechanicalReserve + baseCosmeticReserve + baseHistoryReserve;

    const effectivePlanningEstimate = Math.max(
      0,
      getEffectiveConditionPlanningEstimate(),
    );

    const scale =
      basePlanningTotal > 0 ? effectivePlanningEstimate / basePlanningTotal : 0;

    const mechanicalReserve =
      basePlanningTotal > 0 ? Math.round(baseMechanicalReserve * scale) : 0;

    const historyReserve =
      basePlanningTotal > 0 ? Math.round(baseHistoryReserve * scale) : 0;

    const cosmeticReserve =
      basePlanningTotal > 0
        ? Math.max(
            0,
            effectivePlanningEstimate - mechanicalReserve - historyReserve,
          )
        : effectivePlanningEstimate;

    setConditionAssessments({
      mechanical: assessmentFromReserve("mechanical", mechanicalReserve),
      cosmetic: assessmentFromReserve("cosmetic", cosmeticReserve),
      history: assessmentFromReserve("history", historyReserve),
    });

    setConditionAssessmentsTouched(true);
    setConditionAnalysisApplied(true);
  }

  function openConditionProfitability() {
    if (!conditionAssessmentsTouched) {
      setConditionAssessments(initialConditionAssessments);
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
          conditionSourceText,
          conditionAnalysis,
          originalConditionAnalysis,
          conditionPlanningEstimateOverride,
          conditionReadyDaysLowOverride,
          conditionReadyDaysHighOverride,
          conditionAnalysisApplied,
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

  function resetPreviousEvaluationResults() {
    // Prevent stale search state from carrying into another vehicle.
    marketCheckInFlightRef.current = false;

    setComps(initialComps);
    setMarketCheckStatus("");
    setMarketCheckSearchMeta(null);
    setMarketCheckApiUsage(null);
    setMarketCheckLoading(false);

    setSelectedConditions(initialSelectedConditions);
    setConditionAssessments(initialConditionAssessments);
    setConditionAssessmentsTouched(false);

    setConditionProfitabilityOpen(false);
    setConditionModalTab("ai");
    setConditionSourceText("");
    setConditionAnalysis(null);
    setOriginalConditionAnalysis(null);
    setConditionPlanningEstimateOverride(null);
    setConditionReadyDaysLowOverride(null);
    setConditionReadyDaysHighOverride(null);
    setConditionAnalysisError("");
    setConditionAnalysisLoading(false);
    setConditionAnalysisApplied(false);

    setNotes("");
    setAiSummaryLoadingMode(null);
    setAiSummaryError("");
    setActiveThesisMode("financial");
    setActiveMindfulIntelligenceTab("verdict");

    setVehicleThumbnailUrl("");
    setVehicleThumbnailError("");
    setVehicleThumbnailLoading(false);
    setVinDecodeError("");
    setVinDecodeLoading(false);

    setVehicleDetailsOpen(false);
    setBidLogicOpen(false);
    setMethodologyOpen(false);
    setMethodologySaving(false);
    setMethodologyStatus("");

    setAppliedVehicleProfile(null);
    setFinalTargetOverride(null);

    setSavedEvaluationId(null);
    setSaveStatus("");
    setSaveLoading(false);

    // Reset calculated valuation data while retaining inputs entered for
    // the vehicle that is about to be evaluated.
    setEvaluation((previous) => ({
      ...initialEvaluation,
      currentBid: previous.currentBid,
      targetProfit: previous.targetProfit,
      targetResaleUsed: 0,
      costs: {
        ...initialEvaluation.costs,
      },
    }));
  }

  function clearLocalDraft() {
    try {
      window.localStorage.removeItem(draftStorageKey);
    } catch (error) {
      console.error("Failed to clear local evaluator draft:", error);
    }

    resetPreviousEvaluationResults();

    setVin("");
    setAuctionSite("ACV Auctions");
    setDecodedVehicle(null);
    setManualVehicle(initialManualVehicle);
    setTargetMileage(initialTargetMileage);
    setEvaluation(initialEvaluation);
    setQuickEvalMode("vin");
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

  const hasEvaluationData = Boolean(
    (vehicleYear && vehicleMake && vehicleModel) ||
    valuationInput.currentBid > 0 ||
    comps.length > 0,
  );

  const suggestedBid =
    "safeBid" in valuation && typeof valuation.safeBid === "number"
      ? valuation.safeBid
      : valuation.maxSmartBid;

  const profitabilityScore = calculateDealEconomicsScore(
    valuation.expectedGrossProfit,
    valuation.allInCost,
  );

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
          targetProfit: valuation.desiredProfitTarget,
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

  const mindfulIntelligencePreview = useMemo(
    () =>
      findPrimaryMindfulIntelligenceMatch(
        {
          year: vehicleYear,
          make: vehicleMake,
          model: vehicleModel,
          trim: vehicleTrim,
          generation: dealerFitResult.generation,
          chassisCode: dealerFitResult.generation,
          engine: null,
          transmission: null,
          drivetrain: decodedVehicle?.driveType || null,
          bodyStyle: simplifiedVehicleBodyClass || vehicleBodyClass,
          fuelType: decodedVehicle?.fuelType || null,
          notes: notes || null,
        },
        {
          includeDrafts: true,
        },
      ),
    [
      vehicleYear,
      vehicleMake,
      vehicleModel,
      vehicleTrim,
      dealerFitResult.generation,
      decodedVehicle?.driveType,
      decodedVehicle?.fuelType,
      simplifiedVehicleBodyClass,
      vehicleBodyClass,
      notes,
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

  const mindfulIntelligenceDisplay = mindfulIntelligencePreview || {
    title: vehicleTitle || "Current vehicle",
    verdict:
      dealerFitResult.score >= 75
        ? "strong_fit"
        : dealerFitResult.score >= 55
          ? "conditional_fit"
          : "limited_fit",
    confidence: dealerFitResult.reasons.length >= 2 ? "medium" : "low",
    matchLevel: "general",
    rationale:
      dealerFitReason ||
      "This vehicle does not yet have a dedicated Mindful Intelligence profile, so the current read is based on its broader category, market position, and dealer-fit characteristics.",
    opportunityTypes: [],
    strengths: dealerFitResult.reasons,
    limitations: dealerFitResult.cautions,
    knownIssues: [],
    verificationItems: Array.from(
      new Set([...dealerFitResult.cautions, ...selectedConditions]),
    ),
    source: {
      sectionTitle: "Lot Logic evaluator and dealer-fit rules",
    },
  };

  const mindfulRecommendation =
    mindfulIntelligenceDisplay.verdict === "strong_fit"
      ? "PURSUE"
      : mindfulIntelligenceDisplay.verdict === "conditional_fit"
        ? "SELECTIVE"
        : "AVOID";

  const mindfulRecommendationTone =
    mindfulRecommendation === "PURSUE"
      ? "border-emerald-200 bg-emerald-50 text-emerald-700"
      : mindfulRecommendation === "SELECTIVE"
        ? "border-amber-200 bg-amber-50 text-amber-700"
        : "border-red-200 bg-red-50 text-red-700";

  const mindfulRecommendationLead =
    mindfulRecommendation === "PURSUE"
      ? "Worth pursuing."
      : mindfulRecommendation === "SELECTIVE"
        ? "Proceed selectively."
        : "Pass on this one.";

  const mindfulRationaleNormalized =
    mindfulIntelligenceDisplay.rationale.trim().toLowerCase();

  const mindfulPositiveEvidence = mindfulIntelligenceDisplay.strengths
    .filter((item) => item.trim().toLowerCase() !== mindfulRationaleNormalized)
    .slice(0, 6);

  const mindfulNegativeEvidence = mindfulIntelligenceDisplay.limitations
    .filter((item) => item.trim().toLowerCase() !== mindfulRationaleNormalized)
    .slice(0, 6);

  const mindfulLeadExplanation =
    mindfulRecommendation === "PURSUE"
      ? mindfulIntelligenceDisplay.rationale
      : mindfulNegativeEvidence[0] || mindfulIntelligenceDisplay.rationale;

  const mindfulSupportingNegativeEvidence = mindfulNegativeEvidence.filter(
    (item) =>
      item.trim().toLowerCase() !== mindfulLeadExplanation.trim().toLowerCase(),
  );

  const mindfulConditionalEvidence = mindfulIntelligenceDisplay.verificationItems
    .filter(
      (item) =>
        item.trim().toLowerCase() !== mindfulRationaleNormalized &&
        !mindfulNegativeEvidence.includes(item),
    )
    .slice(0, 6);

  const conditionIssueBullets = (conditionAnalysis?.issues || [])
    .filter((issue) => issue.includeInValuation)
    .sort((a, b) => b.planningEstimate - a.planningEstimate);

  const dealStrengthBullets = [
    profitabilityScore >= 82 && valuation.expectedGrossProfit > 0
      ? `Strong economics: ${money(valuation.expectedGrossProfit)} expected gross at the current assumptions.`
      : null,
    compSummary.includedCount >= 6 && finalTargetUsed > 0
      ? `${compSummary.includedCount} strong comps support an expected sale value near ${money(finalTargetUsed)}.`
      : null,
    conditionAnalysisApplied && getEffectiveConditionPlanningEstimate() > 0
      ? `${money(getEffectiveConditionPlanningEstimate())} of selected recon is already reflected in the deal economics.`
      : null,
    ...dealerFitResult.reasons.slice(0, 2),
  ].filter((item): item is string => Boolean(item));

  const dealConcernBullets = [
    ...conditionIssueBullets
      .filter((issue) => issue.severity !== "minor")
      .slice(0, 4)
      .map((issue) => `${issue.description} · ${money(issue.planningEstimate)} planning estimate.`),
    comps.length > 0 && String(compSummary.confidence || "").toLowerCase() === "low"
      ? "The current comp set is still thin; expand the market before relying heavily on the resale target."
      : null,
  ].filter((item): item is string => Boolean(item));

  const dealerFitContext = hasEvaluationData
    ? `${dealerFitResult.label} · ${dealerFitResult.score}/100`
    : "Not calculated";

  const displayedReconReserve =
    valuationInput.costs.recon +
    valuationInput.costs.conditionRiskAdd +
    valuationInput.costs.titleHistoryRiskAdd;
  const displayedCurrentCost = Math.max(0, valuationInput.currentBid) + displayedReconReserve;
  const dealerFitPillTone =
    dealerFitResult.score >= 70
      ? "bg-emerald-100 text-emerald-700"
      : dealerFitResult.score >= 40
        ? "bg-amber-100 text-amber-700"
        : "bg-red-100 text-red-700";

  const suggestedBidDisplay = !hasEvaluationData
    ? "—"
    : valuationInput.currentBid <= 0
      ? "Enter bid to calculate"
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
            )} above the Recommended Max Buy.`,
          }
        : currentBidDifference < 0
          ? {
              tone: "under" as const,
              text: `${money(
                Math.abs(currentBidDifference),
              )} remains before reaching the Recommended Max Buy.`,
            }
          : {
              tone: "at" as const,
              text: "Current bid is at the Recommended Max Buy.",
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
    setNotes("");
    setAiSummaryError("");
    setAiSummaryLoadingMode(null);
    setActiveThesisMode("financial");

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

  const materialConditionIssues = (conditionAnalysis?.issues || []).filter(
    (issue) =>
      issue.includeInValuation &&
      issue.severity === "severe" &&
      ["mechanical", "history", "structural", "title"].includes(issue.category),
  );

  const hasMaterialConditionRisk = materialConditionIssues.length > 0;

  // Zero strong comps is an evidence state, not a negative verdict.
  // Do not manufacture sale/profit conclusions until market evidence exists.
  const needsCompSearch =
    hasEvaluationData &&
    !marketCheckLoading &&
    compSummary.includedCount === 0;

  const hasLowCompConfidence =
    comps.length > 0 &&
    String(compSummary.confidence || "").toLowerCase() === "low";

  const hasLimitedDealerFit = dealerFitResult.score < 55;

  const isAboveRecommendedBuy =
    hasEvaluationData &&
    valuationInput.currentBid > 0 &&
    suggestedBid > 0 &&
    valuationInput.currentBid > suggestedBid;

  const hasHardPass =
    hasEvaluationData &&
    !needsCompSearch &&
    (valuation.riskGrade === "High/Avoid" || valuation.expectedGrossProfit <= 0);

  const requiresReview =
    hasEvaluationData &&
    !needsCompSearch &&
    !hasHardPass &&
    (isAboveRecommendedBuy ||
      valuation.decision === "Watch / Stretch Only" ||
      hasLowCompConfidence ||
      hasMaterialConditionRisk);

  const reviewReasons = [
    isAboveRecommendedBuy ? "the current bid is above the Recommended Max Buy" : null,
    hasLowCompConfidence ? "market evidence is still thin" : null,
    hasMaterialConditionRisk ? "a material vehicle-specific risk needs review" : null,
  ].filter((reason): reason is string => Boolean(reason));

  const lotLogicLabel = !hasEvaluationData
    ? "AWAITING EVALUATION"
    : needsCompSearch
      ? "COMP SEARCH NEEDED"
      : hasHardPass
        ? "PASS"
      : isAboveRecommendedBuy
        ? "ABOVE TARGET PRICE"
        : valuation.decision === "Watch / Stretch Only"
          ? "WATCH CLOSELY"
          : requiresReview
            ? "REVIEW REQUIRED"
            : "WORTH PURSUING";

  const presentationDecision =
    !hasEvaluationData
      ? "awaiting"
      : needsCompSearch
        ? "comps"
        : hasHardPass
          ? "pass"
          : requiresReview
            ? "review"
            : "pursue";

  const decisionBadgeTone =
    presentationDecision === "pass"
      ? "bg-red-100 text-red-700"
      : presentationDecision === "comps"
        ? "bg-amber-100 text-amber-800"
        : presentationDecision === "review"
          ? "bg-amber-100 text-amber-700"
        : presentationDecision === "pursue"
          ? "bg-emerald-100 text-emerald-700"
          : "bg-slate-100 text-slate-600";

  const decisionBannerTone =
    presentationDecision === "pass"
      ? "border-red-200/80 bg-red-50/60 text-red-950"
      : presentationDecision === "comps"
        ? "border-amber-200/80 bg-amber-50/35 text-amber-950"
        : presentationDecision === "review"
          ? "border-amber-200/80 bg-amber-50/45 text-amber-950"
        : presentationDecision === "pursue"
          ? "border-emerald-200/80 bg-emerald-50/40 text-emerald-950"
          : "border-slate-200 bg-white text-slate-950";

  const decisionTextTone =
    presentationDecision === "pass"
      ? "text-red-700"
      : presentationDecision === "comps"
        ? "text-amber-700"
        : presentationDecision === "review"
          ? "text-amber-700"
        : presentationDecision === "pursue"
          ? "text-emerald-700"
          : "text-slate-400";

  const lotLogicIcon =
    presentationDecision === "pursue" ? "✓ " : "";

  const compConfidenceDisplay =
    comps.length > 0 ? compSummary.confidence : "—";

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
                      Initial API Calls
                    </div>
                    <div className="mt-1 text-[10px] font-semibold leading-4 text-slate-400">
                      Controls the automatic first search. Manual expansion searches up to 3 additional regions separately.
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
                      "Strong Comps",
                      String(
                        marketCheckApiUsage?.usableCompCount ??
                          compSummary.includedCount,
                      ),
                    ],
                    ["Market Evidence", compSummary.confidence || "—"],
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
          <div className="flex max-h-[92vh] w-full max-w-5xl flex-col overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-2xl">
            <div className="flex items-start justify-between gap-4 border-b border-slate-200 bg-white px-6 py-5">
              <div>
                <h2 className="text-[20px] font-extrabold tracking-[-0.025em] text-slate-950">
                  Condition &amp; Reconditioning
                </h2>
                <p className="mt-1 max-w-2xl text-sm font-medium text-slate-500">
                  Analyze auction or seller disclosures, then review the
                  proposed reserve before applying it to the valuation.
                </p>
              </div>

              <button
                type="button"
                onClick={() => setConditionProfitabilityOpen(false)}
                className="rounded-full p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-700"
                aria-label="Close condition and reconditioning"
              >
                ✕
              </button>
            </div>

            <div className="border-b border-slate-200 px-6">
              <div className="flex gap-6" role="tablist">
                <button
                  type="button"
                  role="tab"
                  aria-selected={conditionModalTab === "ai"}
                  onClick={() => setConditionModalTab("ai")}
                  className={`relative py-3 text-sm font-black ${
                    conditionModalTab === "ai"
                      ? "text-violet-700"
                      : "text-slate-400 hover:text-slate-700"
                  }`}
                >
                  AI Analysis
                  <span
                    className={`absolute inset-x-0 bottom-0 h-0.5 ${
                      conditionModalTab === "ai"
                        ? "bg-violet-600"
                        : "bg-transparent"
                    }`}
                  />
                </button>

                <button
                  type="button"
                  role="tab"
                  aria-selected={conditionModalTab === "manual"}
                  onClick={() => setConditionModalTab("manual")}
                  className={`relative py-3 text-sm font-black ${
                    conditionModalTab === "manual"
                      ? "text-violet-700"
                      : "text-slate-400 hover:text-slate-700"
                  }`}
                >
                  Manual Assessment
                  <span
                    className={`absolute inset-x-0 bottom-0 h-0.5 ${
                      conditionModalTab === "manual"
                        ? "bg-violet-600"
                        : "bg-transparent"
                    }`}
                  />
                </button>
              </div>
            </div>

            <div className="flex-1 overflow-y-auto">
              {conditionModalTab === "ai" ? (
                <div className="space-y-5 p-6">
                  <section className="rounded-2xl border border-slate-200 bg-slate-50/60 p-5">
                    <div className="flex flex-wrap items-start justify-between gap-3">
                      <div>
                        <h3 className="font-black text-slate-950">
                          Paste known condition information
                        </h3>
                        <p className="mt-1 text-xs font-semibold leading-5 text-slate-500">
                          Auction announcements, seller disclosures, condition
                          report notes, warning lights, body damage, title
                          concerns, or transportation issues.
                        </p>
                      </div>

                      <span className="rounded-full bg-white px-3 py-1 text-[10px] font-black text-slate-500">
                        {vehicleTitle}
                      </span>
                    </div>

                    <textarea
                      value={conditionSourceText}
                      onChange={(event) => {
                        setConditionSourceText(event.target.value);
                        setConditionAnalysisApplied(false);
                      }}
                      placeholder="Paste the auction or seller condition information here..."
                      className="mt-4 min-h-[190px] w-full resize-y rounded-2xl border border-slate-200 bg-white p-4 text-sm font-medium leading-6 text-slate-700 outline-none focus:border-violet-300"
                    />

                    <div className="mt-3 flex flex-wrap items-center justify-between gap-3">
                      <span className="text-[10px] font-semibold text-slate-400">
                        {conditionSourceText.trim().length.toLocaleString()}{" "}
                        characters
                      </span>

                      <button
                        type="button"
                        onClick={() => void analyzeConditionInformation()}
                        disabled={
                          conditionAnalysisLoading ||
                          !conditionSourceText.trim()
                        }
                        className="rounded-xl bg-violet-700 px-5 py-2.5 text-sm font-black text-white hover:bg-violet-800 disabled:cursor-not-allowed disabled:opacity-50"
                      >
                        {conditionAnalysisLoading
                          ? "Analyzing..."
                          : conditionAnalysis
                            ? "Analyze Again"
                            : "Analyze Condition"}
                      </button>
                    </div>

                    {conditionAnalysisError ? (
                      <div className="mt-4 rounded-xl bg-red-50 px-4 py-3 text-sm font-bold text-red-700">
                        {conditionAnalysisError}
                      </div>
                    ) : null}
                  </section>

                  {conditionAnalysis ? (
                    <>
                      <section className="rounded-2xl border border-slate-200 bg-slate-50/50 p-5">
                        <div className="flex flex-wrap items-start justify-between gap-3">
                          <div>
                            <h3 className="font-black text-slate-950">
                              Planning assumptions
                            </h3>
                            <p className="mt-1 text-xs font-semibold text-slate-500">
                              Adjust the working estimate used for this purchase
                              decision. The original AI estimate remains
                              available below.
                            </p>
                          </div>

                          <button
                            type="button"
                            onClick={resetConditionEstimateOverrides}
                            disabled={
                              conditionPlanningEstimateOverride === null &&
                              conditionReadyDaysLowOverride === null &&
                              conditionReadyDaysHighOverride === null
                            }
                            className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs font-black text-slate-600 hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-40"
                          >
                            Reset to AI Estimates
                          </button>
                        </div>

                        <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
                          <div className="rounded-xl bg-white px-4 py-3">
                            <div className="text-[9px] font-black uppercase tracking-[0.08em] text-slate-400">
                              Overall Risk
                            </div>
                            <div className="mt-1 text-base font-black capitalize text-slate-950">
                              {conditionAnalysis.overallRisk}
                            </div>
                          </div>

                          <div className="rounded-xl bg-white px-4 py-3">
                            <div className="text-[9px] font-black uppercase tracking-[0.08em] text-slate-400">
                              AI Cost Range
                            </div>
                            <div className="mt-1 text-sm font-black text-slate-950">
                              {money(conditionAnalysis.estimatedCostLow)}–
                              {money(conditionAnalysis.estimatedCostHigh)}
                            </div>
                          </div>

                          <label className="rounded-xl border border-violet-200 bg-violet-50 px-4 py-3">
                            <div className="text-[9px] font-black uppercase tracking-[0.08em] text-violet-600">
                              Planning Estimate
                            </div>

                            <div className="mt-2 flex items-center rounded-lg border border-violet-200 bg-white">
                              <span className="pl-3 text-sm text-slate-400">
                                $
                              </span>

                              <input
                                type="text"
                                inputMode="numeric"
                                value={formatNumberInput(
                                  getEffectiveConditionPlanningEstimate(),
                                )}
                                onFocus={(event) =>
                                  event.currentTarget.select()
                                }
                                onChange={(event) => {
                                  setConditionPlanningEstimateOverride(
                                    Math.max(0, toNumber(event.target.value)),
                                  );
                                  setConditionAnalysisApplied(false);
                                }}
                                className="min-w-0 flex-1 bg-transparent px-2 py-2 text-right text-sm font-black text-violet-800 outline-none"
                              />
                            </div>

                            <div className="mt-1 text-[9px] font-bold text-violet-600">
                              AI:{" "}
                              {money(
                                originalConditionAnalysis?.planningEstimate ??
                                  conditionAnalysis.planningEstimate,
                              )}
                            </div>
                          </label>

                          <label className="rounded-xl border border-slate-200 bg-white px-4 py-3">
                            <div className="text-[9px] font-black uppercase tracking-[0.08em] text-slate-400">
                              Ready Days — Low
                            </div>

                            <input
                              type="number"
                              min="0"
                              value={getEffectiveConditionReadyDaysLow()}
                              onChange={(event) => {
                                setConditionReadyDaysLowOverride(
                                  Math.max(0, Number(event.target.value) || 0),
                                );
                                setConditionAnalysisApplied(false);
                              }}
                              className="mt-2 w-full rounded-lg border border-slate-200 px-3 py-2 text-right text-sm font-black text-slate-800 outline-none focus:border-violet-300"
                            />

                            <div className="mt-1 text-[9px] font-bold text-slate-400">
                              AI:{" "}
                              {originalConditionAnalysis?.estimatedReadyDaysLow ??
                                conditionAnalysis.estimatedReadyDaysLow}
                            </div>
                          </label>

                          <label className="rounded-xl border border-slate-200 bg-white px-4 py-3">
                            <div className="text-[9px] font-black uppercase tracking-[0.08em] text-slate-400">
                              Ready Days — High
                            </div>

                            <input
                              type="number"
                              min={getEffectiveConditionReadyDaysLow()}
                              value={getEffectiveConditionReadyDaysHigh()}
                              onChange={(event) => {
                                setConditionReadyDaysHighOverride(
                                  Math.max(
                                    getEffectiveConditionReadyDaysLow(),
                                    Number(event.target.value) || 0,
                                  ),
                                );
                                setConditionAnalysisApplied(false);
                              }}
                              className="mt-2 w-full rounded-lg border border-slate-200 px-3 py-2 text-right text-sm font-black text-slate-800 outline-none focus:border-violet-300"
                            />

                            <div className="mt-1 text-[9px] font-bold text-slate-400">
                              AI:{" "}
                              {originalConditionAnalysis?.estimatedReadyDaysHigh ??
                                conditionAnalysis.estimatedReadyDaysHigh}
                            </div>
                          </label>
                        </div>

                        {conditionPlanningEstimateOverride !== null ||
                        conditionReadyDaysLowOverride !== null ||
                        conditionReadyDaysHighOverride !== null ? (
                          <div className="mt-3 rounded-xl bg-blue-50 px-3 py-2 text-xs font-bold text-blue-700">
                            User-adjusted planning assumptions. The original AI
                            values have been preserved.
                          </div>
                        ) : null}
                      </section>

                      <section className="rounded-2xl border border-slate-200 p-5">
                        <h3 className="font-black text-slate-950">
                          Condition interpretation
                        </h3>
                        <p className="mt-2 text-sm font-semibold leading-6 text-slate-600">
                          {conditionAnalysis.summary}
                        </p>
                      </section>

                      <section>
                        <div className="flex items-center justify-between gap-4">
                          <h3 className="text-sm font-black uppercase tracking-[0.08em] text-slate-500">
                            Proposed Issues
                          </h3>
                          <span className="text-xs font-bold text-slate-400">
                            {
                              conditionAnalysis.issues.filter(
                                (issue) => issue.includeInValuation,
                              ).length
                            }{" "}
                            included
                          </span>
                        </div>

                        <div className="mt-3 space-y-3">
                          {conditionAnalysis.issues.map((issue) => (
                            <div
                              key={issue.id}
                              className={`rounded-2xl border p-4 ${
                                issue.includeInValuation
                                  ? "border-violet-200 bg-violet-50/30"
                                  : "border-slate-200 bg-slate-50 opacity-70"
                              }`}
                            >
                              <div className="flex items-start gap-3">
                                <input
                                  type="checkbox"
                                  checked={issue.includeInValuation}
                                  onChange={() =>
                                    toggleConditionAnalysisIssue(issue.id)
                                  }
                                  className="mt-1 h-4 w-4 rounded border-slate-300"
                                  aria-label={`Include ${issue.description} in valuation`}
                                />

                                <div className="min-w-0 flex-1">
                                  <div className="flex flex-wrap items-center gap-2">
                                    <h4 className="font-black text-slate-950">
                                      {issue.description}
                                    </h4>

                                    <span className="rounded-full bg-white px-2 py-1 text-[9px] font-black uppercase text-slate-500">
                                      {issue.category.replaceAll("_", " ")}
                                    </span>

                                    <span className="rounded-full bg-white px-2 py-1 text-[9px] font-black uppercase text-slate-500">
                                      {issue.certainty.replaceAll("_", " ")}
                                    </span>

                                    <span className="rounded-full bg-white px-2 py-1 text-[9px] font-black uppercase text-slate-500">
                                      {issue.confidence} confidence
                                    </span>
                                  </div>

                                  <div className="mt-3 grid gap-3 sm:grid-cols-4">
                                    <div>
                                      <div className="text-[9px] font-black uppercase text-slate-400">
                                        Range
                                      </div>
                                      <div className="mt-1 text-xs font-bold text-slate-700">
                                        {money(issue.estimatedCostLow)}–
                                        {money(issue.estimatedCostHigh)}
                                      </div>
                                    </div>

                                    <div>
                                      <div className="text-[9px] font-black uppercase text-slate-400">
                                        Planning
                                      </div>
                                      <div className="mt-1 text-xs font-black text-violet-700">
                                        {money(issue.planningEstimate)}
                                      </div>
                                    </div>

                                    <div>
                                      <div className="text-[9px] font-black uppercase text-slate-400">
                                        Severity
                                      </div>
                                      <div className="mt-1 text-xs font-bold capitalize text-slate-700">
                                        {issue.severity}
                                      </div>
                                    </div>

                                    <div>
                                      <div className="text-[9px] font-black uppercase text-slate-400">
                                        Duration
                                      </div>
                                      <div className="mt-1 text-xs font-bold text-slate-700">
                                        {issue.estimatedDurationDays} days
                                      </div>
                                    </div>
                                  </div>

                                  <div className="mt-3 text-[11px] font-semibold leading-5 text-slate-500">
                                    Source: {issue.sourceText}
                                  </div>

                                  {issue.assumptions.length ? (
                                    <div className="mt-2 text-[11px] font-semibold leading-5 text-amber-700">
                                      Assumptions:{" "}
                                      {issue.assumptions.join("; ")}
                                    </div>
                                  ) : null}
                                </div>
                              </div>
                            </div>
                          ))}
                        </div>
                      </section>

                      {conditionAnalysis.recommendedInspections.length ||
                      conditionAnalysis.missingInformation.length ||
                      conditionAnalysis.warnings.length ? (
                        <section className="grid gap-4 lg:grid-cols-3">
                          <div className="rounded-2xl border border-blue-100 bg-blue-50/50 p-4">
                            <h3 className="text-[10px] font-black uppercase tracking-[0.08em] text-blue-700">
                              Recommended Inspections
                            </h3>
                            <ul className="mt-3 space-y-2">
                              {conditionAnalysis.recommendedInspections.map(
                                (item) => (
                                  <li
                                    key={item}
                                    className="text-xs font-semibold leading-5 text-slate-700"
                                  >
                                    • {item}
                                  </li>
                                ),
                              )}
                            </ul>
                          </div>

                          <div className="rounded-2xl border border-amber-100 bg-amber-50/50 p-4">
                            <h3 className="text-[10px] font-black uppercase tracking-[0.08em] text-amber-700">
                              Missing Information
                            </h3>
                            <ul className="mt-3 space-y-2">
                              {conditionAnalysis.missingInformation.map(
                                (item) => (
                                  <li
                                    key={item}
                                    className="text-xs font-semibold leading-5 text-slate-700"
                                  >
                                    • {item}
                                  </li>
                                ),
                              )}
                            </ul>
                          </div>

                          <div className="rounded-2xl border border-red-100 bg-red-50/50 p-4">
                            <h3 className="text-[10px] font-black uppercase tracking-[0.08em] text-red-700">
                              Warnings
                            </h3>
                            <ul className="mt-3 space-y-2">
                              {conditionAnalysis.warnings.map((item) => (
                                <li
                                  key={item}
                                  className="text-xs font-semibold leading-5 text-slate-700"
                                >
                                  • {item}
                                </li>
                              ))}
                            </ul>
                          </div>
                        </section>
                      ) : null}
                    </>
                  ) : null}
                </div>
              ) : (
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

                      return (
                        <div
                          key={definition.key}
                          className="rounded-2xl border border-slate-200 p-4"
                        >
                          <div className="flex flex-col justify-between gap-3 md:flex-row md:items-start">
                            <div className="max-w-xl">
                              <h3 className="font-black text-slate-950">
                                {definition.title}
                              </h3>
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
                                  onFocus={(event) =>
                                    event.currentTarget.select()
                                  }
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
                                  className={`rounded-xl border px-2 py-2 text-xs font-black capitalize ${
                                    selected
                                      ? "border-violet-600 bg-violet-600 text-white"
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
                </div>
              )}
            </div>

            <div className="flex flex-wrap items-center justify-between gap-3 border-t border-slate-200 bg-slate-50 px-6 py-4">
              <div className="text-xs font-bold text-slate-500">
                {conditionAnalysisApplied
                  ? "AI planning estimate applied to the evaluation."
                  : conditionAnalysis
                    ? "Review the proposed issues before applying."
                    : "No AI condition analysis has been applied."}
              </div>

              <div className="flex flex-wrap gap-2">
                <button
                  type="button"
                  onClick={() => setConditionProfitabilityOpen(false)}
                  className="rounded-xl border border-slate-300 bg-white px-5 py-2.5 text-sm font-bold text-slate-700 hover:bg-slate-50"
                >
                  Close
                </button>

                {conditionModalTab === "ai" && conditionAnalysis ? (
                  <button
                    type="button"
                    onClick={applyConditionAnalysis}
                    className="rounded-xl bg-slate-950 px-5 py-2.5 text-sm font-black text-white hover:bg-slate-800"
                  >
                    {conditionAnalysisApplied
                      ? "Applied to Evaluation"
                      : "Apply to Evaluation"}
                  </button>
                ) : null}

                {conditionModalTab === "manual" ? (
                  <button
                    type="button"
                    onClick={() => setConditionProfitabilityOpen(false)}
                    className="rounded-xl bg-slate-950 px-5 py-2.5 text-sm font-black text-white hover:bg-slate-800"
                  >
                    Apply &amp; Close
                  </button>
                ) : null}
              </div>
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

      {compMarketEditorOpen ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/45 px-4 backdrop-blur-sm">
          <div className="flex max-h-[88vh] w-full max-w-2xl flex-col overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-2xl">
            <div className="flex items-start justify-between gap-4 border-b border-slate-100 px-6 py-5">
              <div>
                <h2 className="text-[20px] font-extrabold tracking-[-0.025em] text-slate-950">Edit Comps</h2>
                <p className="mt-1 max-w-lg text-sm font-semibold leading-5 text-slate-500">
                  Expand where Lot Logic looks, or broaden how specifically it matches this vehicle. Geography suggestions keep widening outward from your starting market.
                </p>
              </div>
              <button type="button" onClick={() => setCompMarketEditorOpen(false)} className="rounded-lg border border-slate-200 px-3 py-1.5 text-xs font-black text-slate-500 hover:bg-slate-50">Close</button>
            </div>

            <div className="border-b border-slate-200 px-6">
              <div className="flex gap-6" role="tablist">
                <button
                  type="button"
                  role="tab"
                  aria-selected={compEditorTab === "geography"}
                  onClick={() => setCompEditorTab("geography")}
                  className={`relative py-3 text-sm font-black ${compEditorTab === "geography" ? "text-blue-700" : "text-slate-400 hover:text-slate-700"}`}
                >
                  Geography
                  <span className={`absolute inset-x-0 bottom-0 h-0.5 ${compEditorTab === "geography" ? "bg-blue-700" : "bg-transparent"}`} />
                </button>
                <button
                  type="button"
                  role="tab"
                  aria-selected={compEditorTab === "vehicle"}
                  onClick={() => setCompEditorTab("vehicle")}
                  className={`relative py-3 text-sm font-black ${compEditorTab === "vehicle" ? "text-blue-700" : "text-slate-400 hover:text-slate-700"}`}
                >
                  Vehicle Match
                  <span className={`absolute inset-x-0 bottom-0 h-0.5 ${compEditorTab === "vehicle" ? "bg-blue-700" : "bg-transparent"}`} />
                </button>
              </div>
            </div>

            {compEditorTab === "geography" ? (
              <>
                <div className="border-b border-slate-100 px-6 py-4">
                  <div className="flex flex-wrap items-center gap-2">
                    <button
                      type="button"
                      onClick={suggestMoreCompMarkets}
                      disabled={getCompExpansionMarkets().filter((market) => !(marketCheckSearchMeta?.searchedZips || []).includes(market.zip)).length <= compSuggestionCount}
                      className="rounded-lg border border-blue-200 bg-blue-50 px-3 py-2 text-xs font-black text-blue-700 hover:bg-blue-100 disabled:cursor-not-allowed disabled:border-slate-200 disabled:bg-slate-50 disabled:text-slate-400"
                    >
                      {getCompExpansionMarkets().filter((market) => !(marketCheckSearchMeta?.searchedZips || []).includes(market.zip)).length <= compSuggestionCount
                        ? "All Metro Suggestions Loaded"
                        : "Suggest 3 More Markets"}
                    </button>
                    <div className="flex min-w-[220px] flex-1 items-center gap-2">
                      <input
                        value={customCompZip}
                        onChange={(event) => setCustomCompZip(event.target.value.replace(/\D/g, "").slice(0, 5))}
                        placeholder="Advanced: add ZIP"
                        inputMode="numeric"
                        className="min-w-0 flex-1 rounded-lg border border-slate-200 px-3 py-2 text-xs font-bold text-slate-700 outline-none focus:border-blue-300"
                      />
                      <button
                        type="button"
                        onClick={addCustomCompZip}
                        disabled={customCompZip.length !== 5}
                        className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs font-black text-slate-600 hover:bg-slate-50 disabled:cursor-not-allowed disabled:text-slate-300"
                      >
                        Add ZIP
                      </button>
                    </div>
                  </div>
                </div>

                <div className="flex-1 space-y-2 overflow-y-auto px-6 py-5">
                  {[
                    ...getCompExpansionMarkets().filter((market) => {
                      const searchedZips = marketCheckSearchMeta?.searchedZips || [];
                      if (searchedZips.includes(market.zip)) return true;

                      return getCompExpansionMarkets()
                        .filter((candidate) => !searchedZips.includes(candidate.zip))
                        .slice(0, compSuggestionCount)
                        .some((candidate) => candidate.zip === market.zip);
                    }),
                    ...customCompMarkets.map((market, index) => ({ ...market, order: 10000 + index, enabled: true })),
                  ]
                    .sort((a, b) => a.order - b.order)
                    .map((market) => {
                      const searched = marketCheckSearchMeta?.searchedZips.includes(market.zip) || false;
                      const selected = searched || selectedCompMarketZips.includes(market.zip);
                      const nextRecommended = !searched && getCompExpansionMarkets()
                        .filter((candidate) => !(marketCheckSearchMeta?.searchedZips || []).includes(candidate.zip))
                        .slice(0, compSuggestionCount)
                        .some((candidate) => candidate.zip === market.zip);

                      return (
                        <label key={market.zip} className={`flex items-center gap-3 rounded-xl border px-4 py-3 ${selected ? "border-blue-200 bg-blue-50/60" : "border-slate-200 bg-white"} ${searched ? "cursor-default" : "cursor-pointer"}`}>
                          <input
                            type="checkbox"
                            checked={selected}
                            disabled={searched}
                            onChange={(event) => {
                              setSelectedCompMarketZips((current) =>
                                event.target.checked
                                  ? Array.from(new Set([...current, market.zip]))
                                  : current.filter((zip) => zip !== market.zip),
                              );
                            }}
                            className="h-4 w-4 accent-blue-700"
                          />
                          <span className="min-w-0 flex-1">
                            <span className="block text-sm font-black text-slate-800">{market.market} <span className="text-slate-400">({market.zip})</span></span>
                            <span className="mt-0.5 block text-[10px] font-black uppercase tracking-[0.08em] text-slate-400">
                              {searched
                                ? "Already searched"
                                : nextRecommended
                                  ? "Recommended next market"
                                  : customCompMarkets.some((item) => item.zip === market.zip)
                                    ? "Custom ZIP"
                                    : activeAssumptions.regionalMarkets.some((item) => item.zip === market.zip)
                                      ? "Configured market"
                                      : "Expanded metro market"}
                            </span>
                          </span>
                        </label>
                      );
                    })}
                </div>

                <div className="flex flex-wrap items-center justify-between gap-3 border-t border-slate-100 bg-slate-50 px-6 py-4">
                  <button
                    type="button"
                    onClick={() => { setCompMarketEditorOpen(false); void searchMajorMetropolitanAreas(); }}
                    disabled={marketCheckLoading}
                    className="text-xs font-black text-slate-500 hover:text-blue-700 disabled:text-slate-300"
                  >
                    Search major reference markets instead
                  </button>
                  <button
                    type="button"
                    onClick={() => void searchSelectedCompMarkets()}
                    disabled={!selectedCompMarketZips.length || marketCheckLoading}
                    className="rounded-xl bg-blue-700 px-5 py-2.5 text-sm font-black text-white hover:bg-blue-800 disabled:cursor-not-allowed disabled:bg-slate-300"
                  >
                    Search Selected Markets
                  </button>
                </div>
              </>
            ) : (
              <div className="flex-1 overflow-y-auto px-6 py-5">
                <div className="rounded-2xl border border-slate-200 bg-slate-50/70 p-4">
                  <div className="text-[10px] font-black uppercase tracking-[0.09em] text-slate-400">Current vehicle match</div>
                  <div className="mt-1 text-base font-black text-slate-950">
                    {[vehicleYear, vehicleMake, vehicleModel, compTrimRelaxed ? null : vehicleTrim].filter(Boolean).join(" ") || "Vehicle details unavailable"}
                  </div>
                  <p className="mt-2 text-xs font-semibold leading-5 text-slate-500">
                    Lot Logic still uses year, mileage, body/configuration, drivetrain, geography, and relevance checks when ranking the evidence.
                  </p>
                </div>

                {vehicleTrim ? (
                  <div className="mt-4 rounded-2xl border border-amber-200 bg-amber-50/70 p-5">
                    <div className="text-[10px] font-black uppercase tracking-[0.09em] text-amber-700">Secondary recovery step</div>
                    <div className="mt-1 text-lg font-black text-slate-950">Search as {vehicleMake} {vehicleModel}</div>
                    <p className="mt-2 text-xs font-semibold leading-5 text-slate-600">
                      Lot Logic prefers an exact-trim comp from a farther non-overlapping market over a looser match nearby. Expand Geography first when practical. Use this option after exact-configuration evidence remains thin; it removes trim specificity while keeping the other equivalence and relevance safeguards active.
                    </p>
                    {compTrimRelaxed ? (
                      <div className="mt-4 rounded-xl bg-blue-100 px-3 py-2 text-xs font-black text-blue-800">
                        Vehicle match is already broadened to {vehicleMake} {vehicleModel}.
                      </div>
                    ) : (
                      <button
                        type="button"
                        onClick={() => { setCompMarketEditorOpen(false); void broadenCompVehicleMatch(); }}
                        disabled={marketCheckLoading}
                        className="mt-4 rounded-xl bg-amber-700 px-4 py-2.5 text-sm font-black text-white hover:bg-amber-800 disabled:bg-slate-300"
                      >
                        Search as {vehicleMake} {vehicleModel}
                      </button>
                    )}
                  </div>
                ) : (
                  <div className="mt-4 rounded-2xl border border-slate-200 p-5">
                    <div className="text-sm font-black text-slate-900">Already using a model-level match</div>
                    <p className="mt-2 text-xs font-semibold leading-5 text-slate-500">
                      There is no trim-level specificity to remove for this vehicle. Use Geography to expand the market instead.
                    </p>
                  </div>
                )}

                <div className="mt-4 rounded-xl border border-blue-100 bg-blue-50/50 px-4 py-3 text-xs font-semibold leading-5 text-blue-900/80">
                  Broaden vehicle match changes what qualifies as a comparable; Geography changes where Lot Logic looks. Keeping those choices separate makes it clear which assumption you are changing.
                </div>
              </div>
            )}
          </div>
        </div>
      ) : null}

      {dealerProfileOpen ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/45 px-4 backdrop-blur-sm">
          <div className="w-full max-w-3xl overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-2xl">
            <div className="flex items-start justify-between gap-4 border-b border-slate-100 px-6 py-5">
              <div>
                <div className="text-[10px] font-black uppercase tracking-[0.1em] text-blue-600">Dealer intelligence</div>
                <h2 className="mt-1 text-[20px] font-extrabold tracking-[-0.025em] text-slate-950">Dealer Profile & Preferences</h2>
                <p className="mt-1 max-w-2xl text-sm font-semibold leading-5 text-slate-500">
                  This is the context Lot Logic uses to judge whether a vehicle fits your dealership. Deal economics still drive the overall verdict.
                </p>
              </div>
              <button type="button" onClick={() => setDealerProfileOpen(false)} className="rounded-lg border border-slate-200 px-3 py-1.5 text-xs font-black text-slate-500 hover:bg-slate-50">Close</button>
            </div>

            <div className="grid gap-5 px-6 py-5 md:grid-cols-2">
              <div className="rounded-2xl border border-slate-200 bg-slate-50/70 p-5">
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <div className="text-[10px] font-black uppercase tracking-[0.1em] text-slate-400">Current fit model</div>
                    <div className="mt-1 text-lg font-black text-slate-950">{dealerFitResult.label}</div>
                  </div>
                  <div className="rounded-full bg-white px-3 py-1.5 text-sm font-black text-blue-700 shadow-sm">{dealerFitResult.score}/100</div>
                </div>
                <div className="mt-4 text-xs font-black uppercase tracking-[0.08em] text-emerald-700">Signals helping fit</div>
                <ul className="mt-2 space-y-2">
                  {(dealerFitResult.reasons.length ? dealerFitResult.reasons : ["No strong dealership-specific fit signal has been established yet."]).slice(0, 5).map((reason) => (
                    <li key={reason} className="flex gap-2 text-xs font-semibold leading-5 text-slate-700"><span className="mt-[7px] h-1.5 w-1.5 shrink-0 rounded-full bg-emerald-500" />{reason}</li>
                  ))}
                </ul>
                {dealerFitResult.cautions.length ? (
                  <>
                    <div className="mt-4 text-xs font-black uppercase tracking-[0.08em] text-amber-700">Fit cautions</div>
                    <ul className="mt-2 space-y-2">
                      {dealerFitResult.cautions.slice(0, 4).map((caution) => (
                        <li key={caution} className="flex gap-2 text-xs font-semibold leading-5 text-slate-700"><span className="mt-[7px] h-1.5 w-1.5 shrink-0 rounded-full bg-amber-500" />{caution}</li>
                      ))}
                    </ul>
                  </>
                ) : null}
              </div>

              <div className="space-y-3">
                <div className="rounded-2xl border border-slate-200 p-4">
                  <div className="flex items-center justify-between gap-3">
                    <div className="text-sm font-black text-slate-900">Dealership website intelligence</div>
                    <span className="rounded-full bg-slate-100 px-2.5 py-1 text-[9px] font-black uppercase tracking-[0.08em] text-slate-500">Next onboarding step</span>
                  </div>
                  <p className="mt-2 text-xs font-semibold leading-5 text-slate-500">Lot Logic will use the dealership URL to infer inventory mix, price bands, vehicle types, age/mileage patterns, and positioning, then let the dealer confirm or correct the profile.</p>
                </div>

                <div className="rounded-2xl border border-slate-200 p-4">
                  <div className="text-sm font-black text-slate-900">Your acquisition preferences</div>
                  <p className="mt-2 text-xs font-semibold leading-5 text-slate-500">This will be where dealers add preferred makes, body styles, price bands, mileage/age targets, target gross, and categories they avoid.</p>
                </div>

                <div className="rounded-2xl border border-dashed border-slate-300 bg-slate-50/70 p-4">
                  <div className="text-sm font-black text-slate-900">Deal spec / buying guide</div>
                  <p className="mt-2 text-xs font-semibold leading-5 text-slate-500">Planned: upload a dealership buying guide or deal-spec document so Lot Logic can incorporate those rules into dealer fit.</p>
                </div>
              </div>
            </div>
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

              <FormRow label="Expected Sale Value">
                <div>
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

                  <p className="mt-1.5 text-right text-[10px] font-semibold leading-4 text-slate-400">
                    Defaults to the Conservative Sale Value. Enter a different amount to
                    override it.
                  </p>
                </div>
              </FormRow>

              <FormRow label="Profit Target Override">
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
                <p className="mt-1 text-[10px] font-semibold leading-4 text-slate-400">
                  Leave at $0 to use the Lot Logic automatic target: at least $2,500, scaling to roughly 20% of the pre-recon acquisition basis. Current target: {money(valuation.desiredProfitTarget)}.
                </p>
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
                    {hasEvaluationData
                      ? money(valuation.expectedGrossProfit)
                      : "—"}
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

        <div className="mx-auto max-w-[1380px] px-4 py-4 sm:px-5 lg:px-7">
          <section className="mb-4 rounded-[18px] border border-slate-200 bg-white px-4 py-3.5 shadow-[0_1px_3px_rgba(15,23,42,0.05)]">
            <div className="grid items-end gap-2.5 lg:grid-cols-[170px_minmax(360px,1fr)_135px_135px_165px]">
              <div>
                <div className="text-sm font-black text-slate-950">
                  New Evaluation
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

                    resetPreviousEvaluationResults();

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

                  resetPreviousEvaluationResults();

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
                className="rounded-xl bg-blue-700 px-4 py-2.5 text-sm font-extrabold text-white shadow-sm hover:bg-blue-800 disabled:cursor-not-allowed disabled:bg-slate-200 disabled:text-slate-500 disabled:shadow-none"
              >
                {vinDecodeLoading || marketCheckLoading
                  ? "Evaluating..."
                  : "Run Evaluation"}
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
                  <div
                    className={`text-lg font-black leading-tight tracking-[-0.025em] ${
                      hasEvaluationData ? "text-blue-700" : "text-slate-700"
                    }`}
                  >
                    {hasEvaluationData ? vehicleTitle : "Awaiting vehicle"}
                  </div>

                  <div className="mt-1 text-xs font-semibold leading-5 text-slate-500">
                    {hasEvaluationData
                      ? [simplifiedVehicleBodyClass, decodedVehicle?.fuelType]
                          .filter(Boolean)
                          .join(" • ") || "Vehicle details available"
                      : "Enter a VIN or use Manual Entry to populate vehicle details."}
                  </div>
                </div>
              </div>

              {comps.length > 0 && !representativeCompImage ? (
                <div className="mt-3 text-[10px] font-semibold text-slate-500">
                  No comp photo available
                </div>
              ) : null}

              {hasEvaluationData ? (
                <dl className="mt-5 space-y-2.5 text-sm">
                  {[
                    ["VIN", vin || "—"],
                    [
                      "Mileage",
                      targetMileage
                        ? `${formatNumberInput(targetMileage)} mi`
                        : "—",
                    ],
                    ["Drivetrain", decodedVehicle?.driveType || "—"],
                    ["Body Style", simplifiedVehicleBodyClass || "—"],
                    ["Trim", vehicleTrim || "—"],
                    ["Source", auctionSite || "—"],
                  ].map(([label, value]) => (
                    <div
                      key={label}
                      className="grid grid-cols-[105px_1fr] gap-3"
                    >
                      <dt className="font-semibold text-slate-500">{label}</dt>
                      <dd className="truncate text-right font-bold text-slate-900">
                        {value}
                      </dd>
                    </div>
                  ))}
                </dl>
              ) : (
                <div className="mt-5 rounded-xl border border-slate-200 bg-slate-50/70 px-4 py-4 text-xs font-semibold leading-5 text-slate-500">
                  Vehicle specifications, mileage, trim, and source will appear
                  here after the evaluation begins.
                </div>
              )}
            </article>

            <article
              className={`flex h-full flex-col rounded-[20px] border p-5 shadow-[0_1px_3px_rgba(15,23,42,0.05),0_14px_34px_rgba(15,23,42,0.035)] ${decisionBannerTone}`}
            >
              <div className="flex items-start justify-between gap-3">
                <h2 className="whitespace-nowrap text-base font-black text-slate-950">Lot Logic Verdict</h2>

                <div className="flex shrink-0 flex-col items-end gap-1.5">
                  <span className={`inline-flex items-center rounded-full px-2.5 py-1 text-[10px] font-black ${decisionBadgeTone}`}>
                    {lotLogicIcon}{lotLogicLabel}
                  </span>
                  {hasEvaluationData ? (
                    <span className={`inline-flex items-center rounded-full px-2.5 py-1 text-[9px] font-black ${dealerFitPillTone}`}>
                      Dealer Fit: {dealerFitResult.label} · {dealerFitResult.score}/100
                    </span>
                  ) : null}
                </div>
              </div>

              <div className="mt-4 grid grid-cols-3 gap-3 border-t border-current/10 pt-4 text-center">
                <div className="min-w-0">
                  <div className="text-[9px] font-black uppercase tracking-[0.08em] text-slate-500 sm:text-[10px]">
                    All-In Cost
                  </div>
                  <div className="mt-2 text-[25px] font-black tracking-[-0.04em] text-slate-950">
                    {hasEvaluationData && valuationInput.currentBid > 0
                      ? money(displayedCurrentCost)
                      : "—"}
                  </div>
                  <div className="mt-1 text-[9px] font-bold leading-4 text-slate-500 sm:text-[10px]">
                    {hasEvaluationData && valuationInput.currentBid > 0 ? (
                      <>
                        {money(valuationInput.currentBid)} bid +<br />
                        ≈ {money(displayedReconReserve)} recon
                      </>
                    ) : (
                      <>Bid +<br />recon reserve</>
                    )}
                  </div>
                </div>

                <div className="min-w-0">
                  <div className="text-[10px] font-black uppercase tracking-[0.1em] text-slate-500">
                    Sale Estimate
                  </div>
                  <div className="mt-2 text-[25px] font-black tracking-[-0.04em] text-slate-950">
                    {!needsCompSearch && hasEvaluationData && finalTargetUsed > 0
                      ? money(finalTargetUsed)
                      : "—"}
                  </div>
                  <div className="mt-1 text-[9px] font-bold leading-4 text-slate-500 sm:text-[10px]">
                    {needsCompSearch ? (
                      <>No usable<br />comps yet</>
                    ) : (
                      <>Comp-supported<br />sale value</>
                    )}
                  </div>
                </div>

                <div className="min-w-0">
                  <div className="text-[10px] font-black uppercase tracking-[0.1em] text-slate-500">
                    Estimated Profit
                  </div>
                  <div className={`mt-2 text-[25px] font-black tracking-[-0.04em] ${
                    needsCompSearch
                      ? "text-slate-400"
                      : valuation.expectedGrossProfit >= 0
                        ? "text-emerald-700"
                        : "text-red-700"
                  }`}>
                    {hasEvaluationData && !needsCompSearch
                      ? money(valuation.expectedGrossProfit)
                      : "—"}
                  </div>
                  <div className="mt-1 text-[9px] font-bold leading-4 text-slate-500 sm:text-[10px]">
                    {needsCompSearch ? (
                      <>Waiting on<br />market evidence</>
                    ) : (
                      <>After modeled fees,<br />costs & reserves</>
                    )}
                  </div>
                </div>
              </div>

              {needsCompSearch ? (
                <div className="mt-4 rounded-xl border border-amber-200 bg-amber-100/70 px-3 py-3 text-center">
                  <div className="text-xs font-black text-amber-900">
                    No strong comps found yet.
                  </div>
                  <p className="mt-1 text-[10px] font-semibold leading-4 text-amber-800">
                    Expand the search to establish a market-supported sale value before Lot Logic makes a deal verdict.
                  </p>
                  <div className="mt-3 flex flex-wrap items-center justify-center gap-2">
                    <button
                      type="button"
                      onClick={openCompMarketEditor}
                      disabled={marketCheckLoading}
                      className="rounded-lg bg-blue-700 px-3.5 py-2 text-[11px] font-black text-white hover:bg-blue-800 disabled:bg-slate-300"
                    >
                      Expand Comp Search
                    </button>
                    <button
                      type="button"
                      onClick={() =>
                        compSectionRef.current?.scrollIntoView({
                          behavior: "smooth",
                          block: "start",
                        })
                      }
                      className="rounded-lg border border-amber-300 bg-white px-3.5 py-2 text-[11px] font-black text-amber-800 hover:bg-amber-50"
                    >
                      View Comp Details ↓
                    </button>
                  </div>
                </div>
              ) : null}

              {presentationDecision === "review" && reviewReasons.length ? (
                <div className="mt-4 rounded-xl border border-amber-200 bg-amber-100/70 px-3 py-2.5 text-center text-xs font-bold leading-5 text-amber-800">
                  Review required: {reviewReasons.join(", ")}.
                </div>
              ) : null}

              {!needsCompSearch && currentBidPosition ? (
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

              <div className="mt-auto pt-8">
                <button
                  type="button"
                  onClick={saveEvaluation}
                  disabled={saveLoading || !hasEvaluationData}
                  className={`w-full rounded-xl px-4 py-3 text-sm font-black text-white shadow-sm disabled:cursor-not-allowed disabled:bg-slate-400 ${
                    presentationDecision === "pass"
                      ? "bg-red-700 hover:bg-red-800"
                      : presentationDecision === "comps"
                        ? "bg-blue-700 hover:bg-blue-800"
                        : presentationDecision === "review"
                          ? "bg-amber-600 hover:bg-amber-700"
                          : "bg-emerald-700 hover:bg-emerald-800"
                  }`}
                >
                  {saveLoading
                    ? "Saving..."
                    : savedEvaluationId
                      ? "Update Pipeline"
                      : "Save to Pipeline"}
                </button>

                {!hasEvaluationData ? (
                  <div className="mt-2 text-center text-[10px] font-semibold text-slate-500">
                    Enter vehicle details and run an evaluation to calculate the bid, sale value, and projected profit.
                  </div>
                ) : null}

                {saveStatus ? (
                  <div className="mt-2 text-center text-xs font-bold text-slate-600">
                    {saveStatus}
                  </div>
                ) : null}
              </div>
            </article>

            <article className="rounded-[20px] border border-slate-200 bg-white p-5 shadow-[0_1px_3px_rgba(15,23,42,0.05),0_14px_34px_rgba(15,23,42,0.035)]">
              <div>
                <h2 className="text-base font-black text-slate-950">
                  Why Lot Logic Thinks This
                </h2>
                <p className="mt-1 text-[10px] font-semibold leading-4 text-slate-400">
                  Deal economics and market evidence drive the verdict. Dealer fit is supporting context.
                </p>
              </div>

              <dl className="mt-4 space-y-3 text-sm">
                <div className="flex justify-between gap-4">
                  <dt className="font-semibold text-slate-500">
                    Market Evidence
                  </dt>
                  <dd
                    className={`text-right font-black ${
                      comps.length ? "text-slate-900" : "text-slate-400"
                    }`}
                  >
                    {compConfidenceDisplay}
                  </dd>
                </div>

                <div className="flex justify-between gap-4">
                  <dt className="font-semibold text-slate-500">
                    Strong Comps Used
                  </dt>
                  <dd
                    className={`text-right font-black ${
                      comps.length ? "text-slate-900" : "text-slate-400"
                    }`}
                  >
                    {comps.length ? compSummary.includedCount : "—"}
                  </dd>
                </div>

                <div className="flex justify-between gap-4">
                  <dt className="font-semibold text-slate-500">
                    Comp-Supported Value
                  </dt>
                  <dd
                    className={`text-right font-black ${
                      comps.length ? "text-slate-950" : "text-slate-400"
                    }`}
                  >
                    {comps.length
                      ? money(
                          (compSummary as { medianAdjusted?: number })
                            .medianAdjusted || compSummary.averageAdjusted,
                        )
                      : "—"}
                  </dd>
                </div>

                <div className="flex justify-between gap-4">
                  <dt className="font-semibold text-slate-500">
                    Conservative Sale Value
                  </dt>
                  <dd
                    className={`text-right font-black ${
                      hasEvaluationData && compSummary.fastSaleTarget > 0
                        ? "text-slate-950"
                        : "text-slate-400"
                    }`}
                  >
                    {hasEvaluationData && compSummary.fastSaleTarget > 0
                      ? money(compSummary.fastSaleTarget)
                      : "—"}
                  </dd>
                </div>
              </dl>

              <div className="mt-5 grid grid-cols-2 gap-4 border-t border-slate-100 pt-5">
                <ScoreRing
                  label="Deal Economics"
                  score={profitabilityScoreDisplay}
                  tone="green"
                  isEmpty={!hasEvaluationData || needsCompSearch}
                />

                <ScoreRing
                  label="Dealer Fit"
                  score={dealerFitScoreDisplay}
                  tone="blue"
                  isEmpty={!hasEvaluationData}
                />
              </div>

              <button
                type="button"
                onClick={() => setDealerProfileOpen(true)}
                disabled={!hasEvaluationData}
                className="mx-auto mt-4 block text-xs font-extrabold text-blue-700 hover:text-blue-900 disabled:cursor-not-allowed disabled:text-slate-400"
              >
                Dealer Profile & Preferences →
              </button>
            </article>
          </section>

          <section className="mt-4">
            <SectionCard
              title="Tell Lot Logic What You Know About This Vehicle"
              action={
                <div className="flex items-center gap-2">
                  {conditionAnalysis ? (
                    <span className={`rounded-full px-3 py-1 text-[10px] font-black ${conditionAnalysisApplied ? "bg-emerald-50 text-emerald-700" : "bg-violet-50 text-violet-700"}`}>
                      {conditionAnalysisApplied ? "Applied to valuation" : "Review before applying"}
                    </span>
                  ) : null}
                  <button
                    type="button"
                    onClick={openConditionAnalysis}
                    disabled={!hasEvaluationData}
                    className="rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs font-extrabold text-slate-600 hover:bg-slate-50 disabled:cursor-not-allowed disabled:text-slate-300"
                  >
                    Detailed editor
                  </button>
                </div>
              }
            >
              <div className="grid gap-5 lg:grid-cols-2">
                <div>
                  {!conditionAnalysis ? (
                    <>
                      <p className="max-w-3xl text-sm font-semibold leading-6 text-slate-600">
                        Paste auction announcements, condition-report notes, seller comments, inspection observations, known damage, warning lights, service history, or anything else that could affect value or reconditioning. Lot Logic will turn the messy notes into specific issues you can confirm.
                      </p>

                      <textarea
                        value={conditionSourceText}
                        onChange={(event) => {
                          setConditionSourceText(event.target.value);
                          setConditionAnalysisApplied(false);
                        }}
                        disabled={!hasEvaluationData}
                        placeholder={hasEvaluationData ? "Example: rear tires are around 3/32, windshield has a chip, front bumper is scuffed, CEL is on, seller says brakes were replaced recently..." : "Enter a vehicle first, then add everything you know about its condition."}
                        className="mt-4 min-h-[190px] w-full resize-y rounded-2xl border border-slate-200 bg-slate-50/60 p-4 text-sm font-medium leading-6 text-slate-700 outline-none transition focus:border-violet-300 focus:bg-white disabled:cursor-not-allowed disabled:bg-slate-100"
                      />

                      <div className="mt-3 flex flex-wrap items-center justify-between gap-3">
                        <div className="text-xs font-semibold text-slate-400">
                          Better vehicle context improves recon, risk, and the recommended buy economics.
                        </div>
                        <button
                          type="button"
                          onClick={() => void analyzeConditionInformation()}
                          disabled={conditionAnalysisLoading || !hasEvaluationData || !conditionSourceText.trim()}
                          className="rounded-xl bg-violet-700 px-5 py-2.5 text-sm font-black text-white hover:bg-violet-800 disabled:cursor-not-allowed disabled:bg-slate-300"
                        >
                          {conditionAnalysisLoading ? "Analyzing..." : "Analyze Vehicle Notes"}
                        </button>
                      </div>
                    </>
                  ) : (
                    <div className="h-full rounded-2xl border border-slate-200 bg-slate-50/60 p-5">
                      <div className="flex flex-wrap items-start justify-between gap-3">
                        <div>
                          <div className="text-[10px] font-black uppercase tracking-[0.1em] text-violet-600">Lot Logic Vehicle Read</div>
                          <h3 className="mt-1 text-lg font-black text-slate-950">What helps — and what actually needs attention</h3>
                        </div>
                        <span className={`rounded-full px-3 py-1 text-[10px] font-black ${dealerFitResult.score >= 72 ? "bg-blue-50 text-blue-700" : dealerFitResult.score >= 55 ? "bg-amber-50 text-amber-700" : "bg-slate-100 text-slate-600"}`}>
                          Dealer Fit: {dealerFitContext}
                        </span>
                      </div>

                      <div className="mt-5 grid gap-5 sm:grid-cols-2">
                        <div>
                          <div className="text-[9px] font-black uppercase tracking-[0.12em] text-emerald-700">What strengthens the deal</div>
                          <ul className="mt-3 space-y-2.5">
                            {(dealStrengthBullets.length ? dealStrengthBullets : ["No specific positive signal has been established yet."]).slice(0, 5).map((item) => (
                              <li key={item} className="flex gap-2 text-xs font-semibold leading-5 text-slate-700">
                                <span className="mt-[7px] h-1.5 w-1.5 shrink-0 rounded-full bg-emerald-500" />
                                <span>{item}</span>
                              </li>
                            ))}
                          </ul>
                        </div>

                        <div>
                          <div className="text-[9px] font-black uppercase tracking-[0.12em] text-amber-700">What needs attention</div>
                          <ul className="mt-3 space-y-2.5">
                            {(dealConcernBullets.length ? dealConcernBullets : ["No material vehicle-specific concern has been identified from the supplied notes."]).slice(0, 5).map((item) => (
                              <li key={item} className="flex gap-2 text-xs font-semibold leading-5 text-slate-700">
                                <span className="mt-[7px] h-1.5 w-1.5 shrink-0 rounded-full bg-amber-500" />
                                <span>{item}</span>
                              </li>
                            ))}
                          </ul>
                        </div>
                      </div>

                      <div className="mt-5 flex flex-wrap items-center justify-between gap-3 border-t border-slate-200 pt-4">
                        <p className="text-[10px] font-semibold leading-4 text-slate-400">
                          Only vehicle-specific evidence and supported deal signals are shown here. Generic buying hygiene is intentionally excluded.
                        </p>
                        <button
                          type="button"
                          onClick={() => {
                            setConditionAnalysis(null);
                            setConditionAnalysisApplied(false);
                          }}
                          className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs font-black text-slate-600 hover:bg-slate-50"
                        >
                          Edit vehicle notes
                        </button>
                      </div>
                    </div>
                  )}

                  {conditionAnalysisError ? (
                    <div className="mt-3 rounded-xl bg-red-50 px-4 py-3 text-sm font-bold text-red-700">
                      {conditionAnalysisError}
                    </div>
                  ) : null}
                </div>

                <div className="rounded-2xl border border-slate-200 bg-slate-50/70 p-4">
                  {!conditionAnalysis ? (
                    <div className="flex h-full min-h-[260px] flex-col justify-center text-center">
                      <div className="text-sm font-black text-slate-800">AI-detected recon will appear here.</div>
                      <p className="mx-auto mt-2 max-w-sm text-xs font-semibold leading-5 text-slate-500">
                        Analyze the vehicle notes, then confirm or uncheck each proposed item before it affects the valuation.
                      </p>
                    </div>
                  ) : (
                    <>
                      <div className="flex items-start justify-between gap-3">
                        <div>
                          <div className="text-[10px] font-black uppercase tracking-[0.1em] text-violet-600">AI Recon Planning Reserve</div>
                          <div className="mt-1 flex items-center gap-2">
                            {conditionReconOverrideEditing ? (
                              <div className="flex items-center rounded-lg border border-violet-200 bg-white px-2 py-1">
                                <span className="text-lg font-black text-slate-500">≈ $</span>
                                <input
                                  autoFocus
                                  type="text"
                                  inputMode="numeric"
                                  value={formatNumberInput(getEffectiveConditionPlanningEstimate())}
                                  onFocus={(event) => event.currentTarget.select()}
                                  onChange={(event) => {
                                    setConditionPlanningEstimateOverride(Math.max(0, toNumber(event.target.value)));
                                    // This is an explicit user override, so apply it to
                                    // deal economics immediately rather than requiring a
                                    // second Apply click.
                                    setConditionAnalysisApplied(true);
                                  }}
                                  onBlur={() => setConditionReconOverrideEditing(false)}
                                  onKeyDown={(event) => {
                                    if (event.key === 'Enter' || event.key === 'Escape') {
                                      event.currentTarget.blur();
                                    }
                                  }}
                                  className="w-24 bg-transparent px-1 text-2xl font-black text-slate-950 outline-none"
                                  aria-label="User recon override"
                                />
                              </div>
                            ) : (
                              <div className="text-2xl font-black text-slate-950">≈ {money(getEffectiveConditionPlanningEstimate())}</div>
                            )}
                            <button
                              type="button"
                              onClick={() => setConditionReconOverrideEditing(true)}
                              title="User Recon Override"
                              aria-label="User Recon Override"
                              className="grid h-7 w-7 place-items-center rounded-lg border border-slate-200 bg-white text-sm text-slate-500 shadow-sm hover:border-violet-200 hover:text-violet-700"
                            >
                              ✎
                            </button>
                          </div>
                          <div className="mt-1 text-[10px] font-black text-slate-600">Planning estimate — not a repair quote</div>
                          <div className="mt-1 text-[10px] font-bold text-slate-500">
                            {conditionAnalysis.issues.filter((issue) => issue.includeInValuation).length} selected · {conditionAnalysis.overallRisk} risk
                          </div>
                        </div>
                        <div className="text-right text-[10px] font-bold text-slate-500">
                          <div>Typical planning range</div>
                          <div className="mt-1 text-xs font-black text-slate-800">{money(conditionAnalysis.estimatedCostLow)}–{money(conditionAnalysis.estimatedCostHigh)}</div>
                        </div>
                      </div>

                      <div className="mt-4 max-h-[230px] space-y-2 overflow-y-auto pr-1">
                        {conditionAnalysis.issues.map((issue) => (
                          <label key={issue.id} className={`flex cursor-pointer items-start gap-3 rounded-xl border px-3 py-2.5 ${issue.includeInValuation ? "border-violet-200 bg-white" : "border-slate-200 bg-slate-100/60 opacity-70"}`}>
                            <input
                              type="checkbox"
                              checked={issue.includeInValuation}
                              onChange={() => toggleConditionAnalysisIssue(issue.id)}
                              className="mt-0.5 h-4 w-4 rounded border-slate-300 accent-violet-700"
                            />
                            <span className="min-w-0 flex-1">
                              <span className="block text-xs font-black leading-4 text-slate-800">{issue.description}</span>
                              <span className="mt-1 flex items-center justify-between gap-2 text-[10px] font-bold text-slate-500">
                                <span className="capitalize">{issue.category.replaceAll("_", " ")}</span>
                                <span>≈ {money(issue.planningEstimate)} reserve</span>
                              </span>
                            </span>
                          </label>
                        ))}
                      </div>

                      <div className="mt-4 rounded-xl border border-violet-100 bg-violet-50/60 px-3 py-2.5">
                        <div className="text-[9px] font-black uppercase tracking-[0.08em] text-violet-700">Why this matters</div>
                        <p className="mt-1 text-[10px] font-semibold leading-4 text-slate-600">
                          These directional reserves test whether the deal still works after likely repairs. Actual shop, parts, and diagnostic costs will vary.
                        </p>
                      </div>

                      <button
                        type="button"
                        onClick={applyConditionAnalysis}
                        className={`mt-3 w-full rounded-xl px-4 py-3 text-sm font-black text-white ${conditionAnalysisApplied ? "bg-emerald-700 hover:bg-emerald-800" : "bg-slate-950 hover:bg-slate-800"}`}
                      >
                        {conditionAnalysisApplied
                          ? `Applied · ≈ ${money(getEffectiveConditionPlanningEstimate())} reserve`
                          : `Apply ${conditionAnalysis.issues.filter((issue) => issue.includeInValuation).length} items · ≈ ${money(getEffectiveConditionPlanningEstimate())} reserve`}
                      </button>
                    </>
                  )}
                </div>
              </div>
            </SectionCard>
          </section>

          <section ref={compSectionRef} className="mt-4 scroll-mt-4">
            <SectionCard
              title="Comparable Vehicles"
              action={
                <div className="flex flex-wrap items-center justify-end gap-2">
                  <button
                    type="button"
                    onClick={openCompMarketEditor}
                    disabled={!hasEvaluationData || marketCheckLoading}
                    className="rounded-lg bg-blue-700 px-3.5 py-2 text-xs font-black text-white hover:bg-blue-800 disabled:cursor-not-allowed disabled:bg-slate-300"
                  >
                    {marketCheckLoading ? "Finding Comps..." : "Edit Comps"}
                  </button>

                  <span className="rounded-full bg-blue-50 px-3 py-1 text-xs font-black text-blue-700">
                    {compSummary.includedCount} Strong Comps
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
              {comps.length ? (
                <MarketCompsTable
                  comps={comps}
                  targetMileage={targetMileage}
                  assumptions={activeAssumptions}
                  onToggleIncluded={toggleCompIncluded}
                />
              ) : (
                <div className="flex min-h-56 items-center justify-center rounded-2xl border border-dashed border-slate-300 bg-slate-50/70 px-6 text-center">
                  <div className="max-w-2xl">
                    <div className="text-sm font-extrabold text-slate-800">
                      {marketCheckSearchMeta
                        ? compTrimRelaxed
                          ? `Broader ${vehicleMake} ${vehicleModel} search completed — no strong comps yet`
                          : marketCheckApiUsage?.filterDiagnostics?.returnedListings
                            ? "Listings found, but none qualified as strong comps"
                            : `No strong comps found after searching ${marketCheckSearchMeta.regionsChecked.length} ${marketCheckSearchMeta.regionsChecked.length === 1 ? "region" : "regions"}`
                        : "No comparable vehicles loaded"}
                    </div>
                    <div className="mt-2 text-sm font-medium leading-6 text-slate-500">
                      {marketCheckSearchMeta
                        ? compTrimRelaxed
                          ? `Lot Logic reran ${vehicleMake} ${vehicleModel} with trim ignored across ${marketCheckSearchMeta.regionsChecked.join(", ") || "the previously searched markets"}. It reviewed ${marketCheckApiUsage?.filterDiagnostics?.returnedListings || 0} returned listings, but none met the strong-comp criteria. Use Edit Comps to expand geography further or review the match strategy.`
                          : marketCheckApiUsage?.filterDiagnostics?.returnedListings
                            ? "Lot Logic found listings, but the current vehicle-match rules did not produce usable evidence. Keep the exact configuration and expand geography first; broaden Vehicle Match only when exact-trim evidence remains thin."
                            : `Lot Logic searched ${marketCheckSearchMeta.regionsChecked.join(", ") || "the selected markets"} without finding usable comps. Keep the exact configuration and use Edit Comps to expand into additional non-overlapping markets.`
                        : "Run the evaluation to search the local market for a usable comp set."}
                    </div>

                    {marketCheckSearchMeta && vehicleTrim && marketCheckSearchMeta.regionsChecked.length >= 4 && !compTrimRelaxed ? (
                      <div className="mt-5 rounded-xl border border-amber-200 bg-amber-50 px-4 py-4 text-left">
                        <div className="text-xs font-black uppercase tracking-[0.08em] text-amber-800">Vehicle match may be too specific</div>
                        <p className="mt-1 text-xs font-semibold leading-5 text-amber-900/80">
                          We are searching for {vehicleMake} {vehicleModel} {vehicleTrim}. The trim may be narrowing the evidence more than it helps. Lot Logic can keep the model, year, mileage, and other relevance checks while relaxing trim specificity.
                        </p>
                        <button
                          type="button"
                          onClick={() => void broadenCompVehicleMatch()}
                          disabled={marketCheckLoading}
                          className="mt-3 rounded-lg bg-amber-700 px-4 py-2 text-xs font-black text-white hover:bg-amber-800 disabled:bg-slate-300"
                        >
                          Search as {vehicleMake} {vehicleModel}
                        </button>
                      </div>
                    ) : compTrimRelaxed ? (
                      <div className="mt-4 text-xs font-bold text-blue-700">✓ Broader vehicle search completed: {vehicleMake} {vehicleModel} (trim ignored).</div>
                    ) : null}
                  </div>
                </div>
              )}

              <div className="mt-4 grid gap-3 rounded-2xl bg-slate-50 p-3 text-center sm:grid-cols-5">
                {[
                  [
                    "Regions Searched",
                    marketCheckSearchMeta?.regionsChecked.length
                      ? String(marketCheckSearchMeta.regionsChecked.length)
                      : "—",
                  ],
                  [
                    "Strong Comps",
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
                Lot Logic ranks true comparables by vehicle equivalence, mileage, geography, and market relevance. Keep the strongest evidence selected; uncheck a listing that does not belong. If the local set is thin, add nearby markets before using major national reference markets.
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
