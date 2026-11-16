"use client";

import { useMemo, useState } from "react";

type Criteria = { vehicle: string; budget: string; mileage: string; budgetKind: "vehicle" | "out_the_door" };
type Adjustment = "vehicle" | "budget" | "mileage" | "none";
type Change = { field: Exclude<Adjustment, "none">; from: string; to: string };

const blank: Criteria = { vehicle: "", budget: "", mileage: "100000", budgetKind: "out_the_door" };
const dollars = (v: string) => Number(v || 0).toLocaleString("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 });
const mileageLabel = (v: string) => v === "flexible" ? "Flexible for the right car" : `Under ${Number(v).toLocaleString("en-US")} miles`;
const inputClass = "w-full rounded-xl border border-stone-300 bg-white px-4 py-3 text-lg text-stone-950 outline-none focus:border-[#b77842] focus:ring-2 focus:ring-amber-200";
const mainButton = "rounded-xl bg-[#af7242] px-5 py-3 font-semibold text-white hover:bg-[#955b30] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#af7242] disabled:cursor-not-allowed disabled:opacity-40";
const plainButton = "rounded-xl border border-stone-300 px-4 py-3 font-medium text-stone-700 hover:bg-stone-100";

export default function MotorMatchConversationalPage() {
  const [step, setStep] = useState(0);
  const [criteria, setCriteria] = useState<Criteria>(blank);
  const [original, setOriginal] = useState<Criteria | null>(null);
  const [adjustment, setAdjustment] = useState<Adjustment>("none");
  const [draft, setDraft] = useState("");
  const [changes, setChanges] = useState<Change[]>([]);
  const [alternatives, setAlternatives] = useState(true);
  const [additionalCars, setAdditionalCars] = useState<string[]>([]);
  const [additionalInput, setAdditionalInput] = useState("");
  const [trade, setTrade] = useState<"yes" | "maybe" | "no">("no");
  const [tradeVin, setTradeVin] = useState("");
  const [tradeMiles, setTradeMiles] = useState("");
  const [name, setName] = useState("");
  const [contact, setContact] = useState("");
  const [consent, setConsent] = useState(false);
  const [message, setMessage] = useState("");
  const [saving, setSaving] = useState(false);
  const [submitted, setSubmitted] = useState(false);

  const validStep = useMemo(() => {
    if (step === 1) return criteria.vehicle.trim().length >= 3;
    if (step === 2) return Number(criteria.budget) > 0 && Number(criteria.budget) <= 10_000_000;
    if (step === 3) return criteria.mileage === "flexible" || (Number(criteria.mileage) > 0 && Number(criteria.mileage) <= 1_000_000);
    if (step === 5) return adjustment === "none";
    return true;
  }, [step, criteria, adjustment]);

  function forward() {
    if (!validStep) return;
    if (step === 4 && !original) setOriginal({ ...criteria });
    setMessage("");
    setStep(s => Math.min(s + 1, 7));
  }

  function choose(field: Adjustment) {
    setAdjustment(field);
    setDraft(field === "none" ? "" : criteria[field]);
    setMessage("");
  }

  function apply() {
    if (adjustment === "none") return;
    const value = draft.trim();
    if ((adjustment === "vehicle" && value.length < 3) || (adjustment === "budget" && !(Number(value) > 0 && Number(value) <= 10_000_000)) || (adjustment === "mileage" && value !== "flexible" && !(Number(value) > 0 && Number(value) <= 1_000_000))) {
      setMessage("Please enter a valid choice before applying it.");
      return;
    }
    const field = adjustment;
    const previous = criteria[field];
    if (previous !== value) {
      setCriteria(c => ({ ...c, [field]: value }));
      setChanges(h => [...h, { field, from: previous, to: value }]);
    }
    setAdjustment("none");
    setMessage("Updated. You can adjust another item or keep going.");
  }

  function restore() {
    if (!original) return;
    setCriteria(original);
    setChanges([]);
    setAdjustment("none");
    setMessage("Your original request has been restored.");
  }

  async function submit() {
    if (!name.trim() || !contact.trim() || !consent || saving) {
      setMessage("Add your name, contact information and consent to proceed.");
      return;
    }
    setSaving(true); setMessage("");
    try {
      const response = await fetch("/api/motor-match-conversational/submit", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name, contact, criteria, original: original ?? criteria, changes, alternatives, additionalCars, trade, tradeVin, tradeMiles })
      });
      const body = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(body.error ?? "Unable to submit right now.");
      setSubmitted(true);
    } catch (err) {
      setMessage(err instanceof Error ? err.message : "Unable to submit right now.");
    } finally { setSaving(false); }
  }

  function addCar() {
    const value = additionalInput.trim();
    if (value.length < 3 || additionalCars.length >= 8 || value.toLowerCase() === criteria.vehicle.toLowerCase() || additionalCars.some(c => c.toLowerCase() === value.toLowerCase())) return;
    setAdditionalCars(v => [...v, value]); setAdditionalInput("");
  }

  const steps = ["Welcome", "Your car", "Budget", "Mileage", "Reality check", "Your options", "Current vehicle", "Finish"];
  return (
    <main className="min-h-screen bg-[#f8f7f4] px-4 py-9 text-stone-900">
      <div className="mx-auto max-w-xl rounded-[28px] border border-stone-200 bg-white p-5 shadow-sm sm:p-9">
        <header className="mb-7 flex items-center justify-between gap-3">
          <div><p className="text-xs font-bold tracking-[.2em] text-[#ac6b35]">MINDFUL MOTOR CO.</p><p className="mt-1 text-sm text-stone-500">MOTOR MATCH · DEVELOPMENT PREVIEW</p></div>
          <span className="shrink-0 rounded-full bg-stone-100 px-3 py-1 text-xs font-semibold">{step === 0 ? "Start" : `${step} of 7`}</span>
        </header>
        <div role="progressbar" aria-label="Motor Match progress" aria-valuenow={step} aria-valuemin={0} aria-valuemax={7} className="mb-8 flex gap-1">
          {steps.slice(1).map((s, i) => <span key={s} className={`h-1.5 flex-1 rounded-full ${step >= i + 1 ? "bg-[#af7242]" : "bg-stone-200"}`} />)}
        </div>
        {submitted ? (
          <section className="space-y-4 py-12 text-center" aria-live="polite"><p className="text-3xl">✓</p><h1 className="text-2xl font-bold">Request received.</h1><p className="text-stone-600">Mindful has your search preferences. We can discuss specifics before any purchase commitment.</p></section>
        ) : (
          <>
            <section className="min-h-[335px] space-y-5">
              {step === 0 && <><p className="text-xs font-semibold tracking-widest text-[#a4683b]">LET'S START WITH YOUR DREAM CAR</p><h1 className="text-3xl font-bold">Find something worth driving.</h1><p className="text-stone-600">Tell us what you want. We'll help you understand the options and decide what—if anything—you're willing to compromise on.</p><p className="text-sm text-stone-500">About two minutes. No obligation to buy.</p></>}
              {step === 1 && <><h1 className="text-2xl font-bold">What car do you want?</h1><p className="text-stone-600">Start with one. It's fine if you aren't sure about the year or trim.</p><label htmlFor="mm-car" className="block text-sm font-semibold">Year, make and model</label><input id="mm-car" value={criteria.vehicle} autoFocus className={inputClass} onChange={e => setCriteria(c => ({ ...c, vehicle: e.target.value }))} placeholder="e.g. 2008 Audi S4" /><p className="text-sm text-stone-500">You'll be able to add more cars later.</p></>}
              {step === 2 && <><h1 className="text-2xl font-bold">What's your budget?</h1><p className="text-stone-600">A rough figure is enough to start.</p><label htmlFor="mm-budget" className="block text-sm font-semibold">Your maximum in dollars</label><input id="mm-budget" className={inputClass} type="number" min="1" max="10000000" value={criteria.budget} onChange={e => setCriteria(c => ({ ...c, budget: e.target.value }))} placeholder="9000" /><fieldset className="space-y-2"><legend className="mb-2 text-sm font-semibold">Does that include taxes and fees?</legend>{([["out_the_door","Yes, my total budget"],["vehicle","No, that's the car price"]] as const).map(([v,label]) => <label key={v} className="flex gap-3 rounded-xl border border-stone-200 p-3 text-sm"><input type="radio" className="accent-[#af7242]" checked={criteria.budgetKind===v} onChange={() => setCriteria(c => ({ ...c, budgetKind:v }))}/>{label}</label>)}</fieldset></>}
              {step === 3 && <><h1 className="text-2xl font-bold">How many miles are you comfortable with?</h1><p className="text-stone-600">We can make exceptions for a well-maintained car later.</p><div className="space-y-2">{[["50000","Under 50,000"],["75000","Under 75,000"],["100000","Under 100,000"],["125000","Under 125,000"],["flexible","Depends on the car"]].map(([v,label])=><label key={v} className="flex gap-3 rounded-xl border border-stone-200 p-3"><input type="radio" className="accent-[#af7242]" checked={criteria.mileage===v} onChange={() => setCriteria(c => ({ ...c, mileage:v }))}/>{label}</label>)}</div></>}
              {step === 4 && <><h1 className="text-2xl font-bold">Here's your starting point.</h1><div className="space-y-3 rounded-2xl bg-stone-50 p-5"><p><span className="text-stone-500">Vehicle:</span> <strong>{criteria.vehicle}</strong></p><p><span className="text-stone-500">Budget:</span> <strong>{dollars(criteria.budget)}</strong> <span className="text-xs text-stone-500">({criteria.budgetKind==="out_the_door"?"total":"vehicle only"})</span></p><p><span className="text-stone-500">Mileage:</span> <strong>{mileageLabel(criteria.mileage)}</strong></p></div><div className="rounded-2xl border border-amber-200 bg-amber-50 p-4"><p className="font-semibold">How realistic is this combination?</p><p className="mt-2 text-sm text-stone-700">We haven't checked live inventory in this preview. Some combinations are easy to find, while others need patience or a compromise. You get to decide which requirement matters most.</p></div><p className="text-sm text-stone-500">Next, you can keep these requirements or experiment with one change at a time.</p></>}
              {step === 5 && <><h1 className="text-2xl font-bold">What would you consider changing?</h1><p className="text-stone-600">Your original request is always preserved. Choose one item, or keep everything.</p><div className="grid gap-2">{([["vehicle","Try another car",criteria.vehicle],["budget","Adjust my budget",dollars(criteria.budget)],["mileage","Adjust mileage",mileageLabel(criteria.mileage)],["none","Keep these requirements","Mindful can keep looking"]] as const).map(([id,title,detail]) => <button key={id} type="button" onClick={()=>choose(id)} aria-pressed={adjustment===id} className={`rounded-xl border px-4 py-3 text-left ${adjustment===id?"border-[#af7242] bg-amber-50":"border-stone-200"}`}><span className="block font-semibold">{title}</span><span className="block text-sm text-stone-500">{detail}</span></button>)}</div>{adjustment!=="none" && <div className="space-y-3 rounded-xl bg-stone-50 p-4"><label htmlFor="adjust" className="block text-sm font-semibold">{adjustment==="vehicle"?"Another vehicle":adjustment==="budget"?"New budget in dollars":"Maximum mileage"}</label>{adjustment==="mileage"?<select id="adjust" className={inputClass} value={draft} onChange={e=>setDraft(e.target.value)}>{[["50000","50,000"],["75000","75,000"],["100000","100,000"],["125000","125,000"],["150000","150,000"],["flexible","Flexible"]].map(([v,l])=><option key={v} value={v}>{l}</option>)}</select>:<input id="adjust" className={inputClass} type={adjustment==="budget"?"number":"text"} value={draft} onChange={e=>setDraft(e.target.value)}/>}<button type="button" className={mainButton} onClick={apply}>Apply change</button></div>}<button type="button" className={plainButton} onClick={restore} disabled={!original}>Restore original request</button><p className="text-xs text-stone-500">{changes.length} adjustment{changes.length===1?"":"s"} made</p><label className="flex gap-3 text-sm"><input type="checkbox" className="mt-1 accent-[#af7242]" checked={alternatives} onChange={e=>setAlternatives(e.target.checked)}/>Show me similar vehicles too (without replacing my choice)</label><div className="space-y-2"><label htmlFor="extra-car" className="block text-sm font-semibold">Any other cars you're interested in? <span className="font-normal text-stone-500">Optional</span></label><div className="flex gap-2"><input id="extra-car" className={inputClass} placeholder="e.g. BMW 340i" value={additionalInput} onChange={e=>setAdditionalInput(e.target.value)} onKeyDown={e=>{if(e.key==="Enter"){e.preventDefault();addCar();}}}/><button type="button" onClick={addCar} className={plainButton}>Add</button></div>{additionalCars.map((c,i)=><div key={i} className="flex items-center justify-between rounded-lg bg-stone-100 px-3 py-2 text-sm">{c}<button type="button" className="underline" onClick={()=>setAdditionalCars(a=>a.filter((_,j)=>i!==j))} aria-label={`Remove ${c}`}>Remove</button></div>)}</div></>}
              {step === 6 && <><h1 className="text-2xl font-bold">Have a car to sell or trade?</h1><p className="text-stone-600">We can also help you understand its value and any loan payoff.</p><div className="space-y-2">{([["yes","Yes"],["maybe","Maybe, depending on value"],["no","No, just finding a car"]] as const).map(([v,l])=><label key={v} className="flex gap-3 rounded-xl border border-stone-200 p-3"><input type="radio" className="accent-[#af7242]" checked={trade===v} onChange={()=>setTrade(v)}/>{l}</label>)}</div>{trade!=="no" && <div className="space-y-3 rounded-xl bg-stone-50 p-4"><p className="text-sm text-stone-600">Optional for now. We can collect payoff details with you later.</p><label htmlFor="trade-vin" className="block text-sm font-semibold">Current vehicle VIN (optional)</label><input id="trade-vin" className={inputClass} maxLength={17} value={tradeVin} onChange={e=>setTradeVin(e.target.value.toUpperCase())}/><label htmlFor="trade-miles" className="block text-sm font-semibold">Current mileage (optional)</label><input id="trade-miles" className={inputClass} type="number" min="0" value={tradeMiles} onChange={e=>setTradeMiles(e.target.value)}/></div>}</>}
              {step === 7 && <><h1 className="text-2xl font-bold">Let's find your car.</h1><p className="text-stone-600">Review your request and tell us how to reach you.</p><div className="space-y-1 rounded-xl bg-stone-50 p-4"><p className="font-bold">{criteria.vehicle}</p><p>{dollars(criteria.budget)} · {mileageLabel(criteria.mileage)}</p><p className="text-sm text-stone-500">{additionalCars.length>0?`Also: ${additionalCars.join(", ")}`:""} {trade!=="no"?"· Has a potential trade":""}</p></div><label htmlFor="mm-name" className="block text-sm font-semibold">Your name</label><input id="mm-name" className={inputClass} value={name} onChange={e=>setName(e.target.value)} autoComplete="name"/><label htmlFor="mm-contact" className="block text-sm font-semibold">Phone or email</label><input id="mm-contact" className={inputClass} value={contact} onChange={e=>setContact(e.target.value)} autoComplete="email"/><label className="flex gap-3 text-sm"><input type="checkbox" className="mt-1 accent-[#af7242]" checked={consent} onChange={e=>setConsent(e.target.checked)}/>I agree Mindful Motors may contact me about this request. This is not authorization to purchase a vehicle.</label></>}
            </section>
            {message && <p role="status" className="mt-4 rounded-lg bg-amber-50 p-3 text-sm text-stone-800">{message}</p>}
            <nav aria-label="Motor Match navigation" className="mt-8 flex gap-3 border-t border-stone-200 pt-5">
              {step>0 && <button type="button" className={plainButton} onClick={()=>{setStep(v=>Math.max(0,v-1));setAdjustment("none");setMessage("");}}>Back</button>}
              <button type="button" className={`${mainButton} flex-1`} disabled={saving||!validStep||(step===7&&(!name.trim()||!contact.trim()||!consent))} onClick={step===7?submit:forward}>{saving?"Sending…":step===0?"Find my car":step===7?"Send my request":step===5?"Continue with my choices":"Continue →"}</button>
            </nav>
          </>
        )}
        <p className="mt-5 text-center text-xs text-stone-400">Development preview — separate from the live Motor Match website</p>
      </div>
    </main>
  );
}
