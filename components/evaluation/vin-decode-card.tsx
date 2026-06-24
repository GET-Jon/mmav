"use client";

import type { VinDecodeResult } from "@/types/vin";

type AppliedVehicleProfile = {
  profile: string;
  ruleName: string;
  source: string;
  reason: string;
};

type ManualVehicleBasics = {
  year: string;
  make: string;
  model: string;
  trim: string;
  bodyClass: string;
};

type ManualVehicleField = keyof ManualVehicleBasics;

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

function ManualField({
  label,
  value,
  placeholder,
  inputMode,
  onChange,
}: {
  label: string;
  value: string;
  placeholder?: string;
  inputMode?: "text" | "numeric";
  onChange: (value: string) => void;
}) {
  return (
    <label className="block">
      <div className="mb-1 text-xs font-semibold uppercase tracking-wide text-slate-500">
        {label}
      </div>
      <input
        type="text"
        inputMode={inputMode}
        value={value}
        onChange={(event) => onChange(event.target.value)}
        placeholder={placeholder}
        className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm font-semibold text-slate-900 shadow-sm outline-none"
      />
    </label>
  );
}

export function VinDecodeCard({
  decoded,
  manualVehicle,
  onManualVehicleChange,
  appliedVehicleProfile,
  onReapplyVehicleProfile,
}: {
  decoded?: VinDecodeResult | null;
  manualVehicle: ManualVehicleBasics;
  onManualVehicleChange: (key: ManualVehicleField, value: string) => void;
  appliedVehicleProfile?: AppliedVehicleProfile | null;
  onReapplyVehicleProfile?: () => void;
}) {
  return (
    <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
      <div className="mb-4 flex items-start justify-between gap-4">
        <div>
          <h2 className="text-base font-bold text-slate-950">
            2. Vehicle Identity
          </h2>
          <p className="mt-1 text-xs text-slate-500">
            Decode a VIN in Section 1 or enter vehicle details manually.
          </p>
        </div>

        {decoded ? (
          <span className="rounded-full bg-emerald-100 px-3 py-1 text-xs font-bold text-emerald-700">
            VIN decoded
          </span>
        ) : (
          <span className="rounded-full bg-slate-100 px-3 py-1 text-xs font-bold text-slate-600">
            Manual entry
          </span>
        )}
      </div>

      {!decoded ? (
        <div className="space-y-4">
          <div className="rounded-xl border border-blue-100 bg-blue-50 px-3 py-3">
            <p className="text-sm font-bold text-slate-950">
              No VIN decoded yet.
            </p>
            <p className="mt-1 text-xs text-slate-600">
              Enter at least year, make, and model to run a comp search. Trim is
              optional but improves match quality.
            </p>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <ManualField
              label="Year"
              value={manualVehicle.year}
              inputMode="numeric"
              placeholder="2020"
              onChange={(value) => onManualVehicleChange("year", value)}
            />

            <ManualField
              label="Make"
              value={manualVehicle.make}
              placeholder="BMW"
              onChange={(value) => onManualVehicleChange("make", value)}
            />

            <ManualField
              label="Model"
              value={manualVehicle.model}
              placeholder="X5"
              onChange={(value) => onManualVehicleChange("model", value)}
            />

            <ManualField
              label="Trim"
              value={manualVehicle.trim}
              placeholder="xDrive40i"
              onChange={(value) => onManualVehicleChange("trim", value)}
            />

            <div className="col-span-2">
              <ManualField
                label="Body"
                value={manualVehicle.bodyClass}
                placeholder="SUV / Sedan / Coupe"
                onChange={(value) =>
                  onManualVehicleChange("bodyClass", value)
                }
              />
            </div>
          </div>
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
