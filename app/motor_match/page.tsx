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
 const [year,setYear]=useState<number|null>(null),[make,setMake]=useState(""),[model,setModel]=useState(""),[trim,setTrim]=useState(""),[budget,setBudget]=useState(30000),[mileage,setMileage]=useState(60000),[zip,setZip]=useState(""),[distance,setDistance]=useState(500);
 const [started,setStarted]=useState(false),[result,setResult]=useState<MatchResponse|null>(null),[loading,setLoading]=useState(false),[error,setError]=useState(""),[sessionCalls,setSessionCalls]=useState(0),[showForm,setShowForm]=useState(false);
 const [name,setName]=useState(""),[email,setEmail]=useState(""),[phone,setPhone]=useState(""),[notes,setNotes]=useState(""),[sending,setSending]=useState(false),[sent,setSent]=useState(false),[formError,setFormError]=useState("");
 const requestId=useRef(0);
 const vehicleReady=Boolean(year&&make.trim()&&model.trim());

 const analyze=useCallback(async()=>{
  if(!vehicleReady||!year){setError("Add a year, make, and model first.");return}
  const id=++requestId.current;setLoading(true);setError("");
  try{
   const response=await fetch("/api/motor_match",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({year,make:make.trim(),model:model.trim(),trim:trim.trim(),budget,mileage,zip:zip.trim(),distance})});
   const payload=await response.json();
   setSessionCalls(v=>v+(payload?.apiUsage?.callsThisUpdate||0));
   if(!response.ok)throw new Error(payload?.error||"We could not check the market.");
   if(id===requestId.current){setResult(payload);setStarted(true);setSent(false)}
  }catch(cause){if(id===requestId.current)setError(cause instanceof Error?cause.message:"We could not check the market.")}
  finally{if(id===requestId.current)setLoading(false)}
 },[budget,distance,make,mileage,model,trim,vehicleReady,year,zip]);

 useEffect(()=>{if(!started)return;const t=window.setTimeout(()=>void analyze(),650);return()=>window.clearTimeout(t)},[analyze,started]);

 async function submitLead(e:React.FormEvent){
  e.preventDefault();if(!result||!year)return;setSending(true);setFormError("");
  try{
   const response=await fetch("/api/motor_match/lead",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({name,email,phone,notes,searchKey:result.searchKey,request:{year,make:make.trim(),model:model.trim(),trim:trim.trim(),budget,mileage,zip:zip.trim(),distance},result:{state:result.state,depth:result.depth,matchCount:result.matchCount,priceNeeded:result.market.priceNeeded,mileageNeeded:result.market.mileageNeeded,yearNeeded:result.market.yearNeeded}})});
   const payload=await response.json();if(!response.ok)throw new Error(payload?.error||"We could not send your request.");
   setSent(true);
  }catch(cause){setFormError(cause instanceof Error?cause.message:"We could not send your request.")}
  finally{setSending(false)}
 }

 const headline=useMemo(()=>{
  if(!result)return "";
  if(result.state==="green")return "Yes — this is realistic.";
  if(result.state==="yellow")return "Possible — but options are limited.";
  return "You're close, but something has to give.";
 },[result]);

 const subhead=useMemo(()=>{
  if(!result)return "";
  if(result.state==="green")return result.depth==="strong"?"Strong availability around your target.":"Healthy availability around your target.";
  if(result.state==="yellow")return "Your target exists, but there is not much room to be picky about color, condition, or options.";
  return "We couldn't find enough current inventory satisfying both limits at once.";
 },[result]);

 return <main className={styles.shell}>
  <header className={styles.topbar}>
   <div className={styles.brand}><span className={styles.mark}>MM</span><div><b>MOTOR MATCH</b><small>by Mindful Motors</small></div></div>
   <div className={styles.apiMeter}><div><span>API CALLS · SESSION</span><strong>{sessionCalls}</strong></div><div><span>LAST UPDATE</span><strong>{result?.apiUsage?.callsThisUpdate??0}</strong></div><details><summary>DETAILS</summary><div className={styles.apiPopover}>{(result?.apiUsage?.breakdown||[]).length?result!.apiUsage.breakdown.map((call,i)=><div key={i}><b>{i+1}. {call.label}</b><span>{call.purpose}</span></div>):<p>No new market calls yet.</p>}<small>Individual listings stay private and are never sent to the browser.</small></div></details></div>
  </header>

  <section className={styles.hero}>
   <span className={styles.eyebrow}>WHAT CAN I ACTUALLY BUY?</span>
   <h1>Tell us the car.<br/><em>We'll tell you the market.</em></h1>
   <p>Set the vehicle, budget, mileage, and search area. Motor Match checks current inventory and tells you whether those limits actually intersect.</p>
  </section>

  <section className={styles.builder}>
   <div className={styles.step}>
    <div className={styles.stepNumber}>1</div>
    <div className={styles.stepCopy}><span>THE CAR</span><strong>What are you looking for?</strong></div>
    <div className={styles.vehicleGrid}>
     <Field label="MAKE"><input value={make} placeholder="BMW" onChange={e=>setMake(e.target.value)}/></Field>
     <Field label="MODEL"><input value={model} placeholder="5 Series" onChange={e=>{setModel(e.target.value);setTrim("")}}/></Field>
     <Field label="TRIM"><input value={trim} placeholder="Optional" onChange={e=>setTrim(e.target.value)}/></Field>
    </div>
   </div>

   <div className={styles.step}>
    <div className={styles.stepNumber}>2</div>
    <div className={styles.stepCopy}><span>YOUR LIMITS</span><strong>What matters most?</strong></div>
    <div className={styles.limitGrid}>
     <div className={styles.limitCard}><span>MODEL YEAR</span><strong>{year??"Choose year"}</strong><input type="range" min={2000} max={CURRENT_YEAR+1} step={1} value={year??2022} onChange={e=>setYear(Number(e.target.value))}/></div>
     <div className={styles.limitCard}><span>I WANT TO SPEND NO MORE THAN</span><strong>{money(budget)}</strong><input type="range" min={5000} max={150000} step={500} value={budget} onChange={e=>setBudget(Number(e.target.value))}/></div>
     <div className={styles.limitCard}><span>AND STAY UNDER</span><strong>{num(mileage)} miles</strong><input type="range" min={5000} max={200000} step={1000} value={mileage} onChange={e=>setMileage(Number(e.target.value))}/></div>
    </div>
   </div>

   <div className={styles.step}>
    <div className={styles.stepNumber}>3</div>
    <div className={styles.stepCopy}><span>SEARCH AREA</span><strong>How far should we look?</strong></div>
    <div className={styles.locationGrid}>
     <Field label="ZIP CODE"><input inputMode="numeric" maxLength={5} value={zip} onChange={e=>setZip(e.target.value.replace(/\D/g,"").slice(0,5))} placeholder="Optional"/></Field>
     <Field label="RADIUS"><select value={distance} onChange={e=>setDistance(Number(e.target.value))}><option value={100}>100 miles</option><option value={250}>250 miles</option><option value={500}>500 miles</option><option value={1000}>1,000 miles</option></select></Field>
     <button className={styles.primary} onClick={()=>void analyze()} disabled={loading||!vehicleReady}>{loading?"CHECKING THE MARKET…":started?"REFRESH MARKET →":"CHECK THE MARKET →"}</button>
    </div>
   </div>
  </section>

  {error?<div className={styles.error}>{error}</div>:null}

  {result?<section className={styles.answer+" "+styles["answer_"+result.state]}>
   <div className={styles.answerLead}><span>{result.state==="green"?"REALISTIC TARGET":result.state==="yellow"?"THIN MARKET":"MARKET MISMATCH"}</span><h2>{headline}</h2><p>{subhead}</p></div>
   <div className={styles.constraintRow}>
    <Constraint label="Budget" value={money(budget)} works={result.constraintStatus.priceWorks}/>
    <Constraint label="Mileage" value={num(mileage)+" mi"} works={result.constraintStatus.mileageWorks}/>
    <Constraint label="Model year" value={String(year)} works={result.matchCount>0}/>
   </div>

   {result.state!=="green"?<div className={styles.options}>
    <div className={styles.optionsTitle}><span>KEEP TWO. FLEX ONE.</span><strong>Here’s what opens the market.</strong></div>
    <Option label="Keep the mileage" value={result.market.priceNeeded?money(result.market.priceNeeded):"No clear price target"} action={result.market.priceNeeded&&result.market.priceNeeded>budget?"Use this budget":"No change needed"} active={!!result.market.priceNeeded&&result.market.priceNeeded>budget} onClick={()=>result.market.priceNeeded&&setBudget(Math.ceil(result.market.priceNeeded/500)*500)}/>
    <Option label="Keep the budget" value={result.market.mileageNeeded?num(result.market.mileageNeeded)+" mi":"No clear mileage target"} action={result.market.mileageNeeded&&result.market.mileageNeeded>mileage?"Use this mileage":"No change needed"} active={!!result.market.mileageNeeded&&result.market.mileageNeeded>mileage} onClick={()=>result.market.mileageNeeded&&setMileage(Math.ceil(result.market.mileageNeeded/1000)*1000)}/>
    <Option label="Keep price + mileage" value={result.market.yearNeeded?String(result.market.yearNeeded):"No older-year shortcut"} action={result.market.yearNeeded?"Try this year":"No alternative found"} active={!!result.market.yearNeeded} onClick={()=>result.market.yearNeeded&&setYear(result.market.yearNeeded)}/>
   </div>:null}

   <div className={styles.cta}>
    <div><span>WANT US TO FIND THE RIGHT ONE?</span><strong>We can take it from here.</strong><p>Mindful Motors can search the public market, auctions, and dealer network using the target you just built.</p></div>
    {!showForm&&!sent?<button onClick={()=>setShowForm(true)}>START MY SEARCH →</button>:null}
   </div>

   {showForm&&!sent?<form className={styles.leadForm} onSubmit={submitLead}>
    <label><span>NAME</span><input required value={name} onChange={e=>setName(e.target.value)}/></label>
    <label><span>EMAIL</span><input required type="email" value={email} onChange={e=>setEmail(e.target.value)}/></label>
    <label><span>PHONE</span><input required type="tel" value={phone} onChange={e=>setPhone(e.target.value)}/></label>
    <label className={styles.notes}><span>ANYTHING ELSE WE SHOULD KNOW?</span><textarea value={notes} onChange={e=>setNotes(e.target.value)} rows={3}/></label>
    <button type="submit" disabled={sending}>{sending?"SENDING…":"SEND MY MOTOR MATCH →"}</button>
    {formError?<div className={styles.formError}>{formError}</div>:null}
   </form>:null}

   {sent?<div className={styles.success}><strong>Got it.</strong><span>Your Motor Match has been sent to Mindful Motors.</span></div>:null}
  </section>:null}
 </main>;
}

function Field({label,children}:{label:string;children:React.ReactNode}){return <label className={styles.field}><span>{label}</span>{children}</label>}
function Constraint({label,value,works}:{label:string;value:string;works:boolean}){return <div className={styles.constraint}><span>{label}</span><strong>{value}</strong><b className={works?styles.good:styles.bad}>{works?"WORKS":"BLOCKING"}</b></div>}
function Option({label,value,action,active,onClick}:{label:string;value:string;action:string;active:boolean;onClick:()=>void}){return <button className={styles.option} disabled={!active} onClick={onClick}><span>{label}</span><strong>{value}</strong><b>{action}</b></button>}
