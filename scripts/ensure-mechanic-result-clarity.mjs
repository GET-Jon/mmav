import { readFileSync, writeFileSync } from "node:fs";

function updateFile(path, transform, message) {
  const source = readFileSync(path, "utf8");
  const updated = transform(source);
  if (updated !== source) {
    writeFileSync(path, updated, "utf8");
    console.log(message);
  } else {
    console.log(`${path} already clear or no matching legacy markup found.`);
  }
}

updateFile(
  "components/mindful-inventory/mechanical-owner-finding-review.tsx",
  (input) => {
    let source = input;

    source = source.replace(
      'function sourceLabel(source: string) {\n  return source.toLowerCase() === "ai"\n    ? "AI finding"\n    : source.replaceAll("_", " ");\n}',
      'function sourceLabel(source: string) {\n  return source.toLowerCase() === "ai"\n    ? "Originally flagged by AI"\n    : `Originally flagged by ${source.replaceAll("_", " ")}`;\n}',
    );

    const oldOrigin = `<div className="mt-2 text-[10px] font-bold text-slate-400">\n              {sourceLabel(finding.source)}\n              {finding.mechanicalValidationStatus\n                ? \` · \${finding.mechanicalValidationStatus.replaceAll("_", " ")}\`\n                : ""}\n            </div>`;
    const newOrigin = `<div className="mt-2 text-[10px] font-bold uppercase tracking-[0.06em] text-slate-400">\n              {sourceLabel(finding.source)}\n            </div>\n            {finding.mechanicalValidationStatus === "not_found" ? (\n              <div className="mt-3 flex items-center gap-3 rounded-xl border-2 border-emerald-300 bg-emerald-50 px-4 py-3">\n                <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-emerald-600 text-xl font-black text-white">✓</div>\n                <div>\n                  <div className="text-xs font-black uppercase tracking-[0.08em] text-emerald-800">Mechanic result — Not found</div>\n                  <div className="mt-0.5 text-sm font-bold text-emerald-950">The inspector did not find this condition during the mechanical inspection.</div>\n                </div>\n              </div>\n            ) : finding.mechanicalValidationStatus ? (\n              <div className="mt-2 inline-flex rounded-full bg-slate-100 px-3 py-1 text-[10px] font-black uppercase tracking-[0.06em] text-slate-600">\n                Mechanic result: {finding.mechanicalValidationStatus.replaceAll("_", " ")}\n              </div>\n            ) : null}`;
    if (source.includes(oldOrigin)) source = source.replace(oldOrigin, newOrigin);

    source = source.replace(
      '{needsDifferentPartner ? "Approve & Route" : "Accept Finding"}',
      '{finding.mechanicalValidationStatus === "not_found" ? "Accept Inspector Result" : needsDifferentPartner ? "Approve & Route" : "Accept Finding"}',
    );

    return source;
  },
  "Clarified finding origin versus mechanic result in Owner Review.",
);

updateFile(
  "components/partner/partner-inspection-list.tsx",
  (input) => {
    let source = input;
    const old = '{finding.description ? <div className="mt-1 text-sm text-slate-600">{finding.description}</div> : null}<div className="mt-3 flex flex-wrap gap-2">';
    const replacement = '{finding.description ? <div className="mt-1 text-sm text-slate-600">{finding.description}</div> : null}{reviewed && finding.validationStatus === "not_found" ? <div className="mt-3 flex items-center gap-3 rounded-xl border-2 border-emerald-300 bg-emerald-50 px-4 py-3"><div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-emerald-600 text-lg font-black text-white">✓</div><div><div className="text-xs font-black uppercase tracking-[0.08em] text-emerald-800">Inspector result — Not found</div><div className="mt-0.5 text-xs font-bold text-emerald-950">No defect found during inspection.</div></div></div> : null}<div className="mt-3 flex flex-wrap gap-2">';
    if (source.includes(old)) source = source.replace(old, replacement);

    source = source.replace(
      'className={`rounded-full px-2.5 py-1 text-[10px] font-black uppercase ${dispositionTone(finding.validationStatus)}`}',
      'className={`rounded-full px-3 py-1.5 text-xs font-black uppercase ${dispositionTone(finding.validationStatus)}`}',
    );

    return source;
  },
  "Made reviewed Not Found results prominent on the mechanic inspection screen.",
);
