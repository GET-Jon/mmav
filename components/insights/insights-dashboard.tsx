"use client";

import Link from "next/link";
import { useMemo, useState } from "react";

type WindowDays = 30 | 60 | 90;

export type InsightEvaluation = {
  id: string;
  created_at: string;
  updated_at: string;
  status: string | null;
  year: number | null;
  make: string | null;
  model: string | null;
  trim: string | null;
  vehicle_title: string | null;
  current_bid: number | null;
  target_resale_used: number | null;
  expected_gross_profit: number | null;
  decision: string | null;
  risk_grade: string | null;
  auction_site: string | null;
  created_by: string | null;
  created_by_label: string | null;
};

type GroupStat = {
  key: string;
  label: string;
  count: number;
  purchased: number;
  totalExpectedGross: number;
  averageExpectedGross: number;
};

type BuyerStat = {
  label: string;
  count: number;
  purchased: number;
  averageExpectedGross: number;
};

function money(value: number) {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 0,
  }).format(value);
}

function pct(value: number) {
  return `${Math.round(value * 100)}%`;
}

function statusIsPurchased(value: string | null) {
  return String(value || "").trim().toLowerCase() === "purchased";
}

function vehicleGroupKey(row: InsightEvaluation) {
  return [
    String(row.make || "").trim().toLowerCase(),
    String(row.model || "").trim().toLowerCase(),
  ]
    .filter(Boolean)
    .join("|");
}

function vehicleGroupLabel(row: InsightEvaluation) {
  const label = [row.make, row.model].filter(Boolean).join(" ");
  return label || row.vehicle_title || "Unknown vehicle";
}

function windowStart(days: WindowDays) {
  return Date.now() - days * 24 * 60 * 60 * 1000;
}

function filterByWindow(rows: InsightEvaluation[], days: WindowDays) {
  const start = windowStart(days);
  return rows.filter((row) => new Date(row.created_at).getTime() >= start);
}

function groupVehicles(rows: InsightEvaluation[]) {
  const groups = new Map<string, GroupStat>();

  for (const row of rows) {
    const key = vehicleGroupKey(row);
    if (!key) continue;

    const previous = groups.get(key) || {
      key,
      label: vehicleGroupLabel(row),
      count: 0,
      purchased: 0,
      totalExpectedGross: 0,
      averageExpectedGross: 0,
    };

    previous.count += 1;
    previous.purchased += statusIsPurchased(row.status) ? 1 : 0;
    previous.totalExpectedGross += Math.max(0, row.expected_gross_profit || 0);
    previous.averageExpectedGross =
      previous.count > 0 ? previous.totalExpectedGross / previous.count : 0;

    groups.set(key, previous);
  }

  return [...groups.values()];
}

function buildQuestions(rows: InsightEvaluation[], groups: GroupStat[]) {
  const questions: Array<{
    id: string;
    title: string;
    prompt: string;
    knowledgeTitle: string;
  }> = [];

  const frequentNoBuy = [...groups]
    .filter((group) => group.count >= 3 && group.purchased === 0)
    .sort((a, b) => b.count - a.count)[0];

  if (frequentNoBuy) {
    questions.push({
      id: `no-buy-${frequentNoBuy.key}`,
      title: `You keep looking at ${frequentNoBuy.label}`,
      prompt: `You evaluated ${frequentNoBuy.count} ${frequentNoBuy.label} vehicles in this period but have not marked one purchased. Is that mostly pricing, recon risk, customer demand, or something else?`,
      knowledgeTitle: `${frequentNoBuy.label} acquisition preference`,
    });
  }

  const strongBuyRate = [...groups]
    .filter((group) => group.count >= 2 && group.purchased >= 1)
    .sort((a, b) => {
      const aRate = a.purchased / a.count;
      const bRate = b.purchased / b.count;
      return bRate - aRate || b.count - a.count;
    })[0];

  if (strongBuyRate) {
    questions.push({
      id: `buy-rate-${strongBuyRate.key}`,
      title: `${strongBuyRate.label} may be part of your sweet spot`,
      prompt: `You purchased ${strongBuyRate.purchased} of ${strongBuyRate.count} evaluated ${strongBuyRate.label} vehicles. Should Lot Logic treat this type of vehicle as a stronger fit for your dealership?`,
      knowledgeTitle: `${strongBuyRate.label} dealership fit preference`,
    });
  }

  const highGross = [...groups]
    .filter((group) => group.averageExpectedGross > 0 && group.count >= 2)
    .sort((a, b) => b.averageExpectedGross - a.averageExpectedGross)[0];

  if (highGross) {
    questions.push({
      id: `gross-${highGross.key}`,
      title: `${highGross.label} keeps showing strong economics`,
      prompt: `Your ${highGross.label} evaluations are averaging about ${money(highGross.averageExpectedGross)} in expected gross. Is this a category you actively want Lot Logic to prioritize, or are there reasons the economics overstate its appeal to your store?`,
      knowledgeTitle: `${highGross.label} prioritization guidance`,
    });
  }

  if (!questions.length) {
    questions.push({
      id: "sweet-spot",
      title: "What is your dealership's real sweet spot?",
      prompt:
        "Tell Lot Logic which vehicle types, price bands, mileage ranges, brands, or customer needs you are most excited to buy for.",
      knowledgeTitle: "Dealership acquisition sweet spot",
    });
  }

  questions.push({
    id: "hold-time",
    title: "How patient are you with inventory?",
    prompt:
      "What is a comfortable retail hold period for your dealership, and at what point does a car start to feel too slow?",
    knowledgeTitle: "Inventory hold-time preference",
  });

  return questions.slice(0, 4);
}

function StatCard({
  eyebrow,
  value,
  label,
  detail,
}: {
  eyebrow: string;
  value: string;
  label: string;
  detail?: string;
}) {
  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
      <div className="text-[10px] font-black uppercase tracking-[0.14em] text-slate-400">
        {eyebrow}
      </div>
      <div className="mt-2 text-[30px] font-black tracking-[-0.04em] text-slate-950">
        {value}
      </div>
      <div className="mt-1 text-sm font-black text-slate-800">{label}</div>
      {detail ? (
        <div className="mt-2 text-xs font-semibold leading-5 text-slate-500">
          {detail}
        </div>
      ) : null}
    </div>
  );
}

export function InsightsDashboard({
  evaluations,
  canTeach,
}: {
  evaluations: InsightEvaluation[];
  canTeach: boolean;
}) {
  const [days, setDays] = useState<WindowDays>(30);
  const [answeringId, setAnsweringId] = useState<string | null>(null);
  const [answers, setAnswers] = useState<Record<string, string>>({});
  const [savedQuestions, setSavedQuestions] = useState<Record<string, boolean>>(
    {},
  );
  const [saveMessage, setSaveMessage] = useState<string | null>(null);
  const [knowledgeFile, setKnowledgeFile] = useState<File | null>(null);
  const [knowledgeTitle, setKnowledgeTitle] = useState("");
  const [uploadingKnowledge, setUploadingKnowledge] = useState(false);
  const [uploadMessage, setUploadMessage] = useState<string | null>(null);

  const rows = useMemo(
    () => filterByWindow(evaluations, days),
    [evaluations, days],
  );

  const groups = useMemo(() => groupVehicles(rows), [rows]);

  const purchasedCount = rows.filter((row) => statusIsPurchased(row.status)).length;
  const purchaseRate = rows.length ? purchasedCount / rows.length : 0;
  const expectedGrossRows = rows.filter(
    (row) => (row.expected_gross_profit || 0) > 0,
  );
  const avgExpectedGross = expectedGrossRows.length
    ? expectedGrossRows.reduce(
        (sum, row) => sum + (row.expected_gross_profit || 0),
        0,
      ) / expectedGrossRows.length
    : 0;

  const topOpportunities = [...rows]
    .filter((row) => (row.expected_gross_profit || 0) > 0)
    .sort(
      (a, b) =>
        (b.expected_gross_profit || 0) - (a.expected_gross_profit || 0),
    )
    .slice(0, 5);

  const mostEvaluated = [...groups]
    .sort((a, b) => b.count - a.count)
    .slice(0, 5);

  const lookedAtLeastBought = [...groups]
    .filter((group) => group.count >= 2)
    .sort((a, b) => {
      const aRate = a.purchased / a.count;
      const bRate = b.purchased / b.count;
      return aRate - bRate || b.count - a.count;
    })
    .slice(0, 5);

  const buyerStats = useMemo(() => {
    const buyers = new Map<string, BuyerStat>();

    for (const row of rows) {
      const label = row.created_by_label || "Unknown";
      const previous = buyers.get(label) || {
        label,
        count: 0,
        purchased: 0,
        averageExpectedGross: 0,
      };

      previous.count += 1;
      previous.purchased += statusIsPurchased(row.status) ? 1 : 0;
      previous.averageExpectedGross += Math.max(
        0,
        row.expected_gross_profit || 0,
      );
      buyers.set(label, previous);
    }

    return [...buyers.values()]
      .map((buyer) => ({
        ...buyer,
        averageExpectedGross: buyer.count
          ? buyer.averageExpectedGross / buyer.count
          : 0,
      }))
      .sort((a, b) => b.count - a.count);
  }, [rows]);

  const questions = useMemo(
    () => buildQuestions(rows, groups),
    [rows, groups],
  );

  const topPattern = mostEvaluated[0] || null;
  const noBuyPattern = lookedAtLeastBought.find(
    (group) => group.purchased === 0,
  );

  async function saveAnswer(question: (typeof questions)[number]) {
    if (!canTeach) return;

    const answer = String(answers[question.id] || "").trim();
    if (!answer) return;

    setAnsweringId(question.id);
    setSaveMessage(null);

    try {
      const response = await fetch("/api/intelligence/knowledge", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title: question.knowledgeTitle,
          text: answer,
          sourceType: "manager_note",
        }),
      });

      const payload = await response.json();

      if (!response.ok) {
        throw new Error(payload.error || "Lot Logic could not save that answer.");
      }

      setSavedQuestions((current) => ({ ...current, [question.id]: true }));
      setSaveMessage(
        "Added to Lot Logic Intelligence. Future recommendations can use this context.",
      );
    } catch (error) {
      setSaveMessage(
        error instanceof Error
          ? error.message
          : "Lot Logic could not save that answer.",
      );
    } finally {
      setAnsweringId(null);
    }
  }


  async function uploadDealershipKnowledge() {
    if (!canTeach || !knowledgeFile) return;

    setUploadingKnowledge(true);
    setUploadMessage(null);

    try {
      const formData = new FormData();
      formData.set("file", knowledgeFile);

      const cleanTitle = knowledgeTitle.trim();
      if (cleanTitle) formData.set("title", cleanTitle);

      const response = await fetch("/api/intelligence/knowledge/upload", {
        method: "POST",
        body: formData,
      });

      const payload = (await response.json()) as {
        error?: string;
        assertionCount?: number;
        summary?: string;
      };

      if (!response.ok) {
        throw new Error(
          payload.error || "Lot Logic could not process that document.",
        );
      }

      const assertionCount = Number(payload.assertionCount || 0);
      setUploadMessage(
        `Document learned successfully · ${assertionCount} explicit dealership ${assertionCount === 1 ? "fact" : "facts"} added.`,
      );
      setKnowledgeFile(null);
      setKnowledgeTitle("");

      const input = document.getElementById(
        "dealership-knowledge-upload",
      ) as HTMLInputElement | null;
      if (input) input.value = "";
    } catch (error) {
      setUploadMessage(
        error instanceof Error
          ? error.message
          : "Lot Logic could not process that document.",
      );
    } finally {
      setUploadingKnowledge(false);
    }
  }

  return (
    <div className="space-y-6">
      <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
          <div>
            <div className="text-[10px] font-black uppercase tracking-[0.16em] text-blue-700">
              What Lot Logic has learned
            </div>
            <h2 className="mt-1 text-2xl font-black tracking-[-0.03em] text-slate-950">
              Your buying behavior is becoming useful data.
            </h2>
            <p className="mt-2 max-w-3xl text-sm font-semibold leading-6 text-slate-600">
              These insights use your evaluator and pipeline history. Projected
              economics are labeled as expected until Lot Logic has a confirmed
              sale outcome.
            </p>
          </div>

          <div className="inline-flex self-start rounded-xl bg-slate-100 p-1">
            {([30, 60, 90] as WindowDays[]).map((window) => (
              <button
                key={window}
                type="button"
                onClick={() => setDays(window)}
                className={`rounded-lg px-4 py-2 text-xs font-black transition ${
                  days === window
                    ? "bg-slate-950 text-white shadow-sm"
                    : "text-slate-500 hover:text-slate-900"
                }`}
              >
                {window} days
              </button>
            ))}
          </div>
        </div>

        <div className="mt-5 grid gap-4 md:grid-cols-2 xl:grid-cols-4">
          <StatCard
            eyebrow="Evaluations"
            value={String(rows.length)}
            label="Vehicles evaluated"
            detail="Saved evaluator activity in the selected period."
          />
          <StatCard
            eyebrow="Pipeline conversion"
            value={pct(purchaseRate)}
            label="Marked purchased"
            detail={`${purchasedCount} of ${rows.length || 0} saved evaluations`}
          />
          <StatCard
            eyebrow="Projected economics"
            value={avgExpectedGross ? money(avgExpectedGross) : "—"}
            label="Average expected gross"
            detail="Projection at the assumptions saved with each evaluation."
          />
          <StatCard
            eyebrow="Attention"
            value={topPattern ? String(topPattern.count) : "—"}
            label={topPattern ? topPattern.label : "No pattern yet"}
            detail={
              topPattern
                ? "Your most frequently evaluated vehicle family in this period."
                : "Patterns will appear as evaluator history accumulates."
            }
          />
        </div>

        {(topPattern || noBuyPattern) ? (
          <div className="mt-5 grid gap-3 lg:grid-cols-2">
            {topPattern ? (
              <div className="rounded-xl border border-blue-100 bg-blue-50/50 p-4">
                <div className="text-[10px] font-black uppercase tracking-[0.12em] text-blue-700">
                  Behavior pattern
                </div>
                <div className="mt-1 font-black text-slate-950">
                  {topPattern.label} keeps getting your attention.
                </div>
                <p className="mt-1 text-xs font-semibold leading-5 text-slate-600">
                  You evaluated it {topPattern.count} times and marked{" "}
                  {topPattern.purchased} purchased in this period.
                </p>
              </div>
            ) : null}

            {noBuyPattern ? (
              <div className="rounded-xl border border-amber-100 bg-amber-50/60 p-4">
                <div className="text-[10px] font-black uppercase tracking-[0.12em] text-amber-700">
                  Possible blind spot or time sink
                </div>
                <div className="mt-1 font-black text-slate-950">
                  {noBuyPattern.label}: viewed often, bought rarely.
                </div>
                <p className="mt-1 text-xs font-semibold leading-5 text-slate-600">
                  {noBuyPattern.count} evaluations and no purchases marked. Lot
                  Logic should learn whether that is intentional.
                </p>
              </div>
            ) : null}
          </div>
        ) : null}
      </section>

      <div className="grid gap-5 xl:grid-cols-2">
        <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
          <div>
            <div className="text-[10px] font-black uppercase tracking-[0.14em] text-emerald-700">
              Top opportunities
            </div>
            <h3 className="mt-1 text-xl font-black text-slate-950">
              Highest expected gross
            </h3>
            <p className="mt-1 text-xs font-semibold leading-5 text-slate-500">
              These are evaluator projections, not realized sale profit.
            </p>
          </div>

          <div className="mt-4 space-y-2">
            {topOpportunities.length ? (
              topOpportunities.map((row, index) => (
                <Link
                  key={row.id}
                  href={`/deals/${row.id}`}
                  className="grid grid-cols-[28px_1fr_auto] items-center gap-3 rounded-xl border border-slate-100 px-3 py-3 hover:bg-slate-50"
                >
                  <div className="text-sm font-black text-slate-300">
                    {index + 1}
                  </div>
                  <div className="min-w-0">
                    <div
                      className="truncate text-sm font-black text-slate-900"
                      title={row.vehicle_title || vehicleGroupLabel(row)}
                    >
                      {row.vehicle_title || vehicleGroupLabel(row)}
                    </div>
                    <div className="mt-0.5 text-[10px] font-semibold text-slate-400">
                      {row.status || "watching"} · {row.auction_site || "source unknown"}
                    </div>
                  </div>
                  <div className="text-right">
                    <div className="text-sm font-black text-emerald-700">
                      {money(row.expected_gross_profit || 0)}
                    </div>
                    <div className="text-[9px] font-bold uppercase text-slate-400">
                      expected
                    </div>
                  </div>
                </Link>
              ))
            ) : (
              <div className="rounded-xl border border-dashed border-slate-300 p-5 text-sm font-semibold text-slate-500">
                No positive expected-gross evaluations in this period.
              </div>
            )}
          </div>
        </section>

        <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
          <div>
            <div className="text-[10px] font-black uppercase tracking-[0.14em] text-violet-700">
              Attention vs action
            </div>
            <h3 className="mt-1 text-xl font-black text-slate-950">
              Most evaluated, least purchased
            </h3>
            <p className="mt-1 text-xs font-semibold leading-5 text-slate-500">
              Useful for spotting categories you chase frequently but rarely
              convert.
            </p>
          </div>

          <div className="mt-4 space-y-2">
            {lookedAtLeastBought.length ? (
              lookedAtLeastBought.map((group) => {
                const conversion = group.count
                  ? group.purchased / group.count
                  : 0;

                return (
                  <div
                    key={group.key}
                    className="rounded-xl border border-slate-100 px-4 py-3"
                  >
                    <div className="flex items-center justify-between gap-4">
                      <div className="font-black text-slate-900">
                        {group.label}
                      </div>
                      <div
                        className={`rounded-full px-2.5 py-1 text-xs font-black ${
                          conversion === 0
                            ? "bg-amber-100 text-amber-800"
                            : "bg-slate-100 text-slate-700"
                        }`}
                      >
                        {pct(conversion)} purchased
                      </div>
                    </div>
                    <div className="mt-2 h-2 overflow-hidden rounded-full bg-slate-100">
                      <div
                        className="h-full rounded-full bg-blue-600"
                        style={{ width: `${Math.max(3, conversion * 100)}%` }}
                      />
                    </div>
                    <div className="mt-2 text-[10px] font-semibold text-slate-400">
                      {group.count} evaluations · {group.purchased} purchased
                    </div>
                  </div>
                );
              })
            ) : (
              <div className="rounded-xl border border-dashed border-slate-300 p-5 text-sm font-semibold text-slate-500">
                More repeated evaluations are needed before this pattern becomes
                useful.
              </div>
            )}
          </div>
        </section>
      </div>

      <div className="grid gap-5 xl:grid-cols-[0.9fr_1.1fr]">
        <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
          <div className="text-[10px] font-black uppercase tracking-[0.14em] text-slate-400">
            Team activity
          </div>
          <h3 className="mt-1 text-xl font-black text-slate-950">
            Who is evaluating what
          </h3>

          <div className="mt-4 space-y-2">
            {buyerStats.length ? (
              buyerStats.map((buyer) => (
                <div
                  key={buyer.label}
                  className="grid grid-cols-[1fr_auto_auto] items-center gap-4 rounded-xl border border-slate-100 px-4 py-3"
                >
                  <div className="font-black text-slate-900">{buyer.label}</div>
                  <div className="text-right">
                    <div className="text-sm font-black text-slate-900">
                      {buyer.count}
                    </div>
                    <div className="text-[9px] font-bold uppercase text-slate-400">
                      evaluated
                    </div>
                  </div>
                  <div className="min-w-[80px] text-right">
                    <div className="text-sm font-black text-slate-900">
                      {buyer.purchased}
                    </div>
                    <div className="text-[9px] font-bold uppercase text-slate-400">
                      purchased
                    </div>
                  </div>
                </div>
              ))
            ) : (
              <div className="text-sm font-semibold text-slate-500">
                No evaluator activity in this period.
              </div>
            )}
          </div>
        </section>

        <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
          <div className="text-[10px] font-black uppercase tracking-[0.14em] text-blue-700">
            Teach Lot Logic
          </div>
          <h3 className="mt-1 text-xl font-black text-slate-950">
            Help Lot Logic understand your dealership
          </h3>
          <p className="mt-2 max-w-3xl text-sm font-semibold leading-6 text-slate-600">
            Upload dealership knowledge or answer questions surfaced from your
            evaluator behavior. Explicit knowledge becomes available to future
            recommendations.
          </p>

          {canTeach ? (
            <div className="mt-4 rounded-xl border border-blue-100 bg-blue-50/50 p-4">
              <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
                <div>
                  <div className="font-black text-slate-950">
                    Upload dealership knowledge
                  </div>
                  <p className="mt-1 max-w-xl text-xs font-semibold leading-5 text-slate-600">
                    Dealer playbooks, buying notes, customer sweet spots, brand
                    preferences, recon capabilities, or other team guidance.
                    Lot Logic extracts only explicit statements supported by the
                    document.
                  </p>
                </div>
                <div className="shrink-0 rounded-lg bg-white px-3 py-2 text-[10px] font-bold leading-4 text-slate-500 shadow-sm">
                  PDF · TXT · MD · CSV · RTF · JSON
                  <br />
                  Up to 10 MB
                </div>
              </div>

              <div className="mt-3 grid gap-3 md:grid-cols-[1fr_1.3fr_auto] md:items-end">
                <label className="block">
                  <div className="mb-1 text-[10px] font-black uppercase tracking-wide text-slate-500">
                    Optional title
                  </div>
                  <input
                    value={knowledgeTitle}
                    onChange={(event) => setKnowledgeTitle(event.target.value)}
                    placeholder="Mindful Motors dealer insights"
                    className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm font-semibold text-slate-700 outline-none focus:border-blue-400"
                  />
                </label>

                <label className="block">
                  <div className="mb-1 text-[10px] font-black uppercase tracking-wide text-slate-500">
                    Document
                  </div>
                  <input
                    id="dealership-knowledge-upload"
                    type="file"
                    accept=".pdf,.txt,.md,.markdown,.csv,.rtf,.json,application/pdf,text/plain,text/markdown,text/csv,text/rtf,application/json"
                    onChange={(event) =>
                      setKnowledgeFile(event.target.files?.[0] || null)
                    }
                    className="block w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs font-semibold text-slate-600 file:mr-3 file:rounded-md file:border-0 file:bg-slate-100 file:px-3 file:py-1.5 file:text-xs file:font-black file:text-slate-700"
                  />
                </label>

                <button
                  type="button"
                  disabled={!knowledgeFile || uploadingKnowledge}
                  onClick={() => void uploadDealershipKnowledge()}
                  className="rounded-lg bg-blue-700 px-4 py-2.5 text-xs font-black text-white hover:bg-blue-800 disabled:cursor-not-allowed disabled:bg-slate-300"
                >
                  {uploadingKnowledge ? "Learning..." : "Upload & Learn"}
                </button>
              </div>

              <div className="mt-2 text-[10px] font-semibold leading-4 text-slate-500">
                Word documents: export or save as PDF first. Lot Logic stores
                the extracted dealership knowledge and source metadata; the
                original file is not retained in this first version.
              </div>

              {uploadMessage ? (
                <div className="mt-3 rounded-lg border border-blue-100 bg-white px-3 py-2 text-xs font-bold text-blue-800">
                  {uploadMessage}
                </div>
              ) : null}
            </div>
          ) : (
            <div className="mt-4 rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 text-xs font-semibold text-slate-500">
              An organization administrator can add dealership knowledge and
              answer training questions.
            </div>
          )}

          <div className="mt-5">
            <div className="font-black text-slate-950">
              Questions Lot Logic has for you
            </div>
            <p className="mt-1 text-xs font-semibold leading-5 text-slate-500">
              These are generated from patterns in your evaluator activity.
            </p>
          </div>

          {saveMessage ? (
            <div className="mt-4 rounded-xl border border-blue-100 bg-blue-50 px-4 py-3 text-xs font-bold text-blue-800">
              {saveMessage}
            </div>
          ) : null}

          <div className="mt-4 space-y-3">
            {questions.map((question) => (
              <div
                key={question.id}
                className="rounded-xl border border-slate-200 bg-slate-50/60 p-4"
              >
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <div className="font-black text-slate-950">
                      {question.title}
                    </div>
                    <p className="mt-1 text-xs font-semibold leading-5 text-slate-600">
                      {question.prompt}
                    </p>
                  </div>
                  {savedQuestions[question.id] ? (
                    <span className="shrink-0 rounded-full bg-emerald-100 px-2.5 py-1 text-[10px] font-black text-emerald-700">
                      Learned
                    </span>
                  ) : null}
                </div>

                {!savedQuestions[question.id] && canTeach ? (
                  <>
                    <textarea
                      rows={2}
                      value={answers[question.id] || ""}
                      onChange={(event) =>
                        setAnswers((current) => ({
                          ...current,
                          [question.id]: event.target.value,
                        }))
                      }
                      placeholder="Tell Lot Logic what is true for your dealership..."
                      className="mt-3 w-full resize-y rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm font-semibold text-slate-700 outline-none focus:border-blue-400"
                    />
                    <button
                      type="button"
                      disabled={
                        answeringId === question.id ||
                        !String(answers[question.id] || "").trim()
                      }
                      onClick={() => void saveAnswer(question)}
                      className="mt-2 rounded-lg bg-slate-950 px-3.5 py-2 text-xs font-black text-white disabled:cursor-not-allowed disabled:opacity-35"
                    >
                      {answeringId === question.id
                        ? "Teaching..."
                        : "Teach Lot Logic"}
                    </button>
                  </>
                ) : null}
              </div>
            ))}
          </div>

          <div className="mt-4 border-t border-slate-100 pt-4">
            <Link
              href="/settings?tab=intelligence"
              className="text-xs font-black text-blue-700 hover:text-blue-900"
            >
              View everything Lot Logic knows about your dealership →
            </Link>
          </div>
        </section>
      </div>

      <section className="rounded-2xl border border-dashed border-slate-300 bg-white/70 p-5">
        <div className="text-[10px] font-black uppercase tracking-[0.14em] text-slate-400">
          Coming as outcomes accumulate
        </div>
        <div className="mt-2 grid gap-3 md:grid-cols-3">
          <div>
            <div className="font-black text-slate-900">Gross per day held</div>
            <p className="mt-1 text-xs font-semibold leading-5 text-slate-500">
              Requires confirmed sale price and sale date.
            </p>
          </div>
          <div>
            <div className="font-black text-slate-900">Fastest-turning inventory</div>
            <p className="mt-1 text-xs font-semibold leading-5 text-slate-500">
              Requires reliable acquired-to-sold lifecycle history.
            </p>
          </div>
          <div>
            <div className="font-black text-slate-900">Prediction accuracy</div>
            <p className="mt-1 text-xs font-semibold leading-5 text-slate-500">
              Compare Lot Logic sale, recon, and timing predictions with actual
              outcomes.
            </p>
          </div>
        </div>
      </section>
    </div>
  );
}
