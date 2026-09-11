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
