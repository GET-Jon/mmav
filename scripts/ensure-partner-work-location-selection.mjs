import { readFileSync, writeFileSync } from "node:fs";

const path = "components/partner/partner-work-list-v4.tsx";
let source = readFileSync(path, "utf8");

if (source.includes('data-partner-location-selection="direct-v1"')) {
  console.log("Partner direct location selection already present.");
  process.exit(0);
}

source = source.replace(
  'async function updateLogistics(work: PartnerWorkItem, kind: LogisticsKind, action: "confirm" | "adjust") {',
  'async function updateLogistics(work: PartnerWorkItem, kind: LogisticsKind, action: "confirm" | "adjust" | "set") {',
);

source = source.replace(
  'setMessage((c) => ({ ...c, [work.id]: action === "confirm" ? `${kind === "parts" ? "Parts" : "Location"} confirmed.` : `${kind === "parts" ? "Parts" : "Location"} update sent.` }));',
  'setMessage((c) => ({ ...c, [work.id]: action === "set" ? "Work location saved." : action === "confirm" ? `${kind === "parts" ? "Parts" : "Location"} confirmed.` : `${kind === "parts" ? "Parts" : "Location"} update sent.` }));',
);

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
  console.log("Partner direct location selection skipped: Location step not found.");
  process.exit(0);
}
const locationStart = source.lastIndexOf('<div className="rounded-xl border border-slate-200 p-4">', labelIndex);
const scheduleLabelIndex = source.indexOf('>4 · Schedule</div>', labelIndex);
const scheduleStart = scheduleLabelIndex === -1 ? -1 : source.lastIndexOf('<div className={`rounded-xl border p-4', scheduleLabelIndex);
if (locationStart === -1 || scheduleStart === -1 || scheduleStart <= locationStart) {
  console.log("Partner direct location selection skipped: Location card boundaries not found.");
  process.exit(0);
}

const locationCard = [
  '          <div data-partner-location-selection="direct-v1" className="rounded-xl border border-slate-200 p-4">',
  '            <div className="flex items-start justify-between gap-3">',
  '              <div>',
  '                <div className="text-[10px] font-black uppercase tracking-[0.1em] text-slate-400">3 · Location</div>',
  '                <div className="mt-1 text-sm font-black">{effectiveLocation || "Location not set"}</div>',
  '                <div className={`mt-1 text-xs font-bold ${locationConfirmed ? "text-emerald-700" : "text-amber-700"}`}>',
  '                  {locationConfirmed ? "✓ Work location set" : work.locationName ? "Use this location or choose where you will perform the work." : "Tell Lot Logic where you will perform the work."}',
  '                </div>',
  '              </div>',
  '              <div className="flex flex-wrap justify-end gap-2">',
  '                {!locationConfirmed && work.locationName ? <button disabled={workingId === work.id} onClick={() => void updateLogistics(work, "location", "confirm")} className="rounded-lg bg-emerald-600 px-3 py-2 text-xs font-black text-white">Use this location</button> : null}',
  '                <button type="button" onClick={() => setEditingLogistics(editingLogistics?.workId === work.id && editingLogistics.kind === "location" ? null : { workId: work.id, kind: "location" })} className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-xs font-black">{locationConfirmed ? "Change location" : "Set location"}</button>',
  '              </div>',
  '            </div>',
  '            {editingLogistics?.workId === work.id && editingLogistics.kind === "location" ? <div className="mt-3 border-t border-slate-200 pt-3">',
  '              <div className="text-xs font-bold text-slate-600">Where will you perform this work?</div>',
  '              <textarea rows={2} value={notes[`${work.id}:location`] ?? effectiveLocation ?? ""} onChange={(e) => setNotes((c) => ({ ...c, [`${work.id}:location`]: e.target.value }))} placeholder="Shop name, address, or where the vehicle will be worked on…" className="mt-2 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm" />',
  '              <div className="mt-2 text-[11px] font-semibold text-slate-500">Routine execution locations do not need separate Owner approval.</div>',
  '              <button disabled={workingId === work.id || !(notes[`${work.id}:location`] ?? effectiveLocation ?? "").trim()} onClick={() => void updateLogistics(work, "location", "set")} className="mt-2 rounded-lg bg-slate-950 px-4 py-2 text-xs font-black text-white disabled:opacity-40">Save location</button>',
  '            </div> : null}',
  '          </div>',
  '',
].join("\n");

source = source.slice(0, locationStart) + locationCard + source.slice(scheduleStart);
writeFileSync(path, source, "utf8");
console.log("Partner Work now allows direct execution-location selection.");
