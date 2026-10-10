"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import styles from "./motor-match.module.css";

type MatchState="green"|"yellow"|"red";
type Listing={vin:string|null;year:number|null;make:string|null;model:string|null;trim:string|null;price:number|null;miles:number|null;dealer:string|null;city:string|null;state:string|null;url:string|null};
type ApiUsage={callsThisUpdate:number;breakdown:Array<{label:string;purpose:string}>};
type MatchResponse={state:MatchState;message:string;matchCount:number;market:{priceNeeded:number|null;mileageNeeded:number|null;yearNeeded:number|null};listings:Listing[];apiUsage:ApiUsage;cache?:{hit:boolean;ttlSeconds:number}};
type CohortEntry={cohort:Listing[];providerTotal:number;expiresAt:number};

const CURRENT_YEAR=new Date().getFullYear();
const money=(v:number)=>new Intl.NumberFormat("en-US",{style:"currency",currency:"USD",maximumFractionDigits:0}).format(v);
const num=(v:number)=>new Intl.NumberFormat("en-US").format(v);

function fifth(rows:Listing[],field:"price"|"miles"){
  const values=rows.map(r=>r[field]).filter((v):v is number=>typeof v==="number"&&v>0).sort((a,b)=>a-b);
  return values.length?values[Math.min(4,values.length-1)]:null;
}

function solveMarket(cohort:Listing[],year:number,budget:number,mileage:number,apiUsage:ApiUsage,cache?:{hit:boolean;ttlSeconds:number}):MatchResponse{
  const sameYear=cohort.filter(l=>l.year===year);
  const exact=sameYear.filter(l=>(l.price??Infinity)<=budget&&(l.miles??Infinity)<=mileage);
  const priceNeeded=fifth(sameYear.filter(l=>(l.miles??Infinity)<=mileage),"price");
  const mileageNeeded=fifth(sameYear.filter(l=>(l.price??Infinity)<=budget),"miles");
  const older=cohort.filter(l=>typeof l.year==="number"&&l.year<year&&(l.price??Infinity)<=budget&&(l.miles??Infinity)<=mileage);
  const counts=new Map<number,number>();
  older.forEach(l=>{if(l.year)counts.set(l.year,(counts.get(l.year)||0)+1)});
  const yearNeeded=Array.from(counts.entries()).filter(([,count])=>count>=3).sort((a,b)=>b[0]-a[0])[0]?.[0]||Array.from(counts.keys()).sort((a,b)=>b-a)[0]||null;
  const state:MatchState=exact.length>=5?"green":exact.length>0?"yellow":"red";
  const message=state==="green"?"There is enough current inventory to call this a realistic target.":state==="yellow"?"A few cars fit, but the market is thin. A small adjustment gives you more room for color, condition and options.":"We could not find a current listing satisfying all of those limits at once. Change one constraint and the market can open back up.";
  return{state,message,matchCount:exact.length,market:{priceNeeded,mileageNeeded,yearNeeded},listings:exact.slice(0,20),apiUsage,cache};
}

export default function MotorMatchPage(){
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
  const [sessionCalls,setSessionCalls]=useState(0);
  const requestId=useRef(0);
  const cohortCache=useRef(new Map<string,CohortEntry>());

  const analyze=useCallback(async()=>{
    if(!make.trim()||!model.trim()){setError("Add a make and model first.");return;}
    const id=++requestId.current;
    const cohortKey=[make.trim(),model.trim(),trim.trim()||"*",zip.trim()||"national",zip.trim()?distance:"all"].map(v=>String(v).toLowerCase()).join("|");
    const cached=cohortCache.current.get(cohortKey);
    if(cached&&cached.expiresAt>Date.now()){
      setResult(solveMarket(cached.cohort,year,budget,mileage,{callsThisUpdate:0,breakdown:[]},{hit:true,ttlSeconds:Math.max(0,Math.floor((cached.expiresAt-Date.now())/1000))}));
      setStarted(true);setLoading(false);setError("");
      return;
    }

    setLoading(true);setError("");
    try{
      const response=await fetch("/api/motor_match",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({make:make.trim(),model:model.trim(),trim:trim.trim(),zip:zip.trim(),distance})});
      const payload=await response.json();
      setSessionCalls(v=>v+(payload?.apiUsage?.callsThisUpdate||0));
      if(!response.ok)throw new Error(payload?.error||"We could not check the market.");
      const ttlSeconds=Number(payload?.cache?.ttlSeconds)||1800;
      cohortCache.current.set(cohortKey,{cohort:Array.isArray(payload?.cohort)?payload.cohort:[],providerTotal:Number(payload?.providerTotal)||0,expiresAt:Date.now()+ttlSeconds*1000});
      if(id===requestId.current){
        setResult(solveMarket(Array.isArray(payload?.cohort)?payload.cohort:[],year,budget,mileage,payload?.apiUsage||{callsThisUpdate:0,breakdown:[]},payload?.cache));
        setStarted(true);
      }
    }catch(cause){if(id===requestId.current)setError(cause instanceof Error?cause.message:"We could not check the market.");}
    finally{if(id===requestId.current)setLoading(false);}
  },[budget,distance,make,mileage,model,trim,year,zip]);

  useEffect(()=>{
    if(!started)return;
    const t=window.setTimeout(()=>void analyze(),850);
    return()=>window.clearTimeout(t);
  },[analyze,started]);

  const title=useMemo(()=>{
    if(!result)return "Ready to check the market";
    if(result.state==="green")return "Your target works.";
    if(result.state==="yellow")return "Possible, but thin.";
    return "Something has to give.";
  },[result]);

  const statusClass=result?styles["status_"+result.state]:styles.status_idle;

  return <main className={styles.shell}>
    <header className={styles.topbar}>
      <div className={styles.brand}><span className={styles.mark}>MM</span><div><b>MOTOR MATCH</b><small>by Lot Logic</small></div></div>
      <div className={styles.apiMeter}>
        <div><span>API CALLS · SESSION</span><strong>{sessionCalls}</strong></div>
        <div><span>LAST UPDATE</span><strong>{result?.apiUsage?.callsThisUpdate??0}</strong></div>
        <details>
          <summary>DETAILS</summary>
          <div className={styles.apiPopover}>
            {(result?.apiUsage?.breakdown||[]).length?result!.apiUsage.breakdown.map((call,i)=><div key={i}><b>{i+1}. {call.label}</b><span>{call.purpose}</span></div>):<p>No market calls yet.</p>}
            <small>{result?.cache?.hit?"Using cached market data. ":"Fresh market cohort loaded. "}Session count resets when this page reloads.</small>
          </div>
        </details>
      </div>
    </header>

    <section className={styles.intro}>
      <div><span className={styles.eyebrow}>WHAT CAN I ACTUALLY BUY?</span><h1>Match the car to the market.</h1></div>
      <p>Set the car you want and the limits you care about. We show whether they intersect — and exactly what to change when they don't.</p>
    </section>

    <section className={styles.dashboard}>
      <div className={styles.identityBar}>
        <div className={styles.identityTitle}><span>YOUR CAR</span><strong>{year} {make||"Make"} {model||"Model"} {trim}</strong></div>
        <div className={styles.identityFields}>
          <Field label="YEAR"><input type="number" min="1990" max={CURRENT_YEAR+1} value={year} onChange={e=>setYear(Number(e.target.value))}/></Field>
          <Field label="MAKE"><input value={make} onChange={e=>setMake(e.target.value)} /></Field>
          <Field label="MODEL"><input value={model} onChange={e=>setModel(e.target.value)} /></Field>
          <Field label="TRIM"><input value={trim} onChange={e=>setTrim(e.target.value)} placeholder="Optional"/></Field>
          <Field label="ZIP"><input inputMode="numeric" maxLength={5} value={zip} onChange={e=>setZip(e.target.value.replace(/\D/g,"").slice(0,5))} placeholder="Optional"/></Field>
          <Field label="RADIUS"><select value={distance} onChange={e=>setDistance(Number(e.target.value))}><option value={100}>100 mi</option><option value={250}>250 mi</option><option value={500}>500 mi</option><option value={1000}>1,000 mi</option></select></Field>
        </div>
      </div>

      <div className={styles.gauges}>
        <Gauge label="PRICE" value={money(budget)} hint="Maximum budget" min={5000} max={150000} step={500} raw={budget} onChange={setBudget} marker={result?.market.priceNeeded&&result.market.priceNeeded>budget?money(result.market.priceNeeded):null} markerLabel="MARKET" state={result?.state}/>
        <Gauge label="MILEAGE" value={num(mileage)+" mi"} hint="Maximum mileage" min={5000} max={200000} step={1000} raw={mileage} onChange={setMileage} marker={result?.market.mileageNeeded&&result.market.mileageNeeded>mileage?num(result.market.mileageNeeded)+" mi":null} markerLabel="MARKET" state={result?.state==="red"?"red":undefined}/>
        <Gauge label="YEAR" value={String(year)} hint="Model year" min={2000} max={CURRENT_YEAR+1} step={1} raw={year} onChange={setYear} marker={result?.market.yearNeeded&&result.market.yearNeeded<year?String(result.market.yearNeeded):null} markerLabel="TRY" state={result?.state==="red"?"red":undefined}/>
      </div>

      <div className={styles.matchStrip}>
        <div className={statusClass}><span className={styles.statusDot}/><div><small>{result?(result.matchCount+" CURRENT MATCH"+(result.matchCount===1?"":"ES")):"MARKET STATUS"}</small><strong>{title}</strong><p>{result?.message||"Run the match once, then the sliders update the market automatically."}</p></div></div>
        {!started?<button className={styles.primary} onClick={()=>void analyze()} disabled={loading}>{loading?"CHECKING…":"CHECK MARKET →"}</button>:<div className={styles.liveState}><span className={loading?styles.pulse:""}/>{loading?"Rechecking…":"Live"}</div>}
      </div>

      {result&&result.state!=="green"?<div className={styles.adjustments}>
        <div className={styles.adjustHeader}><span>MAKE IT WORK</span><p>Keep two. Flex one.</p></div>
        <Adjustment label="PAY MORE" value={result.market.priceNeeded?money(result.market.priceNeeded):"—"} sub="Keep this car + mileage" active={!!result.market.priceNeeded} onClick={()=>result.market.priceNeeded&&setBudget(Math.ceil(result.market.priceNeeded/500)*500)}/>
        <Adjustment label="TAKE MORE MILES" value={result.market.mileageNeeded?num(result.market.mileageNeeded)+" mi":"—"} sub="Keep this car + price" active={!!result.market.mileageNeeded} onClick={()=>result.market.mileageNeeded&&setMileage(Math.ceil(result.market.mileageNeeded/1000)*1000)}/>
        <Adjustment label="GO OLDER" value={result.market.yearNeeded?String(result.market.yearNeeded):"—"} sub="Keep price + mileage" active={!!result.market.yearNeeded} onClick={()=>result.market.yearNeeded&&setYear(result.market.yearNeeded)}/>
      </div>:null}

      {error?<div className={styles.error}>{error}</div>:null}
    </section>

    {result?.listings.length?<section className={styles.proof}>
      <div className={styles.proofHead}><div><span>MARKET PROOF</span><strong>Listings behind the answer</strong></div><small>Showing up to 4</small></div>
      <div className={styles.listings}>{result.listings.slice(0,4).map((l,i)=><a className={styles.listing} key={l.vin||i} href={l.url||"#"} target={l.url?"_blank":undefined} rel={l.url?"noreferrer":undefined}><span>{[l.year,l.make,l.model,l.trim].filter(Boolean).join(" ")}</span><strong>{l.price?money(l.price):"Price unavailable"}</strong><div>{l.miles?num(l.miles)+" miles":"Mileage unavailable"}</div><small>{[l.city,l.state].filter(Boolean).join(", ")}{l.dealer?" · "+l.dealer:""}</small></a>)}</div>
    </section>:null}
  </main>;
}

function Field({label,children}:{label:string;children:React.ReactNode}){return <label className={styles.field}><span>{label}</span>{children}</label>}

function Gauge({label,value,hint,min,max,step,raw,onChange,marker,markerLabel,state}:{label:string;value:string;hint:string;min:number;max:number;step:number;raw:number;onChange:(v:number)=>void;marker:string|null;markerLabel:string;state?:MatchState}){
  return <div className={styles.gauge}>
    <div className={styles.gaugeTop}><div><span>{label}</span><strong className={state==="red"&&marker?styles.redText:undefined}>{value}</strong><small>{hint}</small></div>{marker?<div className={styles.marketMarker}><span>{markerLabel}</span><b>{marker}</b></div>:<div className={styles.okMarker}>✓ IN RANGE</div>}</div>
    <input type="range" min={min} max={max} step={step} value={raw} onChange={e=>onChange(Number(e.target.value))}/>
    <div className={styles.rangeEnds}><span>{label==="PRICE"?"$5k":label==="MILEAGE"?"5k":"2000"}</span><span>{label==="PRICE"?"$150k":label==="MILEAGE"?"200k":String(CURRENT_YEAR+1)}</span></div>
  </div>
}

function Adjustment({label,value,sub,active,onClick}:{label:string;value:string;sub:string;active:boolean;onClick:()=>void}){return <button disabled={!active} onClick={onClick} className={styles.adjustment}><span>{label}</span><strong>{value}</strong><small>{sub}</small><b>{active?"APPLY →":"NO MATCH"}</b></button>}
