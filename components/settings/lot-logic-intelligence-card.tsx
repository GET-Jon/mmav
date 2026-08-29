"use client";

import { useMemo, useState } from "react";

export type IntelligenceKnowledgeSource = {
  id: string;
  source_type: string;
  title: string;
  version_label: string | null;
  active: boolean;
  metadata: unknown;
  created_at: string;
  updated_at: string;
};

export type IntelligenceInsight = {
  id: string;
  insight_type: string;
  title: string;
  summary: string;
  confidence: number | null;
  sample_size: number;
  evidence: unknown;
  suggested_action: unknown;
  status: string;
  surfaced_at: string;
  reviewed_at: string | null;
  review_notes: string | null;
  resulting_assertion_id: string | null;
};

export type IntelligenceAssertion = {
  id: string;
  assertion_type: string;
  subject_type: string;
  subject_key: string;
  predicate: string;
  value: unknown;
  provenance_type: string;
  status: string;
  confidence: number | null;
  sample_size: number;
  supporting_count: number;
  contradicting_count: number;
  last_observed_at: string | null;
  requires_validation: boolean;
};

type IntelligenceSection = "knowledge" | "insights" | "validation" | "policies" | "history";

function confidenceLabel(value: number | null) {
  if (value == null) return "Not scored";
  if (value >= 0.8) return `High · ${Math.round(value * 100)}%`;
  if (value >= 0.55) return `Medium · ${Math.round(value * 100)}%`;
  return `Low · ${Math.round(value * 100)}%`;
}

function formatDate(value: string | null) {
  if (!value) return "—";
  return new Intl.DateTimeFormat(undefined, { month: "short", day: "numeric", year: "numeric" }).format(new Date(value));
}

function tabClass(active: boolean) {
  return [
    "rounded-full px-3.5 py-2 text-xs font-black transition",
    active ? "bg-slate-950 text-white" : "border border-slate-200 bg-white text-slate-600 hover:bg-slate-50",
  ].join(" ");
}

export function LotLogicIntelligenceCard({
  canReview,
  initialKnowledgeSources,
  initialInsights,
  initialAssertions,
}: {
  canReview: boolean;
  initialKnowledgeSources: IntelligenceKnowledgeSource[];
  initialInsights: IntelligenceInsight[];
  initialAssertions: IntelligenceAssertion[];
}) {
  const [section, setSection] = useState<IntelligenceSection>("validation");
  const [knowledgeSources, setKnowledgeSources] = useState(initialKnowledgeSources);
  const [insights, setInsights] = useState(initialInsights);
  const [title, setTitle] = useState("");
  const [text, setText] = useState("");
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [reviewingId, setReviewingId] = useState<string | null>(null);

  const pendingInsights = useMemo(() => insights.filter((item) => item.status === "pending"), [insights]);
  const activePolicies = useMemo(
    () => initialAssertions.filter((item) => item.assertion_type === "policy" && ["active", "validated"].includes(item.status)),
    [initialAssertions],
  );

  async function addKnowledge(event: React.FormEvent) {
    event.preventDefault();
    setSaving(true);
    setMessage(null);
    try {
      const response = await fetch("/api/intelligence/knowledge", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ title, text, sourceType: "manager_note" }),
      });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error || "Knowledge could not be added.");
      setKnowledgeSources((current) => [payload, ...current]);
      setTitle("");
      setText("");
      setMessage("Knowledge added. It is now available to the Lot Logic Intelligence layer.");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Knowledge could not be added.");
    } finally {
      setSaving(false);
    }
  }

  async function reviewInsight(id: string, action: "validated" | "refuted" | "keep_observing") {
    setReviewingId(id);
    setMessage(null);
    try {
      const response = await fetch(`/api/intelligence/insights/${id}/review`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action }),
      });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error || "Insight could not be reviewed.");
      setInsights((current) => current.map((item) => (item.id === id ? { ...item, status: action, reviewed_at: new Date().toISOString() } : item)));
      setMessage(action === "validated" ? "Insight validated." : action === "refuted" ? "Insight refuted." : "Lot Logic will keep observing this pattern.");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Insight could not be reviewed.");
    } finally {
      setReviewingId(null);
    }
  }

  return (
    <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
        <div>
          <div className="text-[10px] font-black uppercase tracking-[0.16em] text-slate-400">Lot Logic Intelligence</div>
          <h2 className="mt-1 text-2xl font-black tracking-[-0.025em]">What Lot Logic knows about your company</h2>
          <p className="mt-2 max-w-3xl text-sm leading-6 text-slate-600">
            Explicit company knowledge, operational evidence, and learned patterns live here. Empirical learning can update automatically; material organizational conclusions are surfaced for review.
          </p>
        </div>
        <div className="grid grid-cols-3 gap-2 text-center">
          <div className="rounded-xl bg-slate-50 px-4 py-3"><div className="text-xl font-black">{knowledgeSources.length}</div><div className="text-[10px] font-black uppercase text-slate-400">Sources</div></div>
          <div className="rounded-xl bg-slate-50 px-4 py-3"><div className="text-xl font-black">{pendingInsights.length}</div><div className="text-[10px] font-black uppercase text-slate-400">Review</div></div>
          <div className="rounded-xl bg-slate-50 px-4 py-3"><div className="text-xl font-black">{initialAssertions.length}</div><div className="text-[10px] font-black uppercase text-slate-400">Learned</div></div>
        </div>
      </div>

      <div className="mt-6 flex flex-wrap gap-2">
        <button type="button" onClick={() => setSection("knowledge")} className={tabClass(section === "knowledge")}>Knowledge</button>
        <button type="button" onClick={() => setSection("insights")} className={tabClass(section === "insights")}>Learned Insights</button>
        <button type="button" onClick={() => setSection("validation")} className={tabClass(section === "validation")}>Needs Validation {pendingInsights.length ? `(${pendingInsights.length})` : ""}</button>
        <button type="button" onClick={() => setSection("policies")} className={tabClass(section === "policies")}>Policies</button>
        <button type="button" onClick={() => setSection("history")} className={tabClass(section === "history")}>Learning History</button>
      </div>

      {message ? <div className="mt-4 rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm font-semibold text-slate-700">{message}</div> : null}

      {section === "knowledge" ? (
        <div className="mt-5 grid gap-5 xl:grid-cols-[0.9fr_1.1fr]">
          {canReview ? (
            <form onSubmit={addKnowledge} className="rounded-xl border border-slate-200 bg-slate-50 p-4">
              <h3 className="font-black">Add company knowledge</h3>
              <p className="mt-1 text-xs leading-5 text-slate-500">Use this for a rule, capability, preference, or operational fact you want Lot Logic to consider. Document upload and extraction can build on the same knowledge-source layer.</p>
              <label className="mt-4 block text-xs font-black text-slate-600">Title</label>
              <input value={title} onChange={(event) => setTitle(event.target.value)} maxLength={180} className="mt-1 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm outline-none focus:border-slate-700" placeholder="Example: Key programming preference" />
              <label className="mt-3 block text-xs font-black text-slate-600">Knowledge</label>
              <textarea value={text} onChange={(event) => setText(event.target.value)} rows={7} className="mt-1 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm outline-none focus:border-slate-700" placeholder="Example: Naif is our designated key-fob specialist, but use Devin when Naif is unavailable." />
              <button disabled={saving || !title.trim() || !text.trim()} className="mt-3 rounded-lg bg-slate-950 px-4 py-2 text-sm font-black text-white disabled:opacity-40">{saving ? "Adding…" : "Add to Intelligence"}</button>
            </form>
          ) : null}
          <div>
            <h3 className="font-black">Knowledge sources</h3>
            <div className="mt-3 space-y-2">
              {knowledgeSources.length ? knowledgeSources.map((source) => (
                <div key={source.id} className="rounded-xl border border-slate-200 p-4">
                  <div className="flex items-start justify-between gap-3"><div><div className="font-black">{source.title}</div><div className="mt-1 text-xs font-semibold uppercase tracking-wide text-slate-400">{source.source_type.replaceAll("_", " ")}</div></div><div className="text-xs text-slate-400">{formatDate(source.updated_at)}</div></div>
                </div>
              )) : <div className="rounded-xl border border-dashed border-slate-300 p-5 text-sm text-slate-500">No company knowledge sources have been added yet.</div>}
            </div>
          </div>
        </div>
      ) : null}

      {section === "validation" ? (
        <div className="mt-5 space-y-3">
          {pendingInsights.length ? pendingInsights.map((insight) => (
            <div key={insight.id} className="rounded-xl border border-amber-200 bg-amber-50/40 p-5">
              <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
                <div><div className="text-[10px] font-black uppercase tracking-[0.14em] text-amber-700">{insight.insight_type.replaceAll("_", " ")}</div><h3 className="mt-1 text-lg font-black">{insight.title}</h3><p className="mt-2 max-w-4xl text-sm leading-6 text-slate-700">{insight.summary}</p></div>
                <div className="shrink-0 rounded-lg border border-amber-200 bg-white px-3 py-2 text-xs font-black text-slate-700">{confidenceLabel(insight.confidence)} · n={insight.sample_size}</div>
              </div>
              {canReview ? (
                <div className="mt-4 flex flex-wrap gap-2">
                  <button disabled={reviewingId === insight.id} onClick={() => reviewInsight(insight.id, "validated")} className="rounded-lg bg-slate-950 px-3.5 py-2 text-xs font-black text-white disabled:opacity-40">Validate</button>
                  <button disabled={reviewingId === insight.id} onClick={() => reviewInsight(insight.id, "keep_observing")} className="rounded-lg border border-slate-300 bg-white px-3.5 py-2 text-xs font-black text-slate-700 disabled:opacity-40">Keep observing</button>
                  <button disabled={reviewingId === insight.id} onClick={() => reviewInsight(insight.id, "refuted")} className="rounded-lg border border-red-200 bg-white px-3.5 py-2 text-xs font-black text-red-700 disabled:opacity-40">Refute</button>
                </div>
              ) : null}
            </div>
          )) : <div className="rounded-xl border border-dashed border-slate-300 p-6 text-sm text-slate-500">Nothing requires validation right now. Lot Logic will surface material inferred patterns here as evidence accumulates.</div>}
        </div>
      ) : null}

      {section === "insights" ? (
        <div className="mt-5 space-y-2">
          {insights.length ? insights.map((insight) => (
            <div key={insight.id} className="rounded-xl border border-slate-200 p-4"><div className="flex flex-col gap-2 md:flex-row md:items-start md:justify-between"><div><div className="font-black">{insight.title}</div><p className="mt-1 text-sm leading-6 text-slate-600">{insight.summary}</p></div><div className="shrink-0 text-xs font-bold text-slate-500">{confidenceLabel(insight.confidence)} · {insight.status.replaceAll("_", " ")}</div></div></div>
          )) : <div className="rounded-xl border border-dashed border-slate-300 p-6 text-sm text-slate-500">No learned insights yet.</div>}
        </div>
      ) : null}

      {section === "policies" ? (
        <div className="mt-5 space-y-2">
          {activePolicies.length ? activePolicies.map((policy) => (
            <div key={policy.id} className="rounded-xl border border-slate-200 p-4"><div className="font-black">{policy.subject_key.replaceAll("_", " ")}</div><div className="mt-1 text-sm text-slate-600">{policy.predicate} · {policy.provenance_type.replaceAll("_", " ")}</div><div className="mt-2 text-xs font-bold text-slate-400">{confidenceLabel(policy.confidence)} · n={policy.sample_size}</div></div>
          )) : <div className="rounded-xl border border-dashed border-slate-300 p-6 text-sm text-slate-500">Validated operating policies will appear here.</div>}
        </div>
      ) : null}

      {section === "history" ? (
        <div className="mt-5 space-y-2">
          {[...insights].sort((a, b) => new Date(b.surfaced_at).getTime() - new Date(a.surfaced_at).getTime()).map((insight) => (
            <div key={insight.id} className="flex flex-col gap-1 rounded-xl border border-slate-200 p-4 md:flex-row md:items-center md:justify-between"><div><div className="font-black">{insight.title}</div><div className="text-sm text-slate-500">{insight.status.replaceAll("_", " ")}{insight.review_notes ? ` · ${insight.review_notes}` : ""}</div></div><div className="text-xs font-bold text-slate-400">{formatDate(insight.reviewed_at || insight.surfaced_at)}</div></div>
          ))}
          {!insights.length ? <div className="rounded-xl border border-dashed border-slate-300 p-6 text-sm text-slate-500">Learning events will accumulate here.</div> : null}
        </div>
      ) : null}
    </section>
  );
}
