# Vehicle identity pilot — shadow implementation

Status: development pilot, not enabled for production comparison decisions.
Base: PR #32 head `fa340038e33097c7514bdeac65ff79cc1afb11e2`.

## Purpose and scope

Preserve evidence before attempting to replace matching logic. The pilot adds a
shared, pure profile resolver, explicit comparison outcomes, provider adapters,
and a repeatable offline replay. Existing production matching and valuation
functions are unchanged. The VIN route now preserves additional NHTSA observations
for future saved evaluations; the new optional fields are backward compatible.

The resolver records each field's source, raw text, basis, alternatives and
conflicts. Repeated claims cannot promote a reported fact to verified. Missing
candidate make/model never inherits the subject's identity. Engine displacement,
cylinder count and transmission are separate attributes. A scoped Velar parser
separates engine badges from equipment labels without claiming that a combination
was offered in a particular market/year.

This is deliberately not the complete universal engine. Market/year validity,
full engine-output variants, linked configuration alternatives, pickup cab/bed,
EV batteries, installed equipment, confidence calibration and approved price
adjustments still need coverage. A synthetically complete profile can test the
direct path, but passing that test does not establish production readiness.

## First replay: November 11, 2026

Twenty existing saved evaluations were selected for model variety, yielding 485
candidate rows across 12 makes. No new paid listing searches were needed. Source
snapshots span August–November 2026; this is not a fresh market-pricing test.
The saved inputs are not independently adjudicated factory truth and may include
earlier AI or manual interpretations. They cannot measure classification accuracy.
The separate earlier 10-VIN workbook is a Ford-only seed set with decoder results
marked NOT RUN; it was reviewed but not counted as completed evaluations here.

| Audit observation | Count |
| --- | ---: |
| Saved subject evaluations | 20 |
| Candidate rows / unique within-subject VIN pairs | 485 / 485 |
| Subject profiles without transmission | 20 |
| Candidate profiles without engine/transmission details in saved representation | 49 |
| Distinct available descriptions for those missing-spec candidates | 19 |
| Those descriptions explicitly stating the missing engine/transmission facts | 0 |

The strict shadow policy returned 45 excluded, 369 supporting and 71 needing
verification, with zero direct peers. This is a diagnostic result, NOT an accuracy
claim or a recommendation to activate that policy. Unknown subject transmissions
block otherwise matching configurations. Literal configuration names, exact-year
requirements and AWD/4WD vocabulary differences also cause conservative demotions.
Supporting means a known label/attribute difference lacks an approved equivalence
or adjustment; it does not mean every such difference is a physical mismatch.

The 230 historical direct labels are not ground-truth errors. Saved labels reflect
older code/data, while replay uses the current adapters and strict pilot policy.
`legacyReplayTier` runs the old matcher on the same adapted profiles; it is separate
from historical `savedTier`. No end-to-end valuation delta has been validated.

## What to change next

1. Retain decoder observations before adding AI. The VIN response previously
   discarded transmission, engine designation/output, secondary trim/series,
   electrification and decode-error detail. This branch preserves those fields.
   Missing source fields remain missing; retaining them does not guarantee coverage.
2. Preserve source make, engine and transmission throughout listing mapping.
   Existing Auto.dev mapping/serialization drops some of these dimensions; legacy
   saved rows cannot be repaired by copying subject attributes into candidates.
3. Validate scoped label equivalences (including drivetrain nomenclature) using
   independent references. Do not relax the pilot globally to increase match counts.
4. Obtain evidence for consequential subject gaps. Where transmission really has
   multiple possibilities, request an authoritative decode/build record or explicit
   correction. Where a scoped production reference establishes only one possibility,
   record the inference and its reference.
5. Add independently reviewed holdouts, including TTS and EV battery variants.
   The existing TTS regression remains covered by the legacy suite, but no saved
   TTS evaluation or EV subject is included among these twenty real replays.

## Reproduce

```sh
npm ci --ignore-scripts
npm run test:identity-pilot
./node_modules/.bin/tsc --project scripts/identity-pilot/tsconfig.json
npm run pilot:identity-replay -- /absolute/path/evaluations.json /absolute/path/replay.json
```

Replay is offline. Input is an array of `{id, updated_at, vin, year, make, model,
trim, decoded, candidates}`; each candidate contains `{id, year, model, trim,
source, included, equivalenceTier, details, build, heading}`. `details` contains
identity fields and any saved identity verification; `build` is the listing's
original configuration object. Do not include media URLs, API keys, customer
notes, bid economics or dealer contacts. Keep private snapshots under the ignored
`.pilot-private/` directory, never in the public repository.

Output includes an input SHA-256, policy version, structured reasons and per-field
claims for review. Duplicate VIN rows are counted once per subject. Factory
identity and price quality are separate; the pilot does not issue acquisition
verdicts or modify the four-close-peer pricing gate.

## AI experiment

`extract.cjs` is a small explicit-text parser. It extracts displacement, cylinders
and transmission, and abstains when those are absent. The local audit of the 19
identifier-free saved descriptions found no explicit missing specifications.

`ai-benchmark.cjs` is a separate optional bounded experiment using the existing
Google SDK. Its committed fixture contains only 20 authored synthetic controls;
the script rejects other fixture kinds, VIN-shaped identifiers and URLs. Model
credentials are accepted through environment variables or one stdin JSON object,
never command arguments. Provider failures are recorded without credential values.
No AI output is automatically promoted into a vehicle profile.

Do not send private replay descriptions to an external model without appropriate
authorization. Live VIN verification and AI testing on saved database descriptions
were blocked by automatic approval review during this run. The synthetic controls
cannot establish accuracy on real automotive data.

The deterministic parser passed the 20 constructed controls after one correction
for plural "litres"; this is a development regression result, not an unseen test.
The external AI benchmark did not complete: Netlify returned masked credentials,
and two synthetic-only attempts received HTTP 400 API_KEY_INVALID. This does not
indicate that the real production key is invalid. The runner now rejects masked
configuration before making a request. AI accuracy, cost and latency remain unmeasured.

## Validation limits

All 26 new pilot checks and the new focused typecheck pass. The original 118 vehicle-equivalence cases and
8 valuation regression groups pass. Full-repository TypeScript checking has ten
existing errors in `mechanical-owner-upgrade-review.tsx`; an untouched checkout of
the same base commit produces the identical diagnostics. No production deployment,
database mutation, paid listing refresh or full UI build is part of this pilot.
