#!/usr/bin/env bash
set -euo pipefail
cd "$(git rev-parse --show-toplevel)"

python - <<'PY'
from pathlib import Path


def replace_once(text, old, new, label):
    count = text.count(old)
    if count != 1:
        raise SystemExit(f"PATCH STOPPED: expected 1 occurrence for {label}, found {count}")
    return text.replace(old, new, 1)

# ------------------------------------------------------------------
# 1) Compress global vehicle shell
# ------------------------------------------------------------------
path = Path("components/mindful-inventory/inventory-vehicle-shell.tsx")
text = path.read_text()

start = text.index('  return (\n    <div className="mx-auto w-full max-w-[1480px]')
end_marker = '\n  );\n}'
end = text.rindex(end_marker)

replacement = r'''  return (
    <div className="mx-auto w-full max-w-[1480px] space-y-4 px-4 py-4 sm:px-5 lg:px-7">
      <section className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
        <div className="px-5 py-3.5 sm:px-6">
          <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
                <h1 className="truncate text-2xl font-black tracking-[-0.03em] text-slate-950">{vehicleName}</h1>
                <span className="rounded-full bg-slate-950 px-2.5 py-1 text-[10px] font-black uppercase tracking-wide text-white">{phases[currentPhaseIndex]?.short || "Inventory"}</span>
              </div>
              <div className="mt-1 flex flex-wrap gap-x-3 gap-y-1 text-xs font-semibold text-slate-500">
                <span>{vehicle.stockNumber ? `Stock # ${vehicle.stockNumber}` : "No stock number"}</span>
                {vehicle.vin ? <span>{vehicle.vin}</span> : null}
                {vehicle.mileage !== null ? <span>{vehicle.mileage.toLocaleString()} mi</span> : null}
              </div>
            </div>

            <div className="flex flex-wrap items-center gap-2">
              <div className="flex items-center gap-1 overflow-x-auto rounded-xl bg-slate-50 px-2 py-1.5">
                {phases.map((phase, index) => {
                  const complete = index < currentPhaseIndex;
                  const active = index === currentPhaseIndex;
                  return (
                    <div key={phase.value} className="flex items-center gap-1">
                      <span className={`whitespace-nowrap rounded-lg px-2 py-1 text-[10px] font-black ${active ? "bg-slate-950 text-white" : complete ? "bg-emerald-50 text-emerald-700" : "text-slate-400"}`}>
                        {complete ? "✓ " : ""}{phase.short}
                      </span>
                      {index < phases.length - 1 ? <span className="text-[10px] font-black text-slate-300">→</span> : null}
                    </div>
                  );
                })}
              </div>
              <Link href="/mindful/inventory" className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs font-black text-slate-700 hover:bg-slate-50">← Inventory</Link>
            </div>
          </div>
        </div>

        <div className="border-t border-slate-200 bg-slate-50/70 px-2 py-1.5">
          <nav className="flex gap-1 overflow-x-auto">
            {sections.map((section) => {
              const active = section.href === base ? pathname === base : pathname === section.href || pathname.startsWith(`${section.href}/`);
              return (
                <Link key={section.href} href={section.href} className={`whitespace-nowrap rounded-lg px-3 py-2 text-xs font-black transition ${active ? "bg-slate-950 text-white shadow-sm" : "text-slate-500 hover:bg-white hover:text-slate-900"}`}>
                  {section.label}
                </Link>
              );
            })}
          </nav>
        </div>
      </section>

      <div>{children}</div>
    </div>
  );
}'''

text = text[:start] + replacement + text[end + len(end_marker):]
path.write_text(text)

# Remove now-unused phaseDescriptions object.
text = path.read_text()
phase_start = text.find('const phaseDescriptions: Record<string, string> = {')
if phase_start != -1:
    phase_end = text.find('\n};\n\nexport function InventoryVehicleShell', phase_start)
    if phase_end == -1:
        raise SystemExit('PATCH STOPPED: phaseDescriptions end not found')
    text = text[:phase_start] + text[phase_end + 4:]
    path.write_text(text)

# ------------------------------------------------------------------
# 2) Re-hierarchy Active Work top and hide success-only readiness banner
# ------------------------------------------------------------------
path = Path("components/mindful-inventory/inventory-active-work.tsx")
text = path.read_text()
start_marker = '  return <div className="space-y-4">\n    <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">'
start = text.find(start_marker)
if start == -1:
    raise SystemExit('PATCH STOPPED: Active Work top start not found')
readiness = text.find('\n\n    {openWork.length > 0 ? <section', start)
if readiness == -1:
    raise SystemExit('PATCH STOPPED: Active Work readiness anchor not found')

new_top = r'''  return <div className="space-y-4">
    <section className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
      <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <div className="text-xs font-black uppercase tracking-[0.1em] text-slate-400">Active Work</div>
            <Link href="/mindful/inventory/schedule" className="rounded-lg border border-slate-200 px-2.5 py-1 text-[10px] font-black text-slate-600">Cross-vehicle Schedule →</Link>
          </div>
          {nextWork ? (
            <div className="mt-3 rounded-xl border border-slate-200 bg-slate-50 px-4 py-3">
              <div className="text-[10px] font-black uppercase tracking-[0.12em] text-slate-400">{nextWork.status === "in_progress" ? "Happening now" : "Next action"}</div>
              <div className="mt-1 text-lg font-black text-slate-950">{nextWork.title}</div>
              <div className="mt-1 flex flex-wrap gap-x-3 gap-y-1 text-sm font-semibold text-slate-600">
                <span>{dateTimeLabel(nextWork.scheduledStartAt || nextWork.proposedStartAt)}</span>
                <span>{nextWork.performerName || "Performer not assigned"}</span>
                <span className={!nextWork.locationName ? "font-black text-amber-700" : ""}>{nextWork.locationName || "Location needs attention"}{nextWork.resourceName ? ` · ${nextWork.resourceName}` : ""}</span>
              </div>
            </div>
          ) : <div className="mt-3 text-lg font-black">All authorized work is complete.</div>}
        </div>

        <div className="flex flex-wrap gap-2 lg:justify-end">
          <span className="rounded-full bg-slate-100 px-3 py-1.5 text-xs font-black text-slate-700">{completed}/{workOrders.length} complete</span>
          <span className="rounded-full bg-slate-100 px-3 py-1.5 text-xs font-black text-slate-700">Forecast {forecastReady ? new Date(forecastReady).toLocaleDateString("en-US", { month:"short", day:"numeric" }) : "TBD"}</span>
          <span className="rounded-full bg-blue-50 px-3 py-1.5 text-xs font-black text-blue-700">{hours(totalLabor)} labor</span>
          <span className="rounded-full bg-slate-950 px-3 py-1.5 text-xs font-black text-white">{money(activeBudget)} budget</span>
        </div>
      </div>
      {message ? <div className="mt-3 text-sm font-bold text-slate-600">{message}</div> : null}
    </section>'''

text = text[:start] + new_top + text[readiness:]
text = replace_once(text, '{openWork.length > 0 ? <section', '{openWork.length > 0 && !scheduleReady ? <section', 'readiness visibility')
text = text.replace('Schedule readiness', 'Needs attention', 1)
text = text.replace('This car still has scheduling gaps.', 'Complete the remaining scheduling gaps.', 1)
path.write_text(text)

# ------------------------------------------------------------------
# 3) Partner admin data now exposes primary/default work location
# ------------------------------------------------------------------
path = Path("lib/admin/partners.ts")
text = path.read_text()
text = replace_once(text,
'''  notes: string | null;\n  capabilities: Array<{ id: string; code: string; name: string }>;''',
'''  notes: string | null;\n  primaryLocationId: string | null;\n  primaryLocationName: string | null;\n  capabilities: Array<{ id: string; code: string; name: string }>;''',
'AdminPartner location fields')
text = replace_once(text,
'''export type AdminCapability = { id: string; code: string; name: string; active: boolean };''',
'''export type AdminCapability = { id: string; code: string; name: string; active: boolean };\nexport type AdminPartnerLocationOption = { id: string; name: string };''',
'location option type')
text = replace_once(text,
'''  const [partnersResult, capabilityResult] = await Promise.all([''',
'''  const [partnersResult, capabilityResult, locationsResult] = await Promise.all([''',
'partner data promise')
text = replace_once(text,
'''    supabase\n      .from("mindful_inventory_partner_capabilities")\n      .select("id,code,name,active")\n      .eq("company_id", companyId)\n      .order("name", { ascending: true }),\n  ]);''',
'''    supabase\n      .from("mindful_inventory_partner_capabilities")\n      .select("id,code,name,active")\n      .eq("company_id", companyId)\n      .order("name", { ascending: true }),\n    supabase\n      .from("mindful_inventory_locations")\n      .select("id,name")\n      .eq("company_id", companyId)\n      .eq("active", true)\n      .order("name", { ascending: true }),\n  ]);''',
'location query')
text = replace_once(text,
'''  if (capabilityResult.error) throw new Error(capabilityResult.error.message);''',
'''  if (capabilityResult.error) throw new Error(capabilityResult.error.message);\n  if (locationsResult.error) throw new Error(locationsResult.error.message);''',
'location query error')
text = replace_once(text,
'''  const [assignmentsResult, permissionsResult] = await Promise.all([''',
'''  const [assignmentsResult, permissionsResult, locationLinksResult] = await Promise.all([''',
'partner links promise')
text = replace_once(text,
'''    partnerIds.length\n      ? supabase.from("mindful_inventory_partner_permissions").select("partner_id,view_assigned_work,start_work,complete_work,upload_media,add_notes,report_blocker,update_parts,update_actual_cost,submit_invoice,reschedule_work,add_finding,propose_additional_work,request_plan_change,edit_estimate").in("partner_id", partnerIds)\n      : Promise.resolve({ data: [], error: null }),\n  ]);''',
'''    partnerIds.length\n      ? supabase.from("mindful_inventory_partner_permissions").select("partner_id,view_assigned_work,start_work,complete_work,upload_media,add_notes,report_blocker,update_parts,update_actual_cost,submit_invoice,reschedule_work,add_finding,propose_additional_work,request_plan_change,edit_estimate").in("partner_id", partnerIds)\n      : Promise.resolve({ data: [], error: null }),\n    partnerIds.length\n      ? supabase.from("mindful_inventory_partner_locations").select("partner_id,location_id,is_primary").in("partner_id", partnerIds)\n      : Promise.resolve({ data: [], error: null }),\n  ]);''',
'partner location links query')
text = replace_once(text,
'''  if (permissionsResult.error) throw new Error(permissionsResult.error.message);''',
'''  if (permissionsResult.error) throw new Error(permissionsResult.error.message);\n  if (locationLinksResult.error) throw new Error(locationLinksResult.error.message);''',
'partner links error')
text = replace_once(text,
'''  const permissions = new Map((permissionsResult.data || []).map((row) => [row.partner_id, row]));''',
'''  const permissions = new Map((permissionsResult.data || []).map((row) => [row.partner_id, row]));\n  const locations = (locationsResult.data || []) as AdminPartnerLocationOption[];\n  const locationNameById = new Map(locations.map((location) => [location.id, location.name]));\n  const primaryLocationByPartner = new Map<string, string>();\n  for (const row of locationLinksResult.data || []) {\n    if (row.is_primary || !primaryLocationByPartner.has(row.partner_id)) primaryLocationByPartner.set(row.partner_id, row.location_id);\n  }''',
'partner location maps')
text = replace_once(text,
'''      notes: partner.notes,\n      capabilities: assignments.get(partner.id) || [],''',
'''      notes: partner.notes,\n      primaryLocationId: primaryLocationByPartner.get(partner.id) || null,\n      primaryLocationName: locationNameById.get(primaryLocationByPartner.get(partner.id) || "") || null,\n      capabilities: assignments.get(partner.id) || [],''',
'partner mapped location')
text = replace_once(text,
'''  return { partners, capabilities };''',
'''  return { partners, capabilities, locations };''',
'partner return locations')
path.write_text(text)

# ------------------------------------------------------------------
# 4) Partner Admin UI gets Preferred Work Location
# ------------------------------------------------------------------
path = Path("components/admin/partner-admin.tsx")
text = path.read_text()
text = replace_once(text,
'''  AdminPartnerPermissionSet,\n  PartnerSchedulingMode,''',
'''  AdminPartnerPermissionSet,\n  AdminPartnerLocationOption,\n  PartnerSchedulingMode,''',
'partner admin import')
text = replace_once(text,
'''type Props = { partners: AdminPartner[]; capabilities: AdminCapability[] };''',
'''type Props = { partners: AdminPartner[]; capabilities: AdminCapability[]; locations: AdminPartnerLocationOption[] };''',
'partner admin props')
text = replace_once(text,
'''  schedulingMode: PartnerSchedulingMode;\n  standardHours: PartnerStandardHours;''',
'''  schedulingMode: PartnerSchedulingMode;\n  primaryLocationId: string;\n  standardHours: PartnerStandardHours;''',
'draft location')
text = replace_once(text,
'''  schedulingMode: "manager_scheduled",\n  standardHours:''',
'''  schedulingMode: "manager_scheduled",\n  primaryLocationId: "",\n  standardHours:''',
'blank location')
text = replace_once(text,
'''    schedulingMode: partner.schedulingMode,\n    standardHours:''',
'''    schedulingMode: partner.schedulingMode,\n    primaryLocationId: partner.primaryLocationId || "",\n    standardHours:''',
'from partner location')
text = replace_once(text,
'''export function PartnerAdmin({ partners, capabilities }: Props) {''',
'''export function PartnerAdmin({ partners, capabilities, locations }: Props) {''',
'partner admin signature')
text = replace_once(text,
'''              <div className="mt-2 text-xs font-bold text-slate-500">{modeLabel(partner.schedulingMode)}</div>''',
'''              <div className="mt-2 text-xs font-bold text-slate-500">{modeLabel(partner.schedulingMode)}{partner.primaryLocationName ? ` · ${partner.primaryLocationName}` : " · Location not set"}</div>''',
'partner directory location')
text = replace_once(text,
'''          <label className="mt-4 block"><div className="mb-1 text-xs font-black uppercase text-slate-500">Scheduling mode</div><select className={inputClass} value={draft.schedulingMode} onChange={(event) => setDraft((current) => ({ ...current, schedulingMode: event.target.value as PartnerSchedulingMode }))}><option value="manager_scheduled">Lot Logic can schedule directly</option><option value="partner_availability">Schedule within partner hours</option><option value="coordination_required">Coordination required — do not auto-book</option><option value="partner_self_scheduling">Partner schedules their own work</option></select></label>''',
'''          <div className="mt-4 grid gap-4 sm:grid-cols-2">\n            <label className="block"><div className="mb-1 text-xs font-black uppercase text-slate-500">Scheduling mode</div><select className={inputClass} value={draft.schedulingMode} onChange={(event) => setDraft((current) => ({ ...current, schedulingMode: event.target.value as PartnerSchedulingMode }))}><option value="manager_scheduled">Lot Logic can schedule directly</option><option value="partner_availability">Schedule within partner hours</option><option value="coordination_required">Coordination required — do not auto-book</option><option value="partner_self_scheduling">Partner schedules their own work</option></select></label>\n            <label className="block"><div className="mb-1 text-xs font-black uppercase text-slate-500">Preferred work location</div><select className={inputClass} value={draft.primaryLocationId} onChange={(event) => setDraft((current) => ({ ...current, primaryLocationId: event.target.value }))}><option value="">No default</option>{locations.map((location) => <option key={location.id} value={location.id}>{location.name}</option>)}</select><div className="mt-1 text-[11px] font-semibold text-slate-400">Lot Logic will prefill this location and choose the best matching bay/resource there. You can still override it per job.</div></label>\n          </div>''',
'scheduling preferred location selector')
path.write_text(text)

# ------------------------------------------------------------------
# 5) Admin Partners page passes locations
# ------------------------------------------------------------------
path = Path("app/admin/partners/page.tsx")
text = path.read_text()
text = replace_once(text,
'''<PartnerAdmin partners={data.partners} capabilities={data.capabilities} />''',
'''<PartnerAdmin partners={data.partners} capabilities={data.capabilities} locations={data.locations} />''',
'partner page locations')
path.write_text(text)

# ------------------------------------------------------------------
# 6) Partner API persists preferred work location in partner_locations
# ------------------------------------------------------------------
path = Path("app/api/admin/partners/route.ts")
text = path.read_text()
helper_anchor = '''async function validateCapabilityIds(\n  access: NonNullable<Awaited<ReturnType<typeof requireAdmin>>>,\n  capabilityIds: string[],\n) {'''
if helper_anchor not in text:
    raise SystemExit('PATCH STOPPED: capability validation helper anchor not found')
insert_at = text.index('export async function POST')
helper = '''async function validatePrimaryLocationId(\n  access: NonNullable<Awaited<ReturnType<typeof requireAdmin>>>,\n  value: unknown,\n) {\n  const locationId = String(value || "").trim();\n  if (!locationId) return { locationId: null as string | null, error: null as string | null };\n  const { data, error } = await access.supabase.from("mindful_inventory_locations").select("id").eq("id", locationId).eq("company_id", access.company.companyId).eq("active", true).maybeSingle();\n  if (error) return { locationId: null as string | null, error: error.message };\n  if (!data) return { locationId: null as string | null, error: "Selected preferred work location is not available for this company." };\n  return { locationId, error: null as string | null };\n}\n\nasync function savePrimaryLocation(access: NonNullable<Awaited<ReturnType<typeof requireAdmin>>>, partnerId: string, locationId: string | null) {\n  const { error: deleteError } = await access.supabase.from("mindful_inventory_partner_locations").delete().eq("partner_id", partnerId);\n  if (deleteError) throw new Error(deleteError.message);\n  if (!locationId) return;\n  const { error } = await access.supabase.from("mindful_inventory_partner_locations").insert({ partner_id: partnerId, location_id: locationId, is_primary: true, can_work_mobile: false });\n  if (error) throw new Error(error.message);\n}\n\n'''
text = text[:insert_at] + helper + text[insert_at:]
text = replace_once(text,
'''    const standardHours = normalizeStandardHours(body.standardHours);\n\n    const { data: partner, error }''',
'''    const standardHours = normalizeStandardHours(body.standardHours);\n    const locationValidation = await validatePrimaryLocationId(access, body.primaryLocationId);\n    if (locationValidation.error) return NextResponse.json({ error: locationValidation.error }, { status: 400 });\n\n    const { data: partner, error }''',
'POST location validation')
text = replace_once(text,
'''    const { error: permissionError } = await access.supabase.from("mindful_inventory_partner_permissions").insert({ partner_id: partner.id, ...permissions });''',
'''    await savePrimaryLocation(access, partner.id, locationValidation.locationId);\n\n    const { error: permissionError } = await access.supabase.from("mindful_inventory_partner_permissions").insert({ partner_id: partner.id, ...permissions });''',
'POST save location')
# PATCH has a second standardHours occurrence.
old = '''    const standardHours = normalizeStandardHours(body.standardHours);\n    const now = new Date().toISOString();'''
new = '''    const standardHours = normalizeStandardHours(body.standardHours);\n    const locationValidation = await validatePrimaryLocationId(access, body.primaryLocationId);\n    if (locationValidation.error) return NextResponse.json({ error: locationValidation.error }, { status: 400 });\n    const now = new Date().toISOString();'''
text = replace_once(text, old, new, 'PATCH location validation')
text = replace_once(text,
'''    const { error: deleteCapabilitiesError } = await access.supabase.from("mindful_inventory_partner_capability_assignments").delete().eq("partner_id", partnerId);''',
'''    await savePrimaryLocation(access, partnerId, locationValidation.locationId);\n\n    const { error: deleteCapabilitiesError } = await access.supabase.from("mindful_inventory_partner_capability_assignments").delete().eq("partner_id", partnerId);''',
'PATCH save location')
path.write_text(text)

print('✓ compressed vehicle shell')
print('✓ simplified Active Work hierarchy')
print('✓ readiness banner now only appears for exceptions')
print('✓ partner preferred work location added to admin')
print('✓ preferred location persists to partner defaults')
PY

# Type-check/build is more useful here than repo-wide lint, which has known unrelated failures.
npm run build

git add \
  components/mindful-inventory/inventory-vehicle-shell.tsx \
  components/mindful-inventory/inventory-active-work.tsx \
  components/admin/partner-admin.tsx \
  lib/admin/partners.ts \
  app/admin/partners/page.tsx \
  app/api/admin/partners/route.ts

git commit -m "Simplify active work and use partner location defaults"
git push origin v15-inventory-workflow

echo "✓ V15 Active Work + partner defaults committed and pushed"
