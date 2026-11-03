"use client";

import { useEffect, useId, useRef, useState } from "react";
import { createPortal } from "react-dom";

type Props = { onConfirm: (vin: string) => void; disabled?: boolean };
const VALID_VIN = /^[A-HJ-NPR-Z0-9]{17}$/;
const MIME_TYPES = ["image/jpeg", "image/png", "image/webp", "image/heic", "image/heif"];

export function VinPhotoCapture({ onConfirm, disabled = false }: Props) {
  const galleryRef = useRef<HTMLInputElement>(null);
  const fallbackCameraRef = useRef<HTMLInputElement>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const scanRequestRef = useRef<AbortController | null>(null);
  const id = useId();
  const [dialog, setDialog] = useState<"choice" | "camera" | "review" | null>(null);
  const [proposed, setProposed] = useState("");
  const [busy, setBusy] = useState(false);
  const [openingCamera, setOpeningCamera] = useState(false);
  const [error, setError] = useState("");
  const [facing, setFacing] = useState<"environment" | "user">("environment");

  function stopCamera() {
    streamRef.current?.getTracks().forEach((track) => track.stop());
    streamRef.current = null;
    if (videoRef.current) videoRef.current.srcObject = null;
  }
  function close() {
    scanRequestRef.current?.abort();
    scanRequestRef.current = null;
    stopCamera();
    setDialog(null);
    setError("");
    setProposed("");
    setBusy(false);
    setOpeningCamera(false);
  }

  useEffect(() => {
    return () => {
      streamRef.current?.getTracks().forEach((track) => track.stop());
      scanRequestRef.current?.abort();
    };
  }, []);

  useEffect(() => {
    if (dialog === "camera" && videoRef.current && streamRef.current) {
      videoRef.current.srcObject = streamRef.current;
      void videoRef.current.play().catch(() => {});
    }
  }, [dialog, openingCamera]);

  async function startCamera(nextFacing: "environment" | "user" = "environment") {
    setError("");
    stopCamera();
    setOpeningCamera(true);
    setFacing(nextFacing);
    if (!navigator.mediaDevices?.getUserMedia) {
      setOpeningCamera(false);
      fallbackCameraRef.current?.click();
      return;
    }
    try {
      // Prefer the rear camera explicitly, but support browsers without facingMode constraints.
      let stream: MediaStream;
      try {
        stream = await navigator.mediaDevices.getUserMedia({
          audio: false,
          video: { facingMode: { exact: nextFacing }, width: { ideal: 1920 }, height: { ideal: 1080 } },
        });
      } catch (firstError) {
        if (firstError instanceof DOMException && (firstError.name === "NotAllowedError" || firstError.name === "SecurityError")) throw firstError;
        stream = await navigator.mediaDevices.getUserMedia({
          audio: false, video: { facingMode: { ideal: nextFacing } },
        });
      }
      streamRef.current = stream;
      setDialog("camera");
    } catch {
      setDialog("choice");
      setError("Camera could not open. Check browser permissions or choose a photo from your gallery.");
    } finally {
      setOpeningCamera(false);
    }
  }

  async function takeSnapshot() {
    const video = videoRef.current;
    if (!video || !video.videoWidth || !video.videoHeight) {
      setError("Camera is still starting. Try again when the image appears.");
      return;
    }
    const canvas = document.createElement("canvas");
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    const ctx = canvas.getContext("2d");
    if (!ctx) { setError("Unable to capture the camera image."); return; }
    ctx.drawImage(video, 0, 0);
    const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, "image/jpeg", 0.88));
    if (!blob) { setError("Unable to capture the camera image."); return; }
    stopCamera();
    await analyze(new File([blob], "vin-camera.jpg", { type: "image/jpeg" }));
  }

  async function analyze(file?: File) {
    if (!file) return;
    setError("");
    setProposed("");
    setDialog("review");
    if (!MIME_TYPES.includes(file.type)) {
      setError("Choose a JPEG, PNG, WebP, or HEIC photo.");
      return;
    }
    if (file.size > 5 * 1024 * 1024) {
      setError("Image must be 5 MB or smaller. Try a cropped photo.");
      return;
    }
    setBusy(true);
    const controller = new AbortController();
    scanRequestRef.current = controller;
    try {
      const form = new FormData();
      form.append("image", file);
      const response = await fetch("/api/vin/photo", { method: "POST", body: form, signal: controller.signal });
      const data = await response.json() as { vin?: string; error?: string };
      if (!response.ok || !data.vin) throw new Error(data.error || "VIN could not be read.");
      setProposed(data.vin);
    } catch (cause) {
      if (!controller.signal.aborted) setError(cause instanceof Error ? cause.message : "Could not read VIN image.");
    } finally {
      if (scanRequestRef.current === controller) {
        scanRequestRef.current = null;
        setBusy(false);
      }
      if (galleryRef.current) galleryRef.current.value = "";
      if (fallbackCameraRef.current) fallbackCameraRef.current.value = "";
    }
  }

  const normalized = proposed.toUpperCase().replace(/[\s-]/g, "");
  const valid = VALID_VIN.test(normalized);

  return (
    <>
      <button
        type="button"
        title="Scan VIN from camera or gallery"
        aria-label="Scan VIN from camera or gallery"
        disabled={disabled}
        onClick={() => { setError(""); setDialog("choice"); }}
        className="absolute inset-y-0 right-1 flex w-11 items-center justify-center rounded-lg text-blue-700 hover:bg-blue-50 focus-visible:outline-2 focus-visible:outline-blue-600 disabled:opacity-50"
      >
        <svg aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" className="h-5 w-5">
          <path d="M14.5 4H9.5L7.7 6H4a2 2 0 0 0-2 2v10a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2V8a2 2 0 0 0-2-2h-3.7L14.5 4Z"/>
          <circle cx="12" cy="13" r="3.25"/>
        </svg>
      </button>
      <input ref={galleryRef} type="file" accept="image/jpeg,image/png,image/webp,image/heic,image/heif" className="hidden" aria-label="Choose VIN image from gallery" onChange={(event) => void analyze(event.target.files?.[0])} />
      <input ref={fallbackCameraRef} type="file" accept="image/*" capture="environment" className="hidden" aria-label="Take VIN photo with device camera" onChange={(event) => void analyze(event.target.files?.[0])} />
      {dialog && typeof document !== "undefined" && createPortal(
        <div className="fixed inset-0 z-[200] flex items-center justify-center bg-slate-950/60 p-4" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) close(); }}>
          <div role="dialog" aria-modal="true" aria-labelledby={id} className="w-full max-w-md overflow-hidden rounded-2xl bg-white p-5 shadow-2xl">
            <div className="mb-4 flex items-center justify-between gap-3">
              <h2 id={id} className="text-lg font-black text-slate-950">{dialog === "camera" ? "Photograph VIN" : dialog === "review" ? "Review scanned VIN" : "Scan VIN"}</h2>
              <button type="button" onClick={close} className="rounded-lg px-2 py-1 text-lg font-bold text-slate-500 hover:bg-slate-100" aria-label="Close VIN scanner">×</button>
            </div>
            {dialog === "choice" && (
              <div className="space-y-3">
                <p className="text-sm text-slate-600">Use a clear photo of the VIN plate or door-jamb label.</p>
                <button type="button" disabled={openingCamera} onClick={() => void startCamera("environment")} className="w-full rounded-xl bg-blue-700 px-4 py-3 text-left text-sm font-bold text-white disabled:opacity-50">{openingCamera ? "Opening rear camera…" : "Take Photo"}</button>
                <button type="button" onClick={() => galleryRef.current?.click()} className="w-full rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 text-left text-sm font-bold text-slate-900">Choose from Gallery</button>
              </div>
            )}
            {dialog === "camera" && (
              <div className="space-y-3">
                <video ref={videoRef} autoPlay muted playsInline aria-label="Live VIN camera preview" className="max-h-[55vh] w-full rounded-xl bg-slate-950 object-contain" />
                <p className="text-xs text-slate-500">Position the complete VIN within the frame. Rear camera is preferred.</p>
                <div className="flex gap-2">
                  <button type="button" disabled={openingCamera} onClick={() => void startCamera(facing === "environment" ? "user" : "environment")} className="rounded-lg border border-slate-200 px-3 py-2 text-xs font-bold">Flip Camera</button>
                  <button type="button" onClick={() => void takeSnapshot()} className="flex-1 rounded-lg bg-blue-700 px-3 py-2 text-sm font-bold text-white">Capture VIN</button>
                </div>
              </div>
            )}
            {dialog === "review" && (
              <div className="space-y-3">
                {busy ? <p role="status" className="text-sm font-semibold text-slate-700">Reading VIN from photo…</p> : proposed ? (
                  <>
                    <label htmlFor={id + "-value"} className="block text-xs font-bold text-slate-700">Confirm or correct the 17-character VIN</label>
                    <input id={id + "-value"} autoComplete="off" maxLength={17} value={proposed} onChange={(event) => setProposed(event.target.value.toUpperCase().replace(/[^A-Z0-9]/g, ""))} className="w-full rounded-lg border border-slate-300 px-3 py-3 font-mono text-sm tracking-wide text-slate-900" />
                    {!valid && <p className="text-xs text-amber-700">VIN must have 17 characters, excluding I, O and Q.</p>}
                    <button type="button" disabled={!valid || disabled} onClick={() => { onConfirm(normalized); close(); }} className="w-full rounded-lg bg-blue-700 px-3 py-3 text-sm font-bold text-white disabled:opacity-50">Use This VIN</button>
                  </>
                ) : <button type="button" onClick={() => { setError(""); setDialog("choice"); }} className="rounded-lg border border-slate-200 px-3 py-2 text-sm font-bold">Try another photo</button>}
              </div>
            )}
            {error && <p role="alert" className="mt-3 text-xs font-semibold text-red-700">{error}</p>}
            <p className="mt-4 text-[11px] text-slate-500">Confirm the characters before proceeding. Photos are not saved to your evaluation.</p>
          </div>
        </div>,
        document.body
      )}
    </>
  );
}
