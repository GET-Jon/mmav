import { readFileSync, writeFileSync } from "node:fs";

function patch(path, transform, label) {
  let source = readFileSync(path, "utf8");
  const original = source;
  source = transform(source);
  if (source !== original) {
    writeFileSync(path, source, "utf8");
    console.log(`Aligned ${label}.`);
  } else {
    console.log(`${label} already aligned.`);
  }
}

patch("components/mindful-inventory/inventory-active-work-v6.tsx", (source) => {
  // Parts exceptions are unresolved operational state even if the original parts review was complete.
  source = source.replace(
    'function Step({ n, label, done, active, detail, selected, onClick }: { n: number; label: string; done: boolean; active: boolean; detail?: string; selected?: boolean; onClick?: () => void }) {',
    'function Step({ n, label, done, active, warning, detail, selected, onClick }: { n: number; label: string; done: boolean; active: boolean; warning?: boolean; detail?: string; selected?: boolean; onClick?: () => void }) {',
  );
  source = source.replace(
    '${done ? "bg-emerald-600 text-white" : active ? "bg-blue-700 text-white" : "bg-slate-100 text-slate-400"}">{done ? "✓" : n}',
    '${warning ? "!bg-amber-500 !text-white" : done ? "bg-emerald-600 text-white" : active ? "bg-blue-700 text-white" : "bg-slate-100 text-slate-400"}">{warning ? "!" : done ? "✓" : n}',
  );
  source = source.replace(
    '${done ? "text-emerald-800" : active ? "text-blue-800" : "text-slate-500"}',
    '${warning ? "!text-amber-900" : done ? "text-emerald-800" : active ? "text-blue-800" : "text-slate-500"}',
  );
  source = source.replace(
    '${onClick ? "cursor-pointer hover:border-blue-400 hover:shadow-sm" : ""}`;',
    '${warning ? "!border-amber-300 !bg-amber-50" : ""} ${onClick ? "cursor-pointer hover:border-blue-400 hover:shadow-sm" : ""}`;',
  );

  source = source.replaceAll(
    '<Step n={1} label="Parts" done={work.partsReviewComplete} active={partsActive}',
    '<Step n={1} label="Parts" done={work.partsReviewComplete && !["issue_reported", "reconfirmation_requested"].includes(work.partnerPartsConfirmationStatus || "")} active={partsActive} warning={["issue_reported", "reconfirmation_requested"].includes(work.partnerPartsConfirmationStatus || "")}',
  );

  // An issue should not auto-open a blank "Next setup step" shell. Tiles are the navigation.
  source = source.replaceAll('{!done && (issue || editing) ? <div className="mt-3 rounded-xl border border-blue-200 bg-blue-50/40 p-3">', '{!done && editing ? <div className="mt-3 rounded-xl border border-blue-200 bg-blue-50/40 p-3">');

  // When Parts is deliberately opened, describe the exception instead of claiming it is ready.
  source = source.replaceAll(
    '{work.partsReviewComplete ? (work.partsReadyForExecution ? "Parts resolved and ready." : partsPendingLabel(work)) : "Determine what is needed and resolve the source for every dependency."}',
    '{work.partnerPartsConfirmationStatus === "issue_reported" ? "Partner reported a parts issue. Open Manage Parts to review the conversation and resolve it." : work.partnerPartsConfirmationStatus === "reconfirmation_requested" ? "Parts were updated. Waiting for Partner reconfirmation." : work.partsReviewComplete ? (work.partsReadyForExecution ? "Parts resolved and ready." : partsPendingLabel(work)) : "Determine what is needed and resolve the source for every dependency."}',
  );
  return source;
}, "Owner Parts exception tile and editor state");

patch("components/mindful-inventory/work-order-parts-modal.tsx", (source) => {
  // Older lifecycle patchers may attempt to add their legacy imports to the newer managed-exception modal.
  const combinedUseStateImport = source.includes('import { useMemo, useState } from "react";');
  const lines = source.split("\n");
  let seenUseState = false;
  let seenRouter = false;
  source = lines.filter((line) => {
    if (line === 'import { useState } from "react";') {
      if (combinedUseStateImport || seenUseState) return false;
      seenUseState = true;
    }
    if (line === 'import { useRouter } from "next/navigation";') {
      if (seenRouter) return false;
      seenRouter = true;
    }
    return true;
  }).join("\n");
  return source;
}, "managed Parts issue modal imports");

patch("components/partner/partner-work-list-v4.tsx", (source) => {
  if (!source.includes('PartsIssueThread')) {
    source = source.replace(
      'import type { PartnerPortalPermissions } from "@/lib/partner-portal/access";',
      'import { PartsIssueThread } from "@/components/shared/parts-issue-thread";\nimport type { PartnerPortalPermissions } from "@/lib/partner-portal/access";',
    );
  }

  const locationAnchor = '\n\n          <div className="rounded-xl border border-slate-200 p-4"><div className="flex items-start justify-between gap-3"><div><div className="text-[10px] font-black uppercase tracking-[0.1em] text-slate-400">3 · Location</div>';
  const boundary = '</div>' + locationAnchor;
  if (!source.includes('/parts-issue`} compact />') && source.includes(boundary)) {
    source = source.replace(
      boundary,
      '{(partsIssueReported || partsReconfirmationRequested) ? <PartsIssueThread endpoint={`/api/partner/work-orders/${work.id}/parts-issue`} compact /> : null}</div>' + locationAnchor,
    );
  }
  return source;
}, "Partner Parts issue conversation");
