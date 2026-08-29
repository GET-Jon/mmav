# Lot Logic Intelligence

## Technical Specification v1

**Product:** Lot Logic
**Layer:** Shared Intelligence
**Status:** Active architectural source of truth
**Purpose:** Create a persistent, tenant-specific operational intelligence layer shared by Evaluator and Inventory Operations.

---

## 1. Product Vision

Lot Logic Intelligence is the persistent company-specific understanding beneath Lot Logic.

It combines:

1. **Company Knowledge** — what the company explicitly says about its capabilities, policies, preferences, people, and operating model.
2. **Operational Memory** — what actually happens during acquisition, inspection, planning, reconditioning, scheduling, QC, and sale preparation.
3. **Learned Intelligence** — calculated or inferred patterns derived from repeated operational evidence.
4. **Decision Applications** — Evaluator and Inventory recommendations that consume the intelligence layer.

Evaluator and Inventory do not maintain separate AI memories. They are consumers and producers of one shared Lot Logic Intelligence layer.

The core learning loop is:

**Evaluate → Predict → Acquire → Inspect → Plan → Execute → Measure → Compare Prediction vs Actual → Learn → Improve Next Decision**

---

## 2. Foundational Rules

### 2.1 Internal estimates are management intelligence

AI-predicted pricing, labor hours, elapsed time, recon budget, gross, and related economics are internal management information.

Partners must not see those values before independently submitting their own estimate.

Partner workflow:

- receive work scope, vehicle context, relevant findings, evidence, parts information where appropriate, location, and scheduling requirements
- independently enter quoted price
- independently enter estimated labor time
- independently enter estimated elapsed/completion time
- submit estimate

This produces independent measurements:

**AI Prediction → Partner Estimate → Manager Authorization → Actual Outcome**

Partner estimates are stored separately from the management Work Order economics to prevent accidental information leakage.

### 2.2 Knowledge provenance is permanent

Lot Logic must distinguish:

- explicit knowledge
- observed evidence
- calculated facts
- inferred conclusions
- manager-validated knowledge
- refuted knowledge
- superseded knowledge

A learned conclusion must never silently erase the original company instruction or historical state.

### 2.3 Empirical facts and organizational interpretations are different

Objective calculations may update without human validation, such as:

- actual average cost
- median duration
- estimate variance
- completed-job count
- QC return rate
- partner utilization

Higher-level organizational interpretations may require administrator validation, such as:

- a partner appears to have become the preferred provider for a capability
- the company appears to follow a new approval policy
- an operating practice appears systematically better or worse

Validation states:

- Validate
- Refute
- Keep Observing

### 2.4 Every learned assertion needs evidence

Learned assertions should retain, where applicable:

- confidence
- sample size
- supporting count
- contradicting count
- first observed
- last observed
- supporting records
- provenance
- validation state

### 2.5 Tenant intelligence remains tenant-specific

Company-specific operational data and learned intelligence belong to that company.

Future anonymized network intelligence is a separate feature and must never be assumed as part of tenant learning.

### 2.6 The system may say it does not know

Insufficient evidence must produce low confidence or no company-specific recommendation rather than false precision.

---

## 3. Intelligence Hierarchy

When sufficient company evidence exists, decision context should generally prioritize:

1. explicit current manager instruction
2. validated company policy
3. recent repeated company behavior
4. longer-term company performance
5. future opt-in anonymized Lot Logic network intelligence
6. generic automotive knowledge

Weighting must consider similarity, recency, sample size, confidence, outcome quality, and contradictory evidence.

---

## 4. Day-Zero Intelligence

A new customer must not receive a blank system.

Lot Logic should begin with generalized intelligence including:

- automotive repair and maintenance knowledge
- vehicle/model/engine knowledge
- common issue relationships
- generic repair cost/time ranges
- acquisition and recon workflow knowledge
- common inspection logic
- inventory operations best practices
- generic partner capability taxonomy

Each tenant then adds bootstrap company intelligence through a capability/operations document and other sources.

Typical onboarding knowledge:

- internal staff and partners
- partner capabilities
- facilities and resources
- sourcing preferences
- recon philosophy
- approval limits
- target margins
- target Days-to-Ready
- internal vs outsourced capabilities
- preferred/avoided vehicle profiles
- operating policies and SOPs

Normal system usage then progressively replaces generic assumptions with company-specific evidence where appropriate.

---

## 5. Knowledge Model

### Knowledge Sources

Examples:

- capabilities document
- SOP
- policy
- manager note
- reference document
- imported historical information

Original source content remains preserved.

### Assertions

Assertions represent usable knowledge extracted or learned from sources and operations.

Examples:

- Naif is explicitly designated for key programming
- Devin has performed 11 of the last 13 key-programming jobs
- Devin's median key-programming completion time is 0.8 days
- Devin appears to be the preferred key-programming provider

Assertions maintain provenance and lifecycle rather than overwriting one another.

---

## 6. Prediction / Outcome Learning

Every material AI recommendation should be capable of creating an immutable prediction snapshot.

Prediction types include:

- finding
- work cost
- work duration
- partner recommendation
- related issue
- ready date
- recon total
- bid

Prediction snapshots may retain:

- predicted cost range
- predicted labor time
- predicted elapsed time
- predicted partner
- confidence
- model/provider
- prompt version
- decision context used

When actual work occurs, an outcome record links back to the prediction and stores:

- partner independent estimate
- actual executor
- actual cost
- actual labor time
- actual elapsed time
- QC result
- other outcome facts
- calculated variance

Predictions are never rewritten after the fact.

---

## 7. Partner Blind Estimate Rule

`lot_logic_partner_blind_estimates` is deliberately separate from `mindful_inventory_work_orders`.

Partners must not receive access to management-only fields including:

- AI predicted cost
- AI predicted labor hours
- AI predicted elapsed time
- planning amount
- internal forecast
- approved vehicle recon budget
- acquisition cost
- expected retail
- projected gross

Partners may submit revisions as new estimate records rather than overwriting history.

The system should eventually analyze:

- partner estimate vs AI estimate
- partner estimate vs actual
- systematic estimating bias
- estimate accuracy by partner/work type
- whether actual duration differs from quoted duration

---

## 8. Related Issue Intelligence

Lot Logic must learn issue relationships, not only standalone repair statistics.

Relationship types include:

### Co-occurrence
Two findings frequently appear together.

### Conditional follow-on
When Issue A is present or repair begins, Issue B is subsequently discovered at a meaningful rate.

### Repair-related
Repairing A commonly exposes or requires B.

### Vehicle pattern
A relationship appears within a particular make/model/generation/engine/mileage scope.

### Alternate cause
A frequently suspected issue is often explained by another root cause.

Learned relationships should retain occurrence count, opportunity count, conditional probability, confidence, vehicle scope, and evidence.

These relationships may influence both:

- Evaluator risk allowances and inspection recommendations
- Inventory inspection/work instructions

---

## 9. Decision Events

Human interaction with recommendations is learning data.

Decision events include:

- partner assignment/override
- Plan Item acceptance
- Plan Item decline
- cost override
- duration override
- bid override
- priority override
- vehicle exit
- upgrade decision
- policy/insight validation

Store:

- AI recommendation
- human decision
- human reason
- eventual outcome

Repeated overrides are stronger evidence than passive observations alone.

---

## 10. Intelligence Administration

Target UI:

**Settings → Lot Logic Intelligence**

Recommended sections:

### Knowledge
Uploaded source documents and manually entered company knowledge.

### Learned Insights
Current system observations and emerging conclusions.

### Needs Validation
Material inferred organizational conclusions requiring administrator review.

Actions:

- Validate
- Refute
- Keep Observing

### Policies
Current validated operating rules.

### Learning History
Immutable history of what was learned, validated, refuted, superseded, or archived.

Every surfaced insight should expose a **Why?** view showing supporting evidence and confidence.

---

## 11. Evaluator Integration

Evaluator should progressively construct decisions from:

- generalized automotive knowledge
- vehicle/VIN data
- company policies
- company capabilities
- relevant company historical jobs
- company issue relationships
- company cost/duration distributions
- partner performance/capabilities
- current economics

The long-term valuation question becomes:

> What is this vehicle worth to this dealer given this dealer's actual capabilities and economics?

Two Lot Logic companies may rationally receive different suggested bids for the same vehicle.

---

## 12. Inventory Integration

Inventory is the primary producer of operational evidence.

For each Work Order, the learning record should eventually include:

- AI expected cost
- AI expected labor duration
- AI expected elapsed duration
- AI suggested partner
- partner quoted cost
- partner estimated labor duration
- partner estimated elapsed duration
- manager-approved budget
- assigned partner
- actual executor
- actual cost
- actual labor duration
- actual elapsed duration
- new/related findings
- QC outcome
- difficulty
- Plan revisions
- manager overrides

Completion events should trigger outcome recording and relevant learning recalculation.

---

## 13. Initial Database Objects

V1 foundation:

- `lot_logic_intelligence_knowledge_sources`
- `lot_logic_intelligence_assertions`
- `lot_logic_intelligence_prediction_snapshots`
- `lot_logic_partner_blind_estimates`
- `lot_logic_intelligence_prediction_outcomes`
- `lot_logic_intelligence_decision_events`
- `lot_logic_intelligence_issue_relations`
- `lot_logic_intelligence_insights`

Existing Inventory objects remain authoritative for operational execution.

Intelligence references them; it does not duplicate the operational system.

---

## 14. Initial Implementation Order

### Phase 1 — Intelligence Foundation

- schema
- tenant isolation
- prediction snapshots
- blind partner estimates
- prediction outcomes
- decision events
- issue relationships
- insight validation states

### Phase 2 — Inventory Instrumentation

- create prediction snapshots from AI Plan Items
- collect blind partner estimates
- capture actual outcomes
- record human overrides/declines
- capture secondary findings

### Phase 3 — Shared Context Service

Implement shared Lot Logic Intelligence services for:

- company context
- relevant experience retrieval
- work prediction context
- partner recommendation context
- related issue retrieval
- prediction recording
- outcome recording
- insight evaluation

### Phase 4 — Evaluator Feedback

Use company-specific evidence to condition:

- recon estimates
- labor/time estimates
- related issue risk
- partner recommendation
- total recon
- suggested bid

### Phase 5 — Intelligence Settings UI

- knowledge management
- insights
- validation queue
- policies
- learning history

### Phase 6 — Learning Automation

Event-driven or scheduled analysis promotes repeated evidence into calculated or inferred assertions.

---

## 15. Success Criterion

Lot Logic Intelligence should make the product feel useful on day one and increasingly company-specific through ordinary use.

The user should not need to perform a separate AI-training workflow.

The business itself is the training interface.

Normal actions — assigning, quoting, approving, declining, repairing, completing, overriding, inspecting, and QC — become structured evidence that improves future decisions.
