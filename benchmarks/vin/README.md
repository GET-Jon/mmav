# VIN Identification Benchmark — development only

This benchmark is **not connected to the dealer evaluator**. It makes **no API calls by default**, changes no database tables, and does not run automatically during builds. It uses a fixed, auditable set of 15 VINs transcribed from the `lot_logic_vin_benchmark_expanded_15.xlsx` research workbook.

## Instructions

Run from the repository root on a machine with Node.js 20+:

```bash
node scripts/benchmark-vin-decoders.mjs
```

Dry run lists up to five reference cases; **no API calls** are made.

To run the two differently trimmed 2025 Camrys:

```bash
AUTODEV_API_KEY="<key provided through secure local environment>" node scripts/benchmark-vin-decoders.mjs --execute --make Toyota --limit 2
```

**Recommended:** set `AUTODEV_API_KEY` using an environment manager rather than pasting it into shell history.

Only NHTSA baseline (doesn't use Auto.dev quota):

```bash
node scripts/benchmark-vin-decoders.mjs --execute --nhtsa-only --make Toyota --limit 2
```

One VIN:

```bash
node scripts/benchmark-vin-decoders.mjs --execute --vin 4T1DAACK6SU615158 --limit 1
```

Up to 15 VINs: `--execute --limit 15`. No call is made to Auto.dev's paid `/specs` or `/build` products: this tool invokes only **GET /vin/{vin}** once per selected case and NHTSA's public decode once per selected case. All calls are opt-in. Do not exceed the existing shared free-tier allowance. Run a first 1–2 VIN pilot before the full sample.

The resulting JSON is written to `tmp/vin-benchmark-results.json` (or `--out /path/to/local/results.json`). The file contains the complete API response for reproducibility and must not be publicly committed or shared without reviewing provider terms. No credential is written to the results.

## Scoring semantics

- `exact_correct`: one non-ambiguous asserted retail trim agrees with the reference label.
- `confident_wrong`: the provider asserts a different trim without declaring ambiguity. This is higher risk than leaving trim unknown.
- `ambiguous_contains_truth`: provider reports multiple possible trims, including the reference.
- `ambiguous_excludes_truth`: provider reports alternatives but omits the reference.
- `missing`: no identified retail trim.
- `request_failed`: non-success response or error.
- `not_run`: provider skipped intentionally.

Trim comparison strips only AWD/FWD/4WD wording and punctuation. This can still produce false disagreement for model-specific marketing labels; disputed rows should be manually reviewed before deciding to integrate a provider. **Do not interpret Auto.dev style-confidence estimates as independent verification of an individual VIN.**

## Evidence limitations

These first 15 cases are a **pilot**, not a representative performance sample. Manufacturer labels were found on publicly accessible dealer/CDN sources. Independently re-open the exact PDF and verify VIN/trim on the label before using any row in a published accuracy figure. Several Ford sources are Canadian-market labels. Toyota/Lexus documents are manufacturer-formatted window labels hosted on third-party dealer infrastructure. Treat their provenance accordingly.

The benchmark does not assess pricing, completed sales, or the accuracy of Lot Logic's valuation. A successful decode is a candidate improvement, not permission to auto-insert that trim into dealer-facing pricing.

## Deployment and privacy

This is a CLI script only. It does **not** create a public diagnostic endpoint, expose an API key to a browser, enable new Netlify functions, or run API calls on production. Keep this work on PR #32 until reviewed. If executed, preserve generated results outside Git and report exact VIN-level raw and scored outcomes rather than assumed improvements.
