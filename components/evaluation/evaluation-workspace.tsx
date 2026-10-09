"use client";

import Link from "next/link";
import { PlanSelectionModal } from "@/components/billing/plan-selection-modal";
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
import {
  describeMarketCheckAttempt,
  recommendCompSearchAction,
  type CompSearchReportEntry,
} from "@/lib/evaluation/comp-search-orchestration";
import {
  buildDeterministicVehicleIdentityProfile,
  type VehicleIdentityProfile,
} from "@/lib/evaluation/vehicle-identity-profile";
import { buildExpansionMarkets } from "@/lib/marketcheck/metro-expansion";
import { findModelTaxonomyFallback } from "@/lib/marketcheck/model-taxonomy";
import { calculateCompSummary } from "@/lib/comps";
import { defaultAssumptions } from "@/lib/assumptions";
import { calculateDealerFit } from "@/lib/dealer-fit";
import { findPrimaryMindfulIntelligenceMatch } from "@/lib/mindful-intelligence";
import { calculateDealEconomicsScore, calculateValuation } from "@/lib/valuation";
import { trackEvent } from "@/lib/analytics/client";
import type { MarketComp } from "@/types/comps";
import type { VinDecodeResult } from "@/types/vin";
import type { EvaluationCosts, ValuationInput } from "@/types/evaluation";
import type {
  ConditionAnalysis,
  ConditionAnalysisIssue,
} from "@/lib/ai/condition-analysis-types";

import { evaluationDraftStorageKey as draftStorageKey } from "@/lib/evaluation-draft";

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

const conditionAnalysisProgressSteps = [
  "Reviewing condition notes",
  "Identifying material issues",
  "Estimating likely repairs",
  "Pricing likely repairs",
  "Building condition reserve",
] as const;


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
      <div className="mb-1.5 text-xs font-extrabold text-slate-600">{label}</div>

      <div
        className="relative grid h-[78px] w-[78px] place-items-center rounded-full"
        style={{
          background: isEmpty
            ? "#e2e8f0"
            : `conic-gradient(${ringColor} ${
                normalizedScore * 3.6
              }deg, #e2e8f0 0deg)`,
        }}
      >
        <div className="grid h-[64px] w-[64px] place-items-center rounded-full bg-white shadow-inner">
          <div>
            <div className={`text-[23px] font-black leading-none tracking-[-0.04em] ${
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


function MarketLiquidityVisual({
  soldLow,
  soldHigh,
  soldMedian,
  activeDays,
  label,
  confidence,
  sampleSize,
}: {
  soldLow: number;
  soldHigh: number;
  soldMedian: number;
  activeDays: number;
  label: string;
  confidence: "low" | "medium" | "high" | "unknown";
  sampleSize: number;
}) {
  const hasSoldRange = soldLow > 0 && soldHigh > 0;
  const hasActive = activeDays > 0;
  const scaleMax = Math.max(
    60,
    soldHigh > 0 ? soldHigh * 1.35 : 0,
    activeDays > 0 ? activeDays * 1.25 : 0,
  );
  const pct = (days: number) =>
    Math.max(0, Math.min(100, (days / scaleMax) * 100));
  const rangeLeft = pct(soldLow);
  const rangeWidth = Math.max(6, pct(soldHigh) - rangeLeft);
  const medianLeft = pct(soldMedian);
  const activeLeft = pct(activeDays);

  const labelTone =
    label === "Fast" || label === "Good"
      ? "text-emerald-700"
      : label === "Normal"
        ? "text-amber-700"
        : label === "Slow" || label === "Very Slow"
          ? "text-orange-700"
          : "text-slate-700";

  return (
    <div className="rounded-2xl border border-slate-200 bg-slate-50/70 px-3.5 py-3">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between sm:gap-3">
        <div className="flex flex-wrap items-baseline gap-x-2 gap-y-1">
          <div className="text-xs font-extrabold text-slate-600">
            Time to Sell
          </div>
          <div className={`text-base font-black ${labelTone}`}>{label}</div>
        </div>

        {hasSoldRange ? (
          <div className="text-left sm:text-right">
            <div className="text-[9px] font-black uppercase tracking-[0.07em] text-slate-400 sm:text-[10px]">
              Typical retail window
            </div>
            <div className="mt-0.5 text-sm font-black text-slate-800">
              {Math.round(soldLow)}–{Math.round(soldHigh)} days
            </div>
          </div>
        ) : hasActive ? (
          <div className="inline-flex w-fit rounded-full bg-blue-50 px-2.5 py-1 text-[9px] font-black uppercase tracking-[0.06em] text-blue-700 sm:bg-transparent sm:px-0 sm:py-0 sm:text-right sm:text-[10px] sm:text-slate-400">
            Current market age
          </div>
        ) : null}
      </div>

      <div className="mt-2.5">
        <div className="mb-1 flex justify-between text-[8px] font-black uppercase tracking-[0.06em] text-slate-400">
          <span>Quick turn</span>
          <span>Typical</span>
          <span>Slow turn</span>
        </div>

        <div className="relative pt-6 pb-1">
          <div className="relative h-4 rounded-full bg-gradient-to-r from-emerald-400 via-amber-300 to-orange-400 shadow-inner">
            {hasSoldRange ? (
              <div
                className="absolute top-1/2 h-6 -translate-y-1/2 rounded-full border border-white/80 bg-white/45 shadow-sm backdrop-blur-[1px]"
                style={{ left: `${rangeLeft}%`, width: `${rangeWidth}%` }}
                title="Typical recent sold range"
              />
            ) : null}

            {hasSoldRange && soldMedian > 0 ? (
              <div
                className="absolute top-1/2 h-7 w-[2px] -translate-y-1/2 bg-emerald-950/65"
                style={{ left: `calc(${medianLeft}% - 1px)` }}
                title={`Recent sold median: ${Math.round(soldMedian)} days`}
              />
            ) : null}

            {hasActive ? (
              <>
                <div
                  className="absolute top-1/2 h-7 w-7 -translate-y-1/2 rounded-full border-2 border-white bg-blue-700 shadow-[0_4px_14px_rgba(37,99,235,0.35)]"
                  style={{ left: `calc(${activeLeft}% - 14px)` }}
                  title={`Current active market age: ${Math.round(activeDays)} days`}
                />
                <div
                  className="absolute -top-1 -translate-x-1/2 -translate-y-full rounded-full bg-blue-700 px-2 py-1 text-[10px] font-black text-white shadow-md"
                  style={{ left: `${activeLeft}%` }}
                >
                  {Math.round(activeDays)}d
                </div>
              </>
            ) : null}
          </div>

          <div className="mt-1.5 flex justify-between text-[8px] font-bold text-slate-400">
            <span>0 days</span>
            <span>{Math.round(scaleMax)}+ days</span>
          </div>
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-x-4 gap-y-1.5 text-[10px] font-bold text-slate-500">
        {hasSoldRange ? (
          <span className="inline-flex items-center gap-1.5">
            <span className="h-3 w-5 rounded-full border border-slate-300 bg-white/70" />
            Typical sold range
          </span>
        ) : null}

        {hasSoldRange && soldMedian > 0 ? (
          <span className="inline-flex items-center gap-1.5">
            <span className="h-3 w-[2px] bg-emerald-950/65" />
            Sold median
          </span>
        ) : null}

      </div>

      <div className="mt-2 text-[10px] font-semibold leading-4 text-slate-400">
        {sampleSize > 0
          ? `${sampleSize} recent sold observations · ${confidence} confidence`
          : hasActive
            ? "Active-market timing only · recent sold history unavailable."
            : "Sell-through history is not available for this market yet."}
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

function createEvaluationUsageId() {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return crypto.randomUUID();
  }

  return `eval-${Date.now()}-${Math.random().toString(36).slice(2, 12)}`;
}

type ThesisMode = "financial" | "enthusiast" | "balanced";
type ConditionReviewStatus =
  | "unreviewed"
  | "no_material_issues"
  | "issues"
  | "unknown";

type SavedEvaluationPayload = {
  evaluationUsageId?: string;
  vin?: string;
  auctionSite?: string;
  finalTargetOverride?: number | null;
  decodedVehicle?: VinDecodeResult | null;
  vehicleIdentityProfile?: VehicleIdentityProfile | null;
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
  conditionReviewStatus?: ConditionReviewStatus;
  notes?: string;
};

type EvaluationStage = "vehicle" | "condition" | "market" | "verdict";

function deriveEvaluationStage(payload?: SavedEvaluationPayload | null): EvaluationStage {
  if (!payload) {
    return "vehicle";
  }

  const decoded = payload.decodedVehicle;
  const manual = payload.manualVehicle;
  const hasVehicleBasics = Boolean(
    (decoded?.year && decoded?.make && decoded?.model) ||
      (manual?.year && manual?.make && manual?.model),
  );
  const vehicleComplete = Boolean(
    hasVehicleBasics &&
      (payload.targetMileage || 0) > 0 &&
      (payload.evaluation?.currentBid || 0) > 0,
  );

  if (!vehicleComplete) {
    return "vehicle";
  }

  const reviewStatus =
    payload.conditionReviewStatus ||
    (payload.conditionAnalysisApplied || payload.conditionAssessmentsTouched
      ? "issues"
      : "unreviewed");

  const conditionComplete =
    reviewStatus === "no_material_issues" ||
    reviewStatus === "unknown" ||
    (reviewStatus === "issues" &&
      Boolean(
        payload.conditionAnalysis
          ? payload.conditionAnalysisApplied
          : payload.conditionAssessmentsTouched,
      ));

  if (!conditionComplete) {
    return "condition";
  }

  const hasIncludedComps = Boolean(payload.comps?.some((comp) => comp.included));

  return hasIncludedComps ? "verdict" : "market";
}


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

  const [evaluationUsageId, setEvaluationUsageId] = useState(
    initialSavedPayload?.evaluationUsageId ||
      (initialSavedEvaluationId ? `saved-${initialSavedEvaluationId}` : ""),
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
  const [vehicleIdentityProfile, setVehicleIdentityProfile] =
    useState<VehicleIdentityProfile | null>(
      initialSavedPayload?.vehicleIdentityProfile ||
        (initialSavedPayload?.decodedVehicle
          ? buildDeterministicVehicleIdentityProfile(
              initialSavedPayload.decodedVehicle,
            )
          : null),
    );
  const [vehicleIdentityProfileStatus, setVehicleIdentityProfileStatus] =
    useState(
      initialSavedPayload?.vehicleIdentityProfile
        ? "Vehicle identity ready"
        : "",
    );

  const [manualVehicle, setManualVehicle] = useState<ManualVehicleBasics>(
    initialSavedPayload?.manualVehicle || initialManualVehicle,
  );

  const [marketCheckLoading, setMarketCheckLoading] = useState(false);
  const [evaluationRunning, setEvaluationRunning] = useState(false);
  const [marketCheckStatus, setMarketCheckStatus] = useState("");
  const [marketCheckError, setMarketCheckError] = useState<{
    code: string;
    message: string;
  } | null>(null);
  const [autoDevDiscoveryLoading, setAutoDevDiscoveryLoading] = useState(false);
  const [autoDevDiscoveryStatus, setAutoDevDiscoveryStatus] = useState("");
  const [autoDevDiscovery, setAutoDevDiscovery] = useState<{
    source: "auto.dev";
    role: "discovery-only";
    query: {
      year: number;
      make: string;
      model: string;
      trim: string | null;
      yearMin: number;
      yearMax: number;
      generation: string | null;
      sampleLimit: number;
    };
    total: number;
    returned: number;
    sampleCapped: boolean;
    byState: Record<string, number>;
    recommendedMarkets: Array<{
      market: string;
      zip: string;
      latitude: number;
      longitude: number;
      coverageCount: number;
      states: string[];
      vins: string[];
    }>;
    listings: Array<{
      vin: string | null;
      year: number | null;
      make: string | null;
      model: string | null;
      trim: string | null;
      drivetrain: string | null;
      price: number | null;
      miles: number | null;
      dealer: string | null;
      city: string | null;
      state: string | null;
      zip: string | null;
      url: string | null;
      longitude: number | null;
      latitude: number | null;
    }>;
  } | null>(null);
  const [, setCompSearchHistory] = useState<CompSearchReportEntry[]>([]);
  const [compSearchImproving, setCompSearchImproving] = useState(false);
  const [compSearchImprovementStatus, setCompSearchImprovementStatus] = useState("");

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
    marketLiquidity?: {
      historicalSoldCount?: number;
      soldMedianDays?: number;
      soldP25Days?: number;
      soldP75Days?: number;
      soldAverageDays?: number;
      currentActiveAverageDays?: number;
      currentDealerAverageDays?: number;
      region?: string;
      zip?: string;
      radius?: number;
      generation?: string | null;
      yearQuery?: string;
      source?: string;
      confidence?: "low" | "medium" | "high";
    } | null;
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
      rejectionCounts?: {
        fuelMismatch?: number;
        missingPriceOrMileage?: number;
        qualityBelowThreshold?: number;
        generationMismatch?: number;
        modelMismatch?: number;
        other?: number;
      };
      sampleRejectedListings?: Array<{
        title?: string;
        year?: number | string;
        make?: string;
        model?: string;
        trim?: string;
        rejectedReasons?: string[];
      }>;
    };
  } | null>(null);

  const marketCheckInFlightRef = useRef(false);
  const vehicleIdentityRequestVinRef = useRef("");
  const vehicleIdentityProfilePromiseRef =
    useRef<Promise<VehicleIdentityProfile> | null>(null);
  const [draftReady, setDraftReady] = useState(false);
  const [vinDecodeLoading, setVinDecodeLoading] = useState(false);
  const [vinDecodeError, setVinDecodeError] = useState("");
  const mileageInputRef = useRef<HTMLInputElement | null>(null);
  const compSectionRef = useRef<HTMLElement | null>(null);
  const conditionSectionRef = useRef<HTMLElement | null>(null);
  const [compSearchHandedOff, setCompSearchHandedOff] = useState(false);
  const [automaticCompSearchCompleted, setAutomaticCompSearchCompleted] =
    useState(false);
  const [conditionSectionExpanded, setConditionSectionExpanded] = useState(false);
  const [vehicleInfoOpen, setVehicleInfoOpen] = useState(false);
  const [activeStage, setActiveStage] =
    useState<EvaluationStage>(() => deriveEvaluationStage(initialSavedPayload));
  const [vehicleStepConfirmed, setVehicleStepConfirmed] = useState(() => {
    const stage = deriveEvaluationStage(initialSavedPayload);
    return stage !== "vehicle";
  });
  const [conditionStepConfirmed, setConditionStepConfirmed] = useState(() => {
    const stage = deriveEvaluationStage(initialSavedPayload);
    return stage === "market" || stage === "verdict";
  });
  const [verdictTransitioning, setVerdictTransitioning] = useState(false);
  const [usageLimitMessage, setUsageLimitMessage] = useState("");
  const [evaluationAccessError, setEvaluationAccessError] = useState("");
  const [planSelectionMessage, setPlanSelectionMessage] = useState<string | null>(null);

  useEffect(() => {
    const handleEvaluationLimit = (event: Event) => {
      const detail = (event as CustomEvent<{ message?: string }>).detail;
      setPlanSelectionMessage(
        detail?.message ||
          "You’ve used your available evaluations. Choose a plan to start another.",
      );
    };

    window.addEventListener(
      "lotlogic:evaluation-limit-reached",
      handleEvaluationLimit,
    );
    return () => {
      window.removeEventListener(
        "lotlogic:evaluation-limit-reached",
        handleEvaluationLimit,
      );
    };
  }, []);
  const [verdictEntered, setVerdictEntered] = useState(
    () => deriveEvaluationStage(initialSavedPayload) === "verdict",
  );
  const [conditionAnalysisProgressIndex, setConditionAnalysisProgressIndex] =
    useState(0);
  const [allInCostOpen, setAllInCostOpen] = useState(false);
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
  const [needsDealershipZip, setNeedsDealershipZip] = useState(false);
  const [dealershipProfile, setDealershipProfile] = useState<{ zip: string; websiteUrl: string }>({ zip: "", websiteUrl: "" });
  const [dealerProfileOpen, setDealerProfileOpen] = useState(false);
  const [whyLotLogicOpen, setWhyLotLogicOpen] = useState(false);
  const [conditionProfitabilityOpen, setConditionProfitabilityOpen] =
    useState(false);
  const [conditionModalTab, setConditionModalTab] = useState<"ai" | "manual">(
    "ai",
  );
  const [conditionSourceEditorOpen, setConditionSourceEditorOpen] = useState(false);
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
  const [conditionAnalysisRetryable, setConditionAnalysisRetryable] =
    useState(false);
  const [conditionAnalysisApplied, setConditionAnalysisApplied] = useState(
    Boolean(initialSavedPayload?.conditionAnalysisApplied),
  );
  const [conditionReviewStatus, setConditionReviewStatus] =
    useState<ConditionReviewStatus>(
      initialSavedPayload?.conditionReviewStatus ||
        (initialSavedPayload?.conditionAnalysisApplied ||
        initialSavedPayload?.conditionAssessmentsTouched
          ? "issues"
          : "unreviewed"),
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
    useState({ ...defaultAssumptions, regionalMarkets: [] as typeof defaultAssumptions.regionalMarkets });
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
          setNeedsDealershipZip(Boolean(data.needsDealershipZip));
          setDealershipProfile(data.dealershipProfile || { zip: "", websiteUrl: "" });
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
    if (!conditionAnalysisLoading) {
      setConditionAnalysisProgressIndex(0);
      return;
    }

    setConditionAnalysisProgressIndex(0);
    const timer = window.setInterval(() => {
      setConditionAnalysisProgressIndex((current) =>
        Math.min(current + 1, conditionAnalysisProgressSteps.length - 1),
      );
    }, 850);

    return () => window.clearInterval(timer);
  }, [conditionAnalysisLoading]);

  useEffect(() => {
    if (activeStage !== "verdict") {
      setVerdictEntered(false);
      return;
    }

    const frame = window.requestAnimationFrame(() => {
      setVerdictEntered(true);
    });

    return () => window.cancelAnimationFrame(frame);
  }, [activeStage]);

  useEffect(() => {
    if (initialSavedEvaluationId || initialSavedPayload) {
      if (!evaluationUsageId) {
        setEvaluationUsageId(
          initialSavedEvaluationId
            ? `saved-${initialSavedEvaluationId}`
            : createEvaluationUsageId(),
        );
      }
      setDraftReady(true);
      return;
    }

    try {
      const rawDraft =
        typeof window !== "undefined"
          ? window.localStorage.getItem(draftStorageKey)
          : null;

      if (!rawDraft) {
        setEvaluationUsageId(createEvaluationUsageId());
        setDraftReady(true);
        return;
      }

      const draft = JSON.parse(rawDraft);

      setEvaluationUsageId(
        typeof draft.evaluationUsageId === "string" && draft.evaluationUsageId.trim()
          ? draft.evaluationUsageId
          : createEvaluationUsageId(),
      );

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
        setVehicleIdentityProfile(
          draft.vehicleIdentityProfile ||
            buildDeterministicVehicleIdentityProfile(draft.decodedVehicle),
        );
        setVehicleIdentityProfileStatus("Vehicle identity ready");
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

      if (
        draft.conditionReviewStatus === "unreviewed" ||
        draft.conditionReviewStatus === "no_material_issues" ||
        draft.conditionReviewStatus === "issues" ||
        draft.conditionReviewStatus === "unknown"
      ) {
        setConditionReviewStatus(draft.conditionReviewStatus);
      } else if (
        draft.conditionAnalysisApplied === true ||
        draft.conditionAssessmentsTouched === true
      ) {
        setConditionReviewStatus("issues");
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
      const restoredStage = deriveEvaluationStage(draft as SavedEvaluationPayload);
      setActiveStage(restoredStage);
      setVehicleStepConfirmed(restoredStage !== "vehicle");
      setConditionStepConfirmed(
        restoredStage === "market" || restoredStage === "verdict",
      );
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
          evaluationUsageId,
          vin,
          auctionSite,
          finalTargetOverride,
          decodedVehicle,
          vehicleIdentityProfile,
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
          conditionReviewStatus,
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
    evaluationUsageId,
    vin,
    auctionSite,
    finalTargetOverride,
    decodedVehicle,
    vehicleIdentityProfile,
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
    conditionReviewStatus,
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
  const compTaxonomyFallback = findModelTaxonomyFallback({
    make: vehicleMake,
    model: vehicleModel,
  });
  const compRetrievalLabel = compTaxonomyFallback
    ? [vehicleMake, compTaxonomyFallback.fallbackModel, "broad model bucket"]
        .filter(Boolean)
        .join(" / ")
    : [vehicleMake, vehicleModel].filter(Boolean).join(" ");
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
      .trim() || "New Evaluation";

  useEffect(() => {
    setCompTrimRelaxed(false);
    setAutoDevDiscovery(null);
    setAutoDevDiscoveryStatus("");
  }, [vehicleYear, vehicleMake, vehicleModel, vehicleTrim]);

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

  function updateAllInCostAmount(
    key:
      | "currentBid"
      | "auctionFee"
      | "transport"
      | "reconCombined"
      | "detailAdmin"
      | "generalRiskReserve"
      | "brandRiskAdd",
    value: number,
  ) {
    const normalizedValue = Math.max(0, Number.isFinite(value) ? value : 0);

    if (key === "currentBid") {
      // Purchase price is required deal data. Do not let the cost editor
      // accidentally zero it while selecting/clearing/retyping the field.
      if (normalizedValue <= 0) return;
      updateEvaluationField("currentBid", normalizedValue);
      return;
    }

    if (key === "reconCombined") {
      setEvaluation((previous) => ({
        ...previous,
        costs: {
          ...previous.costs,
          recon: normalizedValue,
          conditionRiskAdd: 0,
          titleHistoryRiskAdd: 0,
        },
      }));
      return;
    }

    updateCost(key, normalizedValue);
  }

  function updateAllInCostText(
    key:
      | "currentBid"
      | "auctionFee"
      | "transport"
      | "reconCombined"
      | "detailAdmin"
      | "generalRiskReserve"
      | "brandRiskAdd",
    rawValue: string,
  ) {
    const digits = rawValue.replace(/[^0-9]/g, "");

    // The purchase price is required deal data. When a user selects the field
    // and briefly clears it while typing, do not turn the live evaluation into
    // a $0 acquisition and manufacture a huge profit.
    if (key === "currentBid" && !digits) return;

    updateAllInCostAmount(key, digits ? Number(digits) : 0);
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
  async function enrichVehicleIdentityProfile(decoded: VinDecodeResult) {
    const requestVin = String(decoded.vin || "").trim().toUpperCase();
    const baseline = buildDeterministicVehicleIdentityProfile(decoded);

    vehicleIdentityRequestVinRef.current = requestVin;
    setVehicleIdentityProfile(baseline);
    setVehicleIdentityProfileStatus("Building vehicle search profile…");

    try {
      const response = await fetch("/api/evaluations/vehicle-identity-profile", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Accept: "application/json",
        },
        body: JSON.stringify({ decodedVehicle: decoded, evaluationUsageId }),
      });
      const data = await response.json();

      if (
        vehicleIdentityRequestVinRef.current !== requestVin ||
        String(decoded.vin || "").trim().toUpperCase() !== requestVin
      ) {
        return baseline;
      }

      if (!response.ok || !data.profile) {
        setVehicleIdentityProfile(baseline);
        setVehicleIdentityProfileStatus("Vehicle search profile ready");
        return baseline;
      }

      setVehicleIdentityProfile(data.profile as VehicleIdentityProfile);
      setVehicleIdentityProfileStatus(
        data.aiEnhanced
          ? "AI-assisted vehicle search profile ready"
          : "Vehicle search profile ready",
      );
      return data.profile as VehicleIdentityProfile;
    } catch (error) {
      console.warn("Vehicle identity profile enrichment failed:", error);
      if (vehicleIdentityRequestVinRef.current === requestVin) {
        setVehicleIdentityProfile(baseline);
        setVehicleIdentityProfileStatus("Vehicle search profile ready");
      }
      return baseline;
    }
  }

  function startVehicleIdentityProfileEnrichment(decoded: VinDecodeResult) {
    const promise = enrichVehicleIdentityProfile(decoded);
    vehicleIdentityProfilePromiseRef.current = promise;

    void promise.then(() => {
      if (vehicleIdentityProfilePromiseRef.current === promise) {
        vehicleIdentityProfilePromiseRef.current = null;
      }
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
      startVehicleIdentityProfileEnrichment(decoded);

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
    if (
      String(decoded.vin || "").trim().toUpperCase() !==
      String(decodedVehicle?.vin || "").trim().toUpperCase()
    ) {
      setEvaluationUsageId(createEvaluationUsageId());
    }

    setDecodedVehicle(decoded);
    setVehicleIdentityProfile(
      buildDeterministicVehicleIdentityProfile(decoded),
    );
    setVehicleIdentityProfileStatus("Vehicle search profile ready");
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
    setMarketCheckError(null);
    setMarketCheckSearchMeta(null);
    setMarketCheckApiUsage(null);
    setCompSearchHistory([]);
    setCompSearchHandedOff(false);
    setAutomaticCompSearchCompleted(false);
    setAutoDevDiscovery(null);
    setAutoDevDiscoveryStatus("");
    setCompSearchImprovementStatus("");
    setSavedEvaluationId(null);
    setSaveStatus("");
    setConditionReviewStatus("unreviewed");
    setConditionAssessments(initialConditionAssessments);
    setConditionAssessmentsTouched(false);
    setConditionSourceText("");
    setConditionAnalysis(null);
    setOriginalConditionAnalysis(null);
    setConditionPlanningEstimateOverride(null);
    setConditionReadyDaysLowOverride(null);
    setConditionReadyDaysHighOverride(null);
    setConditionAnalysisApplied(false);
    setNotes("");
  }

  function resetForDecodedVin(decoded: VinDecodeResult) {
    setDecodedVehicle(decoded);
    setVehicleIdentityProfile(
      buildDeterministicVehicleIdentityProfile(decoded),
    );
    setVehicleIdentityProfileStatus("Vehicle search profile ready");
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
    setMarketCheckError(null);
    setMarketCheckSearchMeta(null);
    setMarketCheckApiUsage(null);
    setSavedEvaluationId(null);
    setSaveStatus("");
    setConditionReviewStatus("unreviewed");
    setConditionAssessments(initialConditionAssessments);
    setConditionAssessmentsTouched(false);
    setConditionSourceText("");
    setConditionAnalysis(null);
    setOriginalConditionAnalysis(null);
    setConditionPlanningEstimateOverride(null);
    setConditionReadyDaysLowOverride(null);
    setConditionReadyDaysHighOverride(null);
    setConditionAnalysisApplied(false);
    setNotes("");
  }

  function toggleCompIncluded(id: string) {
    setComps((previous) =>
      previous.map((comp) => {
        if (comp.id !== id) return comp;

        const nextIncluded = !comp.included;
        return {
          ...comp,
          included: nextIncluded,
          dealerDecision: nextIncluded ? "include" : "exclude",
          dealerDecisionAt: new Date().toISOString(),
        };
      }),
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
          evaluationUsageId,
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

  function recordMarketCheckSearch(data: any) {
    const usage = data?.apiUsage || {};
    const diagnostics = usage?.filterDiagnostics || {};
    const log = Array.isArray(usage?.searchLog) ? usage.searchLog : [];
    const regions = Array.isArray(data?.search?.regionsChecked)
      ? data.search.regionsChecked
      : [];
    const strategies = Array.from(
      new Set(
        log
          .map((row: any) =>
            describeMarketCheckAttempt(String(row?.attemptName || "")),
          )
          .filter(Boolean),
      ),
    );
    const candidateListings = Number(
      diagnostics?.returnedListings ??
        log.reduce(
          (sum: number, row: any) => sum + Number(row?.listingCount || 0),
          0,
        ),
    );
    const usableComps = Number(
      diagnostics?.usableListings ??
        usage?.usableCompCount ??
        log.reduce(
          (sum: number, row: any) => sum + Number(row?.usableComps || 0),
          0,
        ),
    );
    const rejectionCounts = diagnostics?.rejectionCounts || {};
    const details = [
      data?.search?.generationWidening?.attempted
        ? "Nearby model years checked within " +
          (data.search.generationWidening.generation || "the same generation")
        : null,
      data?.search?.taxonomyDiscovery?.attempted
        ? "Provider model taxonomy checked"
        : null,
      Number(rejectionCounts?.modelMismatch || 0) > 0
        ? String(Number(rejectionCounts.modelMismatch)) +
          " model mismatch" +
          (Number(rejectionCounts.modelMismatch) === 1 ? "" : "es") +
          " rejected"
        : null,
      Number(rejectionCounts?.qualityBelowThreshold || 0) > 0
        ? String(Number(rejectionCounts.qualityBelowThreshold)) +
          " below quality threshold"
        : null,
    ].filter((value): value is string => Boolean(value));

    setCompSearchHistory((current) =>
      [
        ...current,
        {
          id: "marketcheck-" + Date.now() + "-" + current.length,
          source: "MarketCheck" as const,
          strategy: strategies.length
            ? strategies.join(" → ")
            : "MarketCheck search",
          summary:
            candidateListings > 0
              ? String(candidateListings) +
                " candidate listing" +
                (candidateListings === 1 ? "" : "s") +
                " reviewed; " +
                String(usableComps) +
                " cleared the latest retrieval-quality checks."
              : "No candidate inventory returned across " +
                String(regions.length || 1) +
                " searched market" +
                (regions.length === 1 ? "" : "s") +
                " in this pass.",
          details,
          apiCalls: Number(usage?.apiCallsMade || 0),
          candidateListings,
          usableComps,
          regions,
          createdAt: new Date().toISOString(),
        },
      ].slice(-12),
    );
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
      useVinMatch?: boolean;
      preferTaxonomyFallback?: boolean;
      useTaxonomyFallbackTrim?: boolean;
      searchOperationId?: string;
    },
  ) {
    if (needsDealershipZip) {
      setMarketCheckStatus("Set your dealership ZIP in Organization & Team before searching comps.");
      return;
    }
    if (marketCheckInFlightRef.current || marketCheckLoading) {
      setMarketCheckStatus("MarketCheck search already in progress.");
      return;
    }

    marketCheckInFlightRef.current = true;

    const overrideVin =
      vehicleOverride && "vin" in vehicleOverride
        ? String(vehicleOverride.vin || "").trim().toUpperCase()
        : "";
    const useSemanticIdentity =
      !vehicleOverride || /^[A-HJ-NPR-Z0-9]{17}$/.test(overrideVin);

    let activeVehicleIdentityProfile = vehicleIdentityProfile;
    if (useSemanticIdentity && vehicleIdentityProfilePromiseRef.current) {
      setMarketCheckStatus("Finishing the vehicle identity profile…");
      activeVehicleIdentityProfile =
        await vehicleIdentityProfilePromiseRef.current;
    }

    const year = vehicleOverride?.year || vehicleYear;
    const make = useSemanticIdentity
      ? activeVehicleIdentityProfile?.make ||
        vehicleOverride?.make ||
        vehicleMake
      : vehicleOverride?.make || vehicleMake;
    const profileModel = String(
      activeVehicleIdentityProfile?.modelFamily || "",
    ).trim();
    const exactVehicleModel = String(
      vehicleOverride?.model || vehicleModel || "",
    ).trim();
    const model = exactVehicleModel || profileModel;
    const profileVariant = String(
      activeVehicleIdentityProfile?.variant || "",
    ).trim();
    const trim =
      !useSemanticIdentity &&
      vehicleOverride &&
      Object.prototype.hasOwnProperty.call(vehicleOverride, "trim")
        ? String(vehicleOverride.trim || "")
        : useSemanticIdentity && activeVehicleIdentityProfile
          ? profileVariant
          : profileVariant ||
            String(vehicleOverride?.trim || "") ||
            vehicleTrim;
    const fuelType = useSemanticIdentity
      ? activeVehicleIdentityProfile?.fuelType ||
        vehicleOverride?.fuelType ||
        decodedVehicle?.fuelType ||
        null
      : vehicleOverride?.fuelType ||
        activeVehicleIdentityProfile?.fuelType ||
        decodedVehicle?.fuelType ||
        null;
    const candidateVin = String(decodedVehicle?.vin || vin || "")
      .trim()
      .toUpperCase();
    const marketCheckVin =
      options?.useVinMatch === false ||
      !/^[A-HJ-NPR-Z0-9]{17}$/.test(candidateVin)
        ? null
        : candidateVin;

    if (!year || !make || !model) {
      setMarketCheckStatus(
        "Enter a VIN or enter Year, Make, and Model before pulling comps.",
      );
      marketCheckInFlightRef.current = false;
      return;
    }

    // Initial searches replace the prior vehicle's MarketCheck state.
    // Expansion searches preserve existing comps and merge new geography.
    if (!options?.mergeResults) {
      setComps([]);
      setMarketCheckSearchMeta(null);
      setMarketCheckApiUsage(null);
      setCompSearchHistory([]);
      setAutoDevDiscovery(null);
      setAutoDevDiscoveryStatus("");
      setCompSearchImprovementStatus("");
      setCompSearchHandedOff(false);
      setAutomaticCompSearchCompleted(false);
    }

    setMarketCheckLoading(true);
    setMarketCheckError(null);
    setMarketCheckStatus(
      "Searching MarketCheck comps...",
    );

    try {
      const response = await fetch("/api/marketcheck/search", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          evaluationUsageId,
          year,
          make,
          model,
          trim,
          vin: marketCheckVin,
          fuelType,
          preferredModelAliases:
            activeVehicleIdentityProfile?.providerAliases || [],
          qualificationYear:
            activeVehicleIdentityProfile?.year || vehicleYear,
          qualificationMake:
            activeVehicleIdentityProfile?.make || vehicleMake,
          // Preserve the decoded/entered derivative as the final comp target.
          // Canonical model families and aliases broaden retrieval only.
          qualificationModel:
            vehicleModel || activeVehicleIdentityProfile?.modelFamily,
          qualificationTrim:
            activeVehicleIdentityProfile
              ? activeVehicleIdentityProfile.variant
              : vehicleTrim,
          qualificationFuelType:
            activeVehicleIdentityProfile?.fuelType ||
            decodedVehicle?.fuelType ||
            null,
          qualificationDrivetrain:
            activeVehicleIdentityProfile?.drivetrain ||
            decodedVehicle?.driveType ||
            null,
          qualificationBodyType:
            activeVehicleIdentityProfile?.bodyClass ||
            decodedVehicle?.bodyClass ||
            null,
          qualificationDoors: decodedVehicle?.doors || null,
          qualificationCylinders: decodedVehicle?.engineCylinders || null,
          targetMileage,
          searchStage: options?.searchStage || "initial",
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
          maxApiCallsPerSearch:
            options?.maxApiCallsPerSearch ??
            (options?.searchStage === "expanded" ||
            options?.searchStage === "metro"
              ? 3
              : 3),
          minUsableCompsToStop: marketCheckApiControls.minUsableCompsToStop,
          minInitialRegions:
            options?.searchStage === "expanded" ||
            options?.searchStage === "metro"
              ? 3
              : marketCheckApiControls.minInitialRegions,
          includeMarketLiquidity: !options?.mergeResults,
          preferTaxonomyFallback: options?.preferTaxonomyFallback === true,
          useTaxonomyFallbackTrim: options?.useTaxonomyFallbackTrim !== false,
          searchOperationId: options?.searchOperationId || null,
        }),
      });

      const data = await response.json();

      if (!response.ok) {
        const message = data.error || "MarketCheck search failed.";
        setMarketCheckError({
          code: String(data.code || "MARKET_SEARCH_FAILED"),
          message,
        });
        throw new Error(message);
      }

      setMarketCheckError(null);

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

        recordMarketCheckSearch(data);

        const returnedListings = Number(
          data.apiUsage?.filterDiagnostics?.returnedListings || 0,
        );
        const usableListings = Number(
          data.apiUsage?.filterDiagnostics?.usableListings ||
            data.apiUsage?.usableCompCount ||
            0,
        );
        const searchedThisPass = Array.isArray(data.search?.regionsChecked)
          ? data.search.regionsChecked.length
          : 0;

        setMarketCheckStatus(
          returnedListings > 0
            ? "Search completed: " +
              returnedListings +
              " listing" +
              (returnedListings === 1 ? "" : "s") +
              " returned, but none qualified as valuation evidence."
            : "Search completed across " +
              (searchedThisPass || 1) +
              " market" +
              (searchedThisPass === 1 ? "" : "s") +
              "; no candidate listings were returned.",
        );

        const retainedComps = options?.mergeResults ? comps : [];

        return {
          data,
          mergedComps: retainedComps,
          includedCount: retainedComps.filter((comp) => comp.included).length,
          returnedListings,
          usableListings,
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
        };
      }

      const pulledComps = Array.isArray(data.comps) ? data.comps : [];

      // The server is authoritative on comp qualification. Never auto-include
      // fallback rows client-side just because MarketCheck returned inventory:
      // that can temporarily manufacture a sale value/profit verdict before
      // vehicle-equivalence checks have established usable comps.
      const normalizedComps: MarketComp[] = pulledComps.map(
        (comp: MarketComp) => ({
          ...comp,
          included: comp.included === true,
        }),
      );

      const mergedComps: MarketComp[] = options?.mergeResults
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

      recordMarketCheckSearch(data);

      setMarketCheckStatus(
        `${mergedComps.length} comps loaded${
          combinedRegionsChecked.length
            ? ` · ${combinedRegionsChecked.length} regions checked`
            : ""
        }${data.cache?.hit ? " from cache" : ""}`,
      );

      return {
        data,
        mergedComps,
        includedCount: mergedComps.filter((comp) => comp.included).length,
        returnedListings: Number(
          data.apiUsage?.filterDiagnostics?.returnedListings || 0,
        ),
        usableListings: Number(
          data.apiUsage?.filterDiagnostics?.usableListings ||
            data.apiUsage?.usableCompCount ||
            0,
        ),
        regionsChecked: combinedRegionsChecked,
        searchedZips: combinedSearchedZips,
      };
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
    if (!activeAssumptions.regionalMarkets.length) return [];
    return buildExpansionMarkets(
      activeAssumptions.regionalMarkets,
      marketCheckSearchMeta?.searchedZips || [],
      marketCheckSearchMeta?.regionsChecked || [],
    );
  }

  function openCompVehicleMatchEditor() {
    setCompEditorTab("vehicle");
    setCompMarketEditorOpen(true);
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

  function scrollToCompEvidence() {
    setWhyLotLogicOpen(false);

    // The decision-details dialog locks body scrolling. Wait until React has
    // unmounted it and restored normal page scrolling, then position the comp
    // card just below the app navigation.
    // Wait for the modal scroll lock to release, then retry after layout.
    window.setTimeout(() => {
      requestAnimationFrame(() => {
        requestAnimationFrame(() => {
          const target = compSectionRef.current;
          if (!target) return;
          const top = target.getBoundingClientRect().top + window.scrollY - 88;
          window.scrollTo({ top: Math.max(0, top), behavior: "smooth" });
        });
      });
    }, 180);
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

  // Geography expansion must preserve the user's current retrieval strategy.
  // If the user switched to a taxonomy fallback (for example TTS -> TT bucket),
  // every later region search must keep that strategy instead of reverting to VIN/exact matching.
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

    setMarketCheckStatus(
      `Searching ${regions.length} selected market${regions.length === 1 ? "" : "s"}...`,
    );
    setCompMarketEditorOpen(false);

    const outcome = await pullMarketCheckComps(null, {
      searchStage: "expanded",
      regions,
      mergeResults: true,
      useVinMatch: !compTrimRelaxed,
      preferTaxonomyFallback: compTrimRelaxed,
      useTaxonomyFallbackTrim: !compTrimRelaxed,
      maxApiCallsPerSearch: Math.min(3, regions.length),
    });

    if (!outcome) {
      // A blocked/failed request previously looked like the markets had been
      // searched because the editor simply disappeared. Re-open it so the
      // user can see that the selected markets are still pending.
      setCompMarketEditorOpen(true);
      return;
    }

    setSelectedCompMarketZips([]);
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

  async function broadenCompVehicleMatch(searchOperationId?: string) {
    if (!vehicleMake || !vehicleModel || !vehicleTrim) {
      setMarketCheckStatus("There is no trim-level specificity to relax for this vehicle.");
      return;
    }

    // When the user deliberately relaxes trim, rerun the geography they actually
    // searched — including generated and custom markets — rather than falling
    // back to the original configured-region list.
    const regions = getPreviouslySearchedCompRegions();

    setCompTrimRelaxed(true);
    setMarketCheckStatus(
      compTaxonomyFallback
        ? `Searching the broader MarketCheck ${vehicleMake} ${compTaxonomyFallback.fallbackModel} bucket while retaining ${vehicleMake} ${vehicleModel} as the final qualification target.`
        : `Broadening retrieval for ${vehicleMake} ${vehicleModel} while retaining strict final vehicle qualification.`,
    );

    return await pullMarketCheckComps(
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
        mergeResults: true,
        useVinMatch: false,
        preferTaxonomyFallback: true,
        useTaxonomyFallbackTrim: false,
        maxApiCallsPerSearch: Math.min(3, Math.max(1, regions.length)),
        searchOperationId,
      },
    );
  }

  async function runAutoDevDiscovery() {
    if (!vehicleYear || !vehicleMake || !vehicleModel || autoDevDiscoveryLoading) {
      return;
    }

    setAutoDevDiscoveryLoading(true);
    setAutoDevDiscoveryStatus("Scanning national inventory with Auto.dev...");

    try {
      const response = await fetch("/api/autodev/discovery", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Accept: "application/json",
        },
        body: JSON.stringify({
          evaluationUsageId,
          year: Number(vehicleYear),
          make: vehicleIdentityProfile?.make || vehicleMake,
          // Search the exact derivative first (TTS, M4, RAV4 Prime, etc.).
          // The canonical model family remains an alternate provider alias.
          model: vehicleModel || vehicleIdentityProfile?.modelFamily,
          trim: vehicleIdentityProfile?.variant || vehicleTrim,
          vin: String(decodedVehicle?.vin || vin || "").trim().toUpperCase(),
          providerAliases: [
            vehicleIdentityProfile?.modelFamily || "",
            String(vehicleModel || "")
              .replace(/\([^)]*\)/g, " ")
              .replace(/\s+/g, " ")
              .trim(),
            ...(vehicleIdentityProfile?.providerAliases || []),
          ].filter(Boolean),
          fuelType:
            vehicleIdentityProfile?.fuelType ||
            decodedVehicle?.fuelType ||
            "",
          drivetrain:
            vehicleIdentityProfile?.drivetrain ||
            decodedVehicle?.driveType ||
            "",
          bodyClass:
            vehicleIdentityProfile?.bodyClass ||
            vehicleBodyClass,
        }),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || "Auto.dev national discovery failed.");
      }

      setAutoDevDiscovery(data);

      const total = Number(data.total || 0);
      const attempts = Array.isArray(data.discovery?.attempts)
        ? data.discovery.attempts
        : [];
      const usedNormalizedIdentity = Boolean(
        data.discovery?.normalizedIdentityUsed,
      );
      const status =
        total > 0
          ? "Found " +
            total +
            " matching active listing" +
            (total === 1 ? "" : "s") +
            " nationwide" +
            (usedNormalizedIdentity && data.query?.model
              ? " after matching the provider classification “" +
                data.query.model +
                "”."
              : ".")
          : "No matching national inventory found after checking " +
            Math.max(1, attempts.length) +
            " exact/normalized vehicle identit" +
            (Math.max(1, attempts.length) === 1 ? "y." : "ies.");

      setAutoDevDiscoveryStatus(status);
      setCompSearchHistory((current) =>
        [
          ...current,
          {
            id: "autodev-" + Date.now() + "-" + current.length,
            source: "Auto.dev" as const,
            strategy: usedNormalizedIdentity
              ? "National discovery with normalized vehicle identity"
              : "National discovery",
            summary: status,
            details: attempts.map(
              (attempt: any) =>
                String(attempt.model || "Vehicle identity") +
                ": " +
                Number(attempt.total || attempt.returned || 0) +
                " found",
            ),
            apiCalls: Math.max(1, attempts.length),
            candidateListings: Number(data.returned || 0),
            usableComps: 0,
            regions: Array.isArray(data.recommendedMarkets)
              ? data.recommendedMarkets
                  .map((market: any) =>
                    String(market.market || market.zip || ""),
                  )
                  .filter(Boolean)
              : [],
            createdAt: new Date().toISOString(),
          },
        ].slice(-12),
      );

      return data;
    } catch (error) {
      const message =
        error instanceof Error
          ? error.message
          : "Auto.dev national discovery failed.";
      setAutoDevDiscovery(null);
      setAutoDevDiscoveryStatus(message);
      setCompSearchHistory((current) =>
        [
          ...current,
          {
            id: "autodev-error-" + Date.now() + "-" + current.length,
            source: "Auto.dev" as const,
            strategy: "National discovery",
            summary: message,
            details: [],
            apiCalls: 0,
            candidateListings: 0,
            usableComps: 0,
            regions: [],
            createdAt: new Date().toISOString(),
          },
        ].slice(-12),
      );
      return null;
    } finally {
      setAutoDevDiscoveryLoading(false);
    }
  }

  async function searchAutoDevRecommendedMarkets(
    discoveryOverride: typeof autoDevDiscovery = autoDevDiscovery,
    searchedZipsOverride?: string[],
    searchOperationId?: string,
  ) {
    const discovery = discoveryOverride;

    if (!discovery?.recommendedMarkets?.length) {
      setAutoDevDiscoveryStatus("No national inventory clusters are available to search.");
      return null;
    }

    const searched = new Set(
      searchedZipsOverride || marketCheckSearchMeta?.searchedZips || [],
    );
    const regions = discovery.recommendedMarkets
      .filter((market) => !searched.has(market.zip))
      .slice(0, 3)
      .map((market, index) => ({
        market: `${market.market} · Auto.dev discovery`,
        zip: market.zip,
        order: index + 1,
        enabled: true,
      }));

    if (!regions.length) {
      setAutoDevDiscoveryStatus(
        "The recommended Auto.dev market centers have already been searched in MarketCheck.",
      );
      return;
    }

    setAutoDevDiscoveryStatus(
      `Searching MarketCheck in ${regions.length} Auto.dev-identified market${regions.length === 1 ? "" : "s"}...`,
    );

    const outcome = await pullMarketCheckComps(null, {
      searchStage: "expanded",
      regions,
      mergeResults: true,
      useVinMatch: false,
      preferTaxonomyFallback: compTrimRelaxed,
      useTaxonomyFallbackTrim: !compTrimRelaxed,
      maxApiCallsPerSearch: regions.length,
      searchOperationId,
    });

    setAutoDevDiscoveryStatus(
      "MarketCheck validation completed in " +
        regions
          .map((region) =>
            region.market.replace(" · Auto.dev discovery", ""),
          )
          .join(", ") +
        ".",
    );

    return outcome;
  }

  async function expandMarketCheckSearch(searchOperationId?: string) {
    const searchedZips = new Set(marketCheckSearchMeta?.searchedZips || []);

    // Use the same expansion engine that powers the UI recommendations so the
    // automatic path cannot recommend markets that its own action cannot search.
    const nextRegions = getCompExpansionMarkets()
      .filter((market) => !searchedZips.has(market.zip))
      .slice(0, 3)
      .map((market, index) => ({
        market: market.market,
        zip: market.zip,
        order:
          typeof market.order === "number" && Number.isFinite(market.order)
            ? market.order
            : index + 1,
        enabled: true,
      }));

    if (nextRegions.length === 0) {
      setMarketCheckStatus(
        "Regional expansion is complete. Lot Logic will use national discovery for the next step.",
      );
      return null;
    }

    return await pullMarketCheckComps(null, {
      searchStage: "expanded",
      regions: nextRegions,
      mergeResults: true,
      useVinMatch: !compTrimRelaxed,
      preferTaxonomyFallback: compTrimRelaxed,
      useTaxonomyFallbackTrim: !compTrimRelaxed,
      maxApiCallsPerSearch: Math.min(3, nextRegions.length),
      searchOperationId,
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
      useVinMatch: !compTrimRelaxed,
      preferTaxonomyFallback: compTrimRelaxed,
      useTaxonomyFallbackTrim: !compTrimRelaxed,
    });
  }

  function openMethodology() {
    // Skip the intermediate methodology modal. The settings page contains the
    // actual search controls, API usage audit trail, and filtering diagnostics.
    window.location.assign("/settings?tab=api");
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

  function chooseConditionReview(status: ConditionReviewStatus) {
    setConditionReviewStatus(status);

    if (status === "issues") {
      setConditionAnalysisApplied(false);
      return;
    }

    // Choosing "no material issues" or "unknown" must not leave an old recon
    // reserve silently influencing the economics.
    setConditionAssessments(initialConditionAssessments);
    setConditionAssessmentsTouched(false);
    setConditionAnalysis(null);
    setOriginalConditionAnalysis(null);
    setConditionSourceText("");
    setConditionPlanningEstimateOverride(null);
    setConditionReadyDaysLowOverride(null);
    setConditionReadyDaysHighOverride(null);
    setConditionAnalysisApplied(false);
    setConditionAnalysisError("");
  }

  function openConditionAnalysis() {
    if (!conditionAssessmentsTouched) {
      setConditionAssessments(initialConditionAssessments);
    }

    setConditionReviewStatus("issues");
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

    trackEvent("condition_analysis_started", {
      source: auctionSite,
      note_length_bucket:
        rawIssueText.length < 250
          ? "short"
          : rawIssueText.length < 1000
            ? "medium"
            : "long",
    });
    setConditionAnalysisLoading(true);
    setConditionAnalysisError("");
    setConditionAnalysisRetryable(false);
    setConditionAnalysisApplied(false);

    try {
      const response = await fetch("/api/evaluations/condition-analysis", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          evaluationUsageId,
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
        code?: string;
        retryable?: boolean;
      };

      if (!response.ok || !data.analysis) {
        setConditionAnalysisRetryable(data.retryable === true);
        throw new Error(data.error || "Condition analysis failed.");
      }

      setConditionAnalysis(data.analysis);
      setOriginalConditionAnalysis(
        JSON.parse(JSON.stringify(data.analysis)) as ConditionAnalysis,
      );
      setConditionPlanningEstimateOverride(null);
      setConditionReadyDaysLowOverride(null);
      setConditionReadyDaysHighOverride(null);
      trackEvent("condition_analysis_completed", {
        issue_count: data.analysis.issues.length,
        included_issue_count: data.analysis.issues.filter(
          (issue) => issue.includeInValuation,
        ).length,
        planning_estimate: data.analysis.planningEstimate,
      });
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
    setConditionReviewStatus("issues");
    trackEvent("condition_review_applied", {
      included_issue_count: includedIssues.length,
      planning_estimate: effectivePlanningEstimate,
    });
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
    setConditionReviewStatus("issues");
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
    setConditionReviewStatus("issues");
  }

  async function continueToVerdict() {
    if (verdictTransitioning) return;

    setUsageLimitMessage("");
    setVerdictTransitioning(true);

    try {
      const response = await fetch("/api/usage/evaluation-complete", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          evaluationUsageId,
          vin,
          year: vehicleYear,
          make: vehicleMake,
          model: vehicleModel,
          trim: vehicleTrim,
          hasUsableValuation: compSummary.includedCount > 0 && finalTargetUsed > 0,
          valuationCompCount: compSummary.includedCount,
        }),
      });

      const payload = (await response.json()) as {
        error?: string;
        code?: string;
      };

      if (!response.ok) {
        throw new Error(payload.error || "This evaluation cannot continue yet.");
      }

      trackEvent("evaluation_verdict_viewed", {
        valuation_comp_count: compSummary.includedCount,
        comp_confidence: compSummary.confidence,
        condition_review_status: conditionReviewStatus,
        presentation_decision: presentationDecision,
      });

      window.setTimeout(() => {
        setActiveStage("verdict");
        setVerdictTransitioning(false);
      }, 220);
    } catch (error) {
      setVerdictTransitioning(false);
      setUsageLimitMessage(
        error instanceof Error ? error.message : "This evaluation cannot continue yet.",
      );
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
          evaluationUsageId,
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
          conditionReviewStatus,
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
      trackEvent("evaluation_saved_to_pipeline", {
        save_mode: data.mode === "updated" ? "updated" : "created",
        valuation_comp_count: compSummary.includedCount,
        comp_confidence: compSummary.confidence,
        condition_review_status: conditionReviewStatus,
      });
    } catch (error) {
      setSaveStatus(error instanceof Error ? error.message : "Save failed.");
    } finally {
      setSaveLoading(false);
    }
  }

  function resetPreviousEvaluationResults(options?: { preserveVehicleInfo?: boolean }) {
    // Prevent stale search state from carrying into another vehicle.
    marketCheckInFlightRef.current = false;

    setComps(initialComps);
    setMarketCheckStatus("");
    setMarketCheckError(null);
    setMarketCheckSearchMeta(null);
    setMarketCheckApiUsage(null);
    setMarketCheckLoading(false);

    setSelectedConditions(initialSelectedConditions);
    setConditionAssessments(initialConditionAssessments);
    setConditionAssessmentsTouched(false);

    setConditionProfitabilityOpen(false);
    setConditionModalTab("ai");
    setConditionSourceEditorOpen(false);
    if (!options?.preserveVehicleInfo) {
      setConditionSourceText("");
    }
    setConditionAnalysis(null);
    setOriginalConditionAnalysis(null);
    setConditionPlanningEstimateOverride(null);
    setConditionReadyDaysLowOverride(null);
    setConditionReadyDaysHighOverride(null);
    setConditionAnalysisError("");
    setConditionAnalysisRetryable(false);
    setConditionAnalysisLoading(false);
    setConditionAnalysisApplied(false);
    setConditionReviewStatus("unreviewed");

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
    setWhyLotLogicOpen(false);
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
    setEvaluationUsageId(createEvaluationUsageId());

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
    setVehicleStepConfirmed(false);
    setConditionStepConfirmed(false);
    setVerdictTransitioning(false);
    setVerdictEntered(false);
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

  const hasAcquisitionPrice = valuationInput.currentBid > 0;

  const vehicleStepComplete = Boolean(
    vehicleYear &&
      vehicleMake &&
      vehicleModel &&
      targetMileage > 0 &&
      valuationInput.currentBid > 0,
  );

  const vehicleInputReady = Boolean(
    targetMileage > 0 &&
      valuationInput.currentBid > 0 &&
      auctionSite.trim() &&
      (quickEvalMode === "vin"
        ? vin.trim().length === 17
        : String(manualVehicle.year || "").trim().length > 0 &&
          manualVehicle.make.trim().length > 0 &&
          manualVehicle.model.trim().length > 0),
  );

  // Recommended Max Buy is the single acquisition ceiling.
  // safeBid/stretchBid remain in saved payloads only for backwards compatibility.
  const suggestedBid = valuation.maxSmartBid;

  const profitabilityScore = calculateDealEconomicsScore(
    valuation.expectedGrossProfit,
    valuation.allInCost,
    valuation.desiredProfitTarget,
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
      ? `${compSummary.includedCount} valuation comps support an expected sale value near ${money(finalTargetUsed)}.`
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
  const displayedCurrentCost = valuation.allInCost;
  const allInCostBreakdown = [
    { key: "currentBid" as const, label: "Current bid / purchase price", amount: Math.max(0, valuationInput.currentBid) },
    { key: "auctionFee" as const, label: "Auction fee", amount: valuationInput.costs.auctionFee },
    { key: "transport" as const, label: "Transport", amount: valuationInput.costs.transport },
    { key: "reconCombined" as const, label: "Condition & reconditioning reserve", amount: displayedReconReserve },
    { key: "detailAdmin" as const, label: "Detail / admin", amount: valuationInput.costs.detailAdmin },
    { key: "generalRiskReserve" as const, label: "Contingency reserve", amount: valuationInput.costs.generalRiskReserve },
    { key: "brandRiskAdd" as const, label: "Brand risk adjustment", amount: valuationInput.costs.brandRiskAdd },
  ];
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

  const recommendedAllInCost =
    suggestedBid > 0 ? suggestedBid + valuation.totalCostAdders : 0;

  const currentAllInDifference =
    valuation.allInCost > 0 && recommendedAllInCost > 0
      ? valuation.allInCost - recommendedAllInCost
      : 0;

  const currentCostPosition =
    valuation.allInCost <= 0 || recommendedAllInCost <= 0
      ? null
      : currentAllInDifference > 0
        ? {
            tone: "over" as const,
            text: `Current all-in cost is ${money(
              currentAllInDifference,
            )} above the recommended all-in target.`,
          }
        : currentAllInDifference < 0
          ? {
              tone: "under" as const,
              text: `Current all-in cost is ${money(
                Math.abs(currentAllInDifference),
              )} below the recommended all-in target.`,
            }
          : {
              tone: "at" as const,
              text: "Current all-in cost is at the recommended all-in target.",
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

  async function runPrimaryEvaluation() {
    trackEvent("evaluation_vehicle_submitted", {
      input_mode: quickEvalMode,
      source: auctionSite,
      has_mileage: targetMileage > 0,
      has_bid_or_ask: valuationInput.currentBid > 0,
    });
    setEvaluationRunning(true);
    setEvaluationAccessError("");

    // Check access before decoding or requesting paid market/AI services.
    // The current vehicle is already persisted by the draft autosave effect.
    try {
      const response = await fetch("/api/usage/status", { cache: "no-store" });
      const access = await response.json();
      if (!response.ok) throw new Error(access.error || "Unable to check your evaluation allowance. Please try again.");
      if (access.canStartEvaluation === false) {
        setPlanSelectionMessage(access.evaluationAccessMessage || "Choose a plan to continue evaluating vehicles.");
        setEvaluationRunning(false);
        return;
      }
    } catch (error) {
      setEvaluationAccessError(error instanceof Error ? error.message : "Unable to check your evaluation allowance. Please try again.");
      setEvaluationRunning(false);
      return;
    }

    if (quickEvalMode === "manual") {
      const manualOverride = {
        year: String(manualVehicle.year || "").trim(),
        make: manualVehicle.make.trim().toUpperCase(),
        model: manualVehicle.model.trim(),
        trim: manualVehicle.trim.trim(),
        fuelType: null,
      };

      if (!manualOverride.year || !manualOverride.make || !manualOverride.model) {
        setMarketCheckStatus(
          "Enter Year, Make, and Model before running the evaluation.",
        );
        setEvaluationRunning(false);
        return;
      }

      resetPreviousEvaluationResults({ preserveVehicleInfo: true });
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
      setVehicleStepConfirmed(true);
      setConditionStepConfirmed(false);
      setActiveStage("condition");

      void generateVehicleThumbnail({
        year: manualOverride.year,
        make: manualOverride.make,
        model: manualOverride.model,
        trim: manualOverride.trim,
        bodyClass: manualVehicle.bodyClass,
      });

      await pullMarketCheckComps(manualOverride);
      setEvaluationRunning(false);
      return;
    }

    resetPreviousEvaluationResults({ preserveVehicleInfo: true });

    const newlyDecodedVehicle = await decodeVinFromBasics();

    if (!newlyDecodedVehicle) {
      setEvaluationRunning(false);
      return;
    }

    setVehicleStepConfirmed(true);
    setConditionStepConfirmed(false);
    setActiveStage("condition");

    void generateVehicleThumbnail({
      year: newlyDecodedVehicle.year,
      make: newlyDecodedVehicle.make,
      model: newlyDecodedVehicle.model,
      trim: newlyDecodedVehicle.trim,
      bodyClass: newlyDecodedVehicle.bodyClass,
    });

    await pullMarketCheckComps(newlyDecodedVehicle);
    setEvaluationRunning(false);
  }

  const materialConditionIssues = (conditionAnalysis?.issues || []).filter(
    (issue) =>
      issue.includeInValuation &&
      issue.severity === "severe" &&
      ["mechanical", "history", "structural", "title"].includes(issue.category),
  );

  const hasMaterialConditionRisk = materialConditionIssues.length > 0;

  // Zero valuation comps is an evidence state, not a negative verdict.
  // Do not manufacture sale/profit conclusions until market evidence exists.
  const needsCompSearch =
    hasEvaluationData &&
    !evaluationRunning &&
    !marketCheckLoading &&
    compSummary.includedCount === 0;

  // Recommendation routing is derived from the current comp-search evidence.
  const compSearchRegions = marketCheckSearchMeta?.regionsChecked.length || 0;
  const compReturnedListings =
    marketCheckApiUsage?.filterDiagnostics?.returnedListings || 0;
  const compUsableListings =
    marketCheckApiUsage?.filterDiagnostics?.usableListings || 0;
  const compModelMismatchCount =
    marketCheckApiUsage?.filterDiagnostics?.rejectionCounts?.modelMismatch || 0;

  const compExpansionMarketsRemaining = getCompExpansionMarkets().filter(
    (market) =>
      !(marketCheckSearchMeta?.searchedZips || []).includes(market.zip),
  ).length;

  const rawCompSearchRecommendation = recommendCompSearchAction({
    includedCount: compSummary.includedCount,
    confidence: String(compSummary.confidence || ""),
    returnedListings: compReturnedListings,
    usableListings: compUsableListings,
    modelMismatchCount: compModelMismatchCount,
    qualityBelowThresholdCount:
      marketCheckApiUsage?.filterDiagnostics?.rejectionCounts
        ?.qualityBelowThreshold || 0,
    generationMismatchCount:
      marketCheckApiUsage?.filterDiagnostics?.rejectionCounts
        ?.generationMismatch || 0,
    regionsSearched: compSearchRegions,
    unsearchedExpansionMarkets: compExpansionMarketsRemaining,
    hasTaxonomyFallback: Boolean(compTaxonomyFallback),
    trimRelaxed: compTrimRelaxed,
    nationalDiscoveryAttempted: Boolean(
      autoDevDiscovery || autoDevDiscoveryStatus,
    ),
    nationalDiscoveryTotal: Number(autoDevDiscovery?.total || 0),
    nationalRecommendedMarkets:
      (autoDevDiscovery?.recommendedMarkets || []).filter(
        (market) =>
          !(marketCheckSearchMeta?.searchedZips || []).includes(market.zip),
      ).length,
  });

  // Completion of one automatic pass is not proof that all useful search
  // paths are exhausted. In particular, national discovery may still contain
  // unsearched markets even after an API-limited or interrupted pass.
  const remainingNationalMarketCount = (autoDevDiscovery?.recommendedMarkets || [])
    .filter((market) => !(marketCheckSearchMeta?.searchedZips || []).includes(market.zip))
    .length;
  const canContinueNationalSearch =
    compSummary.includedCount < 4 && remainingNationalMarketCount > 0;
  const compSearchRecommendation = canContinueNationalSearch
    ? {
        action: "discovered-markets" as const,
        title: `Check ${remainingNationalMarketCount} remaining national market${remainingNationalMarketCount === 1 ? "" : "s"}`,
        reason: "National inventory discovery identified markets that have not yet been checked against strict vehicle-match rules.",
      }
    : automaticCompSearchCompleted && compSummary.includedCount < 4
      ? {
          action: "manual-review" as const,
          title: "Automatic market checks finished",
          reason: "No unsearched national discovery markets remain. Review the search evidence below, then consider other markets or supporting vehicles without changing strict direct-comp rules.",
        }
      : rawCompSearchRecommendation;

  const compNextStep = {
    path:
      compSearchRecommendation.action === "broaden-vehicle" ||
      compSearchRecommendation.action === "manual-review"
        ? ("vehicle-match" as const)
        : compSearchRecommendation.action === "expand-geography"
          ? ("geography" as const)
          : compSearchRecommendation.action === "national-discovery"
            ? ("national-discovery" as const)
            : compSearchRecommendation.action === "discovered-markets"
              ? ("discovered-markets" as const)
              : ("none" as const),
    title: compSearchRecommendation.title,
    reason: compSearchRecommendation.reason,
  };

  const normalizedCompConfidence = String(
    compSummary.confidence || "",
  ).toLowerCase();
  const marketEvidenceStrength: "Strong" | "Moderate" | "Limited" =
    compSummary.includedCount >= 8 && normalizedCompConfidence === "high"
      ? "Strong"
      : compSummary.includedCount >= 4 && normalizedCompConfidence !== "low"
        ? "Moderate"
        : "Limited";
  const hasLimitedMarketEvidence =
    compSummary.includedCount > 0 && marketEvidenceStrength === "Limited";
  const hasLowCompConfidence = hasLimitedMarketEvidence;

  async function improveCompSearch() {
    if (
      compSearchImproving ||
      marketCheckLoading ||
      autoDevDiscoveryLoading ||
      (automaticCompSearchCompleted && !canContinueNationalSearch && compSearchRecommendation.action !== "manual-review") ||
      compSearchRecommendation.action === "complete"
    ) {
      return;
    }

    setCompSearchHandedOff(true);
    setCompMarketEditorOpen(false);
    setCompSearchImproving(true);
    setAutomaticCompSearchCompleted(false);
    const searchOperationId = `recommended-${evaluationUsageId || "evaluation"}-${Date.now()}`;

    window.setTimeout(() => {
      compSectionRef.current?.scrollIntoView({
        behavior: "smooth",
        block: "start",
      });
    }, 80);

    try {
      if (compSearchRecommendation.action === "manual-review") {
        setCompSearchImprovementStatus(
          "Automatic search finished. Review related vehicles or manually select any comp you believe belongs.",
        );
        openCompVehicleMatchEditor();
        return;
      }

      let latestIncludedCount = compSummary.includedCount;
      let latestRegionCount = compSearchRegions;
      let latestSearchedZips = marketCheckSearchMeta?.searchedZips || [];

      if (compSearchRecommendation.action === "discovered-markets") {
        setCompSearchImprovementStatus(
          "Verifying the strongest markets found by national discovery…",
        );

        const discovery = autoDevDiscovery;
        let nationalBatches = 0;
        let remainingNationalMarkets =
          discovery?.recommendedMarkets?.filter(
            (market) => !latestSearchedZips.includes(market.zip),
          ) || [];

        while (
          latestIncludedCount < 4 &&
          remainingNationalMarkets.length > 0 &&
          nationalBatches < 3
        ) {
          const validation = await searchAutoDevRecommendedMarkets(
            discovery,
            latestSearchedZips,
            `${searchOperationId}-national-${nationalBatches + 1}`,
          );
          nationalBatches += 1;

          if (!validation) break;

          latestIncludedCount = Number(
            validation.includedCount || latestIncludedCount,
          );
          latestSearchedZips =
            validation.searchedZips || latestSearchedZips;
          remainingNationalMarkets =
            discovery?.recommendedMarkets?.filter(
              (market) => !latestSearchedZips.includes(market.zip),
            ) || [];

          if (latestIncludedCount < 4 && remainingNationalMarkets.length > 0) {
            setCompSearchImprovementStatus(
              `Still thin. Verifying ${Math.min(3, remainingNationalMarkets.length)} more national market${Math.min(3, remainingNationalMarkets.length) === 1 ? "" : "s"}…`,
            );
          }
        }

        if (latestIncludedCount >= 4) {
          setCompSearchImprovementStatus(
            "Reliable market evidence found. The comp set is ready for review.",
          );
          return;
        }

        setAutomaticCompSearchCompleted(remainingNationalMarkets.length === 0);
        setCompSearchImprovementStatus(
          remainingNationalMarkets.length
            ? `This pass reached its search limit; ${remainingNationalMarkets.length} discovered market(s) remain. Run Recommended Search again to continue.`
            : "All recommended national markets have been checked. Review rejection reasons or adjust the manual search.",
        );
        return;
      }

      if (
        compSearchRecommendation.action === "broaden-vehicle" &&
        !compTrimRelaxed
      ) {
        setCompSearchImprovementStatus(
          vehicleIdentityProfile?.providerAliases?.length
            ? "Using the vehicle search profile to normalize provider naming while keeping final comp rules strict…"
            : "Normalizing provider naming while keeping final comp rules strict…",
        );

        const broadened = await broadenCompVehicleMatch(searchOperationId);
        latestIncludedCount = Number(
          broadened?.includedCount || latestIncludedCount,
        );
        latestRegionCount = Number(
          broadened?.regionsChecked?.length || latestRegionCount,
        );
        latestSearchedZips =
          broadened?.searchedZips || latestSearchedZips;

        if (latestIncludedCount >= 4) {
          setCompSearchImprovementStatus(
            "Reliable market evidence found after normalizing the vehicle match.",
          );
          return;
        }
      }

      if (latestRegionCount < 5) {
        setCompSearchImprovementStatus(
          "Checking the next best nearby markets before going national…",
        );
        const expanded = await expandMarketCheckSearch(searchOperationId);
        latestIncludedCount = Number(
          expanded?.includedCount || latestIncludedCount,
        );
        latestRegionCount = Number(
          expanded?.regionsChecked?.length || latestRegionCount,
        );
        latestSearchedZips =
          expanded?.searchedZips || latestSearchedZips;

        if (latestIncludedCount >= 4) {
          setCompSearchImprovementStatus(
            "Reliable market evidence found after regional expansion.",
          );
          return;
        }
      }

      setCompSearchImprovementStatus(
        "Regional search is complete. Locating matching inventory nationwide…",
      );

      const discovery: typeof autoDevDiscovery =
        autoDevDiscovery || (await runAutoDevDiscovery());

      if (discovery?.recommendedMarkets?.length) {
        let nationalBatches = 0;
        let remainingNationalMarkets = discovery.recommendedMarkets.filter(
          (market) => !latestSearchedZips.includes(market.zip),
        );

        while (
          latestIncludedCount < 4 &&
          remainingNationalMarkets.length > 0 &&
          nationalBatches < 3
        ) {
          setCompSearchImprovementStatus(
            nationalBatches === 0
              ? "National inventory found. Verifying the strongest markets with MarketCheck…"
              : `Still thin. Verifying ${Math.min(3, remainingNationalMarkets.length)} more national market${Math.min(3, remainingNationalMarkets.length) === 1 ? "" : "s"}…`,
          );

          const validation = await searchAutoDevRecommendedMarkets(
            discovery,
            latestSearchedZips,
            `${searchOperationId}-national-${nationalBatches + 1}`,
          );
          nationalBatches += 1;

          if (!validation) break;

          latestIncludedCount = Number(
            validation.includedCount || latestIncludedCount,
          );
          latestSearchedZips =
            validation.searchedZips || latestSearchedZips;
          remainingNationalMarkets = discovery.recommendedMarkets.filter(
            (market) => !latestSearchedZips.includes(market.zip),
          );
        }

        if (latestIncludedCount >= 4) {
          setCompSearchImprovementStatus(
            "Reliable market evidence found after national discovery.",
          );
          return;
        }
      }

      const remainingDiscovered = (discovery?.recommendedMarkets || [])
        .filter((market) => !latestSearchedZips.includes(market.zip)).length;
      setAutomaticCompSearchCompleted(remainingDiscovered === 0);
      setCompSearchImprovementStatus(
        remainingDiscovered
          ? `${remainingDiscovered} discovered national market(s) still need validation. Run Recommended Search again to continue.`
          : discovery
            ? "All discovered national markets checked; review evidence and filtering before widening vehicle similarity."
            : "National discovery did not provide more markets. Review evidence and try a different geographic search.",
      );
    } finally {
      setCompSearchImproving(false);
    }
  }


  const hasLimitedDealerFit = dealerFitResult.score < 55;

  const conditionReviewComplete =
    conditionReviewStatus === "no_material_issues" ||
    conditionReviewStatus === "unknown" ||
    (conditionReviewStatus === "issues" &&
      (conditionAnalysisApplied || conditionAssessmentsTouched));

  const conditionReviewPending =
    hasEvaluationData &&
    !evaluationRunning &&
    !marketCheckLoading &&
    !needsCompSearch &&
    !conditionReviewComplete;

  const conditionUnknown = conditionReviewStatus === "unknown";

  const isAboveRecommendedBuy =
    hasEvaluationData &&
    valuationInput.currentBid > 0 &&
    suggestedBid > 0 &&
    valuationInput.currentBid > suggestedBid;

  const hasHardPass =
    hasEvaluationData &&
    !needsCompSearch &&
    !conditionReviewPending &&
    (valuation.riskGrade === "High/Avoid" || valuation.expectedGrossProfit <= 0);

  const requiresReview =
    hasEvaluationData &&
    !needsCompSearch &&
    !conditionReviewPending &&
    !hasHardPass &&
    (isAboveRecommendedBuy ||
      hasLimitedMarketEvidence ||
      hasMaterialConditionRisk ||
      conditionUnknown);

  const reviewReasons = [
    isAboveRecommendedBuy ? "the current all-in cost is above Lot Logic's recommended all-in target" : null,
    hasLimitedMarketEvidence
      ? "market evidence is limited; strengthen the comp set before treating the recommendation as high-confidence"
      : null,
    hasMaterialConditionRisk ? "a material vehicle-specific risk needs review" : null,
    conditionUnknown ? "condition is unknown or has not been adequately reviewed" : null,
  ].filter((reason): reason is string => Boolean(reason));

  const lotLogicLabel = !hasEvaluationData
    ? "AWAITING EVALUATION"
    : !hasAcquisitionPrice
      ? "PURCHASE PRICE NEEDED"
      : evaluationRunning || marketCheckLoading
        ? "CHECKING MARKET"
      : needsCompSearch
        ? "COMP SEARCH NEEDED"
        : conditionReviewPending
          ? "CONDITION REVIEW NEEDED"
        : hasHardPass
          ? "PASS"
        : isAboveRecommendedBuy
          ? "ABOVE TARGET COST"
          : requiresReview
              ? "REVIEW REQUIRED"
              : "WORTH PURSUING";

  const presentationDecision =
    !hasEvaluationData || !hasAcquisitionPrice
      ? "awaiting"
      : evaluationRunning || marketCheckLoading
        ? "searching"
        : needsCompSearch
          ? "comps"
          : conditionReviewPending
            ? "condition"
          : hasHardPass
            ? "pass"
            : requiresReview
              ? "review"
              : "pursue";

  const decisionBadgeTone =
    presentationDecision === "searching"
      ? "bg-blue-100 text-blue-700"
      : presentationDecision === "pass"
        ? "bg-red-100 text-red-700"
      : presentationDecision === "comps"
        ? "bg-amber-100 text-amber-800"
        : presentationDecision === "condition"
          ? "bg-violet-100 text-violet-800"
        : presentationDecision === "review"
          ? "bg-amber-100 text-amber-700"
        : presentationDecision === "pursue"
          ? "bg-emerald-100 text-emerald-700"
          : "bg-slate-100 text-slate-600";

  const decisionBannerTone =
    presentationDecision === "searching"
      ? "border-blue-200/80 bg-blue-50/40 text-blue-950"
      : presentationDecision === "pass"
        ? "border-red-200/80 bg-red-50/60 text-red-950"
      : presentationDecision === "comps"
        ? "border-amber-200/80 bg-amber-50/35 text-amber-950"
        : presentationDecision === "condition"
          ? "border-violet-200/80 bg-violet-50/40 text-violet-950"
        : presentationDecision === "review"
          ? "border-amber-200/80 bg-amber-50/45 text-amber-950"
        : presentationDecision === "pursue"
          ? "border-emerald-200/80 bg-emerald-50/40 text-emerald-950"
          : "border-slate-200 bg-white text-slate-950";

  const decisionTextTone =
    presentationDecision === "searching"
      ? "text-blue-700"
      : presentationDecision === "pass"
        ? "text-red-700"
      : presentationDecision === "comps"
        ? "text-amber-700"
        : presentationDecision === "condition"
          ? "text-violet-700"
        : presentationDecision === "review"
          ? "text-amber-700"
        : presentationDecision === "pursue"
          ? "text-emerald-700"
          : "text-slate-400";

  const lotLogicIcon =
    presentationDecision === "pursue" ? "✓ " : "";

  const compConfidenceDisplay =
    compSummary.includedCount > 0 ? marketEvidenceStrength : "—";

  const liquidity = marketCheckApiUsage?.marketLiquidity || null;
  const liquiditySoldLow = Math.max(0, liquidity?.soldP25Days || 0);
  const liquiditySoldHigh = Math.max(0, liquidity?.soldP75Days || 0);
  const liquiditySoldMedian = Math.max(0, liquidity?.soldMedianDays || 0);
  const liquidityActiveDays = Math.max(
    0,
    liquidity?.currentActiveAverageDays ||
      marketTimingAverageMarketDays ||
      marketTimingAverageDealerDays ||
      0,
  );
  const liquiditySampleSize = Math.max(0, liquidity?.historicalSoldCount || 0);
  const liquidityConfidence =
    liquidity?.confidence || (liquiditySampleSize ? "low" : "unknown");

  const liquidityLabel = (() => {
    if (!liquiditySoldMedian && !liquidityActiveDays) return "Not enough data";
    const reference = liquiditySoldMedian || liquidityActiveDays;
    if (reference <= 30) return "Fast";
    if (reference <= 50) return "Good";
    if (reference <= 75) return "Normal";
    if (reference <= 110) return "Slow";
    return "Very Slow";
  })();

  const liquidityInterpretation = (() => {
    if (!liquiditySoldMedian) {
      return liquidityActiveDays
        ? `Current comparable inventory is averaging about ${Math.round(liquidityActiveDays)} days on market, but recent sold-history is too thin for a reliable retail window.`
        : "Lot Logic does not yet have enough timing evidence for this vehicle and market.";
    }

    if (!liquidityActiveDays) {
      return `Recent similar vehicles sold in a typical ${Math.round(liquiditySoldLow || liquiditySoldMedian)}–${Math.round(liquiditySoldHigh || liquiditySoldMedian)} day window.`;
    }

    const delta = liquidityActiveDays - liquiditySoldMedian;
    if (delta >= 15) {
      return `Current inventory is aging about ${Math.round(delta)} days longer than the recent sold median, suggesting the market may be slowing.`;
    }
    if (delta <= -15) {
      return "Current inventory is materially younger than the recent sold median, suggesting healthy near-term demand.";
    }
    return "Current inventory age is broadly in line with recent regional sell-through.";
  })();

  const vehicleMetaItems = [
    vin ? `VIN ${vin}` : null,
    auctionSite || null,
    targetMileage ? `${formatNumberInput(targetMileage)} miles` : null,
    savedEvaluationId ? "Saved evaluation" : "Draft evaluation",
  ].filter(Boolean);

  return (
    <main className="min-h-screen bg-[#f5f7fb] text-slate-950">
      {planSelectionMessage ? <PlanSelectionModal message={planSelectionMessage} onClose={() => setPlanSelectionMessage(null)} /> : null}
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

                <div className="grid gap-3 md:grid-cols-3">
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
                      "Valuation Comps",
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
                      Retrieval Strategy
                    </div>
                    <div className="mt-1 text-sm font-bold text-slate-900">
                      {compTrimRelaxed
                        ? compRetrievalLabel
                        : marketCheckSearchMeta?.lowConfidenceFallback
                          ? "Low-confidence comp fallback applied"
                          : "Exact vehicle"}
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
                  Vehicle Condition &amp; Risk
                </h2>
                <p className="mt-1 max-w-2xl text-sm font-medium text-slate-500">
                  Review what is known, analyze auction or seller disclosures, and confirm any reserve before Lot Logic treats condition as complete.
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
                  {!conditionAnalysis ? (
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
                      <div
                        className={`mt-4 rounded-xl border px-4 py-3 text-sm font-bold ${
                          conditionAnalysisRetryable
                            ? "border-amber-200 bg-amber-50 text-amber-800"
                            : "border-red-200 bg-red-50 text-red-700"
                        }`}
                      >
                        {conditionAnalysisError}
                        {conditionAnalysisRetryable ? (
                          <div className="mt-1 text-xs font-semibold text-amber-700">
                            Your pasted condition notes are still here. Try Analyze Condition again in a moment.
                          </div>
                        ) : null}
                      </div>
                    ) : null}
                  </section>


                  ) : null}

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
                        <section className={`grid gap-4 transition-all duration-300 ease-out lg:grid-cols-3 ${
              verdictEntered
                ? "translate-y-0 scale-100 opacity-100"
                : "translate-y-3 scale-[1.015] opacity-0"
            }`}>
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

                      <section className="rounded-2xl border border-slate-200 bg-white">
                        <button
                          type="button"
                          onClick={() => setConditionSourceEditorOpen((open) => !open)}
                          className="flex w-full items-center justify-between gap-4 px-5 py-4 text-left"
                        >
                          <div>
                            <div className="font-black text-slate-950">Edit or update condition information</div>
                            <div className="mt-1 text-xs font-semibold text-slate-500">
                              Review or change the original auction / seller notes, then analyze again.
                            </div>
                          </div>
                          <span className="text-sm font-black text-violet-700">{conditionSourceEditorOpen ? "Hide" : "Edit"}</span>
                        </button>

                        {conditionSourceEditorOpen ? (
                          <div className="border-t border-slate-200 p-5">
                            <textarea
                              value={conditionSourceText}
                              onChange={(event) => {
                                setConditionSourceText(event.target.value);
                                setConditionAnalysisApplied(false);
                              }}
                              placeholder="Paste or update auction / seller condition information..."
                              className="min-h-[170px] w-full resize-y rounded-2xl border border-slate-200 bg-white p-4 text-sm font-medium leading-6 text-slate-700 outline-none focus:border-violet-300"
                            />
                            <div className="mt-3 flex flex-wrap items-center justify-between gap-3">
                              <span className="text-[10px] font-semibold text-slate-400">
                                {conditionSourceText.trim().length.toLocaleString()} characters
                              </span>
                              <button
                                type="button"
                                onClick={() => void analyzeConditionInformation()}
                                disabled={conditionAnalysisLoading || !conditionSourceText.trim()}
                                className="rounded-xl bg-violet-700 px-5 py-2.5 text-sm font-black text-white hover:bg-violet-800 disabled:cursor-not-allowed disabled:opacity-50"
                              >
                                {conditionAnalysisLoading ? "Analyzing..." : "Analyze Again"}
                              </button>
                            </div>
                          </div>
                        ) : null}
                      </section>
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
                    onClick={() => {
                      applyConditionAnalysis();
                      setConditionProfitabilityOpen(false);
                    }}
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
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/45 px-4 py-6 backdrop-blur-sm">
          <div className="flex max-h-[88vh] w-full max-w-2xl flex-col overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-2xl">
            <div className="flex items-start justify-between gap-4 border-b border-slate-100 px-6 py-5">
              <div>
                <h2 className="text-[20px] font-extrabold tracking-[-0.025em] text-slate-950">
                  Improve comps
                </h2>
                <p className="mt-1 text-sm font-semibold text-slate-500">
                  Follow Lot Logic&apos;s next step, or adjust the search yourself.
                </p>
              </div>
              <button
                type="button"
                onClick={() => setCompMarketEditorOpen(false)}
                className="rounded-lg border border-slate-200 px-3 py-1.5 text-xs font-black text-slate-500 hover:bg-slate-50"
              >
                Close
              </button>
            </div>

            <div className="min-h-0 flex-1 overflow-y-auto">
              <div className="px-6 py-5">
                <div className="rounded-2xl border border-blue-200 bg-blue-50/60 p-4">
                  <div className="text-[10px] font-black uppercase tracking-[0.09em] text-blue-600">
                    Recommended next step
                  </div>
                  <div className="mt-1 text-base font-black text-slate-950">
                    {compSearchRecommendation.title}
                  </div>
                  <p className="mt-1 text-xs font-semibold leading-5 text-slate-600">
                    {compSearchRecommendation.reason}
                  </p>
                  {compSearchRecommendation.action !== "complete" ? (
                    <button
                      type="button"
                      onClick={() => void improveCompSearch()}
                      disabled={compSearchImproving || marketCheckLoading || autoDevDiscoveryLoading}
                      className="mt-3 rounded-xl bg-blue-700 px-4 py-2.5 text-sm font-black text-white hover:bg-blue-800 disabled:cursor-wait disabled:bg-slate-300"
                    >
                      {compSearchImproving
                        ? "Running Search…"
                        : compSearchRecommendation.action === "manual-review"
                          ? "Review Vehicle Match →"
                          : "Run Recommended Search →"}
                    </button>
                  ) : null}
                  {compSearchImprovementStatus ? (
                    <div className="mt-2 text-[11px] font-bold leading-4 text-blue-900/70">
                      {compSearchImprovementStatus}
                    </div>
                  ) : null}
                </div>
                <div className="mt-3 rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 text-xs text-slate-700">
                  <div className="font-black text-slate-900">Search evidence</div>
                  <div className="mt-2 grid grid-cols-2 gap-2 sm:grid-cols-3">
                    <span>Auto.dev national listings: <b>{autoDevDiscovery?.total ?? "Not checked"}</b></span>
                    <span>MarketCheck returned: <b>{compReturnedListings}</b></span>
                    <span>Provider-usable: <b>{compUsableListings}</b></span>
                    <span>Trusted selected: <b>{compSummary.includedCount}</b></span>
                    <span>Markets checked: <b>{compSearchRegions}</b></span>
                    <span>Discovered markets left: <b>{remainingNationalMarketCount}</b></span>
                  </div>
                  <div className="mt-2 font-semibold text-slate-600">
                    Rejections (latest provider diagnostics):
                    {" "}model {compModelMismatchCount},
                    {" "}generation {marketCheckApiUsage?.filterDiagnostics?.rejectionCounts?.generationMismatch || 0},
                    {" "}quality {marketCheckApiUsage?.filterDiagnostics?.rejectionCounts?.qualityBelowThreshold || 0}.
                  </div>
                  <p className="mt-2 text-slate-500">National listings and MarketCheck candidates are different data sets; discovery does not guarantee that the same listings can be retrieved as comps. These counts may represent the latest provider response, not cumulative totals.</p>
                </div>

                <details className="mt-4 rounded-2xl border border-slate-200 bg-white">
                  <summary className="cursor-pointer list-none px-4 py-4">
                    <div className="flex items-center justify-between gap-4">
                      <div>
                        <div className="text-sm font-black text-slate-900">
                          Manual search controls
                        </div>
                        <div className="mt-0.5 text-xs font-semibold text-slate-500">
                          Change geography or broaden how providers name the vehicle.
                        </div>
                      </div>
                      <span className="text-sm font-black text-blue-700">Open ↓</span>
                    </div>
                  </summary>

                  <div className="border-t border-slate-200">
                    <div className="border-b border-slate-200 px-4">
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
                      <div>
                        <div className="border-b border-slate-100 px-4 py-4">
                          <div className="flex flex-wrap items-center gap-2">
                            <button
                              type="button"
                              onClick={suggestMoreCompMarkets}
                              disabled={getCompExpansionMarkets().filter((market) => !(marketCheckSearchMeta?.searchedZips || []).includes(market.zip)).length <= compSuggestionCount}
                              className="rounded-lg border border-blue-200 bg-blue-50 px-3 py-2 text-xs font-black text-blue-700 hover:bg-blue-100 disabled:cursor-not-allowed disabled:border-slate-200 disabled:bg-slate-50 disabled:text-slate-400"
                            >
                              {getCompExpansionMarkets().filter((market) => !(marketCheckSearchMeta?.searchedZips || []).includes(market.zip)).length <= compSuggestionCount
                                ? "All suggestions shown"
                                : "Show 3 more markets"}
                            </button>
                            <div className="flex min-w-[220px] flex-1 items-center gap-2">
                              <input
                                value={customCompZip}
                                onChange={(event) => setCustomCompZip(event.target.value.replace(/\D/g, "").slice(0, 5))}
                                placeholder="Add ZIP"
                                inputMode="numeric"
                                className="min-w-0 flex-1 rounded-lg border border-slate-200 px-3 py-2 text-xs font-bold text-slate-700 outline-none focus:border-blue-300"
                              />
                              <button
                                type="button"
                                onClick={addCustomCompZip}
                                disabled={customCompZip.length !== 5}
                                className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs font-black text-slate-600 hover:bg-slate-50 disabled:cursor-not-allowed disabled:text-slate-300"
                              >
                                Add
                              </button>
                            </div>
                          </div>
                        </div>

                        <div className="space-y-2 px-4 py-4">
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
                                <label
                                  key={market.zip}
                                  className={`flex items-center gap-3 rounded-xl border px-4 py-3 ${selected ? "border-blue-200 bg-blue-50/60" : "border-slate-200 bg-white"} ${searched ? "cursor-default" : "cursor-pointer"}`}
                                >
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
                                    <span className="block text-sm font-black text-slate-800">
                                      {market.market} <span className="text-slate-400">({market.zip})</span>
                                    </span>
                                    <span className="mt-0.5 block text-[10px] font-black uppercase tracking-[0.08em] text-slate-400">
                                      {searched
                                        ? "Already searched"
                                        : nextRecommended
                                          ? "Recommended"
                                          : customCompMarkets.some((item) => item.zip === market.zip)
                                            ? "Custom ZIP"
                                            : "Available market"}
                                    </span>
                                  </span>
                                </label>
                              );
                            })}
                        </div>

                        <div className="border-t border-slate-100 bg-slate-50 px-4 py-4">
                          <div className="mb-3 text-[11px] font-semibold leading-5 text-slate-500">
                            Selecting or adding a market stages it here. The search runs when you press the blue button.
                          </div>
                          <div className="flex flex-wrap items-center justify-between gap-3">
                            <button
                              type="button"
                              onClick={() => { setCompMarketEditorOpen(false); void searchMajorMetropolitanAreas(); }}
                              disabled={marketCheckLoading}
                              className="text-xs font-black text-slate-500 hover:text-blue-700 disabled:text-slate-300"
                            >
                              Search reference markets
                            </button>
                            <button
                              type="button"
                              onClick={() => void searchSelectedCompMarkets()}
                              disabled={
                                selectedCompMarketZips.filter(
                                  (zip) => !(marketCheckSearchMeta?.searchedZips || []).includes(zip),
                                ).length === 0 || marketCheckLoading
                              }
                              className="rounded-xl bg-blue-700 px-5 py-2.5 text-sm font-black text-white hover:bg-blue-800 disabled:cursor-not-allowed disabled:bg-slate-300"
                            >
                              {(() => {
                                const count = selectedCompMarketZips.filter(
                                  (zip) => !(marketCheckSearchMeta?.searchedZips || []).includes(zip),
                                ).length;
                                return count > 0
                                  ? `Search ${count} Selected Market${count === 1 ? "" : "s"} →`
                                  : "Select Markets to Search";
                              })()}
                            </button>
                          </div>
                        </div>
                      </div>
                    ) : (
                      <div className="space-y-4 px-4 py-4">
                        <div className="rounded-2xl border border-slate-200 bg-slate-50/70 p-4">
                          <div className="text-[10px] font-black uppercase tracking-[0.09em] text-slate-400">
                            Lot Logic is matching
                          </div>
                          <div className="mt-1 text-base font-black text-slate-950">
                            {[vehicleIdentityProfile?.make || vehicleMake, vehicleIdentityProfile?.modelFamily || vehicleModel, vehicleIdentityProfile?.variant].filter(Boolean).join(" · ") || "Vehicle details unavailable"}
                          </div>
                          <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-[11px] font-semibold text-slate-500">
                            {vehicleIdentityProfile?.bodyClass ? <span>{vehicleIdentityProfile.bodyClass}</span> : null}
                            {vehicleIdentityProfile?.drivetrain ? <span>{vehicleIdentityProfile.drivetrain}</span> : null}
                            {vehicleIdentityProfile?.fuelType ? <span>{vehicleIdentityProfile.fuelType}</span> : null}
                          </div>
                          {vehicleIdentityProfile?.providerAliases?.length ? (
                            <div className="mt-3 text-[11px] font-semibold leading-5 text-slate-500">
                              Provider names: {vehicleIdentityProfile.providerAliases.join(" · ")}
                            </div>
                          ) : null}
                        </div>

                        {vehicleTrim ? (
                          <div className="rounded-2xl border border-amber-200 bg-amber-50/70 p-4">
                            <div className="text-sm font-black text-slate-950">
                              Broaden provider retrieval
                            </div>
                            <p className="mt-1 text-xs font-semibold leading-5 text-slate-600">
                              Search a broader provider bucket without weakening Lot Logic&apos;s final vehicle-match rules.
                            </p>
                            {compTrimRelaxed ? (
                              <div className="mt-3 rounded-xl border border-blue-200 bg-blue-50 px-3 py-3 text-xs font-bold text-blue-900">
                                Current retrieval: {compRetrievalLabel}
                              </div>
                            ) : (
                              <button
                                type="button"
                                onClick={() => { setCompMarketEditorOpen(false); void broadenCompVehicleMatch(); }}
                                disabled={marketCheckLoading}
                                className="mt-3 rounded-xl bg-amber-700 px-4 py-2.5 text-sm font-black text-white hover:bg-amber-800 disabled:bg-slate-300"
                              >
                                {compTaxonomyFallback
                                  ? `Search broader ${vehicleMake} ${compTaxonomyFallback.fallbackModel} bucket`
                                  : "Try Broader Retrieval"}
                              </button>
                            )}
                          </div>
                        ) : (
                          <div className="rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 text-xs font-semibold text-slate-600">
                            Vehicle matching is already at model level. Use Geography if you want to widen the search.
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                </details>
              </div>
            </div>
          </div>
        </div>
      ) : null}

      {whyLotLogicOpen ? (
        <div
          className="fixed inset-0 z-[70] flex items-center justify-center bg-slate-950/50 px-4 py-6 backdrop-blur-sm"
          onClick={() => setWhyLotLogicOpen(false)}
        >
          <div
            role="dialog"
            aria-modal="true"
            aria-label="Why Lot Logic thinks this"
            className="flex max-h-[calc(100dvh-3rem)] w-full max-w-5xl flex-col overflow-hidden rounded-3xl border border-slate-200 bg-white shadow-2xl"
            onClick={(event) => event.stopPropagation()}
          >
            <div className="flex shrink-0 items-start justify-between gap-4 border-b border-slate-200 px-6 py-5">
              <div>
                <div className="text-[10px] font-black uppercase tracking-[0.12em] text-blue-700">
                  Decision details
                </div>
                <h2 className="mt-1 text-xl font-black text-slate-950">
                  Why Lot Logic Thinks This
                </h2>
                <p className="mt-1 max-w-3xl text-sm font-semibold leading-5 text-slate-500">
                  Market evidence and deal economics drive the verdict. Dealer fit and market liquidity add dealership-specific context.
                </p>
              </div>
              <button
                type="button"
                onClick={() => setWhyLotLogicOpen(false)}
                className="rounded-full p-2 text-slate-400 hover:bg-slate-100 hover:text-slate-800"
                aria-label="Close decision details"
              >
                ✕
              </button>
            </div>

            <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-6 py-6">
              <div className="grid gap-5 lg:grid-cols-2">
                <section className="rounded-2xl border border-slate-200 p-5">
                  <div className="text-[10px] font-black uppercase tracking-[0.1em] text-slate-400">
                    Market Evidence
                  </div>
                  <dl className="mt-4 space-y-3 text-sm">
                    <div className="flex justify-between gap-4">
                      <dt className="font-semibold text-slate-500">Confidence</dt>
                      <dd className="text-right font-black text-slate-900">{compConfidenceDisplay}</dd>
                    </div>
                    <div className="flex justify-between gap-4">
                      <dt className="font-semibold text-slate-500">Valuation comps used</dt>
                      <dd className="text-right font-black text-slate-900">{compSummary.includedCount || "—"}</dd>
                    </div>
                    <div className="flex justify-between gap-4">
                      <dt className="font-semibold text-slate-500">Comp-supported value</dt>
                      <dd className="text-right font-black text-slate-950">
                        {compSummary.includedCount
                          ? money(
                              (compSummary as { medianAdjusted?: number }).medianAdjusted ||
                                compSummary.averageAdjusted,
                            )
                          : "—"}
                      </dd>
                    </div>
                    <div className="flex justify-between gap-4">
                      <dt className="font-semibold text-slate-500">Conservative sale value</dt>
                      <dd className="text-right font-black text-slate-950">
                        {compSummary.fastSaleTarget > 0 ? money(compSummary.fastSaleTarget) : "—"}
                      </dd>
                    </div>
                  </dl>
                  <button
                    type="button"
                    onClick={scrollToCompEvidence}
                    className="mt-4 text-xs font-black text-blue-700 hover:text-blue-900"
                  >
                    View comp evidence ↓
                  </button>
                </section>

                <section className="rounded-2xl border border-slate-200 p-5">
                  <div className="text-[10px] font-black uppercase tracking-[0.1em] text-slate-400">
                    Deal Economics
                  </div>
                  <dl className="mt-4 grid grid-cols-2 gap-3 text-sm">
                    <div className="rounded-xl bg-slate-50 p-3">
                      <dt className="text-[9px] font-black uppercase text-slate-400">Current bid</dt>
                      <dd className="mt-1 font-black text-slate-950">{money(valuationInput.currentBid)}</dd>
                    </div>
                    <div className="rounded-xl bg-slate-50 p-3">
                      <dt className="text-[9px] font-black uppercase text-slate-400">Recon reserve</dt>
                      <dd className="mt-1 font-black text-slate-950">{money(displayedReconReserve)}</dd>
                    </div>
                    <div className="rounded-xl bg-slate-50 p-3">
                      <dt className="text-[9px] font-black uppercase text-slate-400">All-in cost</dt>
                      <dd className="mt-1">
                        <button
                          type="button"
                          onClick={() => setAllInCostOpen(true)}
                          className="font-black text-slate-950 underline decoration-slate-300 decoration-dotted underline-offset-4 hover:text-blue-700"
                        >
                          {money(displayedCurrentCost)}
                        </button>
                      </dd>
                    </div>
                    <div className="rounded-xl bg-slate-50 p-3">
                      <dt className="text-[9px] font-black uppercase text-slate-400">Expected profit</dt>
                      <dd className="mt-1 font-black text-emerald-700">
                        {!needsCompSearch && hasAcquisitionPrice ? money(valuation.expectedGrossProfit) : "—"}
                      </dd>
                    </div>
                    <div className="rounded-xl bg-slate-50 p-3">
                      <dt className="text-[9px] font-black uppercase text-slate-400">Recommended max buy</dt>
                      <dd className="mt-1 font-black text-blue-700">{suggestedBid > 0 ? money(suggestedBid) : "—"}</dd>
                    </div>
                    <div className="rounded-xl bg-slate-50 p-3">
                      <dt className="text-[9px] font-black uppercase text-slate-400">Desired profit target</dt>
                      <dd className="mt-1 font-black text-slate-950">{money(valuation.desiredProfitTarget)}</dd>
                      <button type="button" onClick={() => { setWhyLotLogicOpen(false); setBidLogicOpen(true); }} className="mt-2 text-xs font-bold text-blue-700 hover:underline">Edit profit target →</button>
                    </div>
                  </dl>
                </section>

                <section className="rounded-2xl border border-slate-200 p-5">
                  <div className="text-[10px] font-black uppercase tracking-[0.1em] text-slate-400">
                    Dealer Fit
                  </div>
                  <div className="mt-1 text-lg font-black text-slate-950">
                    {dealerFitResult.label} · {dealerFitResult.score}/100
                  </div>
                  <p className="mt-3 text-xs font-semibold leading-5 text-slate-500">
                    Dealer Fit measures how well this vehicle matches the kinds of vehicles your dealership prefers and is positioned to retail. It does not determine whether the deal is profitable.
                  </p>
                  <ul className="mt-4 space-y-2">
                    {[...dealerFitResult.reasons, ...dealerFitResult.cautions]
                      .slice(0, 5)
                      .map((item) => (
                        <li key={item} className="flex gap-2 text-xs font-semibold leading-5 text-slate-700">
                          <span className="mt-[7px] h-1.5 w-1.5 shrink-0 rounded-full bg-blue-500" />
                          {item}
                        </li>
                      ))}
                  </ul>
                  <button
                    type="button"
                    onClick={() => {
                      setWhyLotLogicOpen(false);
                      setDealerProfileOpen(true);
                    }}
                    className="mt-4 text-xs font-black text-blue-700 hover:text-blue-900"
                  >
                    Dealer Profile & Preferences →
                  </button>
                </section>

                <section className="rounded-2xl border border-slate-200 p-5">
                  <div className="text-[10px] font-black uppercase tracking-[0.1em] text-slate-400">
                    Time to Sell
                  </div>
                  <div className="mt-3">
                    <MarketLiquidityVisual
                      soldLow={liquiditySoldLow}
                      soldHigh={liquiditySoldHigh}
                      soldMedian={liquiditySoldMedian}
                      activeDays={liquidityActiveDays}
                      label={liquidityLabel}
                      confidence={liquidityConfidence}
                      sampleSize={liquiditySampleSize}
                    />
                  </div>
                  <p className="mt-3 text-xs font-semibold leading-5 text-slate-600">
                    {liquidityInterpretation}
                  </p>
                  {liquidity?.region ? (
                    <p className="mt-2 text-[10px] font-semibold text-slate-400">
                      Based on recent sold and active listings around {liquidity.region} ({liquidity.zip}) within {liquidity.radius || 100} miles
                      {liquidity.generation ? ` · ${liquidity.generation} generation` : ""}.
                    </p>
                  ) : null}
                </section>
              </div>

              {(reviewReasons.length || needsCompSearch) ? (
                <section className="mt-5 rounded-2xl border border-amber-200 bg-amber-50/70 p-5">
                  <div className="text-[10px] font-black uppercase tracking-[0.1em] text-amber-700">
                    What deserves another look
                  </div>
                  <ul className="mt-3 space-y-2">
                    {[
                      needsCompSearch ? "Market evidence is incomplete; expand the comp search before relying on the sale estimate." : null,
                      ...reviewReasons,
                    ].filter(Boolean).map((item) => (
                      <li key={String(item)} className="flex gap-2 text-xs font-semibold leading-5 text-amber-900">
                        <span className="mt-[7px] h-1.5 w-1.5 shrink-0 rounded-full bg-amber-500" />
                        {item}
                      </li>
                    ))}
                  </ul>
                </section>
              ) : null}
            </div>
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
                    <span className="rounded-full bg-slate-100 px-2.5 py-1 text-[9px] font-black uppercase tracking-[0.08em] text-slate-500">{dealershipProfile.websiteUrl ? "Website saved" : "Add in settings"}</span>
                  </div>
                  {dealershipProfile.websiteUrl ? <p className="mt-2 break-all text-xs font-bold text-blue-700">{dealershipProfile.websiteUrl}</p> : null}
                  <Link href="/settings?tab=organization" className="mt-2 inline-block text-xs font-bold text-blue-700 hover:underline">Edit dealership profile</Link>
                  <p className="mt-2 text-xs font-semibold leading-5 text-slate-500">Website analysis will help identify inventory mix, price bands, and dealership positioning. Your URL is saved as context; automatic website analysis is not active yet.</p>
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
            setActiveStage("vehicle");
            clearLocalDraft();
            setVehicleStepConfirmed(false);
            setConditionStepConfirmed(false);
            setVerdictTransitioning(false);
            setVerdictEntered(false);
            setQuickEvalMode("vin");
            setQuickEvalOpen(false);
          }}
        />

        <div className="mx-auto w-[92vw] max-w-[1720px] px-2 py-4 sm:px-3 lg:px-4">
          {needsDealershipZip ? <div className="mb-4 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm font-semibold text-amber-900">Set your dealership ZIP code so Lot Logic can search your local market. <Link href="/settings?tab=organization" className="font-black underline">Set dealership ZIP →</Link></div> : null}

          {activeStage === "verdict" ? (
            <section className="grid gap-4 lg:grid-cols-3">
              <article className="relative min-h-[142px] rounded-[20px] border border-emerald-200 bg-white p-5 shadow-[0_1px_3px_rgba(15,23,42,0.05)]">
                <div className="flex items-start justify-between gap-3">
                  <div className="text-[10px] font-black uppercase tracking-[0.12em] text-slate-400">Vehicle</div>
                  <button
                    type="button"
                    data-evaluation-entry-action="true"
                    onClick={() => {
                      setQuickEvalMode(vin ? "vin" : "manual");
                      setQuickEvalOpen(true);
                    }}
                    className="text-xs font-black text-blue-700 hover:text-blue-900"
                  >
                    Edit
                  </button>
                </div>
                <div className="mt-3 text-lg font-black leading-tight text-slate-950">{vehicleTitle}</div>
                <div className="absolute bottom-4 left-5 rounded-full bg-emerald-50 px-3 py-1 text-[10px] font-black text-emerald-700">Ready ✓</div>
              </article>

              <article className="relative min-h-[142px] rounded-[20px] border border-emerald-200 bg-white p-5 shadow-[0_1px_3px_rgba(15,23,42,0.05)]">
                <div className="flex items-start justify-between gap-3">
                  <div className="text-[10px] font-black uppercase tracking-[0.12em] text-slate-400">Condition</div>
                  <button
                    type="button"
                    onClick={openConditionAnalysis}
                    className="text-xs font-black text-violet-700 hover:text-violet-900"
                  >
                    Edit
                  </button>
                </div>
                <div className="mt-3 text-lg font-black text-slate-950">
                  {conditionReviewStatus === "issues"
                    ? "Known issues"
                    : conditionReviewStatus === "unknown"
                      ? "Condition unknown"
                      : "No material issues"} · {money(displayedReconReserve)}
                </div>
                <div className="absolute bottom-4 left-5 rounded-full bg-emerald-50 px-3 py-1 text-[10px] font-black text-emerald-700">Ready ✓</div>
              </article>

              <article className="relative min-h-[142px] rounded-[20px] border border-emerald-200 bg-white p-5 shadow-[0_1px_3px_rgba(15,23,42,0.05)]">
                <div className="flex items-start justify-between gap-3">
                  <div className="text-[10px] font-black uppercase tracking-[0.12em] text-slate-400">Market</div>
                  <button
                    type="button"
                    onClick={openCompMarketEditor}
                    className="text-xs font-black text-blue-700 hover:text-blue-900"
                  >
                    Edit
                  </button>
                </div>
                <div className="mt-3 text-lg font-black text-slate-950">
                  {compSummary.includedCount} valuation comp{compSummary.includedCount === 1 ? "" : "s"} · {compSummary.confidence === "High" ? "Strong" : compSummary.confidence === "Medium" ? "Moderate" : "Weak"}
                </div>
                <div className="absolute bottom-4 left-5 rounded-full bg-emerald-50 px-3 py-1 text-[10px] font-black text-emerald-700">Ready ✓</div>
              </article>
            </section>
          ) : (
            <div className={`relative overflow-hidden rounded-[28px] border border-slate-200/80 min-h-[500px] bg-gradient-to-br from-white via-slate-50/80 to-blue-50/40 px-6 py-8 shadow-[0_18px_50px_rgba(15,23,42,0.05)] transition-all duration-300 ease-out sm:px-7 ${
              verdictTransitioning
                ? "-translate-y-1 scale-[0.965] opacity-70"
                : "translate-y-0 scale-100 opacity-100"
            } ${
              activeStage === "vehicle" && !hasEvaluationData
                ? "mt-[clamp(2rem,5vh,3.5rem)]"
                : ""
            }`}>
              <div
                aria-hidden="true"
                className="pointer-events-none absolute inset-0 opacity-[0.22]"
                style={{
                  backgroundImage:
                    "radial-gradient(circle at 1px 1px, rgba(100,116,139,0.22) 1px, transparent 0)",
                  backgroundSize: "24px 24px",
                  maskImage: "linear-gradient(to bottom, black, transparent 72%)",
                }}
              />

              <div className="relative">
                <div className="mb-6">
                  <div className="text-[11px] font-black uppercase tracking-[0.16em] text-blue-700">New Evaluation</div>
                  <h1 className="mt-1 text-2xl font-black tracking-[-0.025em] text-slate-950">
                    Evaluate a vehicle in three quick steps
                  </h1>
                  <p className="mt-1 text-sm font-semibold text-slate-500">
                    Identify the vehicle, review condition, and establish the market.
                  </p>
                </div>

          <section
            className={`relative grid gap-4 transition-[grid-template-columns] duration-300 lg:grid-cols-[var(--workflow-cols)]`}
            style={{
              ["--workflow-cols" as string]:
                activeStage === "vehicle"
                  ? "1.22fr 0.89fr 0.89fr"
                  : activeStage === "condition"
                    ? "0.89fr 1.22fr 0.89fr"
                    : "0.89fr 0.89fr 1.22fr",
            }}
          >
            <div aria-hidden="true" className="pointer-events-none absolute left-[31.8%] right-[31.8%] top-1/2 hidden h-px -translate-y-1/2 bg-gradient-to-r from-blue-200 via-slate-200 to-slate-200 lg:block" />
            <article className={`relative overflow-hidden rounded-[20px] border p-6 shadow-[0_1px_3px_rgba(15,23,42,0.05)] transition-all duration-300 ${
              activeStage === "vehicle"
                ? "z-10 min-h-[360px] border-2 border-blue-500 bg-white opacity-100 ring-4 ring-blue-100/80 shadow-[0_18px_40px_rgba(37,99,235,0.16)] -translate-y-0.5 scale-[1.01]"
                : hasEvaluationData
                  ? "min-h-[360px] border-emerald-200 bg-white"
                  : "min-h-[360px] border-slate-200 bg-white/85 opacity-80"
            }`}>
              {activeStage === "vehicle" ? (
                <svg
                  aria-hidden="true"
                  viewBox="0 0 320 110"
                  className="pointer-events-none absolute -bottom-2 -right-5 h-28 w-72 text-blue-900 opacity-[0.035]"
                  fill="none"
                >
                  <path d="M42 72h18l17-28c5-8 12-12 22-13l91-7c15-1 28 3 40 13l33 28 24 5c8 2 14 9 14 17v4H20v-5c0-8 6-14 14-15l8-1Z" stroke="currentColor" strokeWidth="5" strokeLinejoin="round"/>
                  <circle cx="82" cy="88" r="18" stroke="currentColor" strokeWidth="5"/>
                  <circle cx="244" cy="88" r="18" stroke="currentColor" strokeWidth="5"/>
                  <path d="M101 31l20 37M205 28l-10 40M75 68h173" stroke="currentColor" strokeWidth="4" strokeLinecap="round"/>
                </svg>
              ) : null}
              <div className="flex items-start justify-between gap-3">
                <div>
                  <div className="flex items-center gap-2">
                    <div className="text-[10px] font-black uppercase tracking-[0.12em] text-slate-400">1 · Vehicle</div>
                    {activeStage === "vehicle" ? (
                      <span className="rounded-full bg-blue-600 px-2 py-0.5 text-[9px] font-black uppercase tracking-[0.08em] text-white">Active</span>
                    ) : null}
                  </div>
                  <h2 className="mt-1 text-lg font-black tracking-[-0.015em] text-slate-950">
                    {hasEvaluationData ? vehicleTitle : "Identify the car"}
                  </h2>
                </div>
                {hasEvaluationData ? (
                  <button
                    type="button"
                    data-evaluation-entry-action="true"
                    onClick={() => setActiveStage("vehicle")}
                    className="text-xs font-black text-blue-700 hover:text-blue-900"
                  >
                    Edit
                  </button>
                ) : null}
              </div>

              {activeStage === "vehicle" ? (
                <div className="mt-4 space-y-3">
                  <div className="flex gap-4 text-xs font-extrabold">
                    <button
                      type="button"
                      onClick={() => setQuickEvalMode("vin")}
                      className={quickEvalMode === "vin" ? "border-b-2 border-blue-700 pb-1 text-blue-700" : "pb-1 text-slate-400"}
                    >
                      VIN
                    </button>
                    <button
                      type="button"
                      onClick={() => setQuickEvalMode("manual")}
                      className={quickEvalMode === "manual" ? "border-b-2 border-blue-700 pb-1 text-blue-700" : "pb-1 text-slate-400"}
                    >
                      Manual
                    </button>
                  </div>

                  {quickEvalMode === "vin" ? (
                    <input
                      value={vin}
                      onChange={(event) => setVin(event.target.value.toUpperCase())}
                      placeholder="17-character VIN"
                      className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm font-semibold outline-none focus:border-blue-300"
                    />
                  ) : (
                    <div className="grid grid-cols-[76px_1fr_1fr] gap-2">
                      <input
                        value={manualVehicle.year}
                        onChange={(event) => updateManualVehicleField("year", event.target.value)}
                        placeholder="Year"
                        className="min-w-0 rounded-xl border border-slate-200 bg-white px-2 py-2.5 text-sm font-semibold outline-none"
                      />
                      <input
                        value={manualVehicle.make}
                        onChange={(event) => updateManualVehicleField("make", event.target.value)}
                        placeholder="Make"
                        className="min-w-0 rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm font-semibold outline-none"
                      />
                      <input
                        value={manualVehicle.model}
                        onChange={(event) => updateManualVehicleField("model", event.target.value)}
                        placeholder="Model"
                        className="min-w-0 rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm font-semibold outline-none"
                      />
                    </div>
                  )}

                  <div className="grid grid-cols-2 gap-2">
                    <label>
                      <span className="mb-1 block text-[10px] font-black uppercase tracking-[0.08em] text-slate-400">Mileage</span>
                      <div className="flex items-center rounded-xl border border-slate-200 bg-white">
                        <input
                          ref={mileageInputRef}
                          type="text"
                          inputMode="numeric"
                          value={formatNumberInput(targetMileage)}
                          onChange={(event) => setTargetMileage(toNumber(event.target.value))}
                          className="min-w-0 flex-1 bg-transparent px-3 py-2.5 text-right text-sm font-semibold outline-none"
                        />
                        <span className="pr-3 text-xs font-bold text-slate-400">mi</span>
                      </div>
                    </label>
                    <label>
                      <span className="mb-1 block text-[10px] font-black uppercase tracking-[0.08em] text-slate-400">Bid / Ask</span>
                      <div className="flex items-center rounded-xl border border-slate-200 bg-white">
                        <span className="pl-3 text-sm text-slate-400">$</span>
                        <input
                          type="text"
                          inputMode="numeric"
                          value={formatNumberInput(valuationInput.currentBid)}
                          onChange={(event) => updateEvaluationField("currentBid", toNumber(event.target.value))}
                          className="min-w-0 flex-1 bg-transparent px-3 py-2.5 text-right text-sm font-semibold outline-none"
                        />
                      </div>
                    </label>
                  </div>

                  <label>
                    <span className="mb-1 block text-[10px] font-black uppercase tracking-[0.08em] text-slate-400">Source</span>
                    <select
                      value={auctionSite}
                      onChange={(event) => setAuctionSite(event.target.value)}
                      className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm font-semibold text-slate-800 outline-none focus:border-blue-300"
                    >
                      <option>ACV Auctions</option>
                      <option>Manheim</option>
                      <option>Cars & Bids</option>
                      <option>Bring a Trailer</option>
                      <option>Facebook</option>
                      <option>Private Party</option>
                      <option>Other</option>
                    </select>
                  </label>

                  {vinDecodeError ? (
                    <div className="rounded-lg bg-red-50 px-3 py-2 text-xs font-bold text-red-700">{vinDecodeError}</div>
                  ) : null}
                  {evaluationAccessError ? <div role="alert" className="rounded-lg bg-red-50 px-3 py-2 text-xs font-bold text-red-700">{evaluationAccessError}</div> : null}

                  <button
                    type="button"
                    data-evaluation-entry-action="true"
                    onClick={() => void runPrimaryEvaluation()}
                    disabled={
                      evaluationRunning ||
                      vinDecodeLoading ||
                      marketCheckLoading ||
                      !vehicleInputReady
                    }
                    className="mt-3 w-full rounded-xl bg-blue-700 px-4 py-3 text-sm font-black text-white hover:bg-blue-800 disabled:cursor-not-allowed disabled:bg-slate-300"
                  >
                    {evaluationRunning || vinDecodeLoading ? "Loading Vehicle..." : "Next →"}
                  </button>
                </div>
              ) : hasEvaluationData ? (
                <div className="mt-4">
                  <div className="grid gap-2 text-sm">
                    <div className="flex justify-between gap-3"><span className="font-semibold text-slate-500">Mileage</span><span className="font-black text-slate-900">{targetMileage ? `${formatNumberInput(targetMileage)} mi` : "—"}</span></div>
                    <div className="flex justify-between gap-3"><span className="font-semibold text-slate-500">Bid / Ask</span><span className="font-black text-slate-900">{valuationInput.currentBid > 0 ? money(valuationInput.currentBid) : "—"}</span></div>
                    <div className="flex justify-between gap-3"><span className="font-semibold text-slate-500">Trim</span><span className="truncate font-black text-slate-900">{vehicleTrim || "—"}</span></div>
                  </div>
                  <div className="mt-4 inline-flex rounded-full bg-emerald-50 px-3 py-1 text-[10px] font-black text-emerald-700">Vehicle ready ✓</div>
                </div>
              ) : null}
            </article>

            <article className={`relative overflow-hidden rounded-[20px] border p-6 shadow-[0_1px_3px_rgba(15,23,42,0.05)] transition-all duration-300 ${
              activeStage === "condition"
                ? "z-10 min-h-[360px] border-2 border-violet-500 bg-white opacity-100 ring-4 ring-violet-100/80 shadow-[0_18px_40px_rgba(124,58,237,0.16)] -translate-y-0.5 scale-[1.01]"
                : conditionReviewComplete && vehicleStepConfirmed
                  ? "min-h-[360px] border-emerald-200 bg-white"
                  : vehicleStepConfirmed
                    ? "min-h-[360px] border-slate-200 bg-white/70"
                    : "min-h-[360px] border-slate-200 bg-white/80 opacity-75"
            }`}>
              {conditionAnalysisLoading ? (
                <div className="absolute inset-0 z-30 flex items-center justify-center bg-white/95 p-6 backdrop-blur-[2px]">
                  <div className="w-full max-w-sm text-center">
                    <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-2xl bg-violet-50 ring-1 ring-violet-100">
                      <div className="relative h-9 w-9">
                        <div className="absolute inset-0 rounded-full border-4 border-violet-100" />
                        <div className="absolute inset-0 animate-spin rounded-full border-4 border-transparent border-t-violet-600 border-r-violet-400" />
                      </div>
                    </div>

                    <div className="mt-5 text-[10px] font-black uppercase tracking-[0.14em] text-violet-600">
                      Condition Analysis
                    </div>
                    <div className="mt-2 min-h-[32px] text-xl font-black tracking-[-0.02em] text-slate-950">
                      {conditionAnalysisProgressSteps[conditionAnalysisProgressIndex]}…
                    </div>
                    <div className="mt-2 text-xs font-semibold text-slate-500">
                      Lot Logic is turning the notes into an actionable condition reserve.
                    </div>

                    <div className="mt-6 flex gap-1.5">
                      {conditionAnalysisProgressSteps.map((step, index) => (
                        <div
                          key={step}
                          className={`h-1.5 flex-1 rounded-full transition-all duration-300 ${
                            index <= conditionAnalysisProgressIndex
                              ? "bg-violet-600"
                              : "bg-slate-200"
                          }`}
                        />
                      ))}
                    </div>
                    <div className="mt-2 text-[10px] font-bold text-slate-400">
                      Step {conditionAnalysisProgressIndex + 1} of {conditionAnalysisProgressSteps.length}
                    </div>
                  </div>
                </div>
              ) : null}

              <div className="flex items-start justify-between gap-3">
                <div>
                  <div className="flex items-center gap-2">
                    <div className="text-[10px] font-black uppercase tracking-[0.12em] text-slate-400">2 · Condition</div>
                    {activeStage === "condition" ? (
                      <span className="rounded-full bg-violet-600 px-2 py-0.5 text-[9px] font-black uppercase tracking-[0.08em] text-white">Active</span>
                    ) : null}
                  </div>
                  <h2 className="mt-1 text-lg font-black text-slate-950">
                    {conditionReviewStatus === "unreviewed"
                      ? "What do we know?"
                      : conditionReviewStatus === "no_material_issues"
                        ? "No material issues"
                        : conditionReviewStatus === "unknown"
                          ? "Condition unknown"
                          : "Known issues"}
                  </h2>
                </div>
                {vehicleStepConfirmed && conditionReviewStatus !== "unreviewed" && activeStage !== "condition" ? (
                  <button
                    type="button"
                    onClick={() => {
                      setConditionStepConfirmed(false);
                      setActiveStage("condition");
                    }}
                    className="text-xs font-black text-violet-700 hover:text-violet-900"
                  >
                    Edit
                  </button>
                ) : null}
              </div>

              {!vehicleStepConfirmed ? (
                <div className="mt-5">
                  <div className="space-y-2 opacity-55">
                    {["No material issues", "Known issues", "Condition unknown"].map((label) => (
                      <div key={label} className="flex items-center gap-2 rounded-xl border border-slate-200 bg-white/70 px-3 py-2.5 text-xs font-bold text-slate-400">
                        <span className="h-3.5 w-3.5 rounded-full border border-slate-300 bg-white" />
                        {label}
                      </div>
                    ))}
                  </div>
                  <div className="mt-3 text-[11px] font-bold text-slate-400">Available after Vehicle is complete.</div>
                </div>
              ) : activeStage === "condition" ? (
                <div className="mt-4">
                  {conditionReviewStatus === "unreviewed" ? (
                    <div className="space-y-2">
                      <button type="button" onClick={() => chooseConditionReview("no_material_issues")} className="w-full rounded-xl border border-slate-200 bg-white p-3 text-left hover:border-emerald-300 hover:bg-emerald-50">
                        <div className="text-sm font-black text-slate-900">No material issues apparent</div>
                        <div className="mt-1 text-[11px] font-semibold leading-4 text-slate-500">Based on the listing, inspection, disclosures, and information available.</div>
                      </button>
                      <button type="button" onClick={() => chooseConditionReview("issues")} className="w-full rounded-xl border border-slate-200 bg-white p-3 text-left hover:border-violet-300 hover:bg-violet-50">
                        <div className="text-sm font-black text-slate-900">There are known issues</div>
                        <div className="mt-1 text-[11px] font-semibold leading-4 text-slate-500">Paste the condition information you have and let Lot Logic structure it.</div>
                      </button>
                      <button type="button" onClick={() => chooseConditionReview("unknown")} className="w-full rounded-xl border border-slate-200 bg-white p-3 text-left hover:border-amber-300 hover:bg-amber-50">
                        <div className="text-sm font-black text-slate-900">Condition is unknown</div>
                        <div className="mt-1 text-[11px] font-semibold leading-4 text-slate-500">Use this when the available information is not good enough to establish condition confidently.</div>
                      </button>
                    </div>
                  ) : conditionReviewStatus === "issues" ? (
                    <div>
                      {!conditionAnalysis ? (
                        <>
                          <textarea
                            value={conditionSourceText}
                            onChange={(event) => {
                              setConditionSourceText(event.target.value);
                              setConditionAnalysisApplied(false);
                            }}
                            placeholder="Paste auction notes, disclosures, warning lights, damage, service needs, title/history concerns..."
                            className="min-h-[150px] w-full resize-y rounded-xl border border-violet-200 bg-violet-50/30 p-3 text-sm font-medium leading-5 text-slate-700 outline-none focus:bg-white"
                          />
                          {conditionAnalysisError ? <div className="mt-2 text-xs font-bold text-red-700">{conditionAnalysisError}</div> : null}
                          <div className="mt-3 flex gap-2">
                            <button type="button" onClick={() => {
                          setConditionStepConfirmed(false);
                          chooseConditionReview("unreviewed");
                        }} className="rounded-xl border border-slate-200 px-3 py-2 text-xs font-black text-slate-600">Back</button>
                            <button
                              type="button"
                              onClick={() => void analyzeConditionInformation()}
                              disabled={conditionAnalysisLoading || !conditionSourceText.trim()}
                              className="flex-1 rounded-xl bg-violet-700 px-4 py-2.5 text-sm font-black text-white hover:bg-violet-800 disabled:bg-slate-300"
                            >
                              {conditionAnalysisLoading ? "Analyzing…" : "Analyze Issues"}
                            </button>
                          </div>
                        </>
                      ) : (
                        <>
                          <div className="rounded-xl border border-violet-200 bg-violet-50/40 p-4">
                            <div className="text-sm font-black text-slate-950">{conditionAnalysis.issues.filter((issue) => issue.includeInValuation).length} issue{conditionAnalysis.issues.filter((issue) => issue.includeInValuation).length === 1 ? "" : "s"} identified</div>
                            <div className="mt-1 text-xs font-semibold text-slate-500">Planning reserve ≈ {money(getEffectiveConditionPlanningEstimate())}</div>

                            {conditionAnalysis.issues.filter((issue) => issue.includeInValuation).length ? (
                              <div className="mt-3 space-y-1.5">
                                {conditionAnalysis.issues
                                  .filter((issue) => issue.includeInValuation)
                                  .slice(0, 2)
                                  .map((issue) => (
                                    <div
                                      key={issue.id}
                                      className="flex items-center justify-between gap-3 rounded-lg bg-white/80 px-3 py-2"
                                    >
                                      <div className="min-w-0 truncate text-xs font-bold text-slate-700">
                                        {issue.description}
                                      </div>
                                      <div className="shrink-0 text-xs font-black text-violet-700">
                                        {money(issue.planningEstimate)}
                                      </div>
                                    </div>
                                  ))}
                                {conditionAnalysis.issues.filter((issue) => issue.includeInValuation).length > 2 ? (
                                  <div className="px-1 text-[10px] font-bold text-slate-400">
                                    +{conditionAnalysis.issues.filter((issue) => issue.includeInValuation).length - 2} more in details
                                  </div>
                                ) : null}
                              </div>
                            ) : null}

                            <div className="mt-3">
                              <button type="button" onClick={openConditionAnalysis} className="rounded-lg border border-violet-200 bg-white px-3 py-2 text-xs font-black text-violet-700">Review details</button>
                            </div>
                          </div>
                          <button
                            type="button"
                            onClick={() => {
                              applyConditionAnalysis();
                              setConditionStepConfirmed(true);
                              setActiveStage("market");
                            }}
                            className="mt-3 w-full rounded-xl bg-violet-700 px-4 py-2.5 text-sm font-black text-white hover:bg-violet-800"
                          >
                            Use this condition & continue →
                          </button>
                        </>
                      )}
                    </div>
                  ) : (
                    <div>
                      <div className={`rounded-xl border p-4 ${
                        conditionReviewStatus === "unknown"
                          ? "border-amber-200 bg-amber-50"
                          : "border-emerald-200 bg-emerald-50"
                      }`}>
                        <div className="text-sm font-black text-slate-900">
                          {conditionReviewStatus === "unknown" ? "Condition will remain an explicit uncertainty." : "No material issues apparent."}
                        </div>
                        {conditionReviewStatus === "unknown" ? (
                          <div className="mt-3">
                            <label htmlFor="condition-uncertainty-allowance" className="text-xs font-bold text-slate-800">Condition uncertainty allowance ($)</label>
                            <input
                              id="condition-uncertainty-allowance"
                              type="number"
                              min="0"
                              step="100"
                              inputMode="decimal"
                              value={conditionPlanningEstimateOverride ?? ""}
                              placeholder="0"
                              onChange={(event) => {
                                const amount = event.target.valueAsNumber;
                                setConditionPlanningEstimateOverride(Number.isFinite(amount) ? Math.max(0, amount) : null);
                              }}
                              className="mt-1 w-full rounded-lg border border-amber-200 bg-white px-3 py-2 text-sm font-bold text-slate-900"
                            />
                            <p className="mt-2 text-xs leading-5 text-slate-600">Optional reserve for unseen repairs. Included in all-in cost and reduces your maximum bid; condition remains unknown.</p>
                          </div>
                        ) : null}
                      </div>
                      <div className="mt-3 flex gap-2">
                        <button type="button" onClick={() => {
                          setConditionStepConfirmed(false);
                          chooseConditionReview("unreviewed");
                        }} className="rounded-xl border border-slate-200 px-3 py-2 text-xs font-black text-slate-600">Change</button>
                        <button
                          type="button"
                          onClick={() => {
                            setConditionStepConfirmed(true);
                            setActiveStage("market");
                          }}
                          className="flex-1 rounded-xl bg-blue-700 px-4 py-2.5 text-sm font-black text-white hover:bg-blue-800"
                        >
                          Next →
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              ) : conditionReviewComplete ? (
                <div className="mt-4">
                  <div className="text-sm font-bold text-slate-700">
                    {conditionReviewStatus === "issues"
                      ? `${conditionAnalysis?.issues.filter((issue) => issue.includeInValuation).length || 0} reviewed issue${(conditionAnalysis?.issues.filter((issue) => issue.includeInValuation).length || 0) === 1 ? "" : "s"} · ≈ ${money(getEffectiveConditionPlanningEstimate())} reserve`
                      : conditionReviewStatus === "unknown"
                        ? "Condition unknown · final verdict will require review"
                        : "No material issues apparent"}
                  </div>
                  <div className="mt-4 inline-flex rounded-full bg-emerald-50 px-3 py-1 text-[10px] font-black text-emerald-700">Condition reviewed ✓</div>
                </div>
              ) : vehicleStepConfirmed ? (
                <button
                  type="button"
                  onClick={() => {
                    setConditionStepConfirmed(false);
                    setActiveStage("condition");
                  }}
                  className="mt-4 w-full rounded-xl bg-violet-700 px-4 py-2.5 text-sm font-black text-white"
                >
                  Review Condition →
                </button>
              ) : null}
            </article>

            <article className={`min-h-[360px] rounded-[20px] border p-6 shadow-[0_1px_3px_rgba(15,23,42,0.05)] transition-all duration-300 ${
              activeStage === "market"
                ? "z-10 min-h-[360px] border-2 border-blue-500 bg-white opacity-100 ring-4 ring-blue-100/80 shadow-[0_18px_40px_rgba(37,99,235,0.16)] -translate-y-0.5 scale-[1.01]"
                : conditionStepConfirmed && !needsCompSearch && hasEvaluationData
                  ? "min-h-[360px] border-emerald-200 bg-white"
                  : conditionStepConfirmed
                    ? "min-h-[360px] border-slate-200 bg-white/70"
                    : "border-slate-200 bg-white/45 opacity-50"
            }`}>
              <div className="flex items-start justify-between gap-3">
                <div>
                  <div className="flex items-center gap-2">
                    <div className="text-[10px] font-black uppercase tracking-[0.12em] text-slate-400">3 · Market</div>
                    {activeStage === "market" ? (
                      <span className="rounded-full bg-blue-600 px-2 py-0.5 text-[9px] font-black uppercase tracking-[0.08em] text-white">Active</span>
                    ) : null}
                  </div>
                  <h2 className="mt-1 text-lg font-black text-slate-950">
                    {!conditionStepConfirmed
                      ? "Market evidence"
                      : evaluationRunning || marketCheckLoading
                        ? "Finding comps..."
                        : compSummary.includedCount > 0
                          ? `${compSummary.includedCount} valuation comp${compSummary.includedCount === 1 ? "" : "s"} · ${marketEvidenceStrength} evidence`
                          : "Market evidence"}
                  </h2>
                </div>
                {conditionStepConfirmed && hasEvaluationData && activeStage !== "vehicle" ? (
                  <span className={`rounded-full px-2.5 py-1 text-[10px] font-black ${
                    needsCompSearch ? "bg-amber-50 text-amber-700" : "bg-emerald-50 text-emerald-700"
                  }`}>
                    {needsCompSearch ? "Needs attention" : "Ready ✓"}
                  </span>
                ) : null}
              </div>

              {!conditionStepConfirmed ? (
                <div className="mt-5">
                  <div className="grid grid-cols-2 gap-2 opacity-55">
                    <div className="rounded-xl border border-slate-200 bg-white/70 p-3">
                      <div className="text-[9px] font-black uppercase tracking-[0.08em] text-slate-400">Comparable Vehicles</div>
                      <div className="mt-1 text-lg font-black text-slate-300">—</div>
                    </div>
                    <div className="rounded-xl border border-slate-200 bg-white/70 p-3">
                      <div className="text-[9px] font-black uppercase tracking-[0.08em] text-slate-400">Expected Retail</div>
                      <div className="mt-1 text-lg font-black text-slate-300">—</div>
                    </div>
                  </div>
                  <div className="mt-2 rounded-xl border border-slate-200 bg-white/70 px-3 py-2.5 opacity-55">
                    <div className="text-[9px] font-black uppercase tracking-[0.08em] text-slate-400">Confidence</div>
                    <div className="mt-1 h-1.5 rounded-full bg-slate-200">
                      <div className="h-1.5 w-1/3 rounded-full bg-slate-300" />
                    </div>
                  </div>
                  <div className="mt-3 text-[11px] font-bold text-slate-400">
                    Market search begins after Vehicle and becomes actionable after Condition.
                  </div>
                </div>
              ) : (
                <div className="mt-4">
                  {evaluationRunning || marketCheckLoading ? (
                    <div className="overflow-hidden rounded-xl border border-blue-100 bg-blue-50 px-4 py-4">
                      <div className="flex items-center justify-between gap-4">
                        <div className="text-sm font-black text-blue-700">
                          Checking the market…
                        </div>
                        <div className="flex items-center gap-1.5" aria-hidden="true">
                          {[0, 1, 2].map((index) => (
                            <span
                              key={index}
                              className="h-2 w-2 animate-bounce rounded-full bg-blue-600"
                              style={{ animationDelay: `${index * 140}ms` }}
                            />
                          ))}
                        </div>
                      </div>
                      <div className="mt-3 h-1.5 overflow-hidden rounded-full bg-blue-100">
                        <div className="h-full w-2/3 animate-pulse rounded-full bg-blue-600" />
                      </div>
                    </div>
                  ) : compSummary.includedCount > 0 ? (
                    <>
                      <div className="grid grid-cols-2 gap-3">
                        <div className="rounded-xl bg-slate-50 p-3">
                          <div className="text-[9px] font-black uppercase tracking-[0.08em] text-slate-400">Expected Retail</div>
                          <div className="mt-1 text-xl font-black text-slate-950">{finalTargetUsed > 0 ? money(finalTargetUsed) : "—"}</div>
                        </div>
                        <div className="rounded-xl bg-slate-50 p-3">
                          <div className="text-[9px] font-black uppercase tracking-[0.08em] text-slate-400">Confidence</div>
                          <div className="mt-1 text-xl font-black text-slate-950">{marketEvidenceStrength}</div>
                        </div>
                      </div>
                      {activeStage === "market" ? (
                        <>
                        {hasLimitedMarketEvidence ? (
                          <div className="mt-3 rounded-xl border border-amber-200 bg-amber-50 p-3">
                            <div className="text-xs font-black text-amber-900">Recommended next step: {compSearchRecommendation.title}</div>
                            <div className="mt-1 text-[11px] font-semibold leading-5 text-amber-800">{compSearchRecommendation.reason}</div>
                          </div>
                        ) : null}
                        <div className="mt-3 flex flex-col gap-2 sm:flex-row sm:items-center">
                          {hasLimitedMarketEvidence ? (
                            <>
                              <button
                                type="button"
                                onClick={() => void improveCompSearch()}
                                disabled={compSearchImproving || marketCheckLoading || autoDevDiscoveryLoading || (automaticCompSearchCompleted && !canContinueNationalSearch && compSearchRecommendation.action !== "manual-review")}
                                title={automaticCompSearchCompleted && !canContinueNationalSearch ? "Automatic national market checks are finished. Review or adjust vehicle match." : undefined}
                                className="flex-1 rounded-lg bg-blue-700 px-4 py-2.5 text-xs font-black text-white transition hover:bg-blue-800 disabled:cursor-not-allowed disabled:border disabled:border-slate-200 disabled:bg-slate-100 disabled:text-slate-400"
                              >
                                {compSearchImproving ? "Running Search…" : compSearchRecommendation.action === "manual-review" ? "Review Vehicle Match" : "Run Recommended Search"}
                              </button>
                              <span className="text-center text-[10px] font-black uppercase tracking-[0.12em] text-slate-400">
                                or
                              </span>
                            </>
                          ) : null}
                          <button
                            type="button"
                            onClick={() => void continueToVerdict()}
                            disabled={verdictTransitioning}
                            className="flex-1 rounded-lg border border-blue-200 bg-white px-4 py-2.5 text-xs font-black text-blue-700 transition hover:bg-blue-50 disabled:cursor-wait disabled:opacity-70"
                          >
                            {verdictTransitioning ? "Building Verdict…" : "Continue to Verdict →"}
                          </button>
                        </div>
                        {automaticCompSearchCompleted && hasLimitedMarketEvidence ? (
                          <div className="mt-2 text-[11px] font-bold leading-4 text-slate-500">
                            Automatic search is complete. Use <span className="text-slate-800">Expand / Improve Comps</span> at the top of Comparable Vehicles to search specific markets or adjust the vehicle match.
                          </div>
                        ) : null}
                        {usageLimitMessage ? (
                          <div className="mt-3 flex flex-col gap-2 rounded-xl border border-amber-200 bg-amber-50 p-3 text-xs font-bold leading-5 text-amber-900 sm:flex-row sm:items-center sm:justify-between">
                            <span>{usageLimitMessage}</span>
                            <Link
                              href="/settings?tab=billing"
                              className="shrink-0 rounded-lg bg-slate-950 px-3 py-2 text-center text-xs font-black text-white"
                            >
                              Choose a plan
                            </Link>
                          </div>
                        ) : null}
                        </>
                      ) : null}
                    </>
                  ) : activeStage === "market" ? (
                    compSearchHandedOff ? (
                      <>
                        <div className="rounded-xl border border-blue-200 bg-blue-50/60 p-4">
                          <div className="text-sm font-black text-blue-950">
                            {compSearchImproving
                              ? "Automatic search in progress"
                              : automaticCompSearchCompleted
                                ? "Automatic search finished"
                                : "Comp search continues below"}
                          </div>
                          <div className="mt-1 text-xs font-semibold leading-5 text-blue-800">
                            {compSearchImproving
                              ? compSearchImprovementStatus ||
                                "Lot Logic is running the recommended search step…"
                              : automaticCompSearchCompleted
                                ? `${compSearchRegions || 0} market${compSearchRegions === 1 ? "" : "s"} checked${autoDevDiscovery ? " plus national inventory" : ""}. ${comps.length} candidate${comps.length === 1 ? "" : "s"} reviewed · ${compSummary.includedCount} trusted comp${compSummary.includedCount === 1 ? "" : "s"} selected.`
                                : "Review the current evidence and next recommended step in Comparable Vehicles."}
                          </div>
                        </div>
                        <button
                          type="button"
                          onClick={() => compSectionRef.current?.scrollIntoView({ behavior: "smooth", block: "start" })}
                          className="mt-3 text-xs font-black text-blue-700 hover:text-blue-900"
                        >
                          View comp results ↓
                        </button>
                      </>
                    ) : (
                      <>
                        <div className="rounded-xl border border-amber-200 bg-amber-50 p-4">
                          <div className="text-sm font-black text-amber-900">{compNextStep.title || "More market evidence needed"}</div>
                          <div className="mt-1 text-xs font-semibold leading-5 text-amber-800">{compNextStep.reason || "Adjust the comp search before continuing."}</div>
                        </div>
                        <div className="mt-3 flex flex-wrap gap-2">
                          {compSearchRecommendation.action === "manual-review" ? (
                            <button type="button" onClick={openCompVehicleMatchEditor} className="rounded-lg bg-blue-700 px-4 py-2 text-xs font-black text-white">Review Vehicle Match →</button>
                          ) : (
                            <button
                              type="button"
                              onClick={() => void improveCompSearch()}
                              disabled={compSearchImproving || marketCheckLoading || autoDevDiscoveryLoading || (automaticCompSearchCompleted && !canContinueNationalSearch && compSearchRecommendation.action !== "manual-review")}
                              className="rounded-lg bg-blue-700 px-4 py-2 text-xs font-black text-white disabled:bg-slate-300"
                            >
                              {automaticCompSearchCompleted ? "Automatic search complete" : compSearchImproving ? "Running Search…" : "Run Recommended Search"}
                            </button>
                          )}
                          <button type="button" onClick={openCompMarketEditor} disabled={marketCheckLoading} className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs font-black text-slate-600 disabled:text-slate-300">Expand / Improve Comps</button>
                        </div>
                      </>
                    )
                  ) : (
                    <div className="text-sm font-semibold text-slate-500">Market evidence incomplete.</div>
                  )}
                </div>
              )}
            </article>
          </section>
              </div>
            </div>
          )}

          {activeStage === "market" && (comps.length > 0 || needsCompSearch) ? (
            <section ref={compSectionRef} className="mt-4 scroll-mt-4">
              <SectionCard
                title="Comparable Vehicles"
                action={
                  <div className="flex flex-wrap items-center gap-2">
                    <button type="button" onClick={openCompMarketEditor} disabled={marketCheckLoading} className="rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs font-black text-slate-600 hover:bg-slate-50">Expand / Improve Comps</button>
                    <button type="button" onClick={openMethodology} className="text-xs font-black text-slate-400 hover:text-slate-700">Methodology</button>
                  </div>
                }
              >
                <div className="space-y-3">
                  {comps.length ? (
                    <>
                      <div className="flex flex-wrap items-center justify-between gap-2 px-0.5">
                        <div className="text-xs font-bold text-slate-500">
                          {Math.min(5, comps.length)} of {Number(
                            marketCheckApiUsage?.filterDiagnostics?.usableListings ||
                              comps.length,
                          )} qualifying comp{Number(
                            marketCheckApiUsage?.filterDiagnostics?.usableListings ||
                              comps.length,
                          ) === 1 ? "" : "s"} shown
                        </div>
                        <div className="text-[11px] font-semibold text-slate-400">
                          Full comp set appears after Continue to Verdict.
                        </div>
                      </div>
                      <MarketCompsTable comps={comps.slice(0, 5)} targetMileage={targetMileage} assumptions={activeAssumptions} onToggleIncluded={toggleCompIncluded} />
                      {marketCheckSearchMeta?.regionsChecked?.length ? (
                        <div className="rounded-xl border border-slate-200 bg-slate-50/70 px-4 py-3 text-xs font-semibold text-slate-600">
                          <span className="font-black text-slate-800">Search coverage:</span>{" "}
                          {marketCheckSearchMeta.regionsChecked.join(" → ")}
                          {Array.from(
                            new Set(
                              comps
                                .filter((comp) => comp.included && comp.region)
                                .map((comp) => comp.region),
                            ),
                          ).length ? (
                            <>
                              {" · "}
                              <span className="font-black text-slate-800">Qualifying comps found in:</span>{" "}
                              {Array.from(
                                new Set(
                                  comps
                                    .filter((comp) => comp.included && comp.region)
                                    .map((comp) => comp.region),
                                ),
                              ).join(", ")}
                            </>
                          ) : null}
                        </div>
                      ) : null}
                      <div className="rounded-xl border border-slate-200 bg-slate-50/70 px-4 py-3 text-xs font-semibold leading-5 text-slate-600">
                        <span className="font-black text-slate-900">Comp hierarchy:</span>{" "}
                        Direct and Near comps may be auto-included when they pass the quality floor. Supporting comps require a dealer check. Rejected matches stay excluded unless you deliberately select them; dealer overrides lower confidence. Mileage normalization is nonlinear and capped.
                      </div>
                    </>
                  ) : null}

                  {marketCheckSearchMeta?.regionsChecked?.length ||
                  marketCheckApiUsage?.filterDiagnostics?.returnedListings ? (
                    <details className="group">
                      <summary className="cursor-pointer list-none text-xs font-black text-slate-400 hover:text-slate-700">
                        View search details
                        <span className="ml-1 inline-block transition-transform group-open:rotate-180">↓</span>
                      </summary>
                      <div className="mt-2 rounded-lg bg-slate-50 px-3 py-2 text-[11px] font-semibold leading-5 text-slate-500">
                        {marketCheckSearchMeta?.regionsChecked?.length
                          ? `${marketCheckSearchMeta.regionsChecked.length} market${marketCheckSearchMeta.regionsChecked.length === 1 ? "" : "s"} searched`
                          : "Market search completed"}
                        {Number(marketCheckApiUsage?.filterDiagnostics?.returnedListings || 0) > 0
                          ? ` · ${Number(marketCheckApiUsage?.filterDiagnostics?.returnedListings || 0)} listings reviewed`
                          : ""}
                        {Number(marketCheckApiUsage?.filterDiagnostics?.usableListings || 0) > 0
                          ? ` · ${Number(marketCheckApiUsage?.filterDiagnostics?.usableListings || 0)} qualified`
                          : ""}
                      </div>
                    </details>
                  ) : null}
                </div>
              </SectionCard>
            </section>
          ) : null}

          {activeStage === "verdict" ? (
            <>
              <section className={`mt-4 grid gap-4 transition-all delay-75 duration-300 ease-out lg:grid-cols-[1.05fr_1.1fr_1fr] ${
                verdictEntered
                  ? "translate-y-0 opacity-100"
                  : "translate-y-4 opacity-0"
              }`}>
                <article className="h-full rounded-[20px] border border-slate-200 bg-white p-5 shadow-[0_1px_3px_rgba(15,23,42,0.05),0_14px_34px_rgba(15,23,42,0.035)]">
                  <div className="flex items-start justify-between gap-3">
                    <h2 className="text-base font-black text-slate-950">Vehicle Snapshot</h2>
                    <button type="button" onClick={() => setVehicleDetailsOpen(true)} className="rounded-lg border border-slate-200 px-3 py-1.5 text-xs font-extrabold text-slate-600 hover:bg-slate-50">Details</button>
                  </div>
                  <div className="mt-4 flex items-center gap-4">
                    <div className="relative h-[76px] w-[116px] shrink-0 overflow-hidden rounded-xl border border-slate-200 bg-slate-50">
                      {representativeCompImage ? <img src={representativeCompImage} alt={vehicleTitle} className="h-full w-full object-cover" referrerPolicy="no-referrer" /> : null}
                    </div>
                    <div>
                      <div className="text-lg font-black leading-tight text-blue-700">{vehicleTitle}</div>
                      <div className="mt-1 text-xs font-semibold text-slate-500">{simplifiedVehicleBodyClass || "Vehicle"}{decodedVehicle?.fuelType ? ` · ${decodedVehicle.fuelType}` : ""}</div>
                    </div>
                  </div>
                  <dl className="mt-5 space-y-2.5 text-sm">
                    {[
                      ["VIN", vin || "—"],
                      ["Mileage", targetMileage ? `${formatNumberInput(targetMileage)} mi` : "—"],
                      ["Drivetrain", decodedVehicle?.driveType || "—"],
                      ["Trim", vehicleTrim || "—"],
                      ["Source", auctionSite || "—"],
                    ].map(([label, value]) => (
                      <div key={label} className="grid grid-cols-[100px_1fr] gap-3">
                        <dt className="font-semibold text-slate-500">{label}</dt>
                        <dd className="truncate text-right font-bold text-slate-900">{value}</dd>
                      </div>
                    ))}
                  </dl>
                </article>

                <article className={`flex h-full flex-col rounded-[20px] border p-5 shadow-[0_1px_3px_rgba(15,23,42,0.05),0_14px_34px_rgba(15,23,42,0.035)] ${decisionBannerTone}`}>
                  <div className="flex items-start justify-between gap-3">
                    <h2 className="text-base font-black text-slate-950">Lot Logic Verdict</h2>
                    <span className={`rounded-full px-2.5 py-1 text-[10px] font-black ${decisionBadgeTone}`}>{lotLogicIcon}{lotLogicLabel}</span>
                  </div>
                  <div className="mt-4 grid gap-2 border-t border-current/10 pt-4 text-center sm:grid-cols-3 sm:gap-3">
                    <button
                      type="button"
                      onClick={() => setAllInCostOpen(true)}
                      disabled={!hasEvaluationData}
                      className="rounded-xl bg-white/60 px-3 py-3 text-center transition hover:bg-white/90 focus-visible:outline-2 focus-visible:outline-blue-600 disabled:cursor-default disabled:bg-white/30 sm:bg-transparent sm:px-0 sm:py-0 sm:hover:bg-white/40"
                    >
                      <div className="text-[9px] font-black uppercase tracking-[0.04em] text-slate-500">
                        All-In Cost
                      </div>
                      <div className="mt-1.5 whitespace-nowrap text-[22px] font-black leading-none tracking-[-0.035em] text-slate-950 sm:mt-2 sm:text-[25px]">
                        {displayedCurrentCost > 0 ? money(displayedCurrentCost) : "—"}
                      </div>
                      {hasEvaluationData || displayedCurrentCost > 0 ? (
                        <div className="mt-1 text-[10px] font-black text-blue-700">
                          Edit Costs
                        </div>
                      ) : null}
                    </button>
                    <div className="rounded-xl bg-white/45 px-3 py-3 sm:bg-transparent sm:px-0 sm:py-0">
                      <div className="text-[9px] font-black uppercase tracking-[0.04em] text-slate-500">Sale Estimate</div>
                      <div className="mt-1.5 whitespace-nowrap text-[22px] font-black leading-none tracking-[-0.035em] text-slate-950 sm:mt-2 sm:text-[25px]">{finalTargetUsed > 0 ? money(finalTargetUsed) : "—"}</div>
                    </div>
                    <div className="rounded-xl bg-white/45 px-3 py-3 sm:bg-transparent sm:px-0 sm:py-0">
                      <div className="text-[9px] font-black uppercase tracking-[0.04em] text-slate-500">Estimated Profit</div>
                      <div className={`mt-1.5 whitespace-nowrap text-[22px] font-black leading-none tracking-[-0.035em] sm:mt-2 sm:text-[25px] ${valuation.expectedGrossProfit >= 0 ? "text-emerald-700" : "text-red-700"}`}>{hasAcquisitionPrice ? money(valuation.expectedGrossProfit) : "—"}</div>
                    </div>
                  </div>
                  {presentationDecision === "review" && reviewReasons.length ? (
                    <div className="mt-4 rounded-xl border border-amber-200 bg-amber-100/70 px-3 py-3 text-center text-xs font-bold text-amber-800">Review required: {reviewReasons.join(", ")}.</div>
                  ) : null}
                  {!needsCompSearch && currentCostPosition ? (
                    <div className={`mt-4 rounded-xl px-3 py-2 text-center text-xs font-extrabold ${currentCostPosition.tone === "over" ? "bg-red-100 text-red-700" : currentCostPosition.tone === "under" ? "bg-emerald-100 text-emerald-700" : "bg-amber-100 text-amber-700"}`}>{currentCostPosition.text}</div>
                  ) : null}
                  <div className="mt-auto pt-5">
                    <button
                      type="button"
                      onClick={saveEvaluation}
                      disabled={saveLoading || !hasEvaluationData || !hasAcquisitionPrice}
                      className="w-full rounded-xl bg-slate-950 px-4 py-3 text-sm font-black text-white shadow-sm hover:bg-slate-800 disabled:cursor-not-allowed disabled:bg-slate-300"
                    >
                      {saveLoading ? "Saving..." : savedEvaluationId ? "Update Pipeline" : "Save to Pipeline"}
                    </button>
                    <button type="button" onClick={() => setWhyLotLogicOpen(true)} className="mx-auto mt-3 block text-xs font-extrabold text-blue-700 hover:text-blue-900">Why Lot Logic thinks this →</button>
                  </div>
                </article>

                <article className="flex h-full flex-col rounded-[20px] border border-slate-200 bg-white p-5 shadow-[0_1px_3px_rgba(15,23,42,0.05),0_14px_34px_rgba(15,23,42,0.035)]">
                  <h2 className="text-base font-black text-slate-950">Deal Snapshot</h2>
                  <div className="mt-4 grid grid-cols-2 gap-4">
                    <button type="button" aria-label="View Deal Economics decision details" onClick={() => setWhyLotLogicOpen(true)} className="rounded-xl transition-opacity hover:opacity-80 focus-visible:outline-2 focus-visible:outline-blue-600"><ScoreRing label="Deal Economics" score={profitabilityScoreDisplay} tone="green" isEmpty={!hasEvaluationData || needsCompSearch} /></button>
                    <button type="button" aria-label="View Dealer Fit decision details" onClick={() => setWhyLotLogicOpen(true)} className="rounded-xl transition-opacity hover:opacity-80 focus-visible:outline-2 focus-visible:outline-blue-600"><ScoreRing label="Dealer Fit" score={dealerFitScoreDisplay} tone="blue" isEmpty={!hasEvaluationData} /></button>
                  </div>
                  <button type="button" aria-label="View Current Market Age decision details" onClick={() => setWhyLotLogicOpen(true)} className="mt-4 w-full border-t border-slate-100 pt-4 text-left transition-opacity hover:opacity-80 focus-visible:outline-2 focus-visible:outline-blue-600">
                    <MarketLiquidityVisual soldLow={liquiditySoldLow} soldHigh={liquiditySoldHigh} soldMedian={liquiditySoldMedian} activeDays={liquidityActiveDays} label={liquidityLabel} confidence={liquidityConfidence} sampleSize={liquiditySampleSize} />
                  </button>
                </article>
              </section>

              <section ref={compSectionRef} className={`mt-4 scroll-mt-4 transition-all delay-100 duration-300 ease-out ${
                verdictEntered ? "translate-y-0 opacity-100" : "translate-y-4 opacity-0"
              }`}>
                <SectionCard
                  title="Comparable Vehicles"
                  action={
                    <div className="flex items-center gap-3">
                      <span className="text-xs font-bold text-slate-400">
                        Full comp set · {comps.length}
                      </span>
                      <button type="button" onClick={openCompMarketEditor} className="rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs font-black text-slate-600 hover:bg-slate-50">Expand / Improve Comps</button>
                    </div>
                  }
                >
                  {comps.length ? (
                    <MarketCompsTable comps={comps} targetMileage={targetMileage} assumptions={activeAssumptions} onToggleIncluded={toggleCompIncluded} maxVisibleRows={15} />
                  ) : (
                    <div className="rounded-xl bg-slate-50 px-5 py-5 text-sm font-semibold text-slate-500">No comparable vehicles available.</div>
                  )}
                  {comps.length && marketCheckSearchMeta?.regionsChecked?.length ? (
                    <div className="mt-3 rounded-xl border border-slate-200 bg-slate-50/70 px-4 py-3 text-xs font-semibold text-slate-600">
                      <span className="font-black text-slate-800">Search coverage:</span>{" "}
                      {marketCheckSearchMeta.regionsChecked.join(" → ")}
                      {Array.from(
                        new Set(
                          comps
                            .filter((comp) => comp.included && comp.region)
                            .map((comp) => comp.region),
                        ),
                      ).length ? (
                        <>
                          {" · "}
                          <span className="font-black text-slate-800">Qualifying comps found in:</span>{" "}
                          {Array.from(
                            new Set(
                              comps
                                .filter((comp) => comp.included && comp.region)
                                .map((comp) => comp.region),
                            ),
                          ).join(", ")}
                        </>
                      ) : null}
                    </div>
                  ) : null}
                  {comps.length ? (
                    <div className="mt-3 rounded-xl border border-slate-200 bg-slate-50/70 px-4 py-3 text-xs font-semibold leading-5 text-slate-600">
                      <span className="font-black text-slate-900">Comp hierarchy:</span>{" "}
                      Direct and Near comps may be auto-included when they pass the quality floor. Supporting comps require a dealer check. Rejected matches stay excluded unless you deliberately select them; dealer overrides lower confidence. Mileage normalization is nonlinear and capped.
                    </div>
                  ) : null}
                </SectionCard>
              </section>

              <div className="mt-4">
                <button
                  type="button"
                  onClick={() => {
                    setVerdictTransitioning(false);
                    setVerdictEntered(false);
                    setActiveStage("market");
                  }}
                  className="rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-sm font-black text-slate-600 hover:bg-slate-50"
                >
                  ← Back to Market
                </button>
              </div>
            </>
          ) : null}

          {allInCostOpen ? (
            <div className="fixed inset-0 z-[90] flex items-center justify-center bg-slate-950/45 px-4 py-6 backdrop-blur-sm">
              <div className="w-full max-w-lg overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-2xl">
                <div className="flex items-start justify-between gap-4 border-b border-slate-200 px-5 py-4">
                  <div>
                    <h2 className="text-lg font-black text-slate-950">All-In Cost</h2>
                    <p className="mt-1 text-xs font-semibold text-slate-500">
                      Edit any line item or remove it from the estimate. Changes update the deal economics immediately.
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={() => setAllInCostOpen(false)}
                    className="text-slate-400 hover:text-slate-700"
                    aria-label="Close all-in cost breakdown"
                  >
                    ✕
                  </button>
                </div>

                <div className="p-5">
                  <div className="divide-y divide-slate-100 rounded-xl border border-slate-200">
                    {allInCostBreakdown.map((item) => (
                      <div key={item.label} className="grid grid-cols-[minmax(0,1fr)_132px] items-center gap-3 px-4 py-3 sm:grid-cols-[minmax(0,1fr)_150px]">
                        <span className="text-sm font-semibold leading-5 text-slate-600">{item.label}</span>
                        <div className="flex items-center justify-end gap-2">
                          <div className="flex min-w-0 items-center rounded-lg border border-slate-200 bg-white shadow-sm focus-within:border-blue-300">
                            <span className="pl-2.5 text-sm text-slate-400">$</span>
                            <input
                              type="text"
                              inputMode="numeric"
                              value={formatNumberInput(item.amount)}
                              onFocus={(event) => event.currentTarget.select()}
                              onChange={(event) =>
                                updateAllInCostText(item.key, event.target.value)
                              }
                              aria-label={`Edit ${item.label}`}
                              className="min-w-0 w-full rounded-lg bg-transparent px-2 py-2 text-right text-sm font-black text-slate-950 outline-none"
                            />
                          </div>
                          {item.key !== "currentBid" ? (
                            <button
                              type="button"
                              onClick={() => updateAllInCostAmount(item.key, 0)}
                              className="grid h-8 w-8 shrink-0 place-items-center rounded-md text-slate-400 hover:bg-red-50 hover:text-red-600"
                              title={`Remove ${item.label} from the estimate`}
                              aria-label={`Remove ${item.label} from the estimate`}
                            >
                              <svg
                                aria-hidden="true"
                                viewBox="0 0 24 24"
                                className="h-4 w-4"
                                fill="none"
                                stroke="currentColor"
                                strokeWidth="2"
                                strokeLinecap="round"
                                strokeLinejoin="round"
                              >
                                <path d="M3 6h18" />
                                <path d="M8 6V4h8v2" />
                                <path d="M19 6l-1 14H6L5 6" />
                                <path d="M10 11v5M14 11v5" />
                              </svg>
                            </button>
                          ) : (
                            <span className="h-8 w-8 shrink-0" aria-hidden="true" />
                          )}
                        </div>
                      </div>
                    ))}
                    <div className="flex items-center justify-between gap-4 bg-slate-50 px-4 py-3">
                      <span className="text-sm font-black text-slate-950">Total all-in cost</span>
                      <span className="text-lg font-black text-slate-950">{money(valuation.allInCost)}</span>
                    </div>
                  </div>


                </div>

                <div className="flex justify-end border-t border-slate-200 bg-slate-50 px-5 py-4">
                  <button
                    type="button"
                    onClick={() => setAllInCostOpen(false)}
                    className="rounded-xl bg-slate-950 px-4 py-2 text-sm font-black text-white hover:bg-slate-800"
                  >
                    Close
                  </button>
                </div>
              </div>
            </div>
          ) : null}

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
