"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

import type { AdminPartner } from "@/lib/admin/partners";

export function PartnerPortalAccess({ partners }: { partners: AdminPartner[] }) {
  const router = useRouter();
  const [emails, setEmails] = useState<Record<string, string>>({});
  const [workingId, setWorkingId] = useState<string | null>(null);
  const [message, setMessage] = useState("");

  async function link(partner: AdminPartner) {
    const email = (emails[partner.id] ?? partner.email ?? "").trim();
    if (!email) return;
    setWorkingId(partner.id);
    setMessage("");
    try {
      const response = await fetch("/api/admin/partners/link-login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ partnerId: partner.id, email }),
      });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error || "Login could not be linked.");
      setMessage(`${partner.name} can now use the Partner Portal with ${payload.email}.`);
      router.refresh();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Login could not be linked.");
    } finally {
      setWorkingId(null);
    }
  }

  async function unlink(partner: AdminPartner) {
    setWorkingId(partner.id);
    setMessage("");
    try {
      const response = await fetch("/api/admin/partners/link-login", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ partnerId: partner.id }),
      });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error || "Login could not be unlinked.");
      setMessage(`${partner.name}'s Partner Portal login was unlinked.`);
      router.refresh();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Login could not be unlinked.");
    } finally {
      setWorkingId(null);
    }
  }

  return (
    <section className="mt-5 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
      <div>
        <div className="text-xs font-black uppercase tracking-[0.1em] text-slate-400">Partner Portal Access</div>
        <h2 className="mt-1 text-xl font-black">Link partner logins</h2>
        <p className="mt-1 max-w-3xl text-sm leading-6 text-slate-500">Link an existing Lot Logic login to a partner record. The linked user can open <span className="font-mono font-bold">/partner/work</span> and sees only work assigned to that partner.</p>
      </div>

      {message ? <div className="mt-4 rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm font-bold text-slate-700">{message}</div> : null}

      <div className="mt-4 grid gap-3 lg:grid-cols-2">
        {partners.filter((partner) => partner.active).map((partner) => (
          <div key={partner.id} className="rounded-xl border border-slate-200 p-4">
            <div className="flex items-start justify-between gap-3">
              <div><div className="font-black">{partner.name}</div><div className="text-xs text-slate-400">{partner.companyName || "Independent partner"}</div></div>
              <span className={`rounded-full px-2 py-1 text-[9px] font-black uppercase ${partner.userId ? "bg-emerald-100 text-emerald-700" : "bg-amber-100 text-amber-800"}`}>{partner.userId ? "Linked" : "Not linked"}</span>
            </div>
            {partner.userId ? (
              <button disabled={workingId === partner.id} onClick={() => void unlink(partner)} className="mt-3 rounded-lg border border-slate-300 px-3 py-2 text-xs font-black disabled:opacity-40">Unlink Login</button>
            ) : (
              <div className="mt-3 flex gap-2">
                <input type="email" value={emails[partner.id] ?? partner.email ?? ""} onChange={(event) => setEmails((current) => ({ ...current, [partner.id]: event.target.value }))} placeholder="existing-login@example.com" className="min-w-0 flex-1 rounded-lg border border-slate-300 px-3 py-2 text-sm font-semibold" />
                <button disabled={workingId === partner.id || !(emails[partner.id] ?? partner.email ?? "").trim()} onClick={() => void link(partner)} className="rounded-lg bg-slate-950 px-3 py-2 text-xs font-black text-white disabled:opacity-40">Link</button>
              </div>
            )}
          </div>
        ))}
      </div>
    </section>
  );
}
