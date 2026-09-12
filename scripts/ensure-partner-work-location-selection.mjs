import { readFileSync, writeFileSync } from "node:fs";

function patchWorkLoader() {
  const path = "lib/partner-portal/work.ts";
  let source = readFileSync(path, "utf8");

  if (source.includes("availableLocations: Array<{")) {
    console.log("Partner Work loader already exposes saved locations.");
    return;
  }

  source = source.replace(
    "  locationName: string | null;",
    '  locationId: string | null;\n  locationName: string | null;\n  availableLocations: Array<{ id: string; name: string; address: string | null; locationType: string | null; }>;',
  );

  const workIdsAnchor = "  const workOrderIds = workOrders.map((row) => row.id);";
  if (!source.includes(workIdsAnchor)) {
    console.log("Partner saved locations loader skipped: work-order anchor not found.");
    return;
  }

  source = source.replace(
    workIdsAnchor,
    workIdsAnchor + `\n\n  const { data: availableLocationRows, error: availableLocationError } = await admin\n    .from("mindful_inventory_locations")\n    .select("id,name,address_line_1,address_line_2,city,state,postal_code,location_type")\n    .eq("company_id", access.partner.companyId)\n    .eq("active", true)\n    .order("name", { ascending: true });\n  if (availableLocationError) throw new Error(availableLocationError.message);\n  const availableLocations = (availableLocationRows ?? []).map((location) => ({\n    id: location.id,\n    name: location.name,\n    address: [location.address_line_1, location.address_line_2, location.city, location.state, location.postal_code].filter(Boolean).join(", ") || null,\n    locationType: location.location_type ?? null,\n  }));`,
  );

  source = source.replace(
    "        locationName: row.location_id ? locations.get(row.location_id) ?? null : null,",
    "        locationId: row.location_id ?? null,\n        locationName: row.location_id ? locations.get(row.location_id) ?? null : null,\n        availableLocations,",
  );

  writeFileSync(path, source, "utf8");
  console.log("Partner Work loader now exposes saved locations.");
}

function patchPartnerLocationUi() {
  const path = "components/partner/partner-work-list-v4.tsx";
  let source = readFileSync(path, "utf8");

  if (source.includes('data-partner-location-selection="saved-v2"')) {
    console.log("Partner saved-location selection already present.");
    return;
  }

  const stateAnchor = '  const [availabilityText, setAvailabilityText] = useState<Record<string, string>>({});';
  if (!source.includes(stateAnchor)) {
    console.log("Partner saved-location selection skipped: state anchor not found.");
    return;
  }
  source = source.replace(
    stateAnchor,
    stateAnchor + '\n  const [locationSelections, setLocationSelections] = useState<Record<string, string>>({});\n  const [newLocationDrafts, setNewLocationDrafts] = useState<Record<string, string>>({});',
  );

  source = source.replace(
    'async function updateLogistics(work: PartnerWorkItem, kind: LogisticsKind, action: "confirm" | "adjust") {',
    'async function updateLogistics(work: PartnerWorkItem, kind: LogisticsKind, action: "confirm" | "adjust" | "set") {',
  );

  source = source.replace(
    'setMessage((c) => ({ ...c, [work.id]: action === "confirm" ? `${kind === "parts" ? "Parts" : "Location"} confirmed.` : `${kind === "parts" ? "Parts" : "Location"} update sent.` }));',
    'setMessage((c) => ({ ...c, [work.id]: action === "set" ? "Work location saved." : action === "confirm" ? `${kind === "parts" ? "Parts" : "Location"} confirmed.` : `${kind === "parts" ? "Parts" : "Location"} update sent.` }));',
  );

  const helperAnchor = '  async function loadAvailability(work: PartnerWorkItem) {';
  if (!source.includes(helperAnchor)) {
    console.log("Partner saved-location selection skipped: helper anchor not found.");
    return;
  }
  const helper = [
    '  async function saveWorkLocation(work: PartnerWorkItem) {',
    '    const selected = locationSelections[work.id] ?? work.locationId ?? "";',
    '    const isNew = selected === "__new__";',
    '    const newLocation = isNew ? (newLocationDrafts[work.id] || "").trim() : null;',
    '    if ((!selected || selected === "__new__") && !newLocation) return;',
    '    setWorkingId(work.id);',
    '    setMessage((current) => ({ ...current, [work.id]: "" }));',
    '    try {',
    '      const response = await fetch(`/api/partner/work-orders/${work.id}/logistics`, {',
    '        method: "POST",',
    '        headers: { "Content-Type": "application/json" },',
    '        body: JSON.stringify({ kind: "location", action: "set", locationId: isNew ? null : selected, newLocation }),',
    '      });',
    '      const data = await payload(response);',
    '      if (!response.ok) throw new Error(String(data.error || "Could not save the work location."));',
    '      setEditingLogistics(null);',
    '      setMessage((current) => ({ ...current, [work.id]: isNew ? "New work location saved and noted for Owner review." : "Work location saved." }));',
    '      router.refresh();',
    '    } catch (error) {',
    '      setMessage((current) => ({ ...current, [work.id]: error instanceof Error ? error.message : "Could not save the work location." }));',
    '    } finally {',
    '      setWorkingId(null);',
    '    }',
    '  }',
    '',
  ].join("\n");
  source = source.replace(helperAnchor, helper + helperAnchor);

  source = source.replace(
    'const locationConfirmed = work.partnerLocationConfirmationStatus === "confirmed";',
    'const effectiveLocation = work.partnerLocationRequest || work.locationName;\n    const locationConfirmed = work.partnerLocationConfirmationStatus === "confirmed" && Boolean(effectiveLocation);',
  );
  source = source.replace(
    '!locationConfirmed ? "Confirm the work location" : !hasRequestedSchedule ?',
    '!locationConfirmed ? "Set the work location" : !hasRequestedSchedule ?',
  );

  const locationLabel = '>3 · Location</div>';
  const labelIndex = source.indexOf(locationLabel);
  if (labelIndex === -1) {
    console.log("Partner saved-location selection skipped: Location step not found.");
    return;
  }
  const locationStart = source.lastIndexOf('<div className="rounded-xl border border-slate-200 p-4">', labelIndex);
  const scheduleLabelIndex = source.indexOf('>4 · Schedule</div>', labelIndex);
  const scheduleStart = scheduleLabelIndex === -1 ? -1 : source.lastIndexOf('<div className={`rounded-xl border p-4', scheduleLabelIndex);
  if (locationStart === -1 || scheduleStart === -1 || scheduleStart <= locationStart) {
    console.log("Partner saved-location selection skipped: Location card boundaries not found.");
    return;
  }

  const locationCard = [
    '          <div data-partner-location-selection="saved-v2" className="rounded-xl border border-slate-200 p-4">',
    '            <div className="flex items-start justify-between gap-3">',
    '              <div>',
    '                <div className="text-[10px] font-black uppercase tracking-[0.1em] text-slate-400">3 · Location</div>',
    '                <div className="mt-1 text-sm font-black">{effectiveLocation || "Location not set"}</div>',
    '                <div className={`mt-1 text-xs font-bold ${locationConfirmed ? "text-emerald-700" : "text-amber-700"}`}>',
    '                  {locationConfirmed ? (work.partnerLocationRequest && !work.locationId ? "✓ Work location set · new location noted for Owner review" : "✓ Work location set") : "Choose where you will perform this work."}',
    '                </div>',
    '              </div>',
    '              <button type="button" onClick={() => setEditingLogistics(editingLogistics?.workId === work.id && editingLogistics.kind === "location" ? null : { workId: work.id, kind: "location" })} className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-xs font-black">{locationConfirmed ? "Change location" : "Set location"}</button>',
    '            </div>',
    '            {editingLogistics?.workId === work.id && editingLogistics.kind === "location" ? (() => {',
    '              const selectedLocation = locationSelections[work.id] ?? work.locationId ?? "";',
    '              const addingNewLocation = selectedLocation === "__new__";',
    '              return <div className="mt-3 border-t border-slate-200 pt-3">',
    '                <div className="text-xs font-bold text-slate-600">Where will you perform this work?</div>',
    '                <select value={selectedLocation} onChange={(event) => setLocationSelections((current) => ({ ...current, [work.id]: event.target.value }))} className="mt-2 w-full rounded-lg border border-slate-300 bg-white px-3 py-2.5 text-sm">',
    '                  <option value="">Choose a saved location…</option>',
    '                  {work.availableLocations.map((location) => <option key={location.id} value={location.id}>{location.name}{location.address ? ` — ${location.address}` : ""}</option>)}',
    '                  <option value="__new__">+ Add a new location</option>',
    '                </select>',
    '                {addingNewLocation ? <div className="mt-3 rounded-lg border border-amber-200 bg-amber-50 p-3">',
    '                  <div className="text-xs font-black text-amber-900">New location</div>',
    '                  <textarea rows={2} value={newLocationDrafts[work.id] || ""} onChange={(event) => setNewLocationDrafts((current) => ({ ...current, [work.id]: event.target.value }))} placeholder="Shop name and address, or a clear description of the location…" className="mt-2 w-full rounded-lg border border-amber-300 bg-white px-3 py-2 text-sm" />',
    '                  <div className="mt-2 text-[11px] font-semibold text-amber-800">You can use this location for this job now. Lot Logic will flag it for the Owner to review for addition to saved Locations.</div>',
    '                </div> : null}',
    '                <div className="mt-2 text-[11px] font-semibold text-slate-500">Saved locations are the preferred choice. Routine execution locations do not require separate Owner approval.</div>',
    '                <button disabled={workingId === work.id || (!selectedLocation || (addingNewLocation && !(newLocationDrafts[work.id] || "").trim()))} onClick={() => void saveWorkLocation(work)} className="mt-2 rounded-lg bg-slate-950 px-4 py-2 text-xs font-black text-white disabled:opacity-40">Save location</button>',
    '              </div>;',
    '            })() : null}',
    '          </div>',
    '',
  ].join("\n");

  source = source.slice(0, locationStart) + locationCard + source.slice(scheduleStart);
  writeFileSync(path, source, "utf8");
  console.log("Partner Work now prefers saved locations and allows Owner-noted new locations.");
}

patchWorkLoader();
patchPartnerLocationUi();
