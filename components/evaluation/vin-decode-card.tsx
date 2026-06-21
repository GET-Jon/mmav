"use client";

import type { VinDecodeResult } from "@/types/vin";

type AppliedVehicleProfile = {
  profile: string;
  ruleName: string;
  source: string;
  reason: string;
};

function FieldRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-start justify-between gap-4 border-b border-slate-100 py-2 last:border-0">
      <span className="text-xs font-semibold uppercase tracking-wide text-slate-500">
        {label}
      </span>
      <span className="text-right text-sm font-semibold text-slate-900">
        {value || "—"}
      </span>
    </div>
  );
}

export function VinDecodeCard({
  decoded,
  appliedVehicleProfile,
  onReapplyVehicleProfile,
}: {
  decoded?: VinDecodeResult | null;
  appliedVehicleProfile?: AppliedVehicleProfile | null;
  onReapplyVehicleProfile?: () => void;
}) {
  return (
    <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
      <div className="mb-4 flex items-start justify-between gap-4">
        <div>
          <h2 className="text-base font-bold text-slate-950">
            2. Decoded Vehicle
          </h2>
          <p className="mt-1 text-xs text-slate-500">
            Decode a VIN from Vehicle Basics to populate this section.
          </p>
        </div>
      </div>

      {!decoded ? (
        <div className="rounded-xl border border-dashed border-slate-300 bg-slate-50 px-4 py-8 text-center">
          <p className="text-sm font-semibold text-slate-700">
            No vehicle decoded yet.
          </p>
          <p className="mt-1 text-xs text-slate-500">
            Enter a VIN in Section 1 and click Decode.
          </p>
        </div>
      ) : (
        <>
          <div className="space-y-1">
            <FieldRow label="VIN" value={decoded.vin} />
            <FieldRow label="Year" value={decoded.year} />
            <FieldRow label="Make" value={decoded.make} />
            <FieldRow label="Model" value={decoded.model} />
            <FieldRow label="Trim" value={decoded.trim} />
            <FieldRow label="Body" value={decoded.bodyClass} />
            <FieldRow label="Engine" value={decoded.engineCylinders} />
            <FieldRow label="Displacement" value={decoded.displacementL} />
            <FieldRow label="Drive" value={decoded.driveType} />
            <FieldRow label="Fuel" value={decoded.fuelType} />
            <FieldRow label="Plant" value={decoded.plantCountry} />
          </div>

          {appliedVehicleProfile ? (
            <div className="mt-4 rounded-xl border border-blue-100 bg-blue-50 px-3 py-3">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p className="text-xs font-bold uppercase tracking-wide text-blue-700">
                    Applied Vehicle Profile
                  </p>
                  <p className="mt-1 text-sm font-bold text-slate-950">
                    {appliedVehicleProfile.profile}
                  </p>
                  <p className="mt-1 text-xs text-slate-600">
                    {appliedVehicleProfile.ruleName} ·{" "}
                    {appliedVehicleProfile.source}
                  </p>
                  <p className="mt-1 text-xs text-slate-500">
                    {appliedVehicleProfile.reason}
                  </p>
                </div>

                {onReapplyVehicleProfile ? (
                  <button
                    type="button"
                    onClick={onReapplyVehicleProfile}
                    className="shrink-0 rounded-lg bg-blue-700 px-3 py-2 text-xs font-bold text-white"
                  >
                    Reapply
                  </button>
                ) : null}
              </div>
            </div>
          ) : null}
        </>
      )}
    </section>
  );
}
