import Link from "next/link";
import { notFound } from "next/navigation";

import { AppTopNav } from "@/components/navigation/app-top-nav";
import { getMindfulInventoryAccess } from "@/lib/mindful-inventory/access";

export const dynamic = "force-dynamic";

const sections = [
  { href: "/admin/partners", title: "Partners", description: "Manage outside specialists, capabilities, permissions, and operating access.", ready: true },
  { href: "/admin/locations", title: "Locations & Resources", description: "Mindful facilities, partner shops, storage, transport locations, bays, lifts, detail spaces, and other schedulable capacity.", ready: true },
  { href: "/admin/team", title: "Team & Access", description: "Manage internal users, company roles, account status, and administrative access.", ready: true },
];

export default async function AdminPage() {
  const access = await getMindfulInventoryAccess();
  if (!access || access.company.role !== "company_admin") notFound();

  return (
    <main className="min-h-screen bg-[#f5f7fb] text-slate-950">
      <AppTopNav active="admin" userEmail={access.userEmail} userRole={access.company.role} />
      <div className="mx-auto w-full max-w-[1480px] px-4 py-6 sm:px-5 lg:px-7">
        <div className="mb-6">
          <div className="text-[10px] font-black uppercase tracking-[0.16em] text-slate-400">Administration</div>
          <h1 className="mt-1 text-[30px] font-black tracking-[-0.035em]">Manage how Lot Logic operates</h1>
          <p className="mt-2 max-w-3xl text-slate-600">Configure the people, places, resources, and access rules that the operating workflows depend on.</p>
        </div>
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {sections.map((section) => section.ready ? (
            <Link key={section.title} href={section.href} className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm transition hover:border-slate-400">
              <div className="text-xl font-black">{section.title}</div><p className="mt-2 text-sm leading-6 text-slate-600">{section.description}</p><div className="mt-5 text-sm font-black text-slate-950">Manage {section.title} →</div>
            </Link>
          ) : (
            <div key={section.title} className="rounded-2xl border border-slate-200 bg-white p-6 opacity-65 shadow-sm">
              <div className="flex items-center justify-between"><div className="text-xl font-black">{section.title}</div><span className="rounded-full bg-slate-100 px-2.5 py-1 text-[10px] font-black uppercase text-slate-500">Coming next</span></div><p className="mt-2 text-sm leading-6 text-slate-600">{section.description}</p>
            </div>
          ))}
        </div>
      </div>
    </main>
  );
}
