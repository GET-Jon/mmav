"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import styles from "./motor-match.module.css";

type MatchState = "green" | "yellow" | "red";
type Listing = { vin:string|null; year:number|null; make:string|null; model:string|null; trim:string|null; price:number|null; miles:number|null; dealer:string|null; city:string|null; state:string|null; url:string|null; };
type MatchResponse = {
  state: MatchState;
  message: string;
  matchCount: number;
  market: { priceNeeded:number|null; mileageNeeded:number|null; yearNeeded:number|null; };
  listings: Listing[];
};

const CURRENT_YEAR = new Date().getFullYear();
const money = (v:number) => new Intl.NumberFormat("en-US",{style:"currency",currency:"USD",maximumFractionDigits:0}).format(v);
const num = (v:number) => new Intl.NumberFormat("en-US").format(v);

export default function MotorMatchPage() {
  const [year,setYear]=useState(Math.min(CURRENT_YEAR-2,2024));
  const [make,setMake]=useState("BMW");
  const [model,setModel]=useState("M340i");
  const [trim,setTrim]=useState("xDrive");
  const [budget,setBudget]=useState(38000);
  const [mileage,setMileage]=useState(40000);
  const [zip,setZip]=useState("");
  const [distance,setDistance]=useState(500);
  const [started,setStarted]=useState(false);
  const [result,setResult]=useState<MatchResponse|null>(null);
  const [loading,setLoading]=useState(false);
  const [error,setError]=useState("");
  const requestId=useRef(0);

  const analyze=useCallback(async()=>{
    if(!make.trim()||!model.trim()){ setError("Add a make and model first."); return; }
    const id=++requestId.current;
    setLoading(true); setError("");
    try{
      const response=await fetch("/api/motor_match",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({year,make:make.trim(),model:model.trim(),trim:trim.trim(),budget,mileage,zip:zip.trim(),distance})});
      const payload=await response.json();
      if(!response.ok) throw new Error(payload?.error||"We could not check the market.");
      if(id===requestId.current){ setResult(payload); setStarted(true); }
    }catch(cause){ if(id===requestId.current) setError(cause instanceof Error?cause.message:"We could not check the market."); }
    finally{ if(id===requestId.current) setLoading(false); }
  },[budget,distance,make,mileage,model,trim,year,zip]);

  useEffect(()=>{
    if(!started) return;
    const t=window.setTimeout(()=>void analyze(),850);
    return ()=>window.clearTimeout(t);
  },[analyze,started]);

  const title=useMemo(()=>{
    if(!result) return "";
    if(result.state==="green") return "You can get this car.";
    if(result.state==="yellow") return "Possible — but the market is thin.";
    return "Those numbers do not meet yet.";
  },[result]);

  return <main className={styles.shell}>
    <header className={styles.topbar}>
      <div className={styles.brand}><span className={styles.mark}>MM</span><span>MOTOR MATCH</span></div>
      <span className={styles.powered}>Market intelligence by Lot Logic</span>
    </header>

    <section className={styles.hero}>
      <div className={styles.eyebrow}>STOP GUESSING. START MATCHING.</div>
      <h1>How much car can you <em>actually</em> get?</h1>
      <p>Tell us what you want. Motor Match checks the market and shows where price, mileage and year need to meet.</p>
    </section>

    <section className={styles.workspace}>
      <div className={styles.card}>
        <div className={styles.label}>01 / YOUR CAR</div>
        <div className={styles.grid}>
          <label><span>Year</span><input type="number" min="1990" max={CURRENT_YEAR+1} value={year} onChange={e=>setYear(Number(e.target.value))}/></label>
          <label><span>Make</span><input value={make} onChange={e=>setMake(e.target.value)} placeholder="BMW"/></label>
          <label><span>Model</span><input value={model} onChange={e=>setModel(e.target.value)} placeholder="M340i"/></label>
          <label><span>Trim</span><input value={trim} onChange={e=>setTrim(e.target.value)} placeholder="xDrive (optional)"/></label>
          <label><span>ZIP <small>optional</small></span><input inputMode="numeric" maxLength={5} value={zip} onChange={e=>setZip(e.target.value.replace(/\D/g,"").slice(0,5))} placeholder="29401"/></label>
          <label><span>Radius</span><select value={distance} onChange={e=>setDistance(Number(e.target.value))}><option value={100}>100 miles</option><option value={250}>250 miles</option><option value={500}>500 miles</option><option value={1000}>1,000 miles</option></select></label>
        </div>
      </div>

      <div className={styles.card}>
        <div className={styles.label}>02 / YOUR LIMITS</div>
        <Slider title="MAX BUDGET" value={money(budget)} minLabel="$5k" maxLabel="$150k" min={5000} max={150000} step={500} raw={budget} onChange={setBudget} market={result?.market.priceNeeded && result.market.priceNeeded>budget ? "Market asks ~"+money(result.market.priceNeeded):undefined} danger={result?.state==="red"}/>
        <Slider title="MAX MILEAGE" value={num(mileage)+" mi"} minLabel="5k" maxLabel="200k" min={5000} max={200000} step={1000} raw={mileage} onChange={setMileage} market={result?.market.mileageNeeded && result.market.mileageNeeded>mileage ? "Market asks ~"+num(result.market.mileageNeeded)+" mi":undefined}/>
        <Slider title="MODEL YEAR" value={String(year)} minLabel="2000" maxLabel={String(CURRENT_YEAR+1)} min={2000} max={CURRENT_YEAR+1} step={1} raw={year} onChange={setYear} market={result?.market.yearNeeded && result.market.yearNeeded<year ? "Try "+result.market.yearNeeded:undefined}/>
        {!started ? <button className={styles.primary} onClick={()=>void analyze()} disabled={loading}>{loading?"CHECKING THE MARKET…":"MATCH ME TO THE MARKET →"}</button> :
          <div className={styles.live}><span className={loading?styles.pulse:""}/>{loading?"Updating market match…":"Live market match"}</div>}
        {error ? <div className={styles.error}>{error}</div>:null}
      </div>
    </section>

    {result ? <section className={styles.results}>
      <div className={styles["verdict_"+result.state]}>
        <div className={styles.icon}>{result.state==="green"?"✓":result.state==="yellow"?"!":"×"}</div>
        <div><span className={styles.kicker}>{result.matchCount} CURRENT MATCH{result.matchCount===1?"":"ES"}</span><h2>{title}</h2><p>{result.message}</p></div>
      </div>

      {result.state!=="green" ? <div className={styles.card}>
        <div className={styles.label}>03 / MAKE IT WORK</div>
        <h3 className={styles.h3}>Keep what matters. Flex what doesn't.</h3>
        <div className={styles.solutions}>
          <Solution tag="KEEP CAR + MILES" value={result.market.priceNeeded?money(result.market.priceNeeded):"No reliable target"} text="Raise the budget enough to create a healthier pool of this exact car." disabled={!result.market.priceNeeded} onClick={()=>result.market.priceNeeded&&setBudget(Math.ceil(result.market.priceNeeded/500)*500)}/>
          <Solution tag="KEEP CAR + PRICE" value={result.market.mileageNeeded?num(result.market.mileageNeeded)+" mi":"No reliable target"} text="Accept more mileage while holding your budget and exact vehicle choice." disabled={!result.market.mileageNeeded} onClick={()=>result.market.mileageNeeded&&setMileage(Math.ceil(result.market.mileageNeeded/1000)*1000)}/>
          <Solution tag="KEEP PRICE + MILES" value={result.market.yearNeeded?String(result.market.yearNeeded):"No older-year match"} text="Hold price and mileage while moving to the newest year the market supports." disabled={!result.market.yearNeeded} onClick={()=>result.market.yearNeeded&&setYear(result.market.yearNeeded)}/>
        </div>
      </div>:null}

      {result.listings.length ? <div className={styles.card}>
        <div className={styles.label}>MARKET PROOF</div>
        <h3 className={styles.h3}>Cars supporting this answer</h3>
        <div className={styles.listings}>{result.listings.slice(0,4).map((l,i)=><a className={styles.listing} key={l.vin||i} href={l.url||"#"} target={l.url?"_blank":undefined} rel={l.url?"noreferrer":undefined}><span>{[l.year,l.make,l.model,l.trim].filter(Boolean).join(" ")}</span><strong>{l.price?money(l.price):"Price unavailable"}</strong><div>{l.miles?num(l.miles)+" miles":"Mileage unavailable"}</div><small>{[l.city,l.state].filter(Boolean).join(", ")}{l.dealer?" · "+l.dealer:""}</small></a>)}</div>
      </div>:null}
    </section>:null}

    <footer className={styles.footer}>MOTOR MATCH <span>×</span> LOT LOGIC</footer>
  </main>;
}

function Slider({title,value,minLabel,maxLabel,min,max,step,raw,onChange,market,danger}:{title:string;value:string;minLabel:string;maxLabel:string;min:number;max:number;step:number;raw:number;onChange:(value:number)=>void;market?:string;danger?:boolean}) {
  return <div className={styles.slider}>
    <div className={styles.sliderHead}><div><span>{title}</span><strong className={danger?styles.danger:undefined}>{value}</strong></div>{market?<em>{market}</em>:null}</div>
    <input type="range" min={min} max={max} step={step} value={raw} onChange={e=>onChange(Number(e.target.value))}/>
    <div className={styles.ends}><span>{minLabel}</span><span>{maxLabel}</span></div>
  </div>;
}

function Solution({tag,value,text,disabled,onClick}:{tag:string;value:string;text:string;disabled:boolean;onClick:()=>void}) {
  return <button className={styles.solution} disabled={disabled} onClick={onClick}><span>{tag}</span><strong>{value}</strong><p>{text}</p>{!disabled?<b>USE THIS →</b>:null}</button>;
}
