import Link from "next/link";

import { LotLogicLogo } from "@/components/branding/lot-logic-logo";

function CheckIcon() {
  return (
    <svg viewBox="0 0 20 20" aria-hidden="true" className="h-5 w-5 fill-none stroke-current" strokeWidth="2">
      <path d="m4 10 3.5 3.5L16 5.5" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function ArrowIcon() {
  return (
    <svg viewBox="0 0 20 20" aria-hidden="true" className="h-4 w-4 fill-none stroke-current" strokeWidth="2">
      <path d="M4 10h12M11 5l5 5-5 5" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function SparkIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" className="h-5 w-5 fill-none stroke-current" strokeWidth="1.8">
      <path d="M12 2.75 13.8 8.2 19.25 10 13.8 11.8 12 17.25 10.2 11.8 4.75 10 10.2 8.2 12 2.75Z" strokeLinejoin="round" />
      <path d="m18.2 15.1.8 2.4 2.4.8-2.4.8-.8 2.4-.8-2.4-2.4-.8 2.4-.8.8-2.4Z" strokeLinejoin="round" />
    </svg>
  );
}

const benefits = [
  "VIN-specific vehicle intelligence",
  "Geographically relevant true comps",
  "AI-assisted reconditioning estimates",
  "Dealer-specific fit and sweet-spot analysis",
  "All-in basis, margin, and bid guidance",
  "Prospect tracking across auctions and marketplaces",
];

const workflow = [
  {
    number: "01",
    title: "Drop in the VIN",
    body: "Start with a vehicle from an auction, marketplace, trade opportunity, or sourcing lead. Lot Logic builds the vehicle profile in seconds.",
  },
  {
    number: "02",
    title: "Let AI build the picture",
    body: "Lot Logic combines vehicle data, local-market comps, mileage, trim, condition, fees, transport, recon exposure, and your dealership rules.",
  },
  {
    number: "03",
    title: "See the deal clearly",
    body: "Review expected retail, all-in basis, likely recon, margin, risk, comp confidence, dealer fit, and the price you can afford to pay.",
  },
  {
    number: "04",
    title: "Track what wins",
    body: "Save prospective vehicles, compare opportunities, and learn which cars consistently fit your market, customers, and economics.",
  },
];

const painPoints = [
  {
    title: "Retail value is easy to misjudge",
    body: "A national guidebook number is not your market. Lot Logic starts with the real competitive set around your dealership.",
  },
  {
    title: "The margin can disappear after purchase",
    body: "Auction fees, transport, condition, repair exposure, and ordinary recon all change what you can actually afford to pay.",
  },
  {
    title: "Raw data still leaves the decision to you",
    body: "Lot Logic does the synthesis—turning fragmented inputs into one acquisition view built for a professional buyer.",
  },
];

export function LotLogicMarketingSite() {
  return (
    <main className="min-h-screen bg-[#f6f8fb] text-slate-950">
      <header className="sticky top-0 z-50 border-b border-slate-200/80 bg-white/90 backdrop-blur-xl">
        <div className="mx-auto flex max-w-[1240px] items-center gap-6 px-5 py-3.5 lg:px-8">
          <Link href="/" aria-label="Lot Logic home" className="shrink-0">
            <LotLogicLogo className="h-9" />
          </Link>

          <nav className="mx-auto hidden items-center gap-7 text-sm font-bold text-slate-600 md:flex">
            <a href="#product" className="transition hover:text-slate-950">Product</a>
            <a href="#how-it-works" className="transition hover:text-slate-950">How it works</a>
            <a href="#recon" className="transition hover:text-slate-950">AI Recon</a>
            <a href="#why-lot-logic" className="transition hover:text-slate-950">Why Lot Logic</a>
          </nav>

          <div className="ml-auto flex items-center gap-2.5">
            <Link href="/login" className="hidden rounded-xl px-4 py-2.5 text-sm font-extrabold text-slate-700 transition hover:bg-slate-100 sm:inline-flex">
              Sign in
            </Link>
            <Link href="/evaluate" className="inline-flex items-center gap-2 rounded-xl bg-slate-950 px-4 py-2.5 text-sm font-extrabold text-white shadow-sm transition hover:bg-slate-800">
              Try Lot Logic <ArrowIcon />
            </Link>
          </div>
        </div>
      </header>

      <section className="relative overflow-hidden border-b border-slate-200 bg-white">
        <div className="absolute inset-x-0 top-0 h-[520px] bg-[radial-gradient(circle_at_75%_15%,rgba(37,99,235,0.13),transparent_34%),radial-gradient(circle_at_12%_20%,rgba(15,23,42,0.05),transparent_28%)]" />
        <div className="relative mx-auto grid max-w-[1240px] items-center gap-14 px-5 py-20 lg:grid-cols-[0.92fr_1.08fr] lg:px-8 lg:py-28">
          <div>
            <div className="mb-6 inline-flex items-center gap-2 rounded-full border border-blue-200 bg-blue-50 px-3 py-1.5 text-xs font-black uppercase tracking-[0.14em] text-blue-700">
              <SparkIcon /> AI acquisition intelligence for automotive professionals
            </div>
            <h1 className="max-w-3xl text-5xl font-black tracking-[-0.055em] text-slate-950 sm:text-6xl lg:text-[72px] lg:leading-[0.98]">
              Know the deal before you buy the car.
            </h1>
            <p className="mt-7 max-w-2xl text-lg font-medium leading-8 text-slate-600 sm:text-xl">
              Lot Logic uses AI to evaluate any VIN against true local-market comps, your dealership&apos;s strengths, likely reconditioning costs, and your profit targets—so you know what a vehicle is worth <span className="font-extrabold text-slate-900">to you</span>.
            </p>
            <div className="mt-8 flex flex-col gap-3 sm:flex-row">
              <Link href="/evaluate" className="inline-flex items-center justify-center gap-2 rounded-2xl bg-blue-600 px-6 py-3.5 text-base font-black text-white shadow-[0_14px_35px_rgba(37,99,235,0.24)] transition hover:bg-blue-700">
                Try Lot Logic <ArrowIcon />
              </Link>
              <a href="#how-it-works" className="inline-flex items-center justify-center rounded-2xl border border-slate-300 bg-white px-6 py-3.5 text-base font-black text-slate-800 shadow-sm transition hover:border-slate-400 hover:bg-slate-50">
                See how it works
              </a>
            </div>
            <div className="mt-8 flex flex-wrap gap-x-6 gap-y-2 text-sm font-bold text-slate-500">
              <span className="inline-flex items-center gap-2"><span className="text-blue-600"><CheckIcon /></span> Built for professional buyers</span>
              <span className="inline-flex items-center gap-2"><span className="text-blue-600"><CheckIcon /></span> Auction + marketplace ready</span>
              <span className="inline-flex items-center gap-2"><span className="text-blue-600"><CheckIcon /></span> AI-first workflow</span>
            </div>
          </div>

          <div className="relative">
            <div className="absolute -inset-7 rounded-[36px] bg-gradient-to-br from-blue-100/60 via-transparent to-slate-200/50 blur-2xl" />
            <div className="relative overflow-hidden rounded-[28px] border border-slate-200 bg-slate-950 p-2.5 shadow-[0_30px_80px_rgba(15,23,42,0.20)]">
              <div className="overflow-hidden rounded-[20px] bg-[#f8fafc]">
                <div className="flex items-center justify-between border-b border-slate-200 bg-white px-5 py-4">
                  <div>
                    <div className="text-[11px] font-black uppercase tracking-[0.16em] text-slate-400">Illustrative evaluation</div>
                    <div className="mt-1 text-lg font-black text-slate-950">2022 Volkswagen Taos SE</div>
                  </div>
                  <span className="rounded-full bg-emerald-100 px-3 py-1 text-xs font-black text-emerald-700">Strong Fit</span>
                </div>

                <div className="grid gap-3 p-5 sm:grid-cols-3">
                  <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
                    <div className="text-[10px] font-black uppercase tracking-[0.12em] text-slate-400">Expected Retail</div>
                    <div className="mt-2 text-2xl font-black tracking-tight text-slate-950">$24,400</div>
                    <div className="mt-2 text-xs font-bold text-emerald-600">Local market supported</div>
                  </div>
                  <div className="rounded-2xl border border-blue-200 bg-blue-50 p-4">
                    <div className="text-[10px] font-black uppercase tracking-[0.12em] text-blue-500">Max Buy</div>
                    <div className="mt-2 text-2xl font-black tracking-tight text-blue-950">$18,650</div>
                    <div className="mt-2 text-xs font-bold text-blue-600">At target margin</div>
                  </div>
                  <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
                    <div className="text-[10px] font-black uppercase tracking-[0.12em] text-slate-400">Dealer Fit</div>
                    <div className="mt-2 text-2xl font-black tracking-tight text-slate-950">91 / 100</div>
                    <div className="mt-2 text-xs font-bold text-emerald-600">Inside your sweet spot</div>
                  </div>
                </div>

                <div className="grid gap-4 px-5 pb-5 sm:grid-cols-[1.15fr_0.85fr]">
                  <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
                    <div className="flex items-center justify-between gap-4">
                      <div>
                        <div className="text-sm font-black text-slate-950">True market comparison</div>
                        <div className="mt-1 text-xs font-semibold text-slate-500">Trim + mileage + geography weighted</div>
                      </div>
                      <span className="rounded-lg bg-slate-100 px-2.5 py-1 text-[10px] font-black uppercase tracking-wide text-slate-600">High confidence</span>
                    </div>
                    <div className="mt-5 space-y-3">
                      {[72, 86, 64, 79].map((width, index) => (
                        <div key={index} className="grid grid-cols-[1fr_auto] items-center gap-3">
                          <div className="h-2.5 overflow-hidden rounded-full bg-slate-100">
                            <div className="h-full rounded-full bg-slate-800" style={{ width: `${width}%` }} />
                          </div>
                          <div className="w-16 text-right text-xs font-black text-slate-600">${[23990, 24500, 22995, 24950][index].toLocaleString()}</div>
                        </div>
                      ))}
                    </div>
                  </div>

                  <div id="recon" className="rounded-2xl border border-violet-200 bg-violet-50 p-5">
                    <div className="flex items-center gap-2 text-violet-700"><SparkIcon /><span className="text-xs font-black uppercase tracking-[0.12em]">AI Recon</span></div>
                    <div className="mt-3 text-3xl font-black tracking-tight text-violet-950">$1,280</div>
                    <div className="mt-1 text-xs font-bold text-violet-700">Estimated reconditioning exposure</div>
                    <div className="mt-4 space-y-2 text-xs font-bold text-violet-900/75">
                      <div className="flex justify-between"><span>Tires / wear</span><span>$460</span></div>
                      <div className="flex justify-between"><span>Cosmetic</span><span>$320</span></div>
                      <div className="flex justify-between"><span>Mechanical reserve</span><span>$500</span></div>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      <section id="product" className="mx-auto max-w-[1240px] px-5 py-20 lg:px-8 lg:py-28">
        <div className="grid gap-12 lg:grid-cols-[0.8fr_1.2fr] lg:items-end">
          <div>
            <div className="text-xs font-black uppercase tracking-[0.16em] text-blue-600">One decision view</div>
            <h2 className="mt-4 text-4xl font-black tracking-[-0.04em] text-slate-950 sm:text-5xl">Stop stitching the deal together in your head.</h2>
          </div>
          <p className="max-w-2xl text-lg font-medium leading-8 text-slate-600">
            Traditional tools give you pieces: a book value, a few listings, an auction fee calculator, a repair guess. Lot Logic combines the pieces into the decision—fast enough to use while you are actually buying.
          </p>
        </div>

        <div className="mt-12 grid gap-4 md:grid-cols-3">
          {painPoints.map((item) => (
            <article key={item.title} className="rounded-[24px] border border-slate-200 bg-white p-7 shadow-[0_12px_35px_rgba(15,23,42,0.05)]">
              <div className="mb-5 h-1.5 w-12 rounded-full bg-blue-600" />
              <h3 className="text-xl font-black tracking-tight text-slate-950">{item.title}</h3>
              <p className="mt-3 text-sm font-medium leading-6 text-slate-600">{item.body}</p>
            </article>
          ))}
        </div>
      </section>

      <section id="how-it-works" className="border-y border-slate-200 bg-slate-950 text-white">
        <div className="mx-auto max-w-[1240px] px-5 py-20 lg:px-8 lg:py-28">
          <div className="max-w-3xl">
            <div className="text-xs font-black uppercase tracking-[0.16em] text-blue-400">From VIN to decision</div>
            <h2 className="mt-4 text-4xl font-black tracking-[-0.04em] sm:text-5xl">Four steps. One clear acquisition answer.</h2>
            <p className="mt-5 text-lg font-medium leading-8 text-slate-300">Built for the speed of auctions and marketplaces, without reducing a complex buying decision to a generic book number.</p>
          </div>

          <div className="mt-12 grid gap-px overflow-hidden rounded-[26px] border border-white/10 bg-white/10 md:grid-cols-2 lg:grid-cols-4">
            {workflow.map((item) => (
              <article key={item.number} className="bg-slate-950 p-7 lg:min-h-64">
                <div className="text-sm font-black text-blue-400">{item.number}</div>
                <h3 className="mt-10 text-xl font-black tracking-tight">{item.title}</h3>
                <p className="mt-3 text-sm font-medium leading-6 text-slate-400">{item.body}</p>
              </article>
            ))}
          </div>
        </div>
      </section>

      <section className="bg-white">
        <div className="mx-auto grid max-w-[1240px] gap-12 px-5 py-20 lg:grid-cols-2 lg:items-center lg:px-8 lg:py-28">
          <div>
            <div className="text-xs font-black uppercase tracking-[0.16em] text-blue-600">True comps, not loose lookalikes</div>
            <h2 className="mt-4 text-4xl font-black tracking-[-0.04em] text-slate-950 sm:text-5xl">The comp set is where valuation quality starts.</h2>
            <p className="mt-5 text-lg font-medium leading-8 text-slate-600">
              Lot Logic prioritizes the details that materially change retail value—trim, body configuration, mileage, geography, and market relevance—so a superficially similar listing does not distort the deal.
            </p>
            <div className="mt-7 grid gap-3 sm:grid-cols-2">
              {["VIN + trim aware", "Mileage-adjusted", "Geographically relevant", "Confidence surfaced"].map((item) => (
                <div key={item} className="flex items-center gap-3 rounded-xl bg-slate-50 px-4 py-3 text-sm font-extrabold text-slate-700">
                  <span className="text-blue-600"><CheckIcon /></span>{item}
                </div>
              ))}
            </div>
          </div>

          <div className="rounded-[28px] border border-slate-200 bg-[#f7f9fc] p-6 shadow-[0_20px_55px_rgba(15,23,42,0.08)] sm:p-8">
            <div className="flex items-center justify-between border-b border-slate-200 pb-4">
              <div>
                <div className="text-sm font-black text-slate-950">Comparable retail market</div>
                <div className="mt-1 text-xs font-bold text-slate-500">Charleston, SC · 150-mile radius</div>
              </div>
              <span className="rounded-lg bg-emerald-100 px-2.5 py-1 text-[10px] font-black uppercase tracking-wide text-emerald-700">8 strong comps</span>
            </div>
            <div className="mt-4 space-y-2.5">
              {[
                ["2022 Taos SE", "31,210 mi", "$24,500", "12 mi"],
                ["2022 Taos SE", "37,840 mi", "$23,990", "28 mi"],
                ["2021 Taos SE", "34,150 mi", "$22,995", "43 mi"],
                ["2022 Taos SE", "29,880 mi", "$24,950", "67 mi"],
              ].map(([vehicle, mileage, price, distance]) => (
                <div key={`${vehicle}-${mileage}`} className="grid grid-cols-[1fr_auto] gap-4 rounded-xl border border-slate-200 bg-white px-4 py-3 shadow-sm sm:grid-cols-[1fr_auto_auto_auto] sm:items-center">
                  <div className="text-sm font-black text-slate-900">{vehicle}</div>
                  <div className="hidden text-xs font-bold text-slate-500 sm:block">{mileage}</div>
                  <div className="text-sm font-black text-slate-900">{price}</div>
                  <div className="hidden text-xs font-bold text-slate-400 sm:block">{distance}</div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </section>

      <section className="border-y border-slate-200 bg-[#f5f7fb]">
        <div className="mx-auto grid max-w-[1240px] gap-12 px-5 py-20 lg:grid-cols-[0.9fr_1.1fr] lg:items-center lg:px-8 lg:py-28">
          <div className="order-2 lg:order-1">
            <div className="grid gap-3 sm:grid-cols-2">
              {benefits.map((benefit, index) => (
                <div key={benefit} className={`rounded-2xl border p-5 ${index === 2 ? "border-violet-200 bg-violet-50" : "border-slate-200 bg-white"}`}>
                  <div className={`mb-4 inline-grid h-9 w-9 place-items-center rounded-xl ${index === 2 ? "bg-violet-600 text-white" : "bg-slate-950 text-white"}`}>
                    {index === 2 ? <SparkIcon /> : <span className="text-sm font-black">{index + 1}</span>}
                  </div>
                  <div className="text-sm font-black leading-5 text-slate-900">{benefit}</div>
                </div>
              ))}
            </div>
          </div>
          <div className="order-1 lg:order-2">
            <div className="text-xs font-black uppercase tracking-[0.16em] text-violet-600">AI reconditioning intelligence</div>
            <h2 className="mt-4 text-4xl font-black tracking-[-0.04em] text-slate-950 sm:text-5xl">A cheap car is not a good deal if recon eats the margin.</h2>
            <p className="mt-5 text-lg font-medium leading-8 text-slate-600">
              Lot Logic uses AI-assisted condition analysis and automotive repair intelligence to estimate likely reconditioning exposure before you own the vehicle. That estimate becomes part of the acquisition economics—not an unpleasant surprise after the purchase.
            </p>
            <p className="mt-5 text-sm font-semibold leading-6 text-slate-500">
              Estimates are decision support, not a substitute for a physical inspection or professional diagnosis. Lot Logic surfaces uncertainty so buyers can price risk rather than pretend it does not exist.
            </p>
          </div>
        </div>
      </section>

      <section id="why-lot-logic" className="bg-white">
        <div className="mx-auto max-w-[1240px] px-5 py-20 lg:px-8 lg:py-28">
          <div className="overflow-hidden rounded-[30px] bg-blue-600 px-7 py-10 text-white shadow-[0_25px_65px_rgba(37,99,235,0.22)] sm:px-10 lg:grid lg:grid-cols-[1fr_0.9fr] lg:items-center lg:gap-10 lg:px-14 lg:py-14">
            <div>
              <div className="text-xs font-black uppercase tracking-[0.16em] text-blue-100">Dealer-specific intelligence</div>
              <h2 className="mt-4 max-w-2xl text-4xl font-black tracking-[-0.045em] sm:text-5xl">Not “What is this car worth?”</h2>
              <p className="mt-3 text-3xl font-black tracking-[-0.035em] text-blue-100 sm:text-4xl">What is this car worth to your dealership?</p>
            </div>
            <div className="mt-8 rounded-2xl border border-white/20 bg-white/10 p-6 lg:mt-0">
              <p className="text-base font-semibold leading-7 text-blue-50">
                The same vehicle can be a great acquisition for one dealer and a poor one for another. Lot Logic is built to account for your customer sweet spots, target margins, sourcing preferences, local market, operating costs, and—over time—what your own results prove you are good at.
              </p>
            </div>
          </div>

          <div className="mt-16 grid gap-10 lg:grid-cols-2 lg:items-center">
            <div>
              <div className="text-xs font-black uppercase tracking-[0.16em] text-blue-600">Prospect pipeline</div>
              <h2 className="mt-4 text-4xl font-black tracking-[-0.04em] text-slate-950">Evaluate cars. Save the opportunities. Learn what works.</h2>
              <p className="mt-5 text-lg font-medium leading-8 text-slate-600">
                Lot Logic keeps prospective vehicles together so buyers can compare opportunities across auctions and marketplaces instead of losing decisions in browser tabs, notes, and spreadsheets.
              </p>
            </div>
            <div className="rounded-[26px] border border-slate-200 bg-[#f7f9fc] p-5 shadow-[0_18px_50px_rgba(15,23,42,0.07)]">
              <div className="mb-4 flex items-center justify-between">
                <div className="text-sm font-black text-slate-950">Acquisition Pipeline</div>
                <span className="rounded-lg border border-slate-200 bg-white px-2.5 py-1 text-[10px] font-black uppercase tracking-wide text-slate-500">4 active</span>
              </div>
              {[
                ["2022 VW Taos SE", "Strong Fit", "$18,650", "91"],
                ["2021 Mazda CX-5 Touring", "Strong Fit", "$19,200", "88"],
                ["2020 BMW X3 xDrive30i", "Review Risk", "$21,450", "66"],
                ["2023 Nissan Rogue SV", "Pass", "$20,100", "42"],
              ].map(([vehicle, status, maxBuy, fit]) => (
                <div key={vehicle} className="mb-2.5 grid grid-cols-[1fr_auto] items-center gap-3 rounded-xl border border-slate-200 bg-white p-4 sm:grid-cols-[1fr_auto_auto]">
                  <div>
                    <div className="text-sm font-black text-slate-900">{vehicle}</div>
                    <div className="mt-1 text-[11px] font-bold text-slate-400">Dealer fit {fit}/100</div>
                  </div>
                  <div className="hidden text-right sm:block">
                    <div className="text-[10px] font-black uppercase tracking-wide text-slate-400">Max buy</div>
                    <div className="mt-0.5 text-sm font-black text-slate-900">{maxBuy}</div>
                  </div>
                  <span className={`rounded-full px-2.5 py-1 text-[10px] font-black uppercase tracking-wide ${status === "Strong Fit" ? "bg-emerald-100 text-emerald-700" : status === "Pass" ? "bg-rose-100 text-rose-700" : "bg-amber-100 text-amber-700"}`}>{status}</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      </section>

      <section className="border-t border-slate-200 bg-slate-950 text-white">
        <div className="mx-auto grid max-w-[1240px] gap-10 px-5 py-20 lg:grid-cols-[0.85fr_1.15fr] lg:items-center lg:px-8 lg:py-24">
          <div>
            <div className="text-xs font-black uppercase tracking-[0.16em] text-blue-400">Built from the lot up</div>
            <h2 className="mt-4 text-4xl font-black tracking-[-0.04em] sm:text-5xl">Built by car people because we needed it ourselves.</h2>
          </div>
          <div>
            <p className="text-lg font-medium leading-8 text-slate-300">
              Lot Logic started inside Mindful Motor Co. as a better way to decide which cars were actually worth buying. We wanted the market, the risks, the recon, the costs, and the margin in one place—without sacrificing the judgment that makes a good buyer good.
            </p>
            <p className="mt-5 text-lg font-semibold leading-8 text-white">The result is an AI buying tool designed around how professional acquisition decisions actually happen.</p>
          </div>
        </div>
      </section>

      <section className="bg-white">
        <div className="mx-auto max-w-[980px] px-5 py-20 text-center lg:px-8 lg:py-28">
          <div className="mx-auto inline-flex items-center gap-2 rounded-full bg-blue-50 px-3 py-1.5 text-xs font-black uppercase tracking-[0.14em] text-blue-700"><SparkIcon /> Launching now</div>
          <h2 className="mt-5 text-4xl font-black tracking-[-0.045em] text-slate-950 sm:text-6xl">Make the next buying decision with the whole deal in view.</h2>
          <p className="mx-auto mt-6 max-w-2xl text-lg font-medium leading-8 text-slate-600">Evaluate the VIN. Understand the market. Price the recon. Protect the margin.</p>
          <div className="mt-8">
            <Link href="/evaluate" className="inline-flex items-center gap-2 rounded-2xl bg-blue-600 px-7 py-4 text-base font-black text-white shadow-[0_14px_35px_rgba(37,99,235,0.24)] transition hover:bg-blue-700">
              Try Lot Logic <ArrowIcon />
            </Link>
          </div>
        </div>
      </section>

      <footer className="border-t border-slate-200 bg-[#f6f8fb]">
        <div className="mx-auto flex max-w-[1240px] flex-col gap-5 px-5 py-8 sm:flex-row sm:items-center sm:justify-between lg:px-8">
          <LotLogicLogo className="h-8" />
          <div className="text-xs font-bold text-slate-500">AI-powered vehicle acquisition intelligence for automotive professionals.</div>
          <div className="text-xs font-bold text-slate-400">By Mindful Motor Co.</div>
        </div>
      </footer>
    </main>
  );
}
