"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

import type { PartnerPortalAdminItem } from "@/lib/partner-portal/admin";

function statusFor(partner: PartnerPortalAdminItem) {
  if (!partner.accessEnabled && partner.invitedAt) return { label: "Disabled", cls: "bg-slate-200 text-slate-600" };
  if (partner.accessEnabled && partner.profileConfirmedAt) return { label: "Active", cls: "bg-emerald-100 text-emerald-700" };
  if (partner.accessEnabled && partner.userId) return { label: "Profile pending", cls: "bg-blue-100 text-blue-700" };
  if (partner.invitedAt) return { label: "Invitation sent", cls: "bg-blue-100 text-blue-700" };
  return { label: "Not invited", cls: "bg-amber-100 text-amber-800" };
}

export function PartnerPortalAccess({ partners }: { partners: PartnerPortalAdminItem[] }) {
  const router = useRouter();
  const [emails, setEmails] = useState<Record<string, string>>({});
  const [workingId, setWorkingId] = useState<string | null>(null);
  const [message, setMessage] = useState("");

  async function invite(partner: PartnerPortalAdminItem) {
    const email = (emails[partner.id] ?? partner.email ?? "").trim();
    if (!email) return;
    setWorkingId(partner.id);
    setMessage("");
    try {
      const response = await fetch("/api/admin/partners/invite", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ partnerId: partner.id, email }),
      });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error || "Invitation could not be sent.");
      setMessage(`Invitation sent to ${payload.email}. They will confirm their profile before entering My Work.`);
      router.refresh();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Invitation could not be sent.");
    } finally {
      setWorkingId(null);
    }
  }

  async function disable(partner: PartnerPortalAdminItem) {
    setWorkingId(partner.id);
    setMessage("");
    try {
      const response = await fetch("/api/admin/partners/invite", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ partnerId: partner.id }),
      });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error || "Portal access could not be disabled.");
      setMessage(`${partner.name}'s portal access is disabled. Their partner record and history were preserved.`);
      router.refresh();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Portal access could not be disabled.");
    } finally {
      setWorkingId(null);
    }
  }

  return <section className="mt-5 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
    <div>
      <div className="text-xs font-black uppercase tracking-[0.1em] text-slate-400">Partner Portal Access</div>
      <h2 className="mt-1 text-xl font-black">Invite partners</h2>
      <p className="mt-1 max-w-4xl text-sm leading-6 text-slate-500">Send a secure Lot Logic invitation. New partners create their account from the email, confirm contact details, location, hours, and capabilities, then land in My Work. Existing Lot Logic users receive a sign-in link instead.</p>
    </div>

    {message ? <div className="mt-4 rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm font-bold text-slate-700">{message}</div> : null}

    <div className="mt-4 grid gap-3 lg:grid-cols-2">
      {partners.map((partner) => { const status = statusFor(partner); return <div key={partner.id} className="rounded-xl border border-slate-200 p-4">
        <div className="flex items-start justify-between gap-3">
          <div><div className="font-black">{partner.name}</div><div className="text-xs text-slate-400">{partner.companyName || "Independent partner"}</div></div>
          <span className={`rounded-full px-2 py-1 text-[9px] font-black uppercase ${status.cls}`}>{status.label}</span>
        </div>
        <div className="mt-3 flex gap-2">
          <input type="email" value={emails[partner.id] ?? partner.email ?? ""} onChange={(event) => setEmails((current) => ({ ...current, [partner.id]: event.target.value }))} placeholder="partner@example.com" className="min-w-0 flex-1 rounded-lg border border-slate-300 px-3 py-2 text-sm font-semibold" />
          <button disabled={workingId === partner.id || !(emails[partner.id] ?? partner.email ?? "").trim()} onClick={() => void invite(partner)} className="rounded-lg bg-slate-950 px-3 py-2 text-xs font-black text-white disabled:opacity-40">{partner.invitedAt ? "Resend" : "Send Invite"}</button>
        </div>
        {partner.invitedAt ? <div className="mt-2 text-[11px] font-semibold text-slate-400">Last invited {new Date(partner.invitedAt).toLocaleString()}</div> : null}
        {partner.accessEnabled ? <button disabled={workingId === partner.id} onClick={() => void disable(partner)} className="mt-3 rounded-lg border border-slate-300 px-3 py-2 text-xs font-black text-slate-600 disabled:opacity-40">Disable Portal Access</button> : null}
      </div>; })}
    </div>
  </section>;
}
