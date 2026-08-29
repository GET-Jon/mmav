import type { SupabaseClient } from "@supabase/supabase-js";

import { normalizeIntelligenceKey } from "@/lib/lot-logic-intelligence/service";

export type EvaluatorVehicleContext = {
  year?: string | number | null;
  make?: string | null;
  model?: string | null;
  trim?: string | null;
  mileage?: number | null;
};

export type EvaluatorIntelligenceContext = {
  companyId: string;
  subjectKeys: string[];
  lines: string[];
  assertionsUsed: number;
  issueRelationsUsed: number;
};

function asText(value: unknown) {
  if (typeof value === "string") return value.trim();
  if (typeof value === "number" || typeof value === "boolean") return String(value);
  if (value && typeof value === "object") {
    try {
      return JSON.stringify(value);
    } catch {
      return "";
    }
  }
  return "";
}

function confidenceLabel(value: unknown) {
  const numeric = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(numeric)) return "confidence unknown";
  return `${Math.round(numeric * 100)}% confidence`;
}

function mileageBand(mileage?: number | null) {
  if (typeof mileage !== "number" || !Number.isFinite(mileage) || mileage < 0) return null;
  const low = Math.floor(mileage / 25_000) * 25_000;
  return `${low}-${low + 24_999}`;
}

export function buildEvaluatorSubjectKeys(vehicle: EvaluatorVehicleContext, issueText?: string | null) {
  const make = vehicle.make?.trim() || "";
  const model = vehicle.model?.trim() || "";
  const trim = vehicle.trim?.trim() || "";
  const year = vehicle.year == null ? "" : String(vehicle.year).trim();
  const band = mileageBand(vehicle.mileage);

  const rawKeys = [
    "company",
    make,
    model,
    [make, model].filter(Boolean).join(" "),
    [year, make, model].filter(Boolean).join(" "),
    [make, model, trim].filter(Boolean).join(" "),
    band ? [make, model, band].filter(Boolean).join(" ") : "",
  ];

  if (issueText) {
    rawKeys.push(
      ...issueText
        .split(/\n|\r|;|\.|,/)
        .map((value) => value.trim())
        .filter((value) => value.length >= 4)
        .slice(0, 20),
    );
  }

  return [...new Set(rawKeys.map(normalizeIntelligenceKey).filter(Boolean))].slice(0, 30);
}

export async function buildEvaluatorIntelligenceContext(
  supabase: SupabaseClient,
  companyId: string,
  vehicle: EvaluatorVehicleContext,
  issueText?: string | null,
): Promise<EvaluatorIntelligenceContext> {
  const subjectKeys = buildEvaluatorSubjectKeys(vehicle, issueText);

  const [assertionsResult, relationsResult] = await Promise.all([
    supabase
      .from("lot_logic_intelligence_assertions")
      .select(
        "id,assertion_type,subject_type,subject_key,predicate,value,provenance_type,status,confidence,sample_size,supporting_count,contradicting_count,last_observed_at",
      )
      .eq("company_id", companyId)
      .in("status", ["active", "validated"])
      .order("confidence", { ascending: false, nullsFirst: false })
      .limit(100),
    subjectKeys.length
      ? supabase
          .from("lot_logic_intelligence_issue_relations")
          .select(
            "primary_issue_key,related_issue_key,relation_type,vehicle_scope,occurrence_count,opportunity_count,conditional_probability,confidence,last_observed_at",
          )
          .eq("company_id", companyId)
          .in("primary_issue_key", subjectKeys)
          .order("confidence", { ascending: false, nullsFirst: false })
          .limit(30)
      : Promise.resolve({ data: [], error: null }),
  ]);

  if (assertionsResult.error) throw new Error(assertionsResult.error.message);
  if (relationsResult.error) throw new Error(relationsResult.error.message);

  const assertions = (assertionsResult.data ?? []).filter((row) => {
    if (row.assertion_type === "policy" || row.assertion_type === "preference") return true;
    if (row.subject_type === "company" || row.subject_key === "company") return true;
    return subjectKeys.some(
      (key) => row.subject_key === key || row.subject_key.includes(key) || key.includes(row.subject_key),
    );
  });

  const assertionLines = assertions.slice(0, 20).map((row) => {
    const value = asText(row.value);
    const evidence = row.sample_size
      ? `sample ${row.sample_size}, ${row.supporting_count} supporting / ${row.contradicting_count} contradicting`
      : "explicit or non-sampled evidence";
    return `[${row.provenance_type}; ${confidenceLabel(row.confidence)}; ${evidence}] ${row.subject_key}: ${row.predicate}${value ? ` = ${value}` : ""}`;
  });

  const relationLines = (relationsResult.data ?? []).slice(0, 12).map((row) => {
    const probability =
      typeof row.conditional_probability === "number"
        ? `${Math.round(row.conditional_probability * 100)}% observed conditional rate`
        : "conditional rate unknown";
    return `[learned issue relationship; ${confidenceLabel(row.confidence)}; ${row.occurrence_count}/${row.opportunity_count} observations] ${row.primary_issue_key} -> ${row.related_issue_key} (${row.relation_type}; ${probability})`;
  });

  return {
    companyId,
    subjectKeys,
    lines: [...assertionLines, ...relationLines],
    assertionsUsed: assertionLines.length,
    issueRelationsUsed: relationLines.length,
  };
}
