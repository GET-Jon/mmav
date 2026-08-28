#!/usr/bin/env bash
set -euo pipefail

cd "$(git rev-parse --show-toplevel)"

branch="$(git branch --show-current)"
if [[ "$branch" != "v15-inventory-workflow" ]]; then
  echo "STOP: expected v15-inventory-workflow, found $branch"
  exit 1
fi

python - <<'PY'
from pathlib import Path

path = Path("components/evaluation/evaluation-workspace.tsx")
text = path.read_text()


def replace_once(old: str, new: str, label: str):
    global text
    count = text.count(old)
    if count != 1:
        raise SystemExit(f"PATCH STOPPED: {label}: expected 1 match, found {count}")
    text = text.replace(old, new, 1)

replace_once(
'''  const [activeMindfulIntelligenceTab, setActiveMindfulIntelligenceTab] =
    useState<"perspective" | "thesis" | "checks">("perspective");''',
'''  const [activeMindfulIntelligenceTab, setActiveMindfulIntelligenceTab] =
    useState<"verdict" | "thesis" | "checks">("verdict");''',
"Mindful Intelligence tab state",
)

replace_once(
'''    setActiveMindfulIntelligenceTab("perspective");''',
'''    setActiveMindfulIntelligenceTab("verdict");''',
"Mindful Intelligence reset tab",
)

replace_once(
'''  const mindfulOpportunityLabel =
    mindfulIntelligenceDisplay.opportunityTypes[0]?.replaceAll("_", " ") ||
    dealerFitResult.category ||
    "General acquisition";

  const mindfulOpportunityTone =
    mindfulOpportunityLabel.toLowerCase() === "avoid"
      ? "border-red-200 bg-red-50 text-red-700"
      : "border-slate-200 bg-white text-slate-600";

  const suggestedBidDisplay = !hasEvaluationData''',
'''  const mindfulRecommendation =
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

  const mindfulConditionalEvidence = mindfulIntelligenceDisplay.verificationItems
    .filter(
      (item) =>
        item.trim().toLowerCase() !== mindfulRationaleNormalized &&
        !mindfulNegativeEvidence.includes(item),
    )
    .slice(0, 6);

  const suggestedBidDisplay = !hasEvaluationData''',
"Mindful Intelligence recommendation model",
)

replace_once(
'''                    {hasEvaluationData ? (
                      <div className="mt-1 flex flex-wrap items-center gap-2">
                        <span className="text-xs font-semibold text-slate-500">
                          {mindfulIntelligenceDisplay.title} ·{" "}
                          {mindfulIntelligencePreview
                            ? "Matched Mindful profile"
                            : "General dealer-fit profile"}
                        </span>

                        <span
                          className={`rounded-full border px-2.5 py-0.5 text-[10px] font-black capitalize ${mindfulOpportunityTone}`}
                        >
                          {mindfulOpportunityLabel}
                        </span>
                      </div>
                    ) : (
                      <div className="mt-1 text-xs font-semibold text-slate-500">
                        Available after evaluation
                      </div>
                    )}''',
'''                    {hasEvaluationData ? (
                      <div className="mt-1 text-xs font-semibold text-slate-500">
                        {mindfulIntelligenceDisplay.title}
                      </div>
                    ) : (
                      <div className="mt-1 text-xs font-semibold text-slate-500">
                        Available after evaluation
                      </div>
                    )}''',
"Mindful Intelligence title",
)

replace_once(
'''                  {hasEvaluationData ? (
                    <div className="flex shrink-0 flex-wrap items-center gap-2">
                      <span className="rounded-full border border-violet-200 bg-white px-3 py-1 text-[10px] font-black text-violet-700">
                        Mindful Fit:{" "}
                        {mindfulIntelligenceDisplay.verdict === "strong_fit"
                          ? "Strong"
                          : mindfulIntelligenceDisplay.verdict ===
                              "conditional_fit"
                            ? "Selective"
                            : "Limited"}
                      </span>

                      <span className="rounded-full border border-slate-200 bg-white px-3 py-1 text-[10px] font-bold capitalize text-slate-600">
                        {mindfulIntelligenceDisplay.confidence} confidence
                      </span>
                    </div>''',
'''                  {hasEvaluationData ? (
                    <div className="flex shrink-0 flex-wrap items-center gap-2">
                      <span
                        className={`rounded-full border px-3 py-1 text-[10px] font-black ${mindfulRecommendationTone}`}
                      >
                        Recommendation: {mindfulRecommendation}
                      </span>

                      <span className="rounded-full border border-violet-200 bg-white px-3 py-1 text-[10px] font-black text-violet-700">
                        Mindful Fit:{" "}
                        {mindfulIntelligenceDisplay.verdict === "strong_fit"
                          ? "Strong"
                          : mindfulIntelligenceDisplay.verdict ===
                              "conditional_fit"
                            ? "Selective"
                            : "Limited"}
                      </span>

                      <span className="rounded-full border border-slate-200 bg-white px-3 py-1 text-[10px] font-bold capitalize text-slate-600">
                        {mindfulIntelligenceDisplay.confidence} confidence
                      </span>
                    </div>''',
"Mindful Intelligence recommendation header",
)

replace_once(
'''                    {
                      id: "perspective" as const,
                      label: "Perspective",
                    },''',
'''                    {
                      id: "verdict" as const,
                      label: "Verdict",
                    },''',
"Mindful Intelligence Verdict tab",
)

replace_once(
'''              {activeMindfulIntelligenceTab === "perspective" ? (
                <div className="px-5 py-5">
                  <div className="text-[9px] font-black uppercase tracking-[0.12em] text-slate-400">
                    Mindful perspective
                  </div>

                  <p className="mt-2 text-sm font-semibold leading-6 text-slate-700">
                    {mindfulIntelligenceDisplay.rationale}
                  </p>

                  {mindfulIntelligenceDisplay.strengths.length ? (
                    <div className="mt-5">
                      <div className="text-[9px] font-black uppercase tracking-[0.12em] text-slate-400">
                        Why it fits
                      </div>

                      <ul className="mt-3 grid gap-2 sm:grid-cols-2">
                        {mindfulIntelligenceDisplay.strengths
                          .slice(0, 6)
                          .map((item) => (
                            <li
                              key={item}
                              className="flex gap-2 text-xs font-semibold leading-5 text-slate-700"
                            >
                              <span
                                aria-hidden="true"
                                className="mt-[7px] h-1.5 w-1.5 shrink-0 rounded-full bg-emerald-500"
                              />
                              <span>{item}</span>
                            </li>
                          ))}
                      </ul>
                    </div>
                  ) : null}
                </div>
              ) : null}''',
'''              {activeMindfulIntelligenceTab === "verdict" ? (
                <div className="px-5 py-5">
                  <div className="text-[9px] font-black uppercase tracking-[0.12em] text-slate-400">
                    Mindful verdict
                  </div>

                  <div
                    className={`mt-2 text-base font-black ${
                      mindfulRecommendation === "PURSUE"
                        ? "text-emerald-700"
                        : mindfulRecommendation === "SELECTIVE"
                          ? "text-amber-700"
                          : "text-red-700"
                    }`}
                  >
                    {mindfulRecommendationLead}
                  </div>

                  <p className="mt-2 text-sm font-semibold leading-6 text-slate-700">
                    {mindfulIntelligenceDisplay.rationale}
                  </p>

                  {mindfulNegativeEvidence.length ? (
                    <div className="mt-5">
                      <div className="text-[9px] font-black uppercase tracking-[0.12em] text-red-600">
                        {mindfulRecommendation === "AVOID"
                          ? "Why we're passing"
                          : "What concerns us"}
                      </div>

                      <ul className="mt-3 grid gap-2 sm:grid-cols-2">
                        {mindfulNegativeEvidence.map((item) => (
                          <li
                            key={item}
                            className="flex gap-2 text-xs font-semibold leading-5 text-slate-700"
                          >
                            <span
                              aria-hidden="true"
                              className="mt-[7px] h-1.5 w-1.5 shrink-0 rounded-full bg-red-500"
                            />
                            <span>{item}</span>
                          </li>
                        ))}
                      </ul>
                    </div>
                  ) : null}

                  {mindfulPositiveEvidence.length ? (
                    <div className="mt-5">
                      <div className="text-[9px] font-black uppercase tracking-[0.12em] text-emerald-700">
                        What we like
                      </div>

                      <ul className="mt-3 grid gap-2 sm:grid-cols-2">
                        {mindfulPositiveEvidence.map((item) => (
                          <li
                            key={item}
                            className="flex gap-2 text-xs font-semibold leading-5 text-slate-700"
                          >
                            <span
                              aria-hidden="true"
                              className="mt-[7px] h-1.5 w-1.5 shrink-0 rounded-full bg-emerald-500"
                            />
                            <span>{item}</span>
                          </li>
                        ))}
                      </ul>
                    </div>
                  ) : null}

                  {mindfulConditionalEvidence.length ? (
                    <div className="mt-5 rounded-2xl border border-amber-100 bg-amber-50/60 p-4">
                      <div className="text-[9px] font-black uppercase tracking-[0.12em] text-amber-700">
                        {mindfulRecommendation === "AVOID"
                          ? "What could change the verdict"
                          : "What to verify next"}
                      </div>

                      <ul className="mt-3 grid gap-2 sm:grid-cols-2">
                        {mindfulConditionalEvidence.map((item) => (
                          <li
                            key={item}
                            className="flex gap-2 text-xs font-semibold leading-5 text-slate-700"
                          >
                            <span
                              aria-hidden="true"
                              className="mt-[7px] h-1.5 w-1.5 shrink-0 rounded-full bg-amber-500"
                            />
                            <span>{item}</span>
                          </li>
                        ))}
                      </ul>
                    </div>
                  ) : null}
                </div>
              ) : null}''',
"Mindful Intelligence Verdict panel",
)

replace_once(
'''                      Mindful perspective, deal thesis, and priority checks will
                      appear here after the vehicle and market data are evaluated.''',
'''                      Mindful verdict, deal thesis, and priority checks will
                      appear here after the vehicle and market data are evaluated.''',
"Mindful Intelligence empty state",
)

path.write_text(text)
print("✓ Mindful Intelligence UI patched")
PY

npm run lint
npm run build

git add components/evaluation/evaluation-workspace.tsx
rm -f scripts/apply-v15-mi-card.sh
git add -A scripts/apply-v15-mi-card.sh

git commit -m "Clarify Mindful Intelligence verdict card"
git push origin v15-inventory-workflow

echo
echo "✓ V15 Mindful Intelligence card committed and pushed"
