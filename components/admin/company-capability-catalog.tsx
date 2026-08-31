import type { AdminCapability, AdminPartner } from "@/lib/admin/partners";

export function CompanyCapabilityCatalog({ capabilities, partners }: { capabilities: AdminCapability[]; partners: AdminPartner[] }) {
  const active = capabilities.filter((capability) => capability.active);
  const partnerCountByCapability = new Map<string, number>();
  for (const partner of partners) {
    if (!partner.active) continue;
    for (const capability of partner.capabilities) {
      partnerCountByCapability.set(capability.id, (partnerCountByCapability.get(capability.id) || 0) + 1);
    }
  }

  return (
    <section className="mt-5 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <div className="text-xs font-black uppercase tracking-[0.1em] text-slate-400">Shared vocabulary</div>
          <h2 className="mt-1 text-xl font-black text-slate-950">Company Capability Catalog</h2>
          <p className="mt-1 max-w-3xl text-sm text-slate-500">
            Every active capability below is available to every partner and to owner/manager assignment tools. Partner-added capabilities join this same company-wide catalog.
          </p>
        </div>
        <span className="self-start rounded-full bg-slate-100 px-3 py-1.5 text-xs font-black text-slate-700">{active.length} active</span>
      </div>

      <div className="mt-4 flex flex-wrap gap-2">
        {active.map((capability) => {
          const count = partnerCountByCapability.get(capability.id) || 0;
          return (
            <div key={capability.id} className="flex items-center gap-2 rounded-xl border border-slate-200 bg-slate-50 px-3 py-2">
              <span className="text-sm font-black text-slate-800">{capability.name}</span>
              {capability.source === "partner" ? (
                <span className="rounded-full bg-violet-100 px-2 py-0.5 text-[9px] font-black uppercase tracking-[0.06em] text-violet-700">Partner added</span>
              ) : null}
              <span className="text-[10px] font-bold text-slate-400">{count} partner{count === 1 ? "" : "s"}</span>
            </div>
          );
        })}
        {!active.length ? <div className="text-sm font-semibold text-slate-400">No capabilities have been created yet.</div> : null}
      </div>
    </section>
  );
}
