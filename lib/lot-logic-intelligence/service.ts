import type { SupabaseClient } from "@supabase/supabase-js";

import type {
  BlindEstimateInput,
  DecisionEventInput,
  InsightReviewAction,
  PredictionInput,
  PredictionOutcomeInput,
} from "@/lib/lot-logic-intelligence/types";

export function normalizeIntelligenceKey(value: string) {
  return value
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "")
    .slice(0, 160);
}

export async function recordPrediction(
  supabase: SupabaseClient,
  input: PredictionInput,
) {
  const { data, error } = await supabase
    .from("lot_logic_intelligence_prediction_snapshots")
    .insert({
      company_id: input.companyId,
      prediction_type: input.predictionType,
      subject_key: normalizeIntelligenceKey(input.subjectKey),
      evaluation_id: input.evaluationId ?? null,
      vehicle_id: input.vehicleId ?? null,
      finding_id: input.findingId ?? null,
      plan_item_id: input.planItemId ?? null,
      work_order_id: input.workOrderId ?? null,
      predicted_cost_low: input.predictedCostLow ?? null,
      predicted_cost_high: input.predictedCostHigh ?? null,
      predicted_labor_minutes: input.predictedLaborMinutes ?? null,
      predicted_elapsed_minutes: input.predictedElapsedMinutes ?? null,
      predicted_partner_id: input.predictedPartnerId ?? null,
      predicted_value: input.predictedValue ?? {},
      confidence: input.confidence ?? null,
      model_provider: input.modelProvider ?? null,
      model_name: input.modelName ?? null,
      prompt_version: input.promptVersion ?? null,
      context_snapshot: input.contextSnapshot ?? {},
      created_by: input.createdBy ?? null,
    })
    .select("id,created_at")
    .single();

  if (error) throw new Error(error.message);
  return data;
}

export async function recordDecisionEvent(
  supabase: SupabaseClient,
  input: DecisionEventInput,
) {
  const { data, error } = await supabase
    .from("lot_logic_intelligence_decision_events")
    .insert({
      company_id: input.companyId,
      decision_type: input.decisionType,
      evaluation_id: input.evaluationId ?? null,
      vehicle_id: input.vehicleId ?? null,
      work_order_id: input.workOrderId ?? null,
      plan_item_id: input.planItemId ?? null,
      ai_recommendation: input.aiRecommendation ?? {},
      human_decision: input.humanDecision ?? {},
      human_reason: input.humanReason ?? null,
      actor_user_id: input.actorUserId ?? null,
    })
    .select("id,decided_at")
    .single();

  if (error) throw new Error(error.message);
  return data;
}

export async function recordPredictionOutcome(
  supabase: SupabaseClient,
  input: PredictionOutcomeInput,
) {
  const { data, error } = await supabase
    .from("lot_logic_intelligence_prediction_outcomes")
    .upsert(
      {
        company_id: input.companyId,
        prediction_snapshot_id: input.predictionSnapshotId,
        partner_estimate_id: input.partnerEstimateId ?? null,
        actual_partner_id: input.actualPartnerId ?? null,
        actual_cost: input.actualCost ?? null,
        actual_labor_minutes: input.actualLaborMinutes ?? null,
        actual_elapsed_minutes: input.actualElapsedMinutes ?? null,
        qc_passed: input.qcPassed ?? null,
        outcome_value: input.outcomeValue ?? {},
        variance: input.variance ?? {},
        resolved_at: new Date().toISOString(),
      },
      { onConflict: "prediction_snapshot_id" },
    )
    .select("id,resolved_at")
    .single();

  if (error) throw new Error(error.message);
  return data;
}

export async function submitBlindEstimate(
  supabase: SupabaseClient,
  input: BlindEstimateInput,
) {
  const { data: latest, error: latestError } = await supabase
    .from("lot_logic_partner_blind_estimates")
    .select("id,revision_no")
    .eq("work_order_id", input.workOrderId)
    .eq("partner_id", input.partnerId)
    .order("revision_no", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (latestError) throw new Error(latestError.message);

  const revisionNo = (latest?.revision_no ?? 0) + 1;

  const { data, error } = await supabase
    .from("lot_logic_partner_blind_estimates")
    .insert({
      company_id: input.companyId,
      work_order_id: input.workOrderId,
      partner_id: input.partnerId,
      revision_no: revisionNo,
      supersedes_estimate_id: latest?.id ?? null,
      quoted_cost: input.quotedCost ?? null,
      estimated_labor_minutes: input.estimatedLaborMinutes ?? null,
      estimated_elapsed_minutes: input.estimatedElapsedMinutes ?? null,
      notes: input.notes ?? null,
      submitted_by_user_id: input.submittedByUserId ?? null,
    })
    .select("id,revision_no,submitted_at")
    .single();

  if (error) throw new Error(error.message);
  return data;
}

export async function getRelevantCompanyIntelligence(
  supabase: SupabaseClient,
  companyId: string,
  subjectKeys: string[],
) {
  const normalizedKeys = [...new Set(subjectKeys.map(normalizeIntelligenceKey).filter(Boolean))];

  const assertionsQuery = supabase
    .from("lot_logic_intelligence_assertions")
    .select(
      "id,assertion_type,subject_type,subject_key,predicate,value,provenance_type,status,confidence,sample_size,supporting_count,contradicting_count,last_observed_at,evidence",
    )
    .eq("company_id", companyId)
    .in("status", ["active", "validated"])
    .order("confidence", { ascending: false, nullsFirst: false })
    .limit(100);

  const relationsQuery = normalizedKeys.length
    ? supabase
        .from("lot_logic_intelligence_issue_relations")
        .select(
          "id,primary_issue_key,related_issue_key,relation_type,vehicle_scope,occurrence_count,opportunity_count,conditional_probability,confidence,last_observed_at,evidence",
        )
        .eq("company_id", companyId)
        .in("primary_issue_key", normalizedKeys)
        .order("confidence", { ascending: false, nullsFirst: false })
        .limit(50)
    : Promise.resolve({ data: [], error: null });

  const [assertionsResult, relationsResult] = await Promise.all([
    assertionsQuery,
    relationsQuery,
  ]);

  if (assertionsResult.error) throw new Error(assertionsResult.error.message);
  if (relationsResult.error) throw new Error(relationsResult.error.message);

  const assertions = normalizedKeys.length
    ? (assertionsResult.data ?? []).filter((row) =>
        normalizedKeys.some((key) => row.subject_key === key || row.subject_key.includes(key)),
      )
    : assertionsResult.data ?? [];

  return {
    assertions,
    issueRelations: relationsResult.data ?? [],
  };
}

export async function getHistoricalPredictionEvidence(
  supabase: SupabaseClient,
  companyId: string,
  subjectKey: string,
  limit = 25,
) {
  const key = normalizeIntelligenceKey(subjectKey);
  const { data: predictions, error: predictionError } = await supabase
    .from("lot_logic_intelligence_prediction_snapshots")
    .select(
      "id,prediction_type,predicted_cost_low,predicted_cost_high,predicted_labor_minutes,predicted_elapsed_minutes,predicted_partner_id,confidence,created_at",
    )
    .eq("company_id", companyId)
    .eq("subject_key", key)
    .order("created_at", { ascending: false })
    .limit(limit);

  if (predictionError) throw new Error(predictionError.message);

  const predictionIds = (predictions ?? []).map((row) => row.id);
  if (!predictionIds.length) return { predictions: [], outcomes: [] };

  const { data: outcomes, error: outcomeError } = await supabase
    .from("lot_logic_intelligence_prediction_outcomes")
    .select(
      "prediction_snapshot_id,partner_estimate_id,actual_partner_id,actual_cost,actual_labor_minutes,actual_elapsed_minutes,qc_passed,variance,resolved_at",
    )
    .eq("company_id", companyId)
    .in("prediction_snapshot_id", predictionIds);

  if (outcomeError) throw new Error(outcomeError.message);

  return { predictions: predictions ?? [], outcomes: outcomes ?? [] };
}

export async function listIntelligenceSettingsData(
  supabase: SupabaseClient,
  companyId: string,
) {
  const [sources, insights, assertions] = await Promise.all([
    supabase
      .from("lot_logic_intelligence_knowledge_sources")
      .select("id,source_type,title,version_label,active,metadata,created_at,updated_at")
      .eq("company_id", companyId)
      .order("updated_at", { ascending: false }),
    supabase
      .from("lot_logic_intelligence_insights")
      .select(
        "id,insight_type,title,summary,confidence,sample_size,evidence,suggested_action,status,surfaced_at,reviewed_at,review_notes,resulting_assertion_id",
      )
      .eq("company_id", companyId)
      .order("surfaced_at", { ascending: false }),
    supabase
      .from("lot_logic_intelligence_assertions")
      .select(
        "id,assertion_type,subject_type,subject_key,predicate,value,provenance_type,status,confidence,sample_size,supporting_count,contradicting_count,last_observed_at,requires_validation",
      )
      .eq("company_id", companyId)
      .order("updated_at", { ascending: false }),
  ]);

  if (sources.error) throw new Error(sources.error.message);
  if (insights.error) throw new Error(insights.error.message);
  if (assertions.error) throw new Error(assertions.error.message);

  return {
    knowledgeSources: sources.data ?? [],
    insights: insights.data ?? [],
    assertions: assertions.data ?? [],
  };
}

export async function reviewInsight(
  supabase: SupabaseClient,
  input: {
    companyId: string;
    insightId: string;
    action: InsightReviewAction;
    reviewedBy: string;
    notes?: string | null;
  },
) {
  const now = new Date().toISOString();
  const { data, error } = await supabase
    .from("lot_logic_intelligence_insights")
    .update({
      status: input.action,
      reviewed_by: input.reviewedBy,
      reviewed_at: now,
      review_notes: input.notes ?? null,
      updated_at: now,
    })
    .eq("company_id", input.companyId)
    .eq("id", input.insightId)
    .select("id,status,title,summary,suggested_action")
    .single();

  if (error) throw new Error(error.message);

  await recordDecisionEvent(supabase, {
    companyId: input.companyId,
    decisionType: "insight_validation",
    humanDecision: { action: input.action, insightId: input.insightId },
    humanReason: input.notes ?? null,
    actorUserId: input.reviewedBy,
    aiRecommendation: {
      title: data.title,
      summary: data.summary,
      suggestedAction: data.suggested_action,
    },
  });

  return data;
}
