import { readFileSync, writeFileSync } from "node:fs";

function updateFile(path, transform) {
  const source = readFileSync(path, "utf8");
  const updated = transform(source);
  if (updated !== source) {
    writeFileSync(path, updated, "utf8");
    return true;
  }
  return false;
}

const overviewPath = "components/mindful-inventory/inventory-overview-intake.tsx";
const overviewChanged = updateFile(overviewPath, (source) => {
  let updated = source;

  updated = updated.replace(
    `              <div className="mt-1 inline-flex min-w-0 items-center">\n                <div className="relative inline-flex min-w-0 items-center">\n                  <select aria-label="Title status" className="appearance-none bg-transparent pr-5 text-base font-black text-slate-950 outline-none" value={titleStatus} onChange={(e) => setTitleStatus(e.target.value as InventoryTitleStatus)}>\n                    <option value="unknown">Unknown</option>\n                    <option value="awaiting">Awaiting Title</option>\n                    <option value="received">Received</option>\n                    <option value="issue">Issue</option>\n                    <option value="not_applicable">Not Applicable</option>\n                  </select>\n                  <span aria-hidden="true" className="pointer-events-none absolute right-0 top-1/2 -translate-y-1/2 text-[10px] font-black text-slate-700">▼</span>\n                </div>\n              </div>\n              {titleStatus === "unknown" ? <div className="mt-2 max-w-[180px] text-[11px] font-bold leading-4 text-amber-800">Next step · Set the current title status.</div> : null}`,
    `              <div className="mt-1 flex min-h-9 items-center pr-12">\n                <select aria-label="Title status" className="w-auto max-w-full bg-transparent pr-1 text-base font-black text-slate-950 outline-none" value={titleStatus} onChange={(e) => setTitleStatus(e.target.value as InventoryTitleStatus)}>\n                  <option value="unknown">Unknown</option>\n                  <option value="awaiting">Awaiting Title</option>\n                  <option value="received">Received</option>\n                  <option value="issue">Issue</option>\n                  <option value="not_applicable">Not Applicable</option>\n                </select>\n              </div>`,
  );

  return updated;
});

const guidePath = "components/mindful-inventory/inventory-intake-guide-v2.tsx";
const guideChanged = updateFile(guidePath, (source) => {
  let updated = source;

  updated = updated.replace(
    `      if (titleSelect) {\n        titleSelect.style.appearance = "none";\n        titleSelect.style.paddingRight = "4.5rem";\n      }`,
    `      if (titleSelect) {\n        titleSelect.style.appearance = "auto";\n        titleSelect.style.paddingRight = "0.25rem";\n      }`,
  );

  updated = updated.replace(
    `        return createPortal(\n          <>\n            <span\n              aria-hidden="true"\n              className="pointer-events-none absolute right-11 top-2 z-10 grid h-7 w-7 place-items-center text-base font-black text-slate-700"\n            >\n              ▾\n            </span>\n            <button\n              type="button"\n              title={confirmed ? "Confirmed — click to edit" : active ? "Confirm this status" : "Confirm prior item first"}\n              onClick={() => void confirmTitle()}\n              disabled={savingField === "title_status" || (!confirmed && !active)}\n              className={\`absolute right-2 top-2 z-10 grid h-7 w-7 place-items-center rounded-full text-xs font-black transition \${\n                confirmed\n                  ? "bg-emerald-600 text-white"\n                  : active\n                    ? "border-2 border-emerald-500 bg-white text-emerald-700"\n                    : "border border-slate-200 bg-white text-slate-300"\n              }\`}\n            >\n              {confirmed ? "✓" : "→"}\n            </button>\n          </>,\n          titleCard,\n        );`,
    `        return createPortal(\n          <button\n            type="button"\n            title={confirmed ? "Confirmed — click to edit" : active ? "Confirm this status" : "Confirm prior item first"}\n            onClick={() => void confirmTitle()}\n            disabled={savingField === "title_status" || (!confirmed && !active)}\n            className={\`absolute right-3 top-1/2 z-10 grid h-8 w-8 -translate-y-1/2 place-items-center rounded-full text-xs font-black transition \${\n              confirmed\n                ? "bg-emerald-600 text-white"\n                : active\n                  ? "border-2 border-emerald-500 bg-white text-emerald-700"\n                  : "border border-slate-200 bg-white text-slate-300"\n            }\`}\n          >\n            {confirmed ? "✓" : "→"}\n          </button>,\n          titleCard,\n        );`,
  );

  return updated;
});

if (overviewChanged) console.log("Simplified Title Status next-action card.");
if (guideChanged) console.log("Aligned Title Status dropdown and confirmation control.");
