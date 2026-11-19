"use client";

import type { VinDecodeResult } from "@/types/vin";

function Detail({ label, value }: { label: string; value?: string | null }) {
  return (
    <div className="flex min-w-0 flex-col gap-0.5">
      <dt className="text-[10px] font-bold uppercase tracking-wide text-slate-500">{label}</dt>
      <dd className="break-words text-xs font-semibold text-slate-900">{value?.trim() || "Not established"}</dd>
    </div>
  );
}

/**
 * Only displays identity evidence returned for the current VIN.
 * A VIN change must never display identity attributes from the previous car.
 * Native details/summary gives disclosure without additional requests or JS state.
 */
export function VinIdentificationDetails({
  decoded,
  vin,
}: {
  decoded?: VinDecodeResult | null;
  vin: string;
}) {
  const vinMatches = decoded?.vin?.trim().toUpperCase() === vin.trim().toUpperCase();
  if (!vinMatches || !decoded) return null;

  const evidence = decoded.identityEvidence;
  const sourceNames = evidence?.sources.map(source => source === "auto_dev" ? "Auto.dev" : "NHTSA");
  const statusText = evidence
    ? evidence.confidence === "conflict"
      ? "Conflicting attributes"
      : evidence.confidence === "high"
        ? "High confidence"
        : "Partially verified"
    : "Source confidence unavailable";

  return (
    <details className="group rounded-xl border border-slate-200 bg-slate-50/90">
      <summary className="flex cursor-pointer list-none items-center justify-between gap-3 px-3 py-3 text-xs font-bold text-blue-700 marker:hidden [&::-webkit-details-marker]:hidden">
        <span>Vehicle identification details</span>
        <span className="flex shrink-0 items-center gap-2 text-[11px] font-semibold text-slate-600">
          <span>{statusText}</span>
          <span aria-hidden="true" className="transition-transform group-open:rotate-180">⌄</span>
        </span>
      </summary>
      <div className="space-y-3 border-t border-slate-200 px-3 py-3">
        <dl className="grid grid-cols-2 gap-x-4 gap-y-3">
          <Detail label="Year" value={decoded.year} />
          <Detail label="Make" value={decoded.make} />
          <Detail label="Model" value={decoded.model} />
          <Detail label="Retail trim" value={decoded.trim} />
          <Detail label="Engine cylinders" value={decoded.engineCylinders} />
          <Detail label="Engine displacement" value={decoded.displacementL ? decoded.displacementL + " L" : ""} />
          <Detail label="Fuel / powertrain" value={decoded.fuelType} />
          <Detail label="Drivetrain" value={decoded.driveType} />
          <Detail label="Body" value={decoded.bodyClass} />
          <Detail label="Doors" value={decoded.doors} />
        </dl>
        <div className="border-t border-slate-200 pt-3">
          <p className="text-[10px] font-bold uppercase tracking-wide text-slate-500">Decoder evidence</p>
          {evidence ? (
            <div className="mt-1 space-y-1.5 text-xs text-slate-700">
              <p><strong>Sources:</strong> {sourceNames?.length ? sourceNames.join(" + ") : "Not reported"}</p>
              <p><strong>Confidence:</strong> {statusText}</p>
              <p><strong>Decode time:</strong> {Number.isFinite(evidence.durationMs) ? Math.round(evidence.durationMs).toLocaleString() + " ms" : "Not reported"}
                {evidence.cache === "hit" ? " (cached)" : ""}</p>
              {evidence.ambiguousTrim ? (
                <p className="text-amber-800"><strong>Trim not confirmed.</strong> {evidence.possibleTrims.length
                  ? "Possible grades: " + evidence.possibleTrims.join(", ")
                  : "The decoder did not establish the retail grade."}</p>
              ) : null}
              {evidence.conflicts.length ? (
                <p className="text-amber-800"><strong>Disputed attributes:</strong> {evidence.conflicts.join(", ")}. Do not rely on these for exact-match pricing.</p>
              ) : null}
            </div>
          ) : (
            <p className="mt-1 text-xs text-slate-600">This evaluation does not contain provider provenance or timing data. Decode the VIN again to refresh it.</p>
          )}
          <p className="mt-2 text-[11px] leading-4 text-slate-500">A VIN may identify the model and engine without establishing the exact retail trim. Unverified fields are not proof of an exact configuration match.</p>
        </div>
      </div>
    </details>
  );
}
