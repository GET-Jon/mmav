"use client";

import { useMemo, useState } from "react";

type Criteria = { vehicle: string; budget: string; mileage: string };
type Adjustment = "vehicle" | "budget" | "mileage" | "none";
const initial: Criteria = { vehicle: "2008 Audi S4", budget: "9000", mileage: "100000" };
const formatMoney = (value: string) => Number(value || 0).toLocaleString("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 });
const formatMiles = (value: string) => value === "flexible" ? "Flexible mileage" : `Under ${Number(value || 0).toLocaleString("en-US")} miles`;

export default function MotorMatchConversationalPage() {
  const [step, setStep] = useState(0);
  const [criteria, setCriteria] = useState<Criteria>(initial);
  const [original, setOriginal] = useState<Criteria | null>(null);
  const [adjustment, setAdjustment] = useState<Adjustment>("none");
  const [draft, setDraft] = useState("");
  const [considerAlternatives, setConsiderAlternatives] = useState(true);
  const [trade, setTrade] = useState<"yes" | "maybe" | "no">("no");
  const [name, setName] = useState("");
  const [contact, setContact] = useState("");
  const [history, setHistory] = useState<{ field: string; previous: string; next: string }[]>([]);
  const [message, setMessage] = useState("");

  const canContinue = useMemo(() => {
    if (step === 1) return criteria.vehicle.trim().length >= 3;
    if (step === 2) return Number(criteria.budget) > 0;
    if (step === 3) return criteria.mileage === "flexible" || Number(criteria.mileage) > 0;
    return true;
  }, [step, criteria]);

  function next() {
    if (!canContinue) return;
    if (step === 4 && !original) setOriginal({ ...criteria });
    if (step === 5) {
      if (adjustment !== "none") {
        setMessage("Apply your change first, or choose to keep the current request.");
        return;
      }
    }
    setMessage("");
    setStep(s => Math.min(7, s + 1));
  }

  function chooseAdjustment(field: Adjustment) {
    setAdjustment(field);
    setMessage("");
    setDraft(field === "none" ? "" : criteria[field]);
  }

  function applyAdjustment() {
    if (adjustment === "none") return;
    if (adjustment === "vehicle" && draft.trim().length < 3) return;
    if (adjustment === "budget" && !(Number(draft) > 0)) return;
    if (adjustment === "mileage" && draft !== "flexible" && !(Number(draft) > 0)) return;
    const previous = criteria[adjustment];
    if (previous !== draft) {
      setCriteria(c => ({ ...c, [adjustment]: draft }));
      setHistory(h => [...h, { field: adjustment, previous, next: draft }]);
    }
    setAdjustment("none");
    setMessage("Preferences updated. You can adjust another item, restore the original, or continue.");
  }

  function reset() {
    setCriteria(original ?? initial);
    setAdjustment("none");
    setHistory([]);
    setMessage("Your original search has been restored.");
  }

  const button = "rounded-xl bg-[#b77842] px-5 py-3 font-semibold text-white transition hover:bg-[#9f602f] disabled:cursor-not-allowed disabled:opacity-40";
  const secondary = "rounded-xl border border-neutral-300 px-4 py-3 font-medium text-neutral-700 hover:bg-neutral-100";
  const field = "w-full rounded-xl border border-neutral-300 bg-white px-4 py-3 text-lg text-neutral-900 outline-none focus:border-[#b77842] focus:ring-2 focus:ring-[#b77842]/20";
  const steps = ["Welcome", "Vehicle", "Budget", "Mileage", "Market reality", "Adjust", "Current vehicle", "Review"];
  return (
    <main className="min-h-screen bg-[#f7f6f3] px-4 py-10 text-neutral-900">
      <div className="mx-auto max-w-xl rounded-3xl border border-neutral-200 bg-white p-5 shadow-sm sm:p-9">
        <header className="mb-8 flex items-center justify-between gap-3">
          <div><p className="text-xs font-bold tracking-[.2em] text-[#ae7547]">MINDFUL MOTORS</p><p className="text-sm text-neutral-500">Motor Match · Conversational preview</p></div>
          <span className="rounded-full bg-neutral-100 px-3 py-1 text-xs font-medium">{step === 0 ? "Start" : `${step} of 7`}</span>
        </header>
        <div className="mb-8 flex gap-1" role="progressbar" aria-valuenow={step} aria-valuemin={0} aria-valuemax={7} aria-label="Motor Match progress">
          {steps.slice(1).map((s, i) => <span key={s} className={`h-1.5 flex-1 rounded-full ${step >= i + 1 ? "bg-[#b77842]" : "bg-neutral-200"}`} />)}
        </div>
        <div className="min-h-[340px] space-y-5">
          {step === 0 && <><p className="text-xs font-semibold uppercase tracking-widest text-[#ae7547]">Find something worth driving</p><h1 className="text-3xl font-bold">Let's find your next car.</h1><p className="text-neutral-600">Start with the car you want. We'll work through budget and mileage together, and you can decide which compromises—if any—make sense.</p><p className="text-sm text-neutral-500">No pressure, no commitment.</p></>}
          {step === 1 && <><h1 className="text-2xl font-bold">What car has caught your eye?</h1><p className="text-neutral-600">Start with at least one make and model. Exact year or trim is optional.</p><label className="block text-sm font-medium" htmlFor="vehicle">Car you'd love to own</label><input id="vehicle" className={field} value={criteria.vehicle} onChange={e => setCriteria(c => ({ ...c, vehicle: e.target.value }))} placeholder="e.g. 2008 Audi S4" /><p className="text-sm text-neutral-500">We won't replace your first choice with an alternative unless you ask us to.</p></>}
          {step === 2 && <><h1 className="text-2xl font-bold">What would you like to spend?</h1><p className="text-neutral-600">A ballpark is fine. We'll confirm whether this is the car price or out-the-door budget later.</p><label className="block text-sm font-medium" htmlFor="budget">Budget in dollars</label><input id="budget" type="number" min="1" className={field} value={criteria.budget} onChange={e => setCriteria(c => ({ ...c, budget: e.target.value }))} /></>}
          {step === 3 && <><h1 className="text-2xl font-bold">How many miles are too many?</h1><p className="text-neutral-600">Pick what's comfortable; we'll also consider maintenance and condition.</p><div className="space-y-2">{[["50000","Under 50,000"],["75000","Under 75,000"],["100000","Under 100,000"],["125000","Under 125,000"],["flexible","Depends on the car"]].map(([value,label]) => <label key={value} className="flex cursor-pointer items-center gap-3 rounded-xl border border-neutral-200 p-3"><input type="radio" name="mileage" checked={criteria.mileage === value} onChange={() => setCriteria(c => ({ ...c, mileage: value }))} className="accent-[#b77842]" />{label}</label>)}</div></>}
          {step === 4 && <><h1 className="text-2xl font-bold">Here's your starting point.</h1><div className="space-y-3 rounded-xl bg-neutral-50 p-5"><p><span className="text-neutral-500">Car:</span> <strong>{criteria.vehicle}</strong></p><p><span className="text-neutral-500">Budget:</span> <strong>{formatMoney(criteria.budget)}</strong></p><p><span className="text-neutral-500">Mileage:</span> <strong>{formatMiles(criteria.mileage)}</strong></p></div><div className="rounded-xl border border-amber-200 bg-amber-50 p-4"><p className="font-semibold">Let's check the market together</p><p className="mt-2 text-sm text-neutral-700">Sometimes all three fit. Sometimes finding the right car means adjusting one. We haven't verified live listings in this preview, so we won't label your search impossible or quote invented prices.</p></div><p className="text-sm text-neutral-500">Next, you can keep your request exactly as it is, or experiment with one change at a time.</p></>}
          {step === 5 && <><h1 className="text-2xl font-bold">Which one would you adjust?</h1><p className="text-neutral-600">Nothing is forced. Each adjustment can be changed again.</p><div className="grid gap-2">{([["vehicle","Try another car",criteria.vehicle],["budget","Change my budget",formatMoney(criteria.budget)],["mileage","Adjust mileage",formatMiles(criteria.mileage)],["none","Keep this exact search","Have Mindful keep hunting"]] as const).map(([id,title,value]) => <button key={id} type="button" onClick={() => chooseAdjustment(id)} aria-pressed={adjustment===id} className={`rounded-xl border p-3 text-left ${adjustment === id ? "border-[#b77842] bg-[#fff7f0]" : "border-neutral-200"}`}><span className="block font-semibold">{title}</span><span className="text-sm text-neutral-600">{value}</span></button>)}</div>{adjustment !== "none" && <div className="space-y-3 rounded-xl bg-neutral-50 p-4"><label className="block text-sm font-semibold" htmlFor="newvalue">{adjustment === "vehicle" ? "Another vehicle" : adjustment === "budget" ? "New budget ($)" : "Maximum mileage"}</label>{adjustment === "mileage" ? <select id="newvalue" value={draft} onChange={e => setDraft(e.target.value)} className={field}>{[["50000","50,000"],["75000","75,000"],["100000","100,000"],["125000","125,000"],["150000","150,000"],["flexible","Flexible"]].map(([v,l]) => <option key={v} value={v}>{l}</option>)}</select> : <input id="newvalue" type={adjustment === "budget" ? "number" : "text"} className={field} value={draft} onChange={e => setDraft(e.target.value)}/>}<button type="button" className={button} onClick={applyAdjustment}>Apply change</button></div>}<div className="flex flex-wrap items-center gap-3"><button type="button" className={secondary} onClick={reset}>Restore original</button><span className="text-xs text-neutral-500">{history.length} adjustment{history.length === 1 ? "" : "s"} made</span></div><label className="flex items-start gap-3 text-sm"><input type="checkbox" checked={considerAlternatives} onChange={e => setConsiderAlternatives(e.target.checked)} className="mt-1 accent-[#b77842]"/>Also consider similar cars while keeping my selected car on the list</label></>}
          {step === 6 && <><h1 className="text-2xl font-bold">Have a car to sell or trade?</h1><p className="text-neutral-600">We can help assess your current vehicle and any loan payoff separately.</p><div className="space-y-2">{[["yes","Yes"],["maybe","Maybe, depending on value"],["no","No, just looking"]].map(([value,label]) => <label key={value} className="flex gap-3 rounded-xl border border-neutral-200 p-3"><input type="radio" name="trade" checked={trade === value} onChange={() => setTrade(value as typeof trade)} className="accent-[#b77842]"/>{label}</label>)}</div><p className="text-sm text-neutral-500">Vehicle VIN and loan information will be handled in an optional follow-up, not required here.</p></>}
          {step === 7 && <><h1 className="text-2xl font-bold">Ready for Mindful to take it from here?</h1><div className="space-y-2 rounded-xl bg-neutral-50 p-4"><p><strong>{criteria.vehicle}</strong></p><p>{formatMoney(criteria.budget)} · {formatMiles(criteria.mileage)}</p><p className="text-sm text-neutral-600">{considerAlternatives ? "Similar cars welcome" : "Specific model preferred"} · Trade: {trade}</p></div><label className="block text-sm font-medium" htmlFor="contactname">Your name</label><input id="contactname" value={name} onChange={e => setName(e.target.value)} className={field} placeholder="Name"/><label className="block text-sm font-medium" htmlFor="contactdetails">Phone or email</label><input id="contactdetails" value={contact} onChange={e => setContact(e.target.value)} className={field} placeholder="How should we contact you?"/><div className="rounded-xl border border-neutral-200 p-4 text-sm text-neutral-600"><strong>Development preview — submissions disabled.</strong> This branch does not send personal information to the existing Supabase database. We'll enable secure submission only after the independent database is provisioned.</div></>}
        </div>
        {message && <p role="status" className="mt-4 rounded-lg bg-neutral-100 px-4 py-3 text-sm">{message}</p>}
        <nav className="mt-8 flex gap-3 border-t border-neutral-100 pt-5" aria-label="Motor Match steps">
          {step > 0 && <button type="button" className={secondary} onClick={() => {setMessage("");setStep(s => Math.max(0,s-1));setAdjustment("none");}}>Back</button>}
          <button type="button" className={`${button} flex-1`} disabled={step === 7 || !canContinue || (step === 5 && adjustment !== "none")} onClick={next}>{step === 0 ? "Let's go" : step === 7 ? "Submission unavailable in preview" : step === 5 ? "Continue with these choices" : "Continue →"}</button>
        </nav>
      </div>
    </main>
  );
}
