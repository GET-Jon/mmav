"use client";

import { useRef, useState } from "react";

type Props = { onConfirm: (vin: string) => void; disabled?: boolean };
const VALID_VIN = /^[A-HJ-NPR-Z0-9]{17}$/;

export function VinPhotoCapture({ onConfirm, disabled = false }: Props) {
  const cameraRef = useRef<HTMLInputElement>(null);
  const uploadRef = useRef<HTMLInputElement>(null);
  const [proposed, setProposed] = useState("");
  const [photoName, setPhotoName] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  async function analyze(file?: File) {
    if (!file) return;
    setError("");
    setProposed("");
    setPhotoName("");
    if (!["image/jpeg", "image/png", "image/webp", "image/heic", "image/heif"].includes(file.type)) {
      setError("Choose a JPEG, PNG, WebP, or HEIC photo.");
      return;
    }
    if (file.size > 5 * 1024 * 1024) {
      setError("Image must be 5 MB or smaller. Try a cropped photo.");
      return;
    }
    setBusy(true);
    try {
      const form = new FormData();
      form.append("image", file);
      const response = await fetch("/api/vin/photo", { method: "POST", body: form });
      const data = await response.json() as { vin?: string; error?: string };
      if (!response.ok || !data.vin) throw new Error(data.error || "VIN could not be read.");
      setProposed(data.vin);
      setPhotoName(file.name);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Could not read VIN image.");
    } finally {
      setBusy(false);
      if (cameraRef.current) cameraRef.current.value = "";
      if (uploadRef.current) uploadRef.current.value = "";
    }
  }

  const normalized = proposed.toUpperCase().replace(/[\s-]/g, "");
  const valid = VALID_VIN.test(normalized);

  return (
    <div className="mt-3 space-y-3 rounded-xl border border-slate-200 bg-slate-50 p-3">
      <div className="flex flex-wrap gap-2">
        <button type="button" disabled={busy || disabled} onClick={() => cameraRef.current?.click()} className="rounded-lg bg-slate-900 px-3 py-2 text-xs font-bold text-white disabled:opacity-50">
          {busy ? "Reading photo…" : "Take VIN Photo"}
        </button>
        <button type="button" disabled={busy || disabled} onClick={() => uploadRef.current?.click()} className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-xs font-bold text-slate-800 disabled:opacity-50">
          Upload VIN Photo
        </button>
      </div>
      <input ref={cameraRef} type="file" accept="image/*" capture="environment" className="hidden" aria-label="Take VIN photograph" onChange={(event) => void analyze(event.target.files?.[0])} />
      <input ref={uploadRef} type="file" accept="image/jpeg,image/png,image/webp,image/heic,image/heif" className="hidden" aria-label="Upload VIN photograph" onChange={(event) => void analyze(event.target.files?.[0])} />
      <p className="text-xs text-slate-500">Photograph the VIN plate or door label clearly. The photo is analyzed for this scan only and is not saved to your evaluation.</p>
      {error && <p role="alert" className="text-xs font-semibold text-red-700">{error}</p>}
      {photoName && (
        <div className="space-y-2 rounded-lg border border-blue-200 bg-white p-3">
          <label className="block text-xs font-bold text-slate-700" htmlFor="scanned-vin">Review VIN from photo — correct any characters</label>
          <input id="scanned-vin" autoComplete="off" maxLength={17} value={proposed} onChange={(event) => setProposed(event.target.value.toUpperCase().replace(/[^A-Z0-9]/g, ""))} className="w-full rounded-lg border border-slate-300 px-3 py-2 font-mono text-sm tracking-wide text-slate-900" />
          {!valid && <p className="text-xs text-amber-700">A VIN must contain 17 characters and cannot contain I, O, or Q.</p>}
          <button type="button" disabled={!valid || disabled} onClick={() => { onConfirm(normalized); setPhotoName(""); setProposed(""); }} className="rounded-lg bg-blue-700 px-3 py-2 text-xs font-bold text-white disabled:opacity-50">Use This VIN</button>
        </div>
      )}
    </div>
  );
}
