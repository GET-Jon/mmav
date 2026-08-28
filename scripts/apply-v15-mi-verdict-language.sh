#!/usr/bin/env bash
set -euo pipefail

cd "$(git rev-parse --show-toplevel)"

python - <<'PY'
from pathlib import Path

path = Path("components/evaluation/evaluation-workspace.tsx")
text = path.read_text()


def replace_once(old: str, new: str, label: str) -> None:
    global text
    count = text.count(old)
    if count != 1:
        raise SystemExit(
            f"PATCH STOPPED: expected exactly 1 occurrence for {label}, found {count}"
        )
    text = text.replace(old, new, 1)

replace_once(
'''  const mindfulNegativeEvidence = mindfulIntelligenceDisplay.limitations
    .filter((item) => item.trim().toLowerCase() !== mindfulRationaleNormalized)
    .slice(0, 6);

  const mindfulConditionalEvidence =''',
'''  const mindfulNegativeEvidence = mindfulIntelligenceDisplay.limitations
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

  const mindfulConditionalEvidence =''',
"decision-aligned lead explanation",
)

replace_once(
'''                        Mindful Fit:{" "}''',
'''                        Vehicle Fit:{" "}''',
"Vehicle Fit label",
)

replace_once(
'''                  <p className="mt-2 text-sm font-semibold leading-6 text-slate-700">
                    {mindfulIntelligenceDisplay.rationale}
                  </p>''',
'''                  <p className="mt-2 text-sm font-semibold leading-6 text-slate-700">
                    {mindfulLeadExplanation}
                  </p>''',
"verdict lead explanation",
)

replace_once(
'''                  {mindfulNegativeEvidence.length ? (''',
'''                  {mindfulSupportingNegativeEvidence.length ? (''',
"negative evidence visibility",
)

replace_once(
'''                        {mindfulNegativeEvidence.map((item) => (''',
'''                        {mindfulSupportingNegativeEvidence.map((item) => (''',
"negative evidence rendering",
)

path.write_text(text)
print("✓ Verdict explanation now follows the recommendation")
print("✓ Positive vehicle fit remains separate from buy/pass recommendation")
print("✓ Mindful Fit renamed to Vehicle Fit")
print("✓ Duplicate lead reason removed from supporting negative bullets")
PY

git diff --check

rm -f scripts/apply-v15-mi-card.sh scripts/apply-v15-mi-verdict-language.sh

git add components/evaluation/evaluation-workspace.tsx \
  scripts/apply-v15-mi-card.sh \
  scripts/apply-v15-mi-verdict-language.sh

git commit -m "Align Mindful verdict language with recommendation"
git push origin v15-inventory-workflow

echo "✓ V15 verdict language committed and pushed"
