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
const LOADING_MESSAGES=[
 "Finding your car…",
 "Searching for the perfect fit…",
 "Checking current market inventory…",
 "Comparing price and mileage…",
 "Looking for the best match…",
 "Building your Motor Match…",
];

export default function MotorMatchPage(){
 const [year,setYear]=useState<number|null>(null),[make,setMake]=useState(""),[model,setModel]=useState(""),[trim,setTrim]=useState(""),[budget,setBudget]=useState(30000),[mileage,setMileage]=useState(60000),[zip,setZip]=useState(""),[distance,setDistance]=useState(500);
 const [started,setStarted]=useState(false),[result,setResult]=useState<MatchResponse|null>(null),[loading,setLoading]=useState(false),[loadingMessageIndex,setLoadingMessageIndex]=useState(0),[error,setError]=useState(""),[sessionCalls,setSessionCalls]=useState(0),[showForm,setShowForm]=useState(false);
 const [name,setName]=useState(""),[email,setEmail]=useState(""),[phone,setPhone]=useState(""),[notes,setNotes]=useState(""),[sending,setSending]=useState(false),[sent,setSent]=useState(false),[formError,setFormError]=useState("");
 const requestId=useRef(0);
 const vehicleReady=Boolean(year&&make.trim()&&model.trim());

 const analyze=useCallback(async()=>{
  if(!vehicleReady||!year){setError("Add a year, make, and model first.");return}
  const id=++requestId.current;setLoading(true);setError("");
  try{
   const response=await fetch("/api/motor_match",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({year,make:make.trim(),model:model.trim(),trim:trim.trim(),budget,mileage,zip:zip.trim(),distance})});
   const raw=await response.text();let payload:any=null;try{payload=raw?JSON.parse(raw):null}catch{}
   setSessionCalls(v=>v+(payload?.apiUsage?.callsThisUpdate||0));
   if(!response.ok)throw new Error(payload?.error||"The market service took too long to respond. Please try again.");
   if(!payload)throw new Error("We could not read the market response. Please try again.");
   if(id===requestId.current){setResult(payload);setStarted(true);setSent(false)}
  }catch(cause){if(id===requestId.current)setError(cause instanceof Error?cause.message:"We could not check the market.")}
  finally{if(id===requestId.current)setLoading(false)}
 },[budget,distance,make,mileage,model,trim,vehicleReady,year,zip]);

 useEffect(()=>{if(!started)return;const t=window.setTimeout(()=>void analyze(),650);return()=>window.clearTimeout(t)},[analyze,started]);
 useEffect(()=>{
  if(!loading||started){setLoadingMessageIndex(0);return}
  const timer=window.setInterval(()=>setLoadingMessageIndex(index=>(index+1)%LOADING_MESSAGES.length),1450);
  return()=>window.clearInterval(timer);
 },[loading,started]);

 async function submitLead(e:React.FormEvent){
  e.preventDefault();if(!result||!year)return;setSending(true);setFormError("");
  try{
   const response=await fetch("/api/motor_match/lead",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({name,email,phone,notes,searchKey:result.searchKey,request:{year,make:make.trim(),model:model.trim(),trim:trim.trim(),budget,mileage,zip:zip.trim(),distance},result:{state:result.state,depth:result.depth,matchCount:result.matchCount,priceNeeded:result.market.priceNeeded,mileageNeeded:result.market.mileageNeeded,yearNeeded:result.market.yearNeeded}})});
   const raw=await response.text();let payload:any=null;try{payload=raw?JSON.parse(raw):null}catch{}
   if(!response.ok)throw new Error(payload?.error||"We could not send your request. Please try again.");
   if(!payload)throw new Error("We could not read the submission response. Please try again.");
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
   <div className={styles.step+" "+styles.stepCar}>
    <div className={styles.stepNumber}>1</div>
    <div className={styles.stepCopy}><span>THE CAR</span><strong>What are you looking for?</strong></div>
    <div className={styles.vehicleGrid}>
     <Field label="MAKE"><input value={make} placeholder="BMW" onChange={e=>setMake(e.target.value)}/></Field>
     <Field label="MODEL"><input value={model} placeholder="5 Series" onChange={e=>{setModel(e.target.value);setTrim("")}}/></Field>
     <Field label="TRIM"><input value={trim} placeholder="Optional" onChange={e=>setTrim(e.target.value)}/></Field>
     <Field label="YEAR"><input type="number" min="1990" max={CURRENT_YEAR+1} value={year??""} placeholder="2022" onChange={e=>setYear(e.target.value?Number(e.target.value):null)}/></Field>
    </div>
   </div>

   <div className={styles.step+" "+styles.stepLimits}>
    <div className={styles.stepNumber}>2</div>
    <div className={styles.stepCopy}><span>YOUR LIMITS</span><strong>What matters most?</strong></div>
    <div className={styles.limitGrid}>
     <div className={styles.limitCard}><span>YEAR</span><strong>{year??"Choose year"}</strong><input type="range" min={2000} max={CURRENT_YEAR+1} step={1} value={year??2022} onChange={e=>setYear(Number(e.target.value))}/></div>
     <div className={styles.limitCard}><span>COST</span><strong>{money(budget)}</strong><input type="range" min={5000} max={150000} step={500} value={budget} onChange={e=>setBudget(Number(e.target.value))}/></div>
     <div className={styles.limitCard}><span>MILES</span><strong>{num(mileage)} miles</strong><input type="range" min={5000} max={200000} step={1000} value={mileage} onChange={e=>setMileage(Number(e.target.value))}/></div>
    </div>
   </div>

   <div className={styles.step+" "+styles.stepSearch}>
    <div className={styles.stepNumber}>3</div>
    <div className={styles.stepCopy}><span>SEARCH</span><strong>Where should we look?</strong></div>
    <div className={styles.locationGrid}>
     <Field label="ZIP CODE"><input inputMode="numeric" maxLength={5} value={zip} onChange={e=>setZip(e.target.value.replace(/\D/g,"").slice(0,5))} placeholder="Optional"/></Field>
     <Field label="RADIUS"><select value={distance} onChange={e=>setDistance(Number(e.target.value))}><option value={100}>100 miles</option><option value={250}>250 miles</option><option value={500}>500 miles</option><option value={1000}>1,000 miles</option></select></Field>
     <button className={styles.primary} onClick={()=>void analyze()} disabled={loading||!vehicleReady}>{loading?"CHECKING THE MARKET…":started?"REFRESH MARKET →":"CHECK THE MARKET →"}</button>
    </div>
   </div>
  </section>

  {error?<div className={styles.error}>{error}</div>:null}

  {loading&&started?<div className={styles.refreshStatus} role="status" aria-live="polite"><span className={styles.refreshDot}/><div><strong>Updating your Motor Match…</strong><small>Rechecking the market against your new limits.</small></div></div>:null}

  {result?<section className={styles.answer+" "+styles["answer_"+result.state]}>
   <div className={styles.answerLead}>
    <div className={styles.resultStatusRow}>
     <span className={styles.resultStatus}>{result.state==="green"?"REALISTIC TARGET":result.state==="yellow"?"THIN MARKET":"MARKET MISMATCH"}</span>
     <span className={styles.resultVehicle}>{year} {make} {model}{trim?" · "+trim:""}</span>
    </div>
    <h2>{headline}</h2>
    <p>{subhead}</p>
   </div>

   <div className={styles.targetBlock}>
    <div className={styles.sectionKicker}><span>YOUR TARGET</span><strong>What the market says about each limit.</strong></div>
    <div className={styles.constraintRow}>
     <Constraint label="Budget" value={money(budget)} works={result.constraintStatus.priceWorks}/>
     <Constraint label="Mileage" value={num(mileage)+" mi"} works={result.constraintStatus.mileageWorks}/>
     <Constraint label="Year" value={String(year)} works={result.matchCount>0}/>
    </div>
   </div>

   {result.state!=="green"&&(Boolean(result.market.priceNeeded&&result.market.priceNeeded>budget)||Boolean(result.market.mileageNeeded&&result.market.mileageNeeded>mileage)||Boolean(result.market.yearNeeded))?<div className={styles.nextMoves}>
    <div className={styles.sectionKicker}><span>BEST NEXT MOVE</span><strong>Relax one constraint — not all three.</strong></div>
    <div className={styles.moveGrid}>
     {result.market.priceNeeded&&result.market.priceNeeded>budget?<Option label="Raise budget to" value={money(result.market.priceNeeded)} action="Keep year + mileage" active onClick={()=>setBudget(Math.ceil(result.market.priceNeeded!/500)*500)}/>:null}
     {result.market.mileageNeeded&&result.market.mileageNeeded>mileage?<Option label="Allow up to" value={num(result.market.mileageNeeded)+" mi"} action="Keep year + budget" active onClick={()=>setMileage(Math.ceil(result.market.mileageNeeded!/1000)*1000)}/>:null}
     {result.market.yearNeeded?<Option label="Try model year" value={String(result.market.yearNeeded)} action="Keep budget + mileage" active onClick={()=>setYear(result.market.yearNeeded)}/>:null}
    </div>
   </div>:null}

   <div className={styles.cta}>
    <div><span>WANT US TO FIND THE RIGHT ONE?</span><strong>We can take it from here.</strong><p>Mindful Motors can search the public market, auctions, and dealer network using the target you just built.</p></div>
    {!showForm&&!sent?<button onClick={()=>setShowForm(true)}>FIND MY CAR →</button>:null}
   </div>

   {sent?<div className={styles.success}><strong>Got it.</strong><span>Your Motor Match has been sent to Mindful Motors.</span></div>:null}
  </section>:null}

  {loading&&!started?<div
   role="presentation"
   style={{position:"fixed",inset:0,zIndex:9999,display:"grid",placeItems:"center",padding:20,background:"rgba(17,17,17,.42)",backdropFilter:"blur(6px)"}}
  >
   <div
    role="status"
    aria-live="polite"
    aria-label="Searching the market"
    style={{width:"min(520px,calc(100vw - 32px))",boxSizing:"border-box",background:"#fbfaf6",border:"1px solid rgba(17,17,17,.12)",borderRadius:24,boxShadow:"0 30px 80px rgba(0,0,0,.28)",padding:"30px 26px 25px",textAlign:"center"}}
   >
    <div style={{display:"grid",placeItems:"center",margin:"0 auto 14px"}} aria-hidden="true">
     <svg viewBox="0 0 240 110" width="220" height="101" style={{display:"block",maxWidth:"70vw"}}>
      <defs>
       <clipPath id="motor-match-car-fill">
        <path d="M31 67c4-16 16-26 35-30l22-5 17-18h52l25 22 25 7c12 4 20 14 20 26v8h-15a25 25 0 0 0-49 0H79a25 25 0 0 0-49 0H18v-7c0-7 5-12 13-13Zm71-31h66l-17-15h-37l-12 15Z"/>
        <circle cx="55" cy="79" r="18"/>
        <circle cx="187" cy="79" r="18"/>
       </clipPath>
      </defs>
      <path fill="#d5d8de" d="M31 67c4-16 16-26 35-30l22-5 17-18h52l25 22 25 7c12 4 20 14 20 26v8h-15a25 25 0 0 0-49 0H79a25 25 0 0 0-49 0H18v-7c0-7 5-12 13-13Zm71-31h66l-17-15h-37l-12 15Z"/>
      <circle fill="#b9bec7" cx="55" cy="79" r="18"/>
      <circle fill="#b9bec7" cx="187" cy="79" r="18"/>
      <g clipPath="url(#motor-match-car-fill)">
       <rect x="0" y="0" width="0" height="110" fill="#2457ff">
        <animate attributeName="width" values="0;168;240;240" keyTimes="0;0.5;0.78;1" dur="3.8s" repeatCount="indefinite"/>
       </rect>
      </g>
      <circle fill="#fbfaf6" stroke="rgba(17,17,17,.14)" strokeWidth="2" cx="55" cy="79" r="7"/>
      <circle fill="#fbfaf6" stroke="rgba(17,17,17,.14)" strokeWidth="2" cx="187" cy="79" r="7"/>
     </svg>
    </div>
    <div>
     <span style={{display:"block",fontSize:8,fontWeight:900,letterSpacing:".14em",color:"#2457ff",marginBottom:7}}>SEARCHING THE MARKET</span>
     <h2 key={loadingMessageIndex} style={{margin:0,fontSize:"clamp(25px,4vw,34px)",lineHeight:1.05,letterSpacing:"-.04em",minHeight:36}}>{LOADING_MESSAGES[loadingMessageIndex]}</h2>
     <p style={{margin:"9px 0 0",fontSize:11,lineHeight:1.45,opacity:.56}}>This can take a few seconds while we search current inventory.</p>
    </div>
   </div>
  </div>:null}

  {showForm&&!sent?<div className={styles.modalBackdrop} onMouseDown={e=>{if(e.target===e.currentTarget)setShowForm(false)}}>
   <div className={styles.modal} role="dialog" aria-modal="true" aria-labelledby="motor-match-form-title">
    <button className={styles.modalClose} type="button" onClick={()=>setShowForm(false)} aria-label="Close">×</button>
    <div className={styles.modalIntro}>
     <span>FIND MY CAR</span>
     <h2 id="motor-match-form-title">Let Mindful Motors take it from here.</h2>
     <p>Send us your Motor Match and we’ll review the live market, auctions, and dealer network for the best fit.</p>
    </div>
    <form className={styles.leadForm} onSubmit={submitLead}>
     <label><span>NAME</span><input required value={name} onChange={e=>setName(e.target.value)}/></label>
     <label><span>EMAIL</span><input required type="email" value={email} onChange={e=>setEmail(e.target.value)}/></label>
     <label><span>PHONE</span><input required type="tel" value={phone} onChange={e=>setPhone(e.target.value)}/></label>
     <label className={styles.notes}><span>ANYTHING ELSE WE SHOULD KNOW?</span><textarea value={notes} onChange={e=>setNotes(e.target.value)} rows={3}/></label>
     <button type="submit" disabled={sending}>{sending?"SENDING…":"FIND MY CAR →"}</button>
     {formError?<div className={styles.formError}>{formError}</div>:null}
    </form>
   </div>
  </div>:null}
 </main>;
}

function Field({label,children}:{label:string;children:React.ReactNode}){return <label className={styles.field}><span>{label}</span>{children}</label>}
function Constraint({label,value,works}:{label:string;value:string;works:boolean}){return <div className={styles.constraint}><span>{label}</span><strong>{value}</strong><b className={works?styles.good:styles.bad}>{works?"WORKS":"BLOCKING"}</b></div>}
function Option({label,value,action,active,onClick}:{label:string;value:string;action:string;active:boolean;onClick:()=>void}){return <button className={styles.option} disabled={!active} onClick={onClick}><span>{label}</span><strong>{value}</strong><b>{action}</b></button>}
