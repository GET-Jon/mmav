"use client";

import type { VinDecodeResult } from "@/types/vin";

const initialDecoded: VinDecodeResult = {
  vin: "WA1LAAF78LD012345",
  status: "Example VIN",
  year: "2020",
  make: "Audi",
  model: "Q7",
  trim: "Premium Plus",
  bodyClass: "Sport Utility Vehicle",
  engineCylinders: "6",
  displacementL: "3.0",
  driveType: "AWD/All-Wheel Drive",
  fuelType: "Gasoline",
  plantCountry: "Slovakia",
};

type AppliedVehicleProfile = {
  profile: string;
  ruleName: string;
  source: string;
  reason: string;
};

function FieldRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between gap-4">
      <span className="text-slate-500">{label}</span>
      <span className="text-right font-semibold">{value || "—"}</span>
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
  const displayDecoded = decoded || initialDecoded;

  const statusTone =
    displayDecoded.status === "Decoded"
      ? "bg-emerald-100 text-emerald-700"
      : "bg-amber-100 text-amber-700";

  return (
    <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
      <div className="mb-4 flex items-center justify-between gap-4">
        <h2 className="text-base font-bold text-slate-950">2. Decoded Vehicle</h2>
        <span className={`rounded-full px-2 py-1 text-xs font-bold ${statusTone}`}>
          {displayDecoded.status}
        </span>
      </div>

      <div className="space-y-2 text-sm">
        <FieldRow label="Year" value={displayDecoded.year} />
        <FieldRow label="Make" value={displayDecoded.make} />
        <FieldRow label="Model" value={displayDecoded.model} />
        <FieldRow label="Trim" value={displayDecoded.trim} />
        <FieldRow label="Body Class" value={displayDecoded.bodyClass} />
        <FieldRow label="Drivetrain" value={displayDecoded.driveType} />
        <FieldRow label="Fuel" value={displayDecoded.fuelType} />
        <FieldRow
          label="Engine"
          value={
            displayDecoded.displacementL || displayDecoded.engineCylinders
              ? `${displayDecoded.displacementL || "?"}L ${
                  displayDecoded.engineCylinders
                    ? `${displayDecoded.engineCylinders} cyl`
                    : ""
                }`
              : ""
          }
        />
        <FieldRow label="Plant Country" value={displayDecoded.plantCountry} />
      </div>

      {appliedVehicleProfile ? (
        <div
          data-vin-profile-footer
          className="mt-5 rounded-xl border border-slate-200 bg-slate-50 px-4 py-3"
        >
          <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
            <div className="min-w-0">
              <p className="text-xs font-bold uppercase tracking-[0.14em] text-slate-400">
                Applied Profile
              </p>
              <p className="mt-1 text-sm font-bold text-slate-900">
                {appliedVehicleProfile.profile}
                <span className="ml-2 font-medium text-slate-500">
                  · {appliedVehicleProfile.reason}
                </span>
              </p>
            </div>

            {onReapplyVehicleProfile ? (
              <button
                type="button"
                onClick={onReapplyVehicleProfile}
                className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs font-bold text-slate-700 shadow-sm transition hover:bg-slate-100"
              >
                Reapply
              </button>
            ) : null}
          </div>
        </div>
      ) : null}
    </section>
  );
}
