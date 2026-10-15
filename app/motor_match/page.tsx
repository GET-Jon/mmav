"use client";

import {useCallback,useEffect,useMemo,useRef,useState} from "react";
import styles from "./motor-match.module.css";

type MatchState="green"|"yellow"|"red";
type MatchResponse={
 state:MatchState;depth:"strong"|"healthy"|"thin"|"none";matchCount:number;
 constraintStatus:{priceWorks:boolean;mileageWorks:boolean};
 market:{priceNeeded:number|null;mileageNeeded:number|null;yearNeeded:number|null};
 message:string;searchKey:string;providerTotal:number;sampleSize:number;
 apiUsage:{callsThisUpdate:number;breakdown:Array<{label:string;purpose:string}>};
 cache?:{hit:boolean;ttlSeconds:number};
};

const CURRENT_YEAR=new Date().getFullYear();
const money=(v:number)=>new Intl.NumberFormat("en-US",{style:"currency",currency:"USD",maximumFractionDigits:0}).format(v);
const num=(v:number)=>new Intl.NumberFormat("en-US").format(v);

export default function MotorMatchPage(){
 const [year,setYear]=useState(Math.min(CURRENT_YEAR-2,2024)),[make,setMake]=useState("BMW"),[model,setModel]=useState("M340i"),[trim,setTrim]=useState("xDrive"),[budget,setBudget]=useState(38000),[mileage,setMileage]=useState(40000),[zip,setZip]=useState(""),[distance,setDistance]=useState(500);
 const [started,setStarted]=useState(false),[result,setResult]=useState<MatchResponse|null>(null),[loading,setLoading]=useState(false),[error,setError]=useState(""),[sessionCalls,setSessionCalls]=useState(0);
 const [name,setName]=useState(""),[email,setEmail]=useState(""),[phone,setPhone]=useState(""),[notes,setNotes]=useState(""),[sending,setSending]=useState(false),[sent,setSent]=useState(false),[formError,setFormError]=useState("");
 const requestId=useRef(0);

 const analyze=useCallback(async()=>{
  if(!make.trim()||!model.trim()){setError("Add a make and model first.");return}
  const id=++requestId.current;setLoading(true);setError("");
  try{
   const response=await fetch("/api/motor_match",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({year,make:make.trim(),model:model.trim(),trim:trim.trim(),budget,mileage,zip:zip.trim(),distance})});
   const payload=await response.json();
   setSessionCalls(v=>v+(payload?.apiUsage?.callsThisUpdate||0));
   if(!response.ok)throw new Error(payload?.error||"We could not check the market.");
   if(id===requestId.current){setResult(payload);setStarted(true);setSent(false)}
  }catch(cause){if(id===requestId.current)setError(cause instanceof Error?cause.message:"We could not check the market.")}
  finally{if(id===requestId.current)setLoading(false)}
 },[budget,distance,make,mileage,model,trim,year,zip]);

 useEffect(()=>{if(!started)return;const t=window.setTimeout(()=>void analyze(),850);return()=>window.clearTimeout(t)},[analyze,started]);

 async function submitLead(e:React.FormEvent){
  e.preventDefault();if(!result)return;setSending(true);setFormError("");
  try{
   const response=await fetch("/api/motor_match/lead",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({name,email,phone,notes,searchKey:result.searchKey,request:{year,make:make.trim(),model:model.trim(),trim:trim.trim(),budget,mileage,zip:zip.trim(),distance},result:{state:result.state,depth:result.depth,matchCount:result.matchCount,priceNeeded:result.market.priceNeeded,mileageNeeded:result.market.mileageNeeded,yearNeeded:result.market.yearNeeded}})});
   const payload=await response.json();if(!response.ok)throw new Error(payload?.error||"We could not send your request.");
   setSent(true);
  }catch(cause){setFormError(cause instanceof Error?cause.message:"We could not send your request.")}
  finally{setSending(false)}
 }

 const title=useMemo(()=>!result?"Ready to check the market":result.state==="green"?"Your target works.":result.state==="yellow"?"Possible, but the market is thin.":"Something has to give.",[result]);
 const statusClass=result?styles["status_"+result.state]:styles.status_idle;

 return <main className={styles.shell}>
  <header className={styles.topbar}>
   <div className={styles.brand}><span className={styles.mark}>MM</span><div><b>MOTOR MATCH</b><small>by Lot Logic</small></div></div>
   <div className={styles.apiMeter}><div><span>API CALLS · SESSION</span><strong>{sessionCalls}</strong></div><div><span>LAST UPDATE</span><strong>{result?.apiUsage?.callsThisUpdate??0}</strong></div><details><summary>DETAILS</summary><div className={styles.apiPopover}>{(result?.apiUsage?.breakdown||[]).length?result!.apiUsage.breakdown.map((call,i)=><div key={i}><b>{i+1}. {call.label}</b><span>{call.purpose}</span></div>):<p>No new market calls. Using cached data.</p>}<small>Individual listings stay private and are never sent to the browser.</small></div></details></div>
  </header>

  <section className={styles.intro}><div><span className={styles.eyebrow}>WHAT CAN I ACTUALLY BUY?</span><h1>Match the car to the market.</h1></div><p>Set the car you want and the limits you care about. We show whether they intersect — and exactly what to change when they don't.</p></section>

  <section className={styles.dashboard}>
   <div className={styles.identityBar}><div className={styles.identityTitle}><span>YOUR CAR</span><strong>{year} {make||"Make"} {model||"Model"} {trim}</strong></div><div className={styles.identityFields}>
    <Field label="YEAR"><input type="number" min="1990" max={CURRENT_YEAR+1} value={year} onChange={e=>setYear(Number(e.target.value))}/></Field>
    <Field label="MAKE"><input value={make} onChange={e=>setMake(e.target.value)}/></Field>
    <Field label="MODEL"><input value={model} onChange={e=>{setModel(e.target.value);setTrim("")}}/></Field>
    <Field label="TRIM"><input value={trim} onChange={e=>setTrim(e.target.value)} placeholder="Optional — leave blank if unsure"/></Field>
    <Field label="ZIP"><input inputMode="numeric" maxLength={5} value={zip} onChange={e=>setZip(e.target.value.replace(/\D/g,"").slice(0,5))} placeholder="Optional"/></Field>
    <Field label="RADIUS"><select value={distance} onChange={e=>setDistance(Number(e.target.value))}><option value={100}>100 mi</option><option value={250}>250 mi</option><option value={500}>500 mi</option><option value={1000}>1,000 mi</option></select></Field>
   </div></div>

   <div className={styles.gauges}>
    <Gauge label="PRICE" value={money(budget)} hint="Maximum budget" min={5000} max={150000} step={500} raw={budget} onChange={setBudget} marker={result?.market.priceNeeded&&result.market.priceNeeded>budget?money(result.market.priceNeeded):null} markerLabel="HEALTHIER AT" status={result?result.constraintStatus.priceWorks?"works":"blocked":undefined}/>
    <Gauge label="MILEAGE" value={num(mileage)+" mi"} hint="Maximum mileage" min={5000} max={200000} step={1000} raw={mileage} onChange={setMileage} marker={result?.market.mileageNeeded&&result.market.mileageNeeded>mileage?num(result.market.mileageNeeded)+" mi":null} markerLabel="HEALTHIER AT" status={result?result.constraintStatus.mileageWorks?"works":"blocked":undefined}/>
    <Gauge label="YEAR" value={String(year)} hint="Model year" min={2000} max={CURRENT_YEAR+1} step={1} raw={year} onChange={setYear} marker={result?.market.yearNeeded&&result.market.yearNeeded<year?String(result.market.yearNeeded):null} markerLabel="TRY" status={result?result.matchCount>0?"works":"blocked":undefined}/>
   </div>

   <div className={styles.matchStrip}><div className={statusClass}><span className={styles.statusDot}/><div><small>{result?(result.matchCount+" CURRENT MATCH"+(result.matchCount===1?"":"ES")+" · "+result.depth.toUpperCase()+" MARKET"):"MARKET STATUS"}</small><strong>{title}</strong><p>{result?.message||"Run the match once, then price and mileage updates use the cached market."}</p></div></div>{!started?<button className={styles.primary} onClick={()=>void analyze()} disabled={loading}>{loading?"CHECKING…":"CHECK MARKET →"}</button>:<div className={styles.liveState}><span className={loading?styles.pulse:""}/>{loading?"Rechecking…":"Live"}</div>}</div>

   {result&&result.state!=="green"?<div className={styles.adjustments}><div className={styles.adjustHeader}><span>MAKE IT WORK</span><p>Keep two. Flex one.</p></div>
    <Adjustment label="PAY MORE" value={result.market.priceNeeded?money(result.market.priceNeeded):"—"} sub="Keep this year + mileage" active={!!result.market.priceNeeded&&result.market.priceNeeded>budget} onClick={()=>result.market.priceNeeded&&setBudget(Math.ceil(result.market.priceNeeded/500)*500)}/>
    <Adjustment label="TAKE MORE MILES" value={result.market.mileageNeeded?num(result.market.mileageNeeded)+" mi":"—"} sub="Keep this year + price" active={!!result.market.mileageNeeded&&result.market.mileageNeeded>mileage} onClick={()=>result.market.mileageNeeded&&setMileage(Math.ceil(result.market.mileageNeeded/1000)*1000)}/>
    <Adjustment label="GO OLDER" value={result.market.yearNeeded?String(result.market.yearNeeded):"—"} sub="Keep price + mileage" active={!!result.market.yearNeeded} onClick={()=>result.market.yearNeeded&&setYear(result.market.yearNeeded)}/>
   </div>:null}
   {error?<div className={styles.error}>{error}</div>:null}
  </section>

  {result?<section className={styles.leadCard}>
   <div className={styles.leadIntro}><span>WANT US TO FIND IT?</span><h2>Send this Motor Match to Mindful Motors.</h2><p>We’ll review your target and the live market behind it, then follow up personally.</p></div>
   {sent?<div className={styles.success}><strong>Got it.</strong><span>Your Motor Match has been sent to Mindful Motors.</span></div>:<form className={styles.leadForm} onSubmit={submitLead}>
    <label><span>NAME</span><input required value={name} onChange={e=>setName(e.target.value)}/></label>
    <label><span>EMAIL</span><input required type="email" value={email} onChange={e=>setEmail(e.target.value)}/></label>
    <label><span>PHONE</span><input required type="tel" value={phone} onChange={e=>setPhone(e.target.value)}/></label>
    <label className={styles.notes}><span>ANYTHING ELSE WE SHOULD KNOW?</span><textarea value={notes} onChange={e=>setNotes(e.target.value)} rows={3}/></label>
    <button type="submit" disabled={sending}>{sending?"SENDING…":"SEND MY MOTOR MATCH →"}</button>
    {formError?<div className={styles.formError}>{formError}</div>:null}
   </form>}
  </section>:null}
 </main>;
}

function Field({label,children}:{label:string;children:React.ReactNode}){return <label className={styles.field}><span>{label}</span>{children}</label>}
function Gauge({label,value,hint,min,max,step,raw,onChange,marker,markerLabel,status}:{label:string;value:string;hint:string;min:number;max:number;step:number;raw:number;onChange:(v:number)=>void;marker:string|null;markerLabel:string;status?:"works"|"blocked"}){
 return <div className={styles.gauge}><div className={styles.gaugeTop}><div><span>{label}</span><strong className={status==="blocked"?styles.redText:undefined}>{value}</strong><small>{hint}</small></div>{marker?<div className={styles.marketMarker}><span>{markerLabel}</span><b>{marker}</b></div>:status==="works"?<div className={styles.okMarker}>✓ WORKS</div>:null}</div><input type="range" min={min} max={max} step={step} value={raw} onChange={e=>onChange(Number(e.target.value))}/><div className={styles.rangeEnds}><span>{label==="PRICE"?"$5k":label==="MILEAGE"?"5k":"2000"}</span><span>{label==="PRICE"?"$150k":label==="MILEAGE"?"200k":String(CURRENT_YEAR+1)}</span></div></div>
}
function Adjustment({label,value,sub,active,onClick}:{label:string;value:string;sub:string;active:boolean;onClick:()=>void}){return <button disabled={!active} onClick={onClick} className={styles.adjustment}><span>{label}</span><strong>{value}</strong><small>{sub}</small><b>{active?"APPLY →":"NO CHANGE NEEDED"}</b></button>}
