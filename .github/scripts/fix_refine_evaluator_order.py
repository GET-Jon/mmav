from pathlib import Path

path = Path("components/evaluation/evaluation-workspace.tsx")
text = path.read_text()

old = '''    hasLowCompConfidence
      ? "The current comp set is still thin; expand the market before relying heavily on the resale target."
      : null,
'''
new = '''    comps.length > 0 && String(compSummary.confidence || "").toLowerCase() === "low"
      ? "The current comp set is still thin; expand the market before relying heavily on the resale target."
      : null,
'''

if old not in text:
    raise RuntimeError("Expected early comp-confidence reference was not found")

path.write_text(text.replace(old, new))
print("Fixed evaluator derived-data ordering")
