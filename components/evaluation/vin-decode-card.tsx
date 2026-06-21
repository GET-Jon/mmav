"use client";

import { useState } from "react";
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
  vin,
  onVinChange,
  onDecoded,
  appliedVehicleProfile,
  onReapplyVehicleProfile,
}: {
  vin: string;
  onVinChange: (vin: string) => void;
  onDecoded?: (decoded: VinDecodeResult) => void;
  appliedVehicleProfile?: AppliedVehicleProfile | null;
  onReapplyVehicleProfile?: () => void;
}) {
  const [decoded, setDecoded] = useState<VinDecodeResult>(initialDecoded);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  async function decodeVin() {
    setLoading(true);
    setError("");

    try {
      const response = await fetch("/api/vin/decode", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          vin,
        }),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || "VIN decode failed.");
      }

      setDecoded(data);
      onDecoded?.(data);
    } catch (decodeError) {
      setError(
        decodeError instanceof Error
          ? decodeError.message
          : "VIN decode failed."
      );
    } finally {
      setLoading(false);
    }
  }

  const statusTone = decoded.status === "Decoded"
    ? "bg-emerald-100 text-emerald-700"
    : "bg-amber-100 text-amber-700";

  return (
    <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
      <div className="mb-4 flex items-center justify-between gap-4">
        <h2 className="text-base font-bold text-slate-950">2. VIN Decode</h2>
        <span className={`rounded-full px-2 py-1 text-xs font-bold ${statusTone}`}>
          {decoded.status}
        </span>
      </div>

      <div className="mb-4 space-y-2">
        <label className="block">
          <div className="mb-1 text-xs font-semibold uppercase tracking-wide text-slate-500">
            VIN
          </div>
          <input
            value={vin}
            onChange={(event) => onVinChange(event.target.value.toUpperCase())}
            className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm font-semibold text-slate-900 shadow-sm outline-none"
          />
        </label>

        <button
          onClick={decodeVin}
          disabled={loading}
          className="w-full rounded-xl bg-blue-700 px-4 py-2 text-sm font-semibold text-white shadow-sm disabled:cursor-not-allowed disabled:bg-slate-400"
        >
          {loading ? "Decoding..." : "Decode VIN"}
        </button>

        {error ? (
          <div className="rounded-xl bg-red-50 px-3 py-2 text-sm font-semibold text-red-700">
            {error}
          </div>
        ) : null}
      </div>

      <div className="space-y-2 text-sm">
        <FieldRow label="Year" value={decoded.year} />
        <FieldRow label="Make" value={decoded.make} />
        <FieldRow label="Model" value={decoded.model} />
        <FieldRow label="Trim" value={decoded.trim} />
        <FieldRow label="Body Class" value={decoded.bodyClass} />
        <FieldRow label="Drivetrain" value={decoded.driveType} />
        <FieldRow label="Fuel" value={decoded.fuelType} />
        <FieldRow
          label="Engine"
          value={
            decoded.displacementL || decoded.engineCylinders
              ? `${decoded.displacementL || "?"}L ${
                  decoded.engineCylinders
                    ? `${decoded.engineCylinders} cyl`
                    : ""
                }`
              : ""
          }
        />
        <FieldRow label="Plant Country" value={decoded.plantCountry} />
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
