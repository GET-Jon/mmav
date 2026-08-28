#!/usr/bin/env bash
set -euo pipefail

cd "$(git rev-parse --show-toplevel)"

python - <<'PY'
from pathlib import Path

# 1) Partner notes become a secondary signal in assignment scoring.
p = Path('lib/mindful-inventory/performers.ts')
s = p.read_text()
repls = [
('''  capabilityCodes: string[];\n  capabilityNames: string[];\n};''', '''  capabilityCodes: string[];\n  capabilityNames: string[];\n  notes: string | null;\n};'''),
('''.select("id,name,company_name")''', '''.select("id,name,company_name,notes")'''),
('''      capabilityCodes: partnerCapabilities.map((item) => item.code),\n      capabilityNames: partnerCapabilities.map((item) => item.name),\n    };''', '''      capabilityCodes: partnerCapabilities.map((item) => item.code),\n      capabilityNames: partnerCapabilities.map((item) => item.name),\n      notes: partner.notes || null,\n    };'''),
('''      capabilityCodes: [],\n      capabilityNames: [],\n    }))''', '''      capabilityCodes: [],\n      capabilityNames: [],\n      notes: null,\n    }))'''),
('''  if (performer.capabilityCodes.some((code) => code.toLowerCase() === work.category.toLowerCase())) {\n    score += 8;\n  }\n\n  return score;''', '''  if (performer.capabilityCodes.some((code) => code.toLowerCase() === work.category.toLowerCase())) {\n    score += 8;\n  }\n\n  // Freeform partner notes are useful for niche specialties that do not yet\n  // deserve a reusable capability. Keep them a weaker signal than explicit\n  // capability assignments so prose cannot outweigh structured configuration.\n  if (performer.notes) {\n    const noteTokens = new Set(normalizedTokens(performer.notes));\n    let noteMatches = 0;\n    for (const token of workTokens) {\n      if (noteTokens.has(token)) noteMatches += 1;\n    }\n    score += Math.min(noteMatches, 6);\n  }\n\n  return score;'''),
]
for old, new in repls:
    if old not in s:
        raise SystemExit(f'performers.ts expected block not found:\n{old[:120]}')
    s = s.replace(old, new, 1)
p.write_text(s)

# 2) Partner admin UI: inline capability creation, and explain Notes usage.
p = Path('components/admin/partner-admin.tsx')
s = p.read_text()
old = '''  const [message, setMessage] = useState("");\n  const [filter, setFilter] = useState<"active" | "inactive" | "all">("active");'''
new = '''  const [message, setMessage] = useState("");\n  const [filter, setFilter] = useState<"active" | "inactive" | "all">("active");\n  const [newCapabilityName, setNewCapabilityName] = useState("");\n  const [addingCapability, setAddingCapability] = useState(false);'''
if old not in s: raise SystemExit('partner-admin state block not found')
s = s.replace(old, new, 1)

anchor = '''  async function remove(partner: AdminPartner) {'''
insert = '''  async function addCapability() {\n    const name = newCapabilityName.trim();\n    if (!name) return;\n    setAddingCapability(true);\n    setMessage("");\n    try {\n      const response = await fetch("/api/admin/capabilities", {\n        method: "POST",\n        headers: { "Content-Type": "application/json" },\n        body: JSON.stringify({ name }),\n      });\n      const payload = (await response.json()) as { id?: string; error?: string };\n      if (!response.ok) throw new Error(payload.error || "Failed to add capability.");\n      if (payload.id) {\n        setDraft((current) => ({ ...current, capabilityIds: current.capabilityIds.includes(payload.id!) ? current.capabilityIds : [...current.capabilityIds, payload.id!] }));\n      }\n      setNewCapabilityName("");\n      setMessage(`Capability “${name}” added.`);\n      router.refresh();\n    } catch (error) {\n      setMessage(error instanceof Error ? error.message : "Failed to add capability.");\n    } finally {\n      setAddingCapability(false);\n    }\n  }\n\n'''
if anchor not in s: raise SystemExit('partner-admin remove anchor not found')
s = s.replace(anchor, insert + anchor, 1)

old = '''            <label className="sm:col-span-2"><div className="mb-1 text-xs font-black uppercase text-slate-500">Notes</div><textarea className={`${inputClass} min-h-20 resize-y`} value={draft.notes} onChange={(event) => setDraft((current) => ({ ...current, notes: event.target.value }))} /></label>'''
new = '''            <label className="sm:col-span-2"><div className="mb-1 text-xs font-black uppercase text-slate-500">Notes / Specialties</div><textarea className={`${inputClass} min-h-20 resize-y`} value={draft.notes} onChange={(event) => setDraft((current) => ({ ...current, notes: event.target.value }))} placeholder="e.g. BMW diagnostics, coding, suspension, bolt-on performance, difficult electrical issues…" /><div className="mt-1 text-[11px] font-semibold text-slate-400">Lot Logic also reads these notes as a secondary matching signal for niche skills. Structured Capabilities remain the stronger signal.</div></label>'''
if old not in s: raise SystemExit('partner-admin notes field not found')
s = s.replace(old, new, 1)

old = '''        <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">\n          <h3 className="font-black text-slate-950">Capabilities</h3><p className="mt-1 text-sm text-slate-500">Lot Logic uses these to suggest the right partner / technician for a Work Order.</p>\n          <div className="mt-4 grid gap-2 sm:grid-cols-2 lg:grid-cols-3">{capabilities.filter((capability) => capability.active).map((capability) => <label key={capability.id} className="flex items-center gap-2 rounded-xl border border-slate-200 px-3 py-2.5 text-sm font-bold text-slate-700"><input type="checkbox" checked={draft.capabilityIds.includes(capability.id)} onChange={(event) => setDraft((current) => ({ ...current, capabilityIds: event.target.checked ? [...current.capabilityIds, capability.id] : current.capabilityIds.filter((id) => id !== capability.id) }))} />{capability.name}</label>)}</div>\n        </section>'''
new = '''        <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">\n          <div className="flex flex-col gap-1 sm:flex-row sm:items-start sm:justify-between">\n            <div><h3 className="font-black text-slate-950">Capabilities</h3><p className="mt-1 text-sm text-slate-500">Reusable specialties are the strongest signal Lot Logic uses to suggest the right partner / technician for a Work Order.</p></div>\n          </div>\n          <div className="mt-4 grid gap-2 sm:grid-cols-2 lg:grid-cols-3">{capabilities.filter((capability) => capability.active).map((capability) => <label key={capability.id} className="flex items-center gap-2 rounded-xl border border-slate-200 px-3 py-2.5 text-sm font-bold text-slate-700"><input type="checkbox" checked={draft.capabilityIds.includes(capability.id)} onChange={(event) => setDraft((current) => ({ ...current, capabilityIds: event.target.checked ? [...current.capabilityIds, capability.id] : current.capabilityIds.filter((id) => id !== capability.id) }))} />{capability.name}</label>)}</div>\n          <div className="mt-4 rounded-xl border border-dashed border-slate-300 bg-slate-50 p-3">\n            <div className="text-xs font-black uppercase tracking-[0.08em] text-slate-400">Add reusable capability</div>\n            <div className="mt-2 flex flex-col gap-2 sm:flex-row">\n              <input className={inputClass} value={newCapabilityName} onChange={(event) => setNewCapabilityName(event.target.value)} onKeyDown={(event) => { if (event.key === "Enter") { event.preventDefault(); void addCapability(); } }} placeholder="e.g. Performance Tuning" />\n              <button type="button" disabled={addingCapability || !newCapabilityName.trim()} onClick={() => void addCapability()} className="shrink-0 rounded-xl bg-slate-950 px-4 py-2.5 text-sm font-black text-white disabled:opacity-40">{addingCapability ? "Adding…" : "+ Add Capability"}</button>\n            </div>\n            <div className="mt-2 text-[11px] font-semibold text-slate-400">New capabilities become available to every partner and are selected for the current partner automatically.</div>\n          </div>\n        </section>'''
if old not in s: raise SystemExit('partner-admin capabilities block not found')
s = s.replace(old, new, 1)
p.write_text(s)

# 3) Add an admin-only endpoint for company-scoped capability creation.
route = Path('app/api/admin/capabilities/route.ts')
route.parent.mkdir(parents=True, exist_ok=True)
route.write_text('''import { NextResponse } from "next/server";\n\nimport { getMindfulInventoryAccess } from "@/lib/mindful-inventory/access";\n\nfunction capabilityCode(name: string) {\n  return name\n    .toLowerCase()\n    .trim()\n    .replace(/[^a-z0-9]+/g, "_")\n    .replace(/^_+|_+$/g, "")\n    .slice(0, 64);\n}\n\nexport async function POST(request: Request) {\n  try {\n    const access = await getMindfulInventoryAccess();\n    if (!access || access.company.role !== "company_admin") {\n      return NextResponse.json({ error: "Administrator access required." }, { status: 403 });\n    }\n\n    const body = await request.json().catch(() => ({}));\n    const name = String(body.name || "").trim();\n    if (!name) return NextResponse.json({ error: "Capability name is required." }, { status: 400 });\n    if (name.length > 80) return NextResponse.json({ error: "Capability name must be 80 characters or fewer." }, { status: 400 });\n\n    const code = capabilityCode(name);\n    if (!code) return NextResponse.json({ error: "Capability name must contain letters or numbers." }, { status: 400 });\n\n    const { data: existing, error: existingError } = await access.supabase\n      .from("mindful_inventory_partner_capabilities")\n      .select("id,name,active")\n      .eq("company_id", access.company.companyId)\n      .eq("code", code)\n      .maybeSingle();\n    if (existingError) return NextResponse.json({ error: existingError.message }, { status: 500 });\n\n    if (existing) {\n      if (!existing.active) {\n        const { error: reactivateError } = await access.supabase\n          .from("mindful_inventory_partner_capabilities")\n          .update({ active: true, name, updated_at: new Date().toISOString() })\n          .eq("id", existing.id);\n        if (reactivateError) return NextResponse.json({ error: reactivateError.message }, { status: 500 });\n      }\n      return NextResponse.json({ id: existing.id, reused: true });\n    }\n\n    const { data, error } = await access.supabase\n      .from("mindful_inventory_partner_capabilities")\n      .insert({ company_id: access.company.companyId, code, name, active: true })\n      .select("id")\n      .single();\n    if (error) return NextResponse.json({ error: error.message }, { status: 500 });\n\n    return NextResponse.json({ id: data.id }, { status: 201 });\n  } catch (error) {\n    return NextResponse.json({ error: error instanceof Error ? error.message : "Failed to create capability." }, { status: 500 });\n  }\n}\n''')
PY

# We intentionally don't make repo-wide lint a hard gate because V15 still has
# known unrelated lint debt. TypeScript/build remains the useful regression gate.
npm run build

git add lib/mindful-inventory/performers.ts components/admin/partner-admin.tsx app/api/admin/capabilities/route.ts
if git diff --cached --quiet; then
  echo "No capability changes to commit."
  exit 0
fi

git commit -m "Expand partner capabilities and specialty matching"
git push origin v15-inventory-workflow

echo "✓ Partner capabilities expanded and pushed."
