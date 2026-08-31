"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

import type { PartnerProfileData } from "@/lib/partner-portal/profile";
import type { PartnerStandardHours } from "@/lib/admin/partners";

const inputClass = "w-full rounded-xl border border-slate-300 bg-white px-3 py-2.5 text-sm font-semibold text-slate-900 outline-none focus:border-slate-600";
const days: Array<[keyof PartnerStandardHours, string]> = [["mon","Mon"],["tue","Tue"],["wed","Wed"],["thu","Thu"],["fri","Fri"],["sat","Sat"],["sun","Sun"]];

export function PartnerProfileForm({ profile, onboarding }: { profile: PartnerProfileData; onboarding: boolean }) {
  const router = useRouter();
  const [name, setName] = useState(profile.name);
  const [companyName, setCompanyName] = useState(profile.companyName ?? "");
  const [phone, setPhone] = useState(profile.phone ?? "");
  const [locationText, setLocationText] = useState(profile.locationText ?? "");
  const [standardHours, setStandardHours] = useState<PartnerStandardHours>(profile.standardHours);
  const [capabilityIds, setCapabilityIds] = useState<string[]>(profile.capabilities.filter((item) => item.selected).map((item) => item.id));
  const [newCapability, setNewCapability] = useState("");
  const [newCapabilityNames, setNewCapabilityNames] = useState<string[]>([]);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState("");

  function setDay(day: keyof PartnerStandardHours, patch: Partial<PartnerStandardHours[keyof PartnerStandardHours]>) {
    setStandardHours((current) => ({ ...current, [day]: { ...current[day], ...patch } }));
  }

  function addCapability() {
    const clean = newCapability.trim().replace(/\s+/g, " ");
    if (!clean) return;
    const duplicateExisting = profile.capabilities.some((item) => item.name.toLowerCase() === clean.toLowerCase());
    if (duplicateExisting) {
      const existing = profile.capabilities.find((item) => item.name.toLowerCase() === clean.toLowerCase());
      if (existing && !capabilityIds.includes(existing.id)) setCapabilityIds((current) => [...current, existing.id]);
      setNewCapability("");
      return;
    }
    if (newCapabilityNames.some((item) => item.toLowerCase() === clean.toLowerCase())) {
      setNewCapability("");
      return;
    }
    setNewCapabilityNames((current) => [...current, clean]);
    setNewCapability("");
  }

  async function save() {
    setSaving(true);
    setMessage("");
    try {
      const response = await fetch("/api/partner/profile", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name, companyName, phone, locationText, standardHours, capabilityIds, newCapabilityNames }),
      });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error || "Profile could not be saved.");
      if (onboarding || payload.firstConfirmation) {
        router.push("/partner/work");
        router.refresh();
        return;
      }
      setMessage("Profile updated.");
      setNewCapabilityNames([]);
      router.refresh();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Profile could not be saved.");
    } finally {
      setSaving(false);
    }
  }

  return <div className="space-y-5">
    <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
      <div className="grid gap-4 sm:grid-cols-2">
        <label><div className="mb-1 text-xs font-black uppercase text-slate-500">Name</div><input className={inputClass} value={name} onChange={(e) => setName(e.target.value)} /></label>
        <label><div className="mb-1 text-xs font-black uppercase text-slate-500">Company / Shop</div><input className={inputClass} value={companyName} onChange={(e) => setCompanyName(e.target.value)} /></label>
        <label><div className="mb-1 text-xs font-black uppercase text-slate-500">Email</div><input className={`${inputClass} bg-slate-50 text-slate-500`} value={profile.email ?? ""} disabled /></label>
        <label><div className="mb-1 text-xs font-black uppercase text-slate-500">Phone</div><input className={inputClass} value={phone} onChange={(e) => setPhone(e.target.value)} /></label>
        <label className="sm:col-span-2"><div className="mb-1 text-xs font-black uppercase text-slate-500">General Location</div><input className={inputClass} value={locationText} onChange={(e) => setLocationText(e.target.value)} placeholder="e.g. North Charleston, SC" /></label>
      </div>
    </section>

    <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
      <h2 className="text-lg font-black">Normal availability</h2>
      <p className="mt-1 text-sm text-slate-500">Keep this current so Lot Logic can schedule around your real working hours.</p>
      <div className="mt-4 space-y-2">{days.map(([day,label]) => { const hours = standardHours[day]; return <div key={day} className="grid items-center gap-2 rounded-xl border border-slate-200 p-3 sm:grid-cols-[70px_90px_1fr_1fr]">
        <div className="font-black">{label}</div>
        <label className="flex items-center gap-2 text-xs font-bold"><input type="checkbox" checked={hours.enabled} onChange={(e) => setDay(day,{enabled:e.target.checked})} /> Available</label>
        <input type="time" className={inputClass} disabled={!hours.enabled} value={hours.start} onChange={(e) => setDay(day,{start:e.target.value})} />
        <input type="time" className={inputClass} disabled={!hours.enabled} value={hours.end} onChange={(e) => setDay(day,{end:e.target.value})} />
      </div>; })}</div>
    </section>

    <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
      <h2 className="text-lg font-black">Capabilities</h2>
      <p className="mt-1 text-sm text-slate-500">Select the work you currently handle, or add a capability that is missing. You can update this anytime.</p>

      <div className="mt-4 grid gap-2 sm:grid-cols-2 lg:grid-cols-3">{profile.capabilities.filter((item) => item.active).map((item) => <label key={item.id} className="flex items-center gap-2 rounded-xl border border-slate-200 px-3 py-2.5 text-sm font-bold"><input type="checkbox" checked={capabilityIds.includes(item.id)} onChange={(e) => setCapabilityIds((current) => e.target.checked ? [...current,item.id] : current.filter((id) => id !== item.id))} />{item.name}</label>)}</div>

      {newCapabilityNames.length ? <div className="mt-3 flex flex-wrap gap-2">{newCapabilityNames.map((item) => <span key={item} className="inline-flex items-center gap-2 rounded-full bg-blue-50 px-3 py-1.5 text-xs font-black text-blue-800">{item}<button type="button" onClick={() => setNewCapabilityNames((current) => current.filter((name) => name !== item))} className="text-blue-500 hover:text-blue-900" aria-label={`Remove ${item}`}>×</button></span>)}</div> : null}

      <div className="mt-4 rounded-xl border border-dashed border-slate-300 bg-slate-50 p-3">
        <div className="text-xs font-black uppercase text-slate-500">Add capability</div>
        <div className="mt-2 flex gap-2">
          <input
            className={inputClass}
            value={newCapability}
            maxLength={80}
            onChange={(e) => setNewCapability(e.target.value)}
            onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); addCapability(); } }}
            placeholder="e.g. Paint correction, wheel repair, PPF"
          />
          <button type="button" onClick={addCapability} disabled={!newCapability.trim()} className="rounded-xl bg-slate-950 px-4 py-2 text-sm font-black text-white disabled:opacity-40">Add</button>
        </div>
        <p className="mt-2 text-xs text-slate-500">New capabilities become available to Lot Logic for future work matching after you save your profile.</p>
      </div>
    </section>

    <div className="flex items-center justify-between gap-3 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
      <div className="text-sm font-semibold text-slate-600">{message}</div>
      <button onClick={() => void save()} disabled={saving} className="rounded-xl bg-slate-950 px-5 py-3 text-sm font-black text-white disabled:opacity-50">{saving ? "Saving…" : onboarding ? "Confirm Profile & Continue" : "Save Profile"}</button>
    </div>
  </div>;
}
