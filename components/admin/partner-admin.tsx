"use client";

import { FormEvent, useMemo, useState } from "react";
import { useRouter } from "next/navigation";

import type { AdminCapability, AdminPartner, AdminPartnerPermissionSet } from "@/lib/admin/partners";
import { defaultPartnerPermissions } from "@/lib/admin/partners";

type Props = { partners: AdminPartner[]; capabilities: AdminCapability[] };

type Draft = {
  id: string | null;
  name: string;
  companyName: string;
  email: string;
  phone: string;
  notes: string;
  active: boolean;
  capabilityIds: string[];
  permissions: AdminPartnerPermissionSet;
};

const blankDraft: Draft = {
  id: null,
  name: "",
  companyName: "",
  email: "",
  phone: "",
  notes: "",
  active: true,
  capabilityIds: [],
  permissions: { ...defaultPartnerPermissions },
};

const permissionGroups: Array<{ title: string; items: Array<[keyof AdminPartnerPermissionSet, string]> }> = [
  { title: "Work", items: [["view_assigned_work", "View assigned work"], ["start_work", "Start work"], ["complete_work", "Complete work"], ["add_notes", "Add notes"], ["report_blocker", "Report blockers"]] },
  { title: "Evidence & Cost", items: [["upload_media", "Upload photos / media"], ["submit_invoice", "Submit invoices"], ["update_actual_cost", "Update actual cost"], ["update_parts", "Update parts"]] },
  { title: "Scope", items: [["add_finding", "Add findings"], ["propose_additional_work", "Propose additional work"], ["request_plan_change", "Request plan change"], ["edit_estimate", "Edit estimates"]] },
  { title: "Scheduling", items: [["reschedule_work", "Reschedule assigned work"]] },
];

const inputClass = "w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm font-semibold text-slate-900 outline-none focus:border-slate-500";

function fromPartner(partner: AdminPartner): Draft {
  return {
    id: partner.id,
    name: partner.name,
    companyName: partner.companyName || "",
    email: partner.email || "",
    phone: partner.phone || "",
    notes: partner.notes || "",
    active: partner.active,
    capabilityIds: partner.capabilities.map((capability) => capability.id),
    permissions: { ...partner.permissions },
  };
}

export function PartnerAdmin({ partners, capabilities }: Props) {
  const router = useRouter();
  const [draft, setDraft] = useState<Draft>(blankDraft);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState("");
  const [filter, setFilter] = useState<"active" | "inactive" | "all">("active");

  const filtered = useMemo(() => partners.filter((partner) => filter === "all" || (filter === "active" ? partner.active : !partner.active)), [partners, filter]);

  function edit(partner: AdminPartner) {
    setDraft(fromPartner(partner));
    setMessage("");
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSaving(true);
    setMessage("");
    try {
      const response = await fetch("/api/admin/partners", {
        method: draft.id ? "PATCH" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(draft.id ? { partnerId: draft.id, ...draft } : draft),
      });
      const payload = (await response.json()) as { error?: string };
      if (!response.ok) throw new Error(payload.error || "Failed to save partner.");
      setMessage(draft.id ? "Partner updated." : "Partner created.");
      setDraft(blankDraft);
      router.refresh();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Failed to save partner.");
    } finally {
      setSaving(false);
    }
  }

  async function remove(partner: AdminPartner) {
    if (!window.confirm(partner.active ? `Remove ${partner.name}? Partners with work history will be deactivated instead of deleted.` : `Delete ${partner.name}?`)) return;
    setSaving(true);
    setMessage("");
    try {
      const response = await fetch("/api/admin/partners", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ partnerId: partner.id }),
      });
      const payload = (await response.json()) as { error?: string; deactivated?: boolean };
      if (!response.ok) throw new Error(payload.error || "Failed to remove partner.");
      setMessage(payload.deactivated ? "Partner has work history and was deactivated." : "Partner deleted.");
      if (draft.id === partner.id) setDraft(blankDraft);
      router.refresh();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Failed to remove partner.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="grid gap-5 xl:grid-cols-[minmax(360px,0.8fr)_minmax(0,1.2fr)]">
      <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
        <div className="flex items-start justify-between gap-4">
          <div><div className="text-xs font-black uppercase tracking-[0.1em] text-slate-400">Partner Directory</div><h2 className="mt-1 text-xl font-black text-slate-950">People & specialist shops</h2></div>
          <button type="button" onClick={() => setDraft(blankDraft)} className="rounded-xl bg-slate-950 px-4 py-2.5 text-sm font-black text-white">+ Add Partner</button>
        </div>
        <div className="mt-4 flex gap-2">
          {(["active", "inactive", "all"] as const).map((value) => <button key={value} type="button" onClick={() => setFilter(value)} className={`rounded-lg px-3 py-2 text-xs font-black ${filter === value ? "bg-slate-950 text-white" : "bg-slate-100 text-slate-600"}`}>{value.charAt(0).toUpperCase() + value.slice(1)}</button>)}
        </div>
        <div className="mt-4 space-y-2">
          {filtered.map((partner) => (
            <button key={partner.id} type="button" onClick={() => edit(partner)} className={`w-full rounded-xl border p-4 text-left transition hover:border-slate-400 ${draft.id === partner.id ? "border-slate-950 bg-slate-50" : "border-slate-200 bg-white"}`}>
              <div className="flex items-start justify-between gap-3"><div><div className="font-black text-slate-950">{partner.name}</div><div className="mt-0.5 text-sm font-semibold text-slate-500">{partner.companyName || "Independent partner"}</div></div><span className={`rounded-full px-2 py-1 text-[9px] font-black uppercase ${partner.active ? "bg-emerald-100 text-emerald-700" : "bg-slate-200 text-slate-500"}`}>{partner.active ? "Active" : "Inactive"}</span></div>
              <div className="mt-3 flex flex-wrap gap-1.5">{partner.capabilities.length ? partner.capabilities.map((capability) => <span key={capability.id} className="rounded-full bg-blue-50 px-2 py-1 text-[10px] font-black text-blue-700">{capability.name}</span>) : <span className="text-xs font-semibold text-amber-700">No capabilities assigned</span>}</div>
            </button>
          ))}
          {filtered.length === 0 ? <div className="rounded-xl border border-dashed border-slate-300 p-6 text-center text-sm font-bold text-slate-400">No partners in this view.</div> : null}
        </div>
      </section>

      <form onSubmit={save} className="space-y-5">
        <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
          <div className="flex flex-wrap items-start justify-between gap-3"><div><div className="text-xs font-black uppercase tracking-[0.1em] text-slate-400">{draft.id ? "Edit Partner" : "New Partner"}</div><h2 className="mt-1 text-xl font-black text-slate-950">{draft.id ? draft.name : "Create a partner"}</h2></div>{draft.id ? <label className="flex items-center gap-2 text-sm font-black text-slate-700"><input type="checkbox" checked={draft.active} onChange={(event) => setDraft((current) => ({ ...current, active: event.target.checked }))} /> Active</label> : null}</div>
          <div className="mt-4 grid gap-4 sm:grid-cols-2">
            <label><div className="mb-1 text-xs font-black uppercase text-slate-500">Name</div><input required className={inputClass} value={draft.name} onChange={(event) => setDraft((current) => ({ ...current, name: event.target.value }))} /></label>
            <label><div className="mb-1 text-xs font-black uppercase text-slate-500">Company / Shop</div><input className={inputClass} value={draft.companyName} onChange={(event) => setDraft((current) => ({ ...current, companyName: event.target.value }))} /></label>
            <label><div className="mb-1 text-xs font-black uppercase text-slate-500">Email</div><input type="email" className={inputClass} value={draft.email} onChange={(event) => setDraft((current) => ({ ...current, email: event.target.value }))} /></label>
            <label><div className="mb-1 text-xs font-black uppercase text-slate-500">Phone</div><input className={inputClass} value={draft.phone} onChange={(event) => setDraft((current) => ({ ...current, phone: event.target.value }))} /></label>
            <label className="sm:col-span-2"><div className="mb-1 text-xs font-black uppercase text-slate-500">Notes</div><textarea className={`${inputClass} min-h-20 resize-y`} value={draft.notes} onChange={(event) => setDraft((current) => ({ ...current, notes: event.target.value }))} /></label>
          </div>
        </section>

        <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
          <h3 className="font-black text-slate-950">Capabilities</h3><p className="mt-1 text-sm text-slate-500">Lot Logic uses these to suggest the right performer for a Work Order.</p>
          <div className="mt-4 grid gap-2 sm:grid-cols-2 lg:grid-cols-3">{capabilities.filter((capability) => capability.active).map((capability) => <label key={capability.id} className="flex items-center gap-2 rounded-xl border border-slate-200 px-3 py-2.5 text-sm font-bold text-slate-700"><input type="checkbox" checked={draft.capabilityIds.includes(capability.id)} onChange={(event) => setDraft((current) => ({ ...current, capabilityIds: event.target.checked ? [...current.capabilityIds, capability.id] : current.capabilityIds.filter((id) => id !== capability.id) }))} />{capability.name}</label>)}</div>
        </section>

        <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
          <h3 className="font-black text-slate-950">Partner Permissions</h3><p className="mt-1 text-sm text-slate-500">What this partner can do when partner access is enabled.</p>
          <div className="mt-4 grid gap-5 lg:grid-cols-2">{permissionGroups.map((group) => <div key={group.title}><div className="mb-2 text-xs font-black uppercase tracking-[0.08em] text-slate-400">{group.title}</div><div className="space-y-2">{group.items.map(([key, label]) => <label key={key} className="flex items-center justify-between gap-4 rounded-xl border border-slate-200 px-3 py-2.5 text-sm font-bold text-slate-700"><span>{label}</span><input type="checkbox" checked={draft.permissions[key]} onChange={(event) => setDraft((current) => ({ ...current, permissions: { ...current.permissions, [key]: event.target.checked } }))} /></label>)}</div></div>)}</div>
        </section>

        <section className="flex flex-col gap-3 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm sm:flex-row sm:items-center sm:justify-between">
          <div className="text-sm font-semibold text-slate-600">{message}</div>
          <div className="flex gap-2">{draft.id ? <button type="button" disabled={saving} onClick={() => { const partner = partners.find((item) => item.id === draft.id); if (partner) void remove(partner); }} className="rounded-xl border border-red-200 px-4 py-2.5 text-sm font-black text-red-600 disabled:opacity-50">Remove</button> : null}<button disabled={saving} className="rounded-xl bg-slate-950 px-5 py-2.5 text-sm font-black text-white disabled:opacity-50">{saving ? "Saving…" : draft.id ? "Save Partner" : "Create Partner"}</button></div>
        </section>
      </form>
    </div>
  );
}
