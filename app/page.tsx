import { MarketCompsTable } from "@/components/comps/market-comps-table";

function MetricCard({
  label,
  value,
  tone = "default",
}: {
  label: string;
  value: string;
  tone?: "default" | "green" | "blue" | "purple" | "orange";
}) {
  const toneClass =
    tone === "green"
      ? "text-emerald-600"
      : tone === "blue"
      ? "text-blue-700"
      : tone === "purple"
      ? "text-purple-700"
      : tone === "orange"
      ? "text-amber-600"
      : "text-slate-950";

  return (
    <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
      <div className="text-xs font-semibold uppercase tracking-wide text-slate-500">
        {label}
      </div>
      <div className={`mt-2 text-2xl font-bold ${toneClass}`}>{value}</div>
    </div>
  );
}

function SectionCard({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
      <h2 className="mb-4 text-base font-bold text-slate-950">{title}</h2>
      {children}
    </section>
  );
}

export default function Home() {
  return (
    <main className="min-h-screen bg-slate-100 text-slate-950">
      <div className="flex min-h-screen">
        <aside className="hidden w-64 shrink-0 bg-slate-950 p-5 text-white lg:block">
          <div className="mb-10 flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-cyan-400 text-xl font-black text-slate-950">
              M
            </div>
            <div>
              <div className="text-lg font-bold leading-tight">Mindful</div>
              <div className="text-lg font-bold leading-tight">Motors</div>
            </div>
          </div>

          <nav className="space-y-2 text-sm">
            {[
              "Dashboard",
              "Auction Evaluator",
              "Market Comps",
              "Vehicles",
              "Deal Log",
              "Rules & Defaults",
              "Settings",
            ].map((item) => (
              <div
                key={item}
                className={`rounded-xl px-4 py-3 ${
                  item === "Auction Evaluator"
                    ? "bg-cyan-500/20 text-cyan-200"
                    : "text-slate-300 hover:bg-white/5"
                }`}
              >
                {item}
              </div>
            ))}
          </nav>

          <div className="mt-10 rounded-2xl border border-white/10 bg-white/5 p-4 text-sm text-slate-300">
            <div className="font-semibold text-white">Mindful Motors</div>
            <div>Phoenix, AZ</div>
          </div>
        </aside>

        <div className="flex min-w-0 flex-1 flex-col">
          <header className="flex h-16 items-center justify-between border-b border-slate-200 bg-white px-6">
            <div className="text-xl font-bold">Auction Evaluator</div>
            <div className="hidden w-[420px] rounded-xl border border-slate-200 bg-slate-50 px-4 py-2 text-sm text-slate-500 md:block">
              Enter VIN or search vehicles...
            </div>
            <div className="flex items-center gap-3">
              <div className="rounded-full bg-slate-100 px-3 py-1 text-sm font-medium">
                Buyer
              </div>
              <div className="h-9 w-9 rounded-full bg-slate-900" />
            </div>
          </header>

          <div className="flex-1 p-6">
            <div className="mb-6 flex flex-col justify-between gap-4 xl:flex-row xl:items-end">
              <div>
                <div className="mb-2 text-sm font-medium text-blue-700">
                  Back to Evaluations
                </div>
                <h1 className="text-3xl font-bold tracking-tight">
                  2020 Audi Q7 quattro Premium Plus
                </h1>
                <div className="mt-2 inline-flex rounded-full bg-emerald-100 px-3 py-1 text-sm font-semibold text-emerald-700">
                  Bid If Clean
                </div>
              </div>

              <div className="flex flex-wrap gap-3">
                <button className="rounded-xl border border-slate-300 bg-white px-4 py-2 text-sm font-semibold shadow-sm">
                  Decode VIN
                </button>
                <button className="rounded-xl bg-blue-700 px-4 py-2 text-sm font-semibold text-white shadow-sm">
                  Pull MarketCheck Comps
                </button>
                <button className="rounded-xl bg-slate-950 px-4 py-2 text-sm font-semibold text-white shadow-sm">
                  Save Evaluation
                </button>
              </div>
            </div>

            <div className="grid grid-cols-1 gap-5 xl:grid-cols-[1fr_360px]">
              <div className="space-y-5">
                <div className="grid grid-cols-1 gap-5 lg:grid-cols-3">
                  <SectionCard title="1. Vehicle Basics">
                    <div className="grid grid-cols-2 gap-3 text-sm">
                      <div>
                        <div className="text-slate-500">VIN</div>
                        <div className="font-semibold">WA1LAAF78LD012345</div>
                      </div>
                      <div>
                        <div className="text-slate-500">Mileage</div>
                        <div className="font-semibold">68,742</div>
                      </div>
                      <div>
                        <div className="text-slate-500">Auction Site</div>
                        <div className="font-semibold">Manheim Phoenix</div>
                      </div>
                      <div>
                        <div className="text-slate-500">Vehicle Type</div>
                        <div className="font-semibold">SUV / 4D</div>
                      </div>
                      <div>
                        <div className="text-slate-500">Current Bid</div>
                        <div className="font-semibold">$18,200</div>
                      </div>
                      <div>
                        <div className="text-slate-500">Title</div>
                        <div className="font-semibold">Clean</div>
                      </div>
                    </div>
                  </SectionCard>

                  <SectionCard title="2. VIN Decode">
                    <div className="space-y-2 text-sm">
                      {[
                        ["Year", "2020"],
                        ["Make", "Audi"],
                        ["Model", "Q7"],
                        ["Trim", "Premium Plus"],
                        ["Body Class", "SUV"],
                        ["Drivetrain", "quattro AWD"],
                        ["Fuel", "Gasoline"],
                        ["Engine", "3.0L V6 TFSI"],
                      ].map(([label, value]) => (
                        <div key={label} className="flex justify-between gap-4">
                          <span className="text-slate-500">{label}</span>
                          <span className="font-semibold">{value}</span>
                        </div>
                      ))}
                    </div>
                  </SectionCard>

                  <SectionCard title="3. Condition Checklist">
                    <div className="space-y-4 text-sm">
                      <div>
                        <div className="mb-2 font-semibold">Mechanical</div>
                        <label className="flex items-center justify-between">
                          <span>
                            <input className="mr-2" type="checkbox" checked readOnly />
                            Warning Light
                          </span>
                          <span className="text-slate-500">+25</span>
                        </label>
                        <label className="flex items-center justify-between">
                          <span>
                            <input className="mr-2" type="checkbox" readOnly />
                            Mechanical Concern
                          </span>
                          <span className="text-slate-500">+35</span>
                        </label>
                      </div>

                      <div>
                        <div className="mb-2 font-semibold">Exterior</div>
                        <label className="flex items-center justify-between">
                          <span>
                            <input className="mr-2" type="checkbox" checked readOnly />
                            Minor Cosmetics
                          </span>
                          <span className="text-slate-500">+10</span>
                        </label>
                        <label className="flex items-center justify-between">
                          <span>
                            <input className="mr-2" type="checkbox" checked readOnly />
                            Needs Tires
                          </span>
                          <span className="text-slate-500">+15</span>
                        </label>
                      </div>

                      <div className="grid grid-cols-2 gap-3 rounded-xl bg-emerald-50 p-3 text-center">
                        <div>
                          <div className="text-xs text-slate-500">Risk Add</div>
                          <div className="font-bold text-emerald-700">+$900</div>
                        </div>
                        <div>
                          <div className="text-xs text-slate-500">Points</div>
                          <div className="font-bold">90 / 200</div>
                        </div>
                      </div>
                    </div>
                  </SectionCard>
                </div>

                <SectionCard title="4. Market Comps">
                  <div className="mb-4 grid grid-cols-2 gap-3 md:grid-cols-5">
                    <MetricCard label="Comp Count" value="6" />
                    <MetricCard label="Median Adjusted" value="$33,750" />
                    <MetricCard label="Fast Sale Target" value="$31,250" />
                    <MetricCard label="Confidence" value="72%" tone="green" />
                    <MetricCard label="Search Type" value="Local + Regional" />
                  </div>

                  <MarketCompsTable />
                </SectionCard>
              </div>

              <aside className="space-y-5">
                <SectionCard title="6. Output / Decision">
                  <div className="grid grid-cols-2 gap-3">
                    <MetricCard label="All-In Cost" value="$23,096" />
                    <MetricCard label="Gross Profit" value="$7,104" tone="green" />
                    <MetricCard label="Safe Bid" value="$18,300" />
                    <MetricCard label="Max Smart Bid" value="$19,800" tone="blue" />
                    <MetricCard label="Stretch Bid" value="$21,200" tone="purple" />
                    <MetricCard label="Risk Grade" value="C" tone="orange" />
                  </div>

                  <div className="mt-4 rounded-2xl bg-emerald-600 p-5 text-white">
                    <div className="text-3xl font-black">Bid If Clean</div>
                    <p className="mt-2 text-sm text-emerald-50">
                      Strong comp support, moderate recon, moderate risk.
                    </p>
                  </div>
                </SectionCard>

                <SectionCard title="5. Cost & Risk">
                  <div className="space-y-2 text-sm">
                    {[
                      ["Auction Fee", "$546"],
                      ["Transport", "$800"],
                      ["Recon", "$950"],
                      ["Detail/Admin", "$250"],
                      ["General Risk Reserve", "$600"],
                      ["Brand Risk Add", "$250"],
                      ["Title/History Risk Add", "$500"],
                      ["Condition Risk Add", "$900"],
                    ].map(([label, value]) => (
                      <div key={label} className="flex justify-between">
                        <span className="text-slate-500">{label}</span>
                        <span className="font-semibold">{value}</span>
                      </div>
                    ))}
                    <div className="mt-4 border-t border-slate-200 pt-4">
                      <div className="flex justify-between text-base font-bold">
                        <span>Total Cost Adders</span>
                        <span>$4,796</span>
                      </div>
                      <div className="mt-2 flex justify-between text-base font-bold text-red-600">
                        <span>Total Risk Points</span>
                        <span>125 / 300</span>
                      </div>
                    </div>
                  </div>
                </SectionCard>

                <SectionCard title="7. Deal Notes">
                  <textarea
                    className="h-28 w-full rounded-xl border border-slate-200 p-3 text-sm"
                    defaultValue="Clean title Q7 with good service history. Minor cosmetic wear, needs tires. Strong local demand for this trim."
                  />
                  <button className="mt-3 rounded-xl bg-blue-700 px-4 py-2 text-sm font-semibold text-white">
                    Save Note
                  </button>
                </SectionCard>
              </aside>
            </div>
          </div>
        </div>
      </div>
    </main>
  );
}
