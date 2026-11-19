"use client";

import type { VinDecodeResult } from "@/types/vin";

function Detail({ label, value, confidence }: { label: string; value?: string | null; confidence?: "corroborated" | "single_source" | "conflict" | "unverified" }) {
  return (
    <div className="flex min-w-0 flex-col gap-0.5">
      <dt className="text-[10px] font-bold uppercase tracking-wide text-slate-500">{label}</dt>
      <dd className="break-words text-xs font-semibold text-slate-900">{value?.trim() || "Not established"}</dd>
      {confidence ? <span className={`text-[10px] font-semibold ${confidence === "conflict" ? "text-amber-800" : "text-slate-500"}`}>{confidence === "corroborated" ? "Both providers agree" : confidence === "single_source" ? "One provider" : confidence === "conflict" ? "Disputed" : "Unverified"}</span> : null}
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
  const confidenceFor = (field: "year" | "make" | "model" | "trim" | "engineCylinders" | "displacementL" | "fuelType" | "driveType" | "bodyClass") => evidence?.attributes?.[field]?.confidence;
  const disputed = evidence?.conflicts.map(field => ({field, values: evidence.attributes?.[field as keyof NonNullable<typeof evidence.attributes>]?.reported}));
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
          <Detail label="Year" value={decoded.year} confidence={confidenceFor("year")} />
          <Detail label="Make" value={decoded.make} confidence={confidenceFor("make")} />
          <Detail label="Model" value={decoded.model} confidence={confidenceFor("model")} />
          <Detail label="Retail trim" value={decoded.trim} confidence={confidenceFor("trim")} />
          <Detail label="Engine cylinders" value={decoded.engineCylinders} confidence={confidenceFor("engineCylinders")} />
          <Detail label="Engine displacement" value={decoded.displacementL ? decoded.displacementL + " L" : ""} confidence={confidenceFor("displacementL")} />
          <Detail label="Fuel / powertrain" value={decoded.fuelType} confidence={confidenceFor("fuelType")} />
          <Detail label="Drivetrain" value={decoded.driveType} confidence={confidenceFor("driveType")} />
          <Detail label="Body" value={decoded.bodyClass} confidence={confidenceFor("bodyClass")} />
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
              {evidence.providerHealth?.length ? (
                <div className="space-y-1 rounded-lg border border-slate-200 bg-white p-2">
                  <p className="font-semibold">Provider availability</p>
                  {evidence.providerHealth.map(provider => (
                    <p key={provider.provider} className={provider.status === "ok" ? "text-slate-700" : "text-amber-800"}>
                      <strong>{provider.provider === "nhtsa" ? "NHTSA" : "Auto.dev"}:</strong>{" "}
                      {provider.status === "ok" ? "Success"
                        : provider.status === "partial" ? "Partial answer"
                        : provider.status === "http_error" ? `Unavailable (HTTP ${provider.httpStatus})`
                        : provider.status === "timeout" ? "Timed out"
                        : provider.status === "not_configured" ? "Not configured"
                        : "Unavailable"}{" "}
                      · {Math.round(provider.durationMs).toLocaleString()} ms
                    </p>
                  ))}
                  {evidence.providerHealth.some(provider => provider.provider === "nhtsa" && provider.httpStatus === 403) ? (
                    <p className="text-[11px] text-amber-800">NHTSA refused this server request (403). Auto.dev fallback remains available; repeating a forbidden request is not expected to fix it.</p>
                  ) : null}
                </div>
              ) : null}
              {evidence.engineNote ? (
                <p className="text-[11px] text-amber-800">{evidence.engineNote}</p>
              ) : null}
              {evidence.ambiguousTrim ? (
                <p className="text-amber-800"><strong>Trim not confirmed.</strong> {evidence.possibleTrims.length
                  ? "Possible grades: " + evidence.possibleTrims.join(", ")
                  : "The decoder did not establish the retail grade."}</p>
              ) : null}
              {disputed?.length ? (
                <div className="space-y-1.5 rounded-lg border border-amber-200 bg-amber-50 p-2 text-amber-900">
                  <p className="font-bold">Provider disagreements</p>
                  {disputed.map(({field, values}) => (
                    <div key={field} className="space-y-0.5">
                      <p className="font-semibold">{field}</p>
                      <p>NHTSA: {values?.nhtsa || "Not reported"}</p>
                      <p>Auto.dev: {values?.auto_dev || "Not reported"}</p>
                    </div>
                  ))}
                  <p className="text-[11px]">Disputed values are not used as verified exact-match attributes.</p>
                </div>
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
