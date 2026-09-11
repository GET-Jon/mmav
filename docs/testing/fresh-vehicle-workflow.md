# Fresh vehicle workflow observations

## Baseline — September 10, 2026

- User confirmed that Inventory was empty after the reset. Deal Pipeline still contains saved Evaluator records; those were outside the documented Inventory/Intelligence reset.
- Test vehicle shown: 2018 Mercedes-Benz GLS-Class GLS550-4M, VIN 4JGDF7DE4JB090866, 92,000 miles, purchase price $5,200.
- Active workflow branch: `v15-inventory-workflow`. Keep v16 comparison changes separate.

## Intake verification

User decision: emphasize the entire Mileage card first, then Title Status, then Purchase Price. Advance emphasis after successful confirmation. Confirmed fields remain editable through their checkmark.

Confirmed defects:

- Title Status had its own hard-coded Unknown highlight, independent of the verification sequence.
- Confirmation arrows did not visibly acknowledge pending requests.
- Numeric blur-save could overlap confirmation; unchanged numeric values were written again before confirming.
- Title confirmation triggered a hidden full-form save without awaiting its success.

Implemented correction:

- One ordered verification highlight; blue pending feedback, spinner and Saving text; green checkmark only after successful confirmation; local error feedback and retry.
- Guard duplicate clicks through the full operation. Disable handoff during a pending mutation.
- Required numeric fields save on confirmation. Unchanged values skip the redundant summary write; changed values save before confirmation. Optional acquisition costs retain blur-save.
- Title uses a scoped summary-field update and awaits success before recording confirmation. It no longer triggers a full Overview save on selection/confirmation.
- Preserve company-scoped access and existing history events. No schema or Evaluator changes.

## Verification

- Full `npm run build` passed, including the existing prebuild transformation chain and TypeScript compilation.
- Controlled-response React DOM checks passed: ordered emphasis, immediate pending feedback, duplicate-click guard, unchanged-value request reduction, edited-value single save, title save failure preventing confirmation, retry, reopening and handoff gating. These checks mock network responses; live database round-trip latency remains unmeasured.
- Browser rendering could not be checked locally because the browser download failed. Deployed visual review remains pending.

## Rebuild requirements and follow-up

- Build verification cards as normal React components with shared state, rather than DOM discovery, portals into other components, and source-mutating build scripts.
- Model pending/success/failure as standard mutation states throughout the product. Every action must acknowledge input immediately and prevent duplicate submission.
- Consolidate value persistence, server validation, confirmation and audit into an atomic operation with concurrency protection. Current separate value/confirmation requests are still not atomic across users.
- Measure live request latency separately from perceived responsiveness. The user reports broader site slowness; its overall cause remains unverified.
- The Overview save currently writes Intake, then vehicle details, then refreshes the server page. The page loads the Inventory dashboard to locate one vehicle. Investigate these paths when measuring broader latency; do not assume they explain every slow action.
- Verify these changes in the deployed Owner session before recording the fresh-vehicle stage as passed.


## Upgrade capture — September 11, 2026

User-approved simplification implemented for the current test:

- Default fields: Upgrade, Description, optional Product link, optional Budget preference.
- Native More details disclosure retains category, quantity, desired outcome, manufacturer, part number, preferred vendor, parts/labor estimates, substitutes and notes. Collapsing it does not clear values.
- Budget remains the existing estimate field, explicitly described as a planning preference. Adding an upgrade records intent and does not authorize work or spending.
- New upgrades default to Other rather than silently assuming Performance when category is collapsed. Existing upgrade categories are preserved on edit.
- Existing create/edit payloads and cost calculations are unchanged.

Rebuild follow-up: suggest category, progressively add sourcing/assessment detail, distinguish budget preference from formal authorization in the domain model, and preserve structured information through assessment, Work Plan and execution without re-entry.

Verification: production build passed with the existing prebuild chain. A field-binding comparison confirmed that every prior form value is retained. Deployed visual review remains pending.


### Upgrade estimates refinement — September 11, 2026

- Description renamed Details (optional), with a concrete example distinguishing the work title from preferences and constraints.
- Optional Parts, Labor and Total estimates are visible together. Entered parts/labor calculate the total unless the owner supplies a manual total. A total alone is supported without inventing a breakdown.
- Manual totals are explicitly identified; Recalculate total restores the sum when a breakdown exists. Clearing a manual total returns to calculation (or blank when both components are unknown).
- Both components blank leaves the total blank, including on reopening saved upgrades. Explicit zero remains distinct from unknown. Partial breakdowns sum only known entries, and the UI explains this. The existing API already preserves null component estimates.

Verification: production build passed. Calculation checks passed for blank, partial and complete estimates, manual-total preservation, recalculation, clearing both components and explicit zero.


### Finding review action grouping — September 11, 2026

Request Clarification now sits alongside the owner note/question field. Accept Finding (or Approve & Route) and Dismiss form a separate decision group, visually divided on desktop and stacked on smaller screens. Existing handlers, validation and permissions are unchanged. Rebuild principle: group message submission with its input, separately from operational decisions.

Verification: full production build passed with the prebuild chain. Deployed visual review remains pending.


### Clarification draft lifecycle

Successful clarification submission clears the submitted draft. Failed submissions retain it; text changed while the request is pending is preserved. Saved review notes are no longer copied into the composer on page load, preventing already-sent questions from reappearing as drafts. Conversation/history persistence is unchanged.

Verification: production build passed; checked that the draft-clearing logic survives the source-mutating prebuild chain.


## Mechanical repair authorization — September 11, 2026

Product decision:

- Accepting a mechanical finding means the Owner is approving the repair, approving the displayed spend authorization, and including that repair in the Work Plan.
- If the inspecting Partner says they can perform the repair, that Partner becomes the preferred performer automatically.
- If the inspecting Partner says they cannot perform it, the Owner must choose an alternate Partner before approval.
- The mechanic who authored the assessment remains visible as provenance even when a different Partner will perform the work.
- The approval total represents new cash spend for the work. In-stock parts remain visible but contribute $0 to new spend. Parts marked Not Needed are excluded. Purchase-required parts plus labor determine the authorization range/ceiling.

Implementation corrections discovered during this change:

- The old review endpoint recorded `accepted` but did not save the inspector as preferred performer when `mechanical_can_perform = true`.
- Preliminary Work Plan generation previously consumed every open mechanical finding, even if the Owner had not accepted it. That violated the intended Finding → Owner decision → Work Plan boundary.
- Mechanical part quote/AI-price fields existed in the stored suggestion JSON but the Owner finding view normalized them away, preventing a trustworthy total from being calculated in the approval card.
- A legacy prebuild patch could overwrite the Mechanical page with the older Owner-review component. The patch chain was aligned so the V2 review component remains authoritative through production build.

Implemented behavior:

- Owner review now uses a decision-focused card that shows the mechanic, recommendation, can-perform status, labor hours, mechanic note, Partner routing, labor price, part pricing, and a prominent Total Authorization.
- Partner-offered part prices are treated as exact quoted unit prices. AI part estimates remain ranges and are labeled as AI estimates. Quantity is included in totals.
- Purchase-required part prices count toward new spend. In-stock parts are clearly labeled and excluded from new spend. Not-needed parts are excluded from the authorization.
- The approval amount is exact when all included inputs are exact and a range when any purchase-required part is a range. The maximum displayed amount is the spend authorization ceiling.
- Approval is blocked when the labor price, a purchase-required part price, or performer decision is missing. The Owner is directed to Request Clarification rather than approving undefined scope/budget/ownership.
- Accepting writes the authorization snapshot to immutable Inventory History, including labor, new-parts low/high, total low/high, price-source flags, and assigned Partner.
- When the inspector can perform the repair, `owner_preferred_partner_id` now receives the inspection Partner. When they cannot, the selected alternate Partner is stored instead.
- Preliminary Work Plan generation now receives only Owner-accepted open mechanical findings. Dismissed, unreviewed, and clarification-pending findings cannot silently enter the plan.
- Every accepted finding must appear exactly once in the generated Work Plan and cannot be merged into an upgrade item.
- For an accepted finding represented in a generated Plan Item, the Owner-authorized repair range overrides a fresh AI cost guess. The Plan Item planning amount uses the approved maximum, and the preferred Partner carries into routing.
- The final Owner finding decision continues to build/open the Preliminary Work Plan automatically; the prebuild transition script now targets the V2 review component.

Rebuild requirement:

- Formalize repair authorization as a first-class immutable domain object or versioned approval snapshot rather than deriving it from mutable Finding fields plus History metadata. The current v15 correction is behaviorally correct for the fresh-vehicle test, but the clean rebuild should make authorization boundaries explicit in the schema.
- Model part disposition as structured data rather than encoding `IN STOCK` / `NOT NEEDED` prefixes into notes.

Verification:

- Full production `npm run build` passed on Node 22 after the complete source-mutating prebuild chain, Next.js production compilation, and TypeScript validation for the initial authorization implementation.
- The prebuild verification caught and corrected two legacy-patcher incompatibilities rather than allowing them to reach deployment: exact-match part-type detection and the old Owner-review component reference.
- Deployed visual review with the fresh GLS finding is still required.
- Fresh-vehicle runtime verification still needs to confirm that an accepted repair appears once in the generated Work Plan with the displayed authorization maximum and intended Partner.

### Authorization-card refinement after initial build

- The visible Owner card was subsequently reorganized again around the actual decision: Finding identity → Mechanic assessment → Parts detail → Repair authorization → Clarification → Approve/Dismiss.
- The assigned mechanic/Partner name is now shown directly. If the inspector offered to perform the repair, the card identifies them as the proposed performer; otherwise it requires an alternate Partner.
- `Estimate` was replaced by the unambiguous `Labor price` label.
- The Repair authorization box shows labor price, new-parts spend, pricing status, and the exact/range total being authorized.
- Approval copy now explicitly states that approving authorizes the repair, its spend, its performer, and inclusion in the Work Plan.
- The primary action now reads `Approve Repair` or `Approve Repair & Route`, rather than the weaker `Accept Finding` wording.
- A legacy safety case was added: if a finding says parts are required but has no structured part records/pricing, both the UI and review endpoint block approval rather than silently treating the repair as labor-only.
- Missing labor price, missing purchase-required part price, and unresolved performer status are surfaced separately instead of displaying a misleading total.

Verification status for this refinement:

- Source review confirms compatibility with the existing `ensure-expand-search-source.mjs` Owner-review transformation markers; the new component preserves the exact marker sequence expected by that patcher.
- Server validation mirrors the client approval gates for performer and pricing completeness, including legacy unstructured required-parts data.
- A fresh production build has **not yet been observed for the final card-refinement commits**. Do not treat the earlier successful build as verification of these later UI/backend refinements.
- Next deployed test: open the fresh GLS mechanical review card, confirm the mechanic name and `$710–$880`-style authorization math where applicable, approve one repair, and verify the generated Work Plan carries the same ceiling and intended Partner exactly once.
