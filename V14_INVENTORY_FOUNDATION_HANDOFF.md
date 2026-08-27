# V14 Inventory Foundation — Full Handoff Report

**Version:** V14 Inventory Foundation  
**Repository:** `GET-Jon/mmav`  
**Source branch:** `v14-inventory-foundation`  
**Hosted Supabase project:** `ymlleqpbpgzydyzwhlqq`  
**Handoff date:** 2026-08-27

## 1. Current state

V14 established the operational foundation for Mindful Inventory / Lot Logic. The app now supports a complete working path from purchase into inventory, inspection, Work Plan, Work Orders, scheduling, partner coordination, parts sourcing, parts readiness, QC, and operational dashboards.

The test data has been reset at handoff. Pipeline/evaluation and inventory transactional data are empty. Operational configuration was intentionally preserved, including partners, locations, resources, partner capabilities, permissions, scheduling preferences, and standard hours.

At reset verification:

- `auction_evaluations`: 0
- `mindful_inventory_vehicles`: 0
- `mindful_inventory_work_orders`: 0
- `mindful_inventory_work_order_parts`: 0
- `mindful_inventory_history`: 0
- Partners preserved: 5
- Locations preserved: 3
- Resources preserved: 3
- Partner capabilities preserved: 4

## 2. Core operating model

The intended workflow is:

**Purchase → Overview / Intake → Mechanical → Work Plan → Active Work → Parts / Transport → QC → Media → Ready**

Important conceptual boundaries:

- **Mechanical** = what is true about the vehicle.
- **Work Plan / Car Plan** = what Mindful has authorized and intends to do.
- **Schedule** = when, where, and by whom approved work will be executed.
- **Active Work** = single-vehicle execution timeline.
- **Cross-vehicle Schedule** = resource and capacity management across inventory.
- Material changes after plan approval should eventually become change requests rather than silent mutations.

## 3. Inventory dashboard

The main Inventory page was redesigned away from a wide database-style table into a denser operational dashboard.

Implemented behavior includes:

- cleaner vehicle cards/rows
- ownership surfaced on the dashboard
- operational filters
- alternating visual treatment for scanability
- grade descriptions
- more appropriate status language for newly purchased vehicles instead of showing them as "On track"
- vehicle status intended to reflect actual workflow state rather than generic health

Potential follow-up items:

- confirm preliminary grade written during intake always synchronizes with the vehicle/dashboard grade
- review whether dynamically calculated readiness forecasts should ever be persisted back from Overview

## 4. Overview / Intake

Overview/Intake supports editable operational vehicle data while keeping Lot Logic evaluation data available as source context.

Implemented:

- Title Status
- Vehicle Owner
- intake / preliminary grading flow
- read-only Lot Logic evaluation context

Known VIN-decoder mapping issue:

Some evaluation metadata is nested under:

`source_snapshot.lotLogicEvaluationSnapshot.payload.decodedVehicle`

Useful fields there include make, model, trim, year, body class, fuel type, drivetrain, displacement, cylinders, and plant country. Transmission and colors were not available in the inspected payload.

## 5. Mechanical inspection

Mechanical was separated from Work Plan authorization.

Implemented:

- inspection findings
- finding validation states
- finding notes
- upgrades
- visual pills/status treatment
- imported AI findings can be reviewed rather than treated as automatically authoritative

Relevant schema work included mechanical scope validation and associated workflow handling.

## 6. Work Plan / Car Plan

The Work Plan is now the authorization boundary for execution.

Implemented:

- editable draft planning
- plan versions
- plan items
- imported AI work-plan items when the evaluation condition analysis was applied
- activation into Work Orders
- approved plan protection / immutability behavior
- change-request schema foundation

AI import fields include provenance and estimate metadata such as AI source evaluation/issue IDs, confidence, cost range, duration, sequence, assumptions, and source issue text.

Known follow-up items:

- review planning totals around `monitor` items
- improve sequencing UI
- add cleaner planning notes
- improve preassignment controls for partner / technician during planning

## 7. Active Work

Active Work became the single-vehicle operational timeline.

Implemented:

- Work Order execution calendar
- explicit scheduling controls
- partner / technician assignment
- location assignment
- optional resource / bay assignment
- Start and Complete actions
- conflict handling on assignment changes
- actual start/end timing
- forecast-ready date
- schedule readiness summary
- inline save/error behavior
- link to cross-vehicle Schedule

### Schedule health

The same operational timing logic is now used to surface lateness.

Rules currently implemented:

- scheduled work that has not started receives a visual warning after a 30-minute grace period
- more serious lateness escalates after an additional 60 minutes
- in-progress expected finish is based on **actual start + estimated elapsed/duration**
- finish buffer is `max(30 minutes, 15% of duration)`
- overdue work escalates after another 60 minutes

Active Work now displays a vehicle-level **Behind schedule** warning listing affected Work Orders and lateness. Cross-vehicle Schedule also has amber/orange/red health states.

A possible polish item is to add the same red/amber row accent directly to late Work Orders on Active Work, not just the vehicle-level warning.

## 8. Cross-vehicle Schedule

The Schedule is a manager planning/control surface rather than a simple calendar.

Implemented:

- week calendar
- current-day emphasis
- completed work remains faintly visible
- Calendar view
- Partners / Technicians view
- Resources / Bays view
- Unscheduled queue
- priority sorting
- schedule-item modal editor
- schedule conflict detection
- explicit schedule save
- performer, location, and resource editing
- schedule health / lateness
- filters/pills for:
  - All Work
  - Conflicts
  - Behind Schedule
  - Missing Info
  - Unscheduled
  - Waiting on Parts

Conflict precedence remains stronger than other warning styling.

Future ideas deliberately not yet prioritized:

- drag-and-drop scheduling
- hourly grid/swimlanes
- capacity visualization
- role-based Start/Complete restrictions
- notifications that lag visual schedule-health warnings by roughly 15–30 minutes

## 9. Partners / Admin

Admin was reorganized around operational setup.

Top-level Admin areas now include:

- Partners
- Locations & Resources
- Team & Access
- Turn 14 Distribution diagnostics

Navigation was simplified so Settings moved out of the primary center nav and into account/admin context.

### Partner capabilities and permissions

Implemented:

- partner create/edit
- capabilities
- permissions
- Select All permissions
- active/inactive status
- create persistence fixes for capabilities and permissions
- partner deletion only when there is no historical Work Order dependency

### Partner scheduling modes

Partner scheduling now supports:

- `manager_scheduled` — Lot Logic can schedule directly
- `partner_availability` — schedule within partner hours
- `coordination_required` — do not auto-book; coordinate with partner
- `partner_self_scheduling` — partner controls their scheduling

A new standard-hours table was added:

`mindful_inventory_partner_standard_hours`

Existing partners were seeded Mon–Fri 09:00–17:00 and weekends closed. Admin now allows editing weekly hours.

The existing table `mindful_inventory_partner_availability` remains available for a future one-off exceptions layer such as vacations, closures, and special availability.

### Suggested scheduling

Plan activation now attempts to assign:

- partner / technician
- location
- relevant resource
- proposed or firm time

For directly schedulable partners, suggested work is fitted within configured standard hours and checked for conflicts.

For `coordination_required` and `partner_self_scheduling` partners:

- partner may still be assigned
- location/resource may still be suggested
- no fake firm appointment is created
- work remains unscheduled / awaiting coordination

### Email Partner workflow

Outside-partner coordination now has an **Email Partner** action.

The modal provides:

- partner email in an easy-copy field
- subject
- concise vehicle/project email
- bundled work items for the same partner
- proposed appointment window
- Copy Email / Copy Subject / Copy Message actions

Direct Gmail integration was intentionally deferred.

## 10. Parts workflow

Parts moved from a simple storage concept toward a Work Order dependency system.

### AI suggested parts

Each Work Order can generate a recommended checklist rather than a single generic search.

Recommendations are classified as:

- Likely required
- Possible
- Consumable

Recommended items are advisory until the user clicks **Add**. Once added, they become tracked Work Order parts.

The sourcing UI was simplified into collapsed Work Order rows. Expanding a Work Order reveals suggested parts. Each suggested part has its own natural-language search and sourcing actions.

An **Other Part** line allows the user to enter a part the AI did not infer.

### Sourcing links

Current starting sources:

- Amazon
- eBay
- Turn 14

Search phrases were deliberately made human/natural instead of dumping full VIN-decoder-style vehicle descriptions into search strings.

Visible fitment context was also simplified to human-readable vehicle identity.

### Parts lifecycle / readiness

Tracked parts now affect execution.

A shared readiness model derives states such as:

- none
- needed
- ordered
- backordered
- ready
- installed

A Work Order is considered execution-ready only when its active tracked parts are received or installed.

Implemented effects:

- Active Work shows a Parts readiness warning
- affected Work Orders show pending-part counts and ETA where available
- Start is blocked server-side while required tracked parts are not ready
- Schedule receives the same readiness data
- Schedule cards show **Waiting on parts** styling/pills
- Schedule includes a `Waiting on Parts` filter
- schedule modal shows the dependency and links to Manage Parts
- Start Work is disabled there until parts are ready

Important rule: AI recommendations alone do **not** block execution. Only parts the user adds to tracked Parts create an execution dependency.

## 11. Turn 14 integration status — paused

Turn 14 work is intentionally paused because it is not worth further time/energy at this stage.

What was implemented:

- Netlify server-side credentials:
  - `TURN14_CLIENT_ID`
  - `TURN14_CLIENT_SECRET`
- Admin → Turn 14 Distribution diagnostics
- test/production environment handling
- test environment defaults to `https://apitest.turn14.com/v1`
- OAuth client-credentials diagnostic
- read-only catalog/inventory probe scaffolding
- no ordering implementation

Safety boundary:

- token exchange is the only POST in the Turn 14 client
- no quote/order/purchase/checkout methods were implemented
- no generic arbitrary-request helper was implemented

Turn 14 support later clarified:

- test server access opens 24 hours after approval
- full data integration must be completed before production access
- recommended sync cadence:
  - `/v1/items` daily + deltas
  - `/v1/pricing` daily after 1:00 AM EST + deltas
  - `/v1/inventory` daily full + deltas
- stop processing on any non-200 response
- paginate rather than fetching item-by-item; 1 page = 1,000 items
- Turn 14 Item ID / part-number mapping is required
- fitment uses AutoCare VCDB vehicle IDs and human YMM translation requires a separately licensed VCDB subscription
- ordering, if ever implemented, requires quote then promote quote to order

Preferred future architecture if resumed:

**Turn 14 scheduled read-only sync → Supabase cache → Lot Logic sourcing UI**

Do not resume Turn 14 by making live API calls for every part-search click.

## 12. Locations / resources / ownership

Locations and resources are now first-class scheduling entities.

Implemented:

- Admin management of locations
- Admin management of resources/bays
- Work Order location/resource assignment
- scheduling conflict checks for resources
- partner primary-location behavior
- vehicle owner and next-action ownership concepts

Resource is intentionally **not** treated as mandatory Missing Info for every Work Order because some jobs do not require a constrained resource.

## 13. QC / completion

QC schema and workflow are present.

When all Work Orders are complete/cancelled, vehicle workflow advances toward Final QC. QC inspection/items exist and were exercised in testing.

Role restriction remains a future item: eventually owners should not be responsible for Start/Complete operations except where appropriate, especially QC.

## 14. Database state and reset notes

Hosted Supabase currently retains schema and operational configuration but contains no test pipeline/inventory transactional data.

During cleanup, immutable-history and approved-plan mutation triggers prevented ordinary cascaded deletes. Because this is the test database and the goal was a clean reset, transactional rows were deleted inside a transaction with `session_replication_role = replica`, then restored to `origin` before commit. This bypassed row-level immutability triggers only for the cleanup operation; no schema protections were removed.

Preserved configuration includes:

- company/membership
- partners
- partner capabilities and assignments
- partner permissions
- partner locations
- partner standard hours / availability configuration
- locations
- resources
- application/admin configuration

## 15. Security / architecture follow-ups

Important unresolved hardening item:

Some inventory Admin RLS policies appear to use broad company-member checks rather than strict company-admin checks. UI/API Admin access is narrower, but direct database mutation rules should eventually be reviewed and hardened so partner/location/resource master data cannot be modified by ordinary members.

Other known cleanup/follow-up items:

- rename or eventually remove deprecated `middleware.ts` in favor of Next.js proxy convention
- review Lot Logic nested VIN mapping
- preliminary grade synchronization
- dynamic forecast persistence semantics
- Work Plan monitor-total semantics
- sequencing/notes/preassignment UX
- coordination-required work could be labeled more explicitly as `Awaiting coordination` rather than generic missing time in every surface
- partner portal/invite workflow remains deferred
- one-off partner availability exceptions remain deferred

## 16. Recent important commits

Selected recent V14 commits include:

- `2f9374bbd45cb90d2684a4ef065de8b113ce7471` — partner standard hours / coordination scheduling migration
- `d2980a0defd2466286dc3729609ff1e4e84c0c16` — partner scheduling controls
- `6a450898e7874537b08e66da545bb9ee36e50368` — suggested scheduling respects partner hours/modes
- `491a706863f2b469610e665c3cb15970d9e6726c` — expose actual work timing
- `9bc3433bc9285c298971d6453e1b23dd34535e51` — schedule health / overdue work
- `73232228cd8e1165e07eb023e8ab13c9550d28d5` — collapse parts sourcing by Work Order
- `e1cb3d921e1335e179773f36dff5c158d36f011d` — recommended-parts checklist/actions
- `8ce0996bca1298ec58496fe3b95eaac81df2fd2b` — Turn 14 OAuth form encoding
- `499891336602bf716bd9ec0a0cb5e17d99ad0986` — vehicle timeline behind-schedule warning
- `6f274f5ed164eda6a8cfc9dbf18c7fce1a0a3012` — parts readiness on Schedule cards

## 17. Handoff recommendation

Start the next thread from the new V15 branch and treat V14 as the completed inventory-foundation milestone.

Recommended immediate focus for V15:

1. verify a clean end-to-end vehicle from purchase/evaluation into inventory using the now-empty test database
2. refine Parts lifecycle UX (`Needed → Ordered → Received → Installed`) with ETA, tracking, supplier, and cost rollup
3. finish small Active Work / Schedule consistency polish
4. return to unresolved Work Plan and VIN/intake cleanup
5. defer Turn 14 until it becomes operationally valuable enough to justify the synchronization work

## 18. Testing / build caveat

Many changes were visually tested through the deployed Netlify preview during development. However, do not assume every latest commit was locally built by the assistant. Where a build was not explicitly run, the user was instructed to pull and run `npm run build` before deployment.
