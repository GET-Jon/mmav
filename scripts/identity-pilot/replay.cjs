require('./register.cjs');
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const { compareEvidence } = require('../../lib/evaluation/identity-evidence.ts');
const { subjectEvidence, candidateEvidence } = require('../../lib/evaluation/identity-pilot-adapters.ts');
const { evaluateVehicleEquivalence } = require('../../lib/marketcheck/vehicle-equivalence.ts');
const input = path.resolve(process.argv[2] || '.pilot-private/evaluations.json');
const output = path.resolve(process.argv[3] || '.pilot-private/replay.json');
const bytes = fs.readFileSync(input);
const data = JSON.parse(bytes);
if (!Array.isArray(data) || !data.length) throw new Error('Expected a nonempty array of saved evaluations.');
const counter = (items) => items.reduce((a, x) => (a[x] = (a[x] || 0) + 1, a), {});
const evaluations = data.map((row, index) => {
  const subject = subjectEvidence(row);
  const seen = new Set();
  let duplicates = 0;
  const comparisons = [];
  for (const candidate of row.candidates || []) {
    const profile = candidateEvidence(candidate);
    // A missing VIN cannot establish cross-provider independence.
    const key = profile.vin ? 'vin:' + profile.vin.toUpperCase() : 'row:' + candidate.id;
    if (seen.has(key)) { duplicates++; continue; }
    seen.add(key);
    const legacy = evaluateVehicleEquivalence({ target: subject.identity, candidate: profile.identity });
    const decision = compareEvidence(subject, profile);
    comparisons.push({ candidateId: candidate.id, savedTier: candidate.equivalenceTier || 'unrecorded',
      legacyReplayTier: legacy.tier, decision, subjectFacts: subject.facts, candidateFacts: profile.facts,
      independentVinPresent: !!profile.vin,
      listingText: [candidate.heading, candidate.details?.heading, candidate.build?.version].filter(Boolean).join(' | ') });
  }
  return { caseId: 'E' + String(index + 1).padStart(2, '0'),
    label: [row.year, row.make, row.model, row.trim].filter(Boolean).join(' '),
    sourceSnapshotDate: row.updated_at, rows: (row.candidates || []).length, duplicates,
    subjectUnknown: Object.entries(subject.facts).filter(([, f]) => !f.value).map(([k]) => k),
    outcomes: counter(comparisons.map(c => c.decision.outcome)), comparisons };
});
const all = evaluations.flatMap(e => e.comparisons);
const result = { policy: 'pilot-1-shadow-only', inputSha256: crypto.createHash('sha256').update(bytes).digest('hex'),
  limitations: ['Saved evaluations are not independently labeled factory truth.', 'No live pricing refresh; no accuracy or valuation-improvement claim.',
    'No paid listing searches; saved snapshots may already contain prior AI interpretations.', 'Legacy replay uses the same adapted identities; savedTier reflects historical classification.',
    'Strict pilot requires transmission and engine facts; not calibrated for production.', 'Twenty saved subjects do not cover EV battery variants or all makes.'],
  totals: { evaluations: evaluations.length, candidateRows: evaluations.reduce((n,e) => n+e.rows,0),
    uniquePairs: all.length, duplicateRows: evaluations.reduce((n,e) => n+e.duplicates,0),
    outcomes: counter(all.map(c => c.decision.outcome)), savedTiers: counter(all.map(c => c.savedTier)),
    legacyReplayTiers: counter(all.map(c => c.legacyReplayTier)),
    blockers: counter(all.flatMap(c => c.decision.reasons.filter(r => /missing|conflicting/.test(r.code)).map(r => r.detail))),
    missingCandidateVin: all.filter(c => !c.independentVinPresent).length }, evaluations };
fs.mkdirSync(path.dirname(output), {recursive:true});
fs.writeFileSync(output, JSON.stringify(result,null,2)+'\n');
console.log(JSON.stringify({ output, totals: result.totals, cases: evaluations.map(({comparisons,...e})=>e) },null,2));
