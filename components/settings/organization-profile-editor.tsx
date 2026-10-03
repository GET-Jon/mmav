"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

export function OrganizationProfileEditor({
  initialName,
  initialZip,
  initialWebsiteUrl,
  canEdit,
}: {
  initialName: string;
  initialZip: string;
  initialWebsiteUrl: string;
  canEdit: boolean;
}) {
  const router = useRouter();
  const [name, setName] = useState(initialName);
  const [zip, setZip] = useState(initialZip);
  const [websiteUrl, setWebsiteUrl] = useState(initialWebsiteUrl);
  const [status, setStatus] = useState("");
  const [saving, setSaving] = useState(false);

  async function save() {
    if (!canEdit || saving) return;

    setSaving(true);
    setStatus("");

    try {
      const response = await fetch("/api/company/profile", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name, zip, websiteUrl }),
      });
      const data = (await response.json()) as { error?: string };
      if (!response.ok) throw new Error(data.error || "Could not update company.");

      setStatus("Saved.");
      router.refresh();
    } catch (error) {
      setStatus(error instanceof Error ? error.message : "Could not update company.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div>
      <label className="block">
        <div className="mb-1.5 text-xs font-black uppercase tracking-wide text-slate-500">
          Company name
        </div>
        <div className="flex flex-col gap-2 sm:flex-row">
          <input
            value={name}
            onChange={(event) => setName(event.target.value)}
            disabled={!canEdit || saving}
            className="min-w-0 flex-1 rounded-xl border border-slate-200 bg-white px-4 py-3 text-sm font-bold text-slate-950 outline-none focus:border-blue-300 disabled:bg-slate-50 disabled:text-slate-400"
          />
          {canEdit ? (
            <button
              type="button"
              onClick={() => void save()}
              disabled={saving || (name.trim() === initialName.trim() && zip === initialZip && websiteUrl === initialWebsiteUrl)}
              className="rounded-xl bg-slate-950 px-5 py-3 text-sm font-black text-white disabled:cursor-not-allowed disabled:bg-slate-200 disabled:text-slate-500"
            >
              {saving ? "Saving…" : "Save"}
            </button>
          ) : null}
        </div>
      </label>
      <div className="mt-4 grid gap-4 sm:grid-cols-2">
        <label className="block">
          <div className="mb-1.5 text-xs font-black uppercase tracking-wide text-slate-500">Dealership ZIP code</div>
          <input required inputMode="numeric" pattern="[0-9]{5}" maxLength={5} value={zip} onChange={(event) => setZip(event.target.value.replace(/\D/g, ""))} disabled={!canEdit || saving} className="w-full rounded-xl border border-slate-200 px-4 py-3 text-sm font-bold disabled:bg-slate-50" />
          <p className="mt-1 text-xs text-slate-500">Starting market for comp searches.</p>
        </label>
        <label className="block">
          <div className="mb-1.5 text-xs font-black uppercase tracking-wide text-slate-500">Website <span className="normal-case font-medium">(optional)</span></div>
          <input inputMode="url" value={websiteUrl} onChange={(event) => setWebsiteUrl(event.target.value)} disabled={!canEdit || saving} placeholder="https://yourdealership.com" className="w-full rounded-xl border border-slate-200 px-4 py-3 text-sm font-bold disabled:bg-slate-50" />
          <p className="mt-1 text-xs text-slate-500">Saved for your dealership’s AI profile.</p>
        </label>
      </div>
      {status ? <div className="mt-2 text-xs font-bold text-slate-500">{status}</div> : null}
    </div>
  );
}
