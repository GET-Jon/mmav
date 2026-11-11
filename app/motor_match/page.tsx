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
 fallbackOptions?:Array<{kind:"year"|"trim"|"distance";value:number|string;label:string;detail:string}>;
};

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
 const [started,setStarted]=useState(false),[result,setResult]=useState<MatchResponse|null>(null),[loading,setLoading]=useState(false),[loadingMessageIndex,setLoadingMessageIndex]=useState(0),[error,setError]=useState(""),[vehicleError,setVehicleError]=useState(""),[sessionCalls,setSessionCalls]=useState(0),[showForm,setShowForm]=useState(false);
 const [name,setName]=useState(""),[email,setEmail]=useState(""),[phone,setPhone]=useState(""),[notes,setNotes]=useState(""),[sending,setSending]=useState(false),[sent,setSent]=useState(false),[formError,setFormError]=useState("");
 const [makes,setMakes]=useState<string[]>([]),[models,setModels]=useState<string[]>([]),[validYears,setValidYears]=useState<number[]>([]);
 const [manualInquiry,setManualInquiry]=useState(false);
 const [priority,setPriority]=useState<"budget"|"year"|"mileage">("budget");
 const [advancedOpen,setAdvancedOpen]=useState(false);
 const [originalTarget,setOriginalTarget]=useState<{year:number;budget:number;mileage:number}|null>(null);
 const [appliedSuggestion,setAppliedSuggestion]=useState("");
 const [refinementOutcome,setRefinementOutcome]=useState<{before:number;after:number;label:string}|null>(null);
 const pendingRefinement=useRef<{before:number;label:string}|null>(null);
 const [budgetDraft,setBudgetDraft]=useState("30000");
 const [discoveryMode,setDiscoveryMode]=useState(false);
 const [activePanel,setActivePanel]=useState<0|1|2|null>(0);
 const [budgetChosen,setBudgetChosen]=useState(false);
 const [priorityChosen,setPriorityChosen]=useState(false);
 const [embedded,setEmbedded]=useState(false);
 const [vehicleSuggestion,setVehicleSuggestion]=useState<{model:string;year:number}|null>(null);
 const requestId=useRef(0);
 const shellRef=useRef<HTMLElement|null>(null);
 const resultsRef=useRef<HTMLElement|null>(null);
 const builderRef=useRef<HTMLElement|null>(null);
 const scrollAfterSearch=useRef(false);
 const makeInputRef=useRef<HTMLSelectElement|null>(null);
 const rounded=(value:number,step:number)=>Math.ceil(value/step)*step;
 const vehicleReady=Boolean(year&&make.trim()&&model.trim());
 const makeNeedsFocus=!make.trim();

 const analyze=useCallback(async()=>{
  if(!vehicleReady||!year){scrollAfterSearch.current=false;setError("Add a year, make, and model first.");return}
  const id=++requestId.current;setLoading(true);setError("");setVehicleError("");setVehicleSuggestion(null);
  try{
   const response=await fetch("/api/motor_match",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({year,make:make.trim(),model:model.trim(),trim:trim.trim(),budget,mileage,zip:zip.trim(),distance})});
   const raw=await response.text();let payload:any=null;try{payload=raw?JSON.parse(raw):null}catch{}
   setSessionCalls(v=>v+(payload?.apiUsage?.callsThisUpdate||0));
   if(!response.ok){
    if(payload?.code==="vehicle_unverified"||payload?.code==="invalid_model_year"){
     if(id===requestId.current){scrollAfterSearch.current=false;setResult(null);setStarted(false);setVehicleSuggestion(payload.suggestion||null);setActivePanel(0);setVehicleError(payload.error||"We couldn't verify that vehicle.");}
     return;
    }
    throw new Error(payload?.error||"The market service took too long to respond. Please try again.");
   }
   if(!payload)throw new Error("We could not read the market response. Please try again.");
   if(id===requestId.current){
    const pending=pendingRefinement.current;
    if(pending){setRefinementOutcome({before:pending.before,after:payload.matchCount,label:pending.label});pendingRefinement.current=null;}
    else if(!started)setRefinementOutcome(null);
    setResult(payload);setStarted(true);setSent(false);setAppliedSuggestion("");setActivePanel(null);
   }
  }catch(cause){if(id===requestId.current){scrollAfterSearch.current=false;setError(cause instanceof Error?cause.message:"We could not check the market.")}}
  finally{if(id===requestId.current)setLoading(false)}
 },[budget,distance,make,mileage,model,trim,vehicleReady,year,zip,started]);

 useEffect(()=>{
  const originalGutter=document.documentElement.style.scrollbarGutter;
  document.documentElement.style.scrollbarGutter="stable";
  return()=>{document.documentElement.style.scrollbarGutter=originalGutter};
 },[]);
 useEffect(()=>{
  const isEmbed=new URLSearchParams(window.location.search).get("embed")==="1";
  setEmbedded(isEmbed);
  if(!isEmbed)return;
  const bodyBackground=document.body.style.background;
  const htmlBackground=document.documentElement.style.background;
  const bodyMinHeight=document.body.style.minHeight;
  const bodyHeight=document.body.style.height;
  const htmlMinHeight=document.documentElement.style.minHeight;
  const htmlHeight=document.documentElement.style.height;
  document.body.style.background="transparent";
  document.documentElement.style.background="transparent";
  document.body.style.minHeight="0";
  document.body.style.height="auto";
  document.documentElement.style.minHeight="0";
  document.documentElement.style.height="auto";

  let lastHeight=0;
  let raf=0;
  const reportHeight=()=>{
   cancelAnimationFrame(raf);
   raf=requestAnimationFrame(()=>{
    const shell=shellRef.current;
    if(!shell)return;
    const rect=shell.getBoundingClientRect();
    const height=Math.ceil(Math.max(shell.scrollHeight,rect.height));
    if(Math.abs(height-lastHeight)<2)return;
    lastHeight=height;
    window.parent.postMessage({type:"motor-match:resize",height},"*");
   });
  };
  const observer=new ResizeObserver(reportHeight);
  if(shellRef.current)observer.observe(shellRef.current);
  window.addEventListener("resize",reportHeight);
  reportHeight();
  const delayed=[100,400,900].map(ms=>window.setTimeout(reportHeight,ms));

  return()=>{
   observer.disconnect();
   window.removeEventListener("resize",reportHeight);
   delayed.forEach(window.clearTimeout);
   cancelAnimationFrame(raf);
   document.body.style.background=bodyBackground;
   document.documentElement.style.background=htmlBackground;
   document.body.style.minHeight=bodyMinHeight;
   document.body.style.height=bodyHeight;
   document.documentElement.style.minHeight=htmlMinHeight;
   document.documentElement.style.height=htmlHeight;
  };
 },[]);
 useEffect(()=>{
  fetch("/api/motor_match/options").then(r=>r.json()).then(payload=>setMakes(Array.isArray(payload?.makes)?payload.makes:[])).catch(()=>setError("We couldn't load the vehicle list. Please refresh and try again."));
 },[]);
 useEffect(()=>{
  if(!make){setModels([]);return}
  fetch("/api/motor_match/options?make="+encodeURIComponent(make)).then(r=>r.json()).then(payload=>setModels(Array.isArray(payload?.models)?payload.models:[])).catch(()=>setModels([]));
 },[make]);
 useEffect(()=>{
  if(!make||!model){setValidYears([]);return}
  fetch("/api/motor_match/options?make="+encodeURIComponent(make)+"&model="+encodeURIComponent(model)).then(r=>r.json()).then(payload=>{
   const next=Array.isArray(payload?.years)?payload.years.map(Number).filter(Number.isFinite):[];
   setValidYears(next);
   setYear(current=>current&&next.includes(current)?current:next.length?Math.max(...next):null);
  }).catch(()=>setValidYears([]));
 },[make,model]);
 useEffect(()=>{makeInputRef.current?.focus()},[]);
 useEffect(()=>{if(!started)return;const t=window.setTimeout(()=>void analyze(),650);return()=>window.clearTimeout(t)},[analyze,started]);
 useEffect(()=>{
  if(!result||loading||!scrollAfterSearch.current)return;
  scrollAfterSearch.current=false;
  const timer=window.setTimeout(()=>{
   const section=resultsRef.current;
   if(!section)return;
   if(new URLSearchParams(window.location.search).get("embed")==="1"){
    window.parent.postMessage({type:"motor-match:scroll-results",offset:section.getBoundingClientRect().top},"*");
   }else{
    const reduced=window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    section.scrollIntoView({behavior:reduced?"auto":"smooth",block:"start"});
   }
  },180);
  return()=>window.clearTimeout(timer);
 },[result,loading]);
 useEffect(()=>{
  if(!loading||started){setLoadingMessageIndex(0);return}
  const timer=window.setInterval(()=>setLoadingMessageIndex(index=>(index+1)%LOADING_MESSAGES.length),1450);
  return()=>window.clearInterval(timer);
 },[loading,started]);

 async function submitLead(e:React.FormEvent){
  e.preventDefault();if(!manualInquiry&&(!result||!year))return;setSending(true);setFormError("");
  try{
   const response=await fetch("/api/motor_match/lead",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({
    manualInquiry,name,email,phone,notes:notes+(manualInquiry?"":`
Customer priority: ${priority}`),
    searchKey:manualInquiry?"":result?.searchKey||"",
    request:{year,make:make.trim(),model:model.trim(),trim:trim.trim(),budget,mileage,zip:zip.trim(),distance},
    result:manualInquiry?null:result?{state:result.state,depth:result.depth,matchCount:result.matchCount,priceNeeded:result.market.priceNeeded,mileageNeeded:result.market.mileageNeeded,yearNeeded:result.market.yearNeeded}:null
   })});
   const raw=await response.text();let payload:any=null;try{payload=raw?JSON.parse(raw):null}catch{}
   if(!response.ok)throw new Error(payload?.error||"We could not send your request. Please try again.");
   if(!payload)throw new Error("We could not read the submission response. Please try again.");
   setSent(true);setShowForm(false);
  }catch(cause){setFormError(cause instanceof Error?cause.message:"We could not send your request.")}
  finally{setSending(false)}
 }

 const matchesBoth=Boolean(result&&result.matchCount>0);
 const saveOriginal=()=>{if(!originalTarget&&year)setOriginalTarget({year,budget,mileage})};
 const applySuggestion=(kind:"price"|"mileage"|"year",value:number)=>{
  saveOriginal();setAppliedSuggestion(kind);
  if(kind==="price"){setBudget(value);setBudgetDraft(String(value))}
  if(kind==="mileage")setMileage(value);
  if(kind==="year")setYear(value);
 };
 const queueRefinement=(label:string,action:()=>void,verified:boolean)=>{
  if(verified&&result){pendingRefinement.current={before:result.matchCount,label};setRefinementOutcome(null);}
  else{pendingRefinement.current=null;setRefinementOutcome(null);}
  action();
 };
 const restoreOriginal=()=>{if(!originalTarget)return;setYear(originalTarget.year);setBudget(originalTarget.budget);setBudgetDraft(String(originalTarget.budget));setMileage(originalTarget.mileage);setOriginalTarget(null);setAppliedSuggestion("");};
 const refinementOptions=useMemo(()=>{
  if(!result||result.state==="green")return [];
  type Choice={key:string;heading:string;value:string;detail:string;verified:boolean;action:()=>void;focus:"year"|"mileage"|"budget"|"other"};
  const choices:Choice[]=[];
  const add=(item:Choice)=>{if(!choices.some(c=>c.key===item.key))choices.push(item)};
  const yearOption=result.market.yearNeeded;
  const mileageOption=result.market.mileageNeeded;
  const priceOption=result.market.priceNeeded;
  const alternateYear=(result.fallbackOptions||[]).find(c=>c.kind==="year");
  if(yearOption&&yearOption<Number(year)){
   add({key:"year-verified",heading:"Prioritize lower mileage",value:String(yearOption)+" "+make+" "+model,detail:"Keep your budget and mileage target · supported by sampled listings",verified:true,focus:"year",action:()=>applySuggestion("year",yearOption)});
  }else if(alternateYear&&Number(alternateYear.value)<Number(year)){
   add({key:"year-explore",heading:"Prioritize lower mileage",value:"Explore "+alternateYear.value+" models",detail:"Keep mileage and budget · availability not yet verified",verified:false,focus:"year",action:()=>applySuggestion("year",Number(alternateYear.value))});
  }
  if(mileageOption&&mileageOption>mileage){
   const value=rounded(mileageOption,5000);
   add({key:"mileage-verified",heading:"Prioritize a newer car",value:"Allow up to "+num(value)+" miles",detail:"Keep model year and budget · supported by sampled listings; inspect maintenance history",verified:true,focus:"mileage",action:()=>applySuggestion("mileage",value)});
  }
  if(priceOption&&priceOption>budget){
   const value=rounded(priceOption,500);
   add({key:"price-verified",heading:"Keep year and mileage",value:"Consider "+money(value),detail:"Raise the budget · supported by sampled listings",verified:true,focus:"budget",action:()=>applySuggestion("price",value)});
  }
  // Always offer both trade-off directions without fabricating an inventory threshold.
  if(!choices.some(c=>c.focus==="year")){
   add({key:"year-review",heading:"Prioritize lower mileage",value:"Explore other model years",detail:"Review valid older years while keeping your mileage goal · availability unconfirmed",verified:false,focus:"year",action:()=>{setActivePanel(2);setAdvancedOpen(true);builderRef.current?.scrollIntoView({behavior:"smooth",block:"start"})}});
  }
  if(!choices.some(c=>c.focus==="mileage")){
   add({key:"mileage-review",heading:"Prioritize a newer car",value:"Revisit the mileage limit",detail:"Keep your selected year; adjust mileage to broaden the search · no verified threshold yet",verified:false,focus:"mileage",action:()=>{setActivePanel(2);setAdvancedOpen(true);builderRef.current?.scrollIntoView({behavior:"smooth",block:"start"})}});
  }
  if(choices.length<2){
   add({key:"budget-review",heading:"Keep year and mileage",value:"Review your budget",detail:"Explore a higher price ceiling; no verified threshold yet",verified:false,focus:"budget",action:()=>{setActivePanel(1);builderRef.current?.scrollIntoView({behavior:"smooth",block:"start"})}});
  }
  const order=priority==="year"?["mileage","year","budget","other"]:priority==="mileage"?["year","mileage","budget","other"]:["year","mileage","budget","other"];
  return choices.sort((a,b)=>order.indexOf(a.focus)-order.indexOf(b.focus));
 // Deliberately recalculated with current search evidence; suggestions update the original search.
 },[result,priority,year,make,model,budget,mileage]);
 const headline=useMemo(()=>{
  if(!result)return "";
  if(result.state==="green")return "Yes — this is realistic.";
  if(result.state==="yellow")return "Your search is possible, but choices are limited.";
  return "You're close, but something has to give.";
 },[result]);

 const subhead=useMemo(()=>{
  if(!result)return "";
  if(result.state==="green")return result.depth==="strong"?"Strong availability around your target.":"Healthy availability around your target.";
  if(result.state==="yellow")return "Some listings may fit, but finding the right condition, history, and options could take patience.";
  return "We couldn't find enough current inventory satisfying both limits at once.";
 },[result]);

 return <main ref={shellRef} className={styles.shell+(embedded?" "+styles.shellEmbedded:"")}>
  {!embedded?<header className={styles.topbar}>
   <div className={styles.brand}><span className={styles.mark}>MM</span><div><b>MOTOR MATCH</b><small>by Mindful Motors</small></div></div>
   <div className={styles.apiMeter}><div><span>API CALLS · SESSION</span><strong>{sessionCalls}</strong></div><div><span>LAST UPDATE</span><strong>{result?.apiUsage?.callsThisUpdate??0}</strong></div><details><summary>DETAILS</summary><div className={styles.apiPopover}>{(result?.apiUsage?.breakdown||[]).length?result!.apiUsage.breakdown.map((call,i)=><div key={i}><b>{i+1}. {call.label}</b><span>{call.purpose}</span></div>):<p>No new market calls yet.</p>}<small>Individual listings stay private and are never sent to the browser.</small></div></details></div>
  </header>:null}

  {!embedded?<section className={styles.hero}>
   <span className={styles.eyebrow}>WHAT CAN I ACTUALLY BUY?</span>
   <h1>Tell us the car.<br/><em>We'll tell you the market.</em></h1>
   <div className={styles.heroProcess}><strong>THREE QUICK CHOICES</strong><span>1. Choose your car</span><span>2. Set your budget</span><span>3. Pick your priorities</span><span className={styles.heroProcessResult}>Then see what's realistic ↓</span></div>
  </section>:null}

  {embedded?<div className={styles.embedProcess}><strong>THREE QUICK CHOICES</strong><span>Car → Budget → Priorities → Market results</span></div>:null}

  <section ref={builderRef} className={styles.builder+" "+styles.guidedBuilder+" "+styles.panelBuilder}>
   <div className={styles.panelTrack+(activePanel===null?" "+styles.panelTrackAllClosed:"")} data-active={activePanel===null?"all":activePanel}>
    <section className={styles.expandPanel+" "+(activePanel===0?styles.expandPanelOpen:styles.expandPanelClosed)}>
     <button className={styles.panelHandle} type="button" aria-expanded={activePanel===0} aria-controls="mm-car" onClick={()=>setActivePanel(activePanel===0?null:0)}><span className={styles.panelBadge}>1</span><span className={styles.panelHandleWords}><small>CAR</small><strong>{make&&model?make+" "+model:"Choose your car"}</strong></span><span className={styles.panelHandleChevron} aria-hidden="true">{activePanel===0?"−":"+"}</span></button>
     <div className={styles.panelContent} id="mm-car" aria-hidden={activePanel!==0}><div className={styles.panelInner}>
      <h3>What car do you have in mind?</h3><p>Start with a make and model. We can help with the rest.</p>
      <div className={styles.guidedVehicleGrid}>
       <Field label="MAKE"><select ref={makeInputRef} tabIndex={activePanel===0?0:-1} className={makeNeedsFocus?styles.makeFocus:""} value={make} onChange={e=>{setMake(e.target.value);setModel("");setYear(null);setTrim("");setResult(null);setStarted(false);setOriginalTarget(null);setVehicleError("")}}><option value="">Select make</option>{makes.map(value=><option key={value} value={value}>{value}</option>)}</select></Field>
       <Field label="MODEL"><select tabIndex={activePanel===0?0:-1} value={model} disabled={!make} onChange={e=>{setModel(e.target.value);setYear(null);setTrim("");setResult(null);setStarted(false);setOriginalTarget(null);setVehicleError("");if(e.target.value)setActivePanel(1)}}><option value="">{make?"Select model":"Choose make first"}</option>{models.map(value=><option key={value} value={value}>{value}</option>)}</select></Field>
      </div>
      <button type="button" tabIndex={activePanel===0?0:-1} className={styles.dreamLink} onClick={()=>{setDiscoveryMode(true);setManualInquiry(true);setSent(false);setFormError("");setShowForm(true)}}>Not sure what car to buy? Let us help you choose →</button>
      <div className={styles.panelActions}><button type="button" tabIndex={activePanel===0?0:-1} className={styles.panelNext} disabled={!make||!model} onClick={()=>setActivePanel(1)}>Next: Set your budget →</button></div>
     </div></div>
    </section>
    <section className={styles.expandPanel+" "+(activePanel===1?styles.expandPanelOpen:styles.expandPanelClosed)}>
     <button className={styles.panelHandle} type="button" aria-expanded={activePanel===1} aria-controls="mm-budget" onClick={()=>setActivePanel(activePanel===1?null:1)}><span className={styles.panelBadge}>2</span><span className={styles.panelHandleWords}><small>BUDGET</small><strong>{budgetChosen||started?money(budget):"Set your budget"}</strong></span><span className={styles.panelHandleChevron} aria-hidden="true">{activePanel===1?"−":"+"}</span></button>
     <div className={styles.panelContent} id="mm-budget" aria-hidden={activePanel!==1}><div className={styles.panelInner}>
      <h3>What's your ideal budget?</h3><p>Enter an amount or use the slider. You can change it anytime.</p>
      <div className={styles.budgetPanel}><label className={styles.budgetInputLabel}><span>BUDGET (USD)</span><div><span aria-hidden="true">$</span><input tabIndex={activePanel===1?0:-1} aria-label="Budget in dollars" type="number" min={1000} max={1000000} step={500} value={budgetDraft} onChange={e=>{setBudgetDraft(e.target.value);setBudgetChosen(true)}} onBlur={()=>{const n=Math.max(1000,Math.min(1000000,Number(budgetDraft)||30000));setBudget(n);setBudgetDraft(String(n))}} onKeyDown={e=>{if(e.key==="Enter")e.currentTarget.blur()}}/></div></label><input tabIndex={activePanel===1?0:-1} aria-label="Adjust budget" type="range" min={5000} max={150000} step={500} value={Math.max(5000,Math.min(150000,budget))} onChange={e=>{setBudget(Number(e.target.value));setBudgetDraft(e.target.value);setBudgetChosen(true)}}/><div className={styles.rangeEnds}><span>$5,000</span><span>$150,000+</span></div></div>
      <div className={styles.panelActions}><button type="button" tabIndex={activePanel===1?0:-1} className={styles.panelNext} onClick={()=>{const n=Math.max(1000,Math.min(1000000,Number(budgetDraft)||30000));setBudget(n);setBudgetDraft(String(n));setBudgetChosen(true);setActivePanel(2)}}>Next: Choose priorities →</button></div>
     </div></div>
    </section>
    <section className={styles.expandPanel+" "+(activePanel===2?styles.expandPanelOpen:styles.expandPanelClosed)}>
     <button className={styles.panelHandle} type="button" aria-expanded={activePanel===2} aria-controls="mm-priorities" onClick={()=>setActivePanel(activePanel===2?null:2)}><span className={styles.panelBadge}>3</span><span className={styles.panelHandleWords}><small>PREFERENCES</small><strong>{priorityChosen||started?(priority==="budget"?"Stay within budget":priority==="year"?"Newer car":"Lower mileage"):"Set your priorities"}</strong></span><span className={styles.panelHandleChevron} aria-hidden="true">{activePanel===2?"−":"+"}</span></button>
     <div className={styles.panelContent} id="mm-priorities" aria-hidden={activePanel!==2}><div className={styles.panelInner}>
      <h3>What matters most?</h3><p>Choose your biggest priority. Refine any other details.</p>
      <div className={styles.priorityGrid} role="radiogroup" aria-label="Your biggest priority">{([["budget","Stay within my budget"],["year","Get a newer car"],["mileage","Find lower mileage"]] as const).map(([value,label])=><label className={styles.priorityChoice} key={value}><input tabIndex={activePanel===2?0:-1} type="radio" name="motor-match-priority" value={value} checked={priority===value} onChange={()=>{setPriority(value);setPriorityChosen(true)}}/><span>{label}</span></label>)}</div>
      <button type="button" tabIndex={activePanel===2?0:-1} className={styles.advancedToggle} aria-expanded={advancedOpen} onClick={()=>setAdvancedOpen(v=>!v)}>{advancedOpen?"− Hide preferences":"+ Refine year, mileage, trim and search area"} <span>{year?"· "+year:""} · {num(mileage)} mi · {zip||"Nationwide"}</span></button>
      {advancedOpen?<div className={styles.advancedGrid}>
       <Field label="MODEL YEAR"><select tabIndex={activePanel===2?0:-1} value={year??""} disabled={!model} onChange={e=>setYear(e.target.value?Number(e.target.value):null)}><option value="">{model?"Select year":"Choose model first"}</option>{validYears.map(value=><option key={value} value={value}>{value}</option>)}</select></Field>
       <Field label="MAXIMUM MILEAGE"><input tabIndex={activePanel===2?0:-1} inputMode="numeric" type="number" min={1000} max={500000} step={1000} value={mileage} onChange={e=>setMileage(Math.max(1000,Math.min(500000,Number(e.target.value)||1000)))}/></Field>
       <Field label="TRIM (OPTIONAL)"><input tabIndex={activePanel===2?0:-1} value={trim} placeholder="Any trim" onChange={e=>setTrim(e.target.value)}/></Field>
       <Field label="ZIP CODE (OPTIONAL)"><input tabIndex={activePanel===2?0:-1} inputMode="numeric" maxLength={5} value={zip} onChange={e=>setZip(e.target.value.replace(/\D/g,"").slice(0,5))} placeholder="Nationwide"/></Field>
       <Field label="SEARCH RADIUS"><select tabIndex={activePanel===2?0:-1} value={distance} onChange={e=>setDistance(Number(e.target.value))}><option value={100}>100 miles</option><option value={250}>250 miles</option><option value={500}>500 miles</option><option value={1000}>1,000 miles</option></select></Field>
      </div>:null}
      <div className={styles.panelActions}><button type="button" tabIndex={activePanel===2?0:-1} className={styles.primary+" "+styles.primaryReady} onClick={()=>{scrollAfterSearch.current=true;void analyze()}} disabled={loading||!vehicleReady}>{loading?"SEARCHING THE MARKET…":started?"UPDATE MY RESULTS →":"SEE WHAT\u2019S REALISTIC →"}</button></div>
     </div></div>
    </section>
   </div>
  </section>

  {sent&&manualInquiry?<div className={styles.success+" "+styles.manualSuccess}><strong>Got it.</strong><span>We’ll take a look at what you’re trying to find and get back to you.</span></div>:null}
  {vehicleError?<div className={styles.vehicleError}><strong>CHECK THE VEHICLE</strong><span>{vehicleError}</span>{vehicleSuggestion?<button type="button" className={styles.vehicleSuggestionButton} onClick={()=>{setModel(vehicleSuggestion.model);setYear(vehicleSuggestion.year);setTrim("");setVehicleError("");setVehicleSuggestion(null);setActivePanel(2)}}>Switch to {make} {vehicleSuggestion.model} →</button>:null}</div>:null}
  {error?<div className={styles.error}>{error}</div>:null}

  {loading&&started?<div className={styles.refreshStatus} role="status" aria-live="polite"><span className={styles.refreshDot}/><div><strong>Updating your Motor Match…</strong><small>Rechecking the market against your new limits.</small></div></div>:null}

  {result?<section ref={resultsRef} id="motor-match-results" className={styles.answer+" "+styles["answer_"+result.state]}>
   <div className={styles.answerLead}>
    <div className={styles.resultStatusRow}>
     <span className={styles.resultStatus}>{result.state==="green"?"REALISTIC TARGET":result.state==="yellow"?"THIN MARKET":"MARKET MISMATCH"}</span>
     <span className={styles.resultVehicle}>{year} {make} {model}{trim?" · "+trim:""}</span>
    </div>
    <h2>{headline}</h2>
    <p>{subhead}</p>
   </div>
   <div className={styles.refinementTop}>
    {loading&&pendingRefinement.current?<div className={styles.refinementProgress} role="status">Checking how your updated criteria change the available listings…</div>:null}
    {refinementOutcome&&!loading?<div className={styles.refinementOutcome} role="status">
     <strong>{refinementOutcome.after>refinementOutcome.before?"Your updated search found more matches.":refinementOutcome.after>0?"Your updated search has matching listings.":"No confirmed matches with this adjustment yet."}</strong>
     <span>{refinementOutcome.label} · {refinementOutcome.before} → {refinementOutcome.after} matching listings in the respective market samples.</span>
    </div>:null}
    {result.state==="green"?<>
     <div className={styles.sectionKicker}><span>YOUR MOTOR MATCH</span><strong>Your search is realistic.</strong></div>
     <div className={styles.refinementSuccess}>
      <strong>{year} {make} {model}</strong>
      <span>{money(budget)} budget · up to {num(mileage)} miles</span>
      <p>{result.matchCount} matching listings in the current market sample. Vehicle condition and availability still require verification.</p>
     </div>
    </>:result.state==="yellow"?<>
     <div className={styles.sectionKicker}><span>YOUR MOTOR MATCH</span><strong>Possible, but choices are limited.</strong></div>
     <div className={styles.refinementSuccess}>
      <strong>{year} {make} {model}</strong>
      <span>{money(budget)} budget · up to {num(mileage)} miles</span>
      <p>{result.matchCount} matching {result.matchCount===1?"listing":"listings"} in the current sample. If you'd like more options, consider either direction below.</p>
     </div>
     <div className={styles.refinementGrid}>
      {refinementOptions.slice(0,3).map(choice=><button type="button" key={choice.key} className={styles.refinementCard} onClick={()=>queueRefinement(choice.value,choice.action,choice.verified)}><span>{choice.heading}</span><strong>{choice.value}</strong><small>{choice.detail}</small><b>{choice.verified?"APPLY & CHECK MARKET →":"EDIT SEARCH PREFERENCES →"}</b></button>)}
     </div>
    </>:<>
     <div className={styles.sectionKicker}><span>REFINE YOUR SEARCH</span><strong>Choose what matters more to you.</strong></div>
     <p className={styles.refinementIntro}>We couldn't verify a listing that meets all your limits. Try one of these approaches—verified adjustments are labeled, and exploratory choices are not guarantees.</p>
     <div className={styles.refinementGrid}>
      {refinementOptions.map(choice=><button type="button" key={choice.key} className={styles.refinementCard} onClick={()=>queueRefinement(choice.value,choice.action,choice.verified)}><span>{choice.heading}</span><strong>{choice.value}</strong><small>{choice.detail}</small><b>{choice.verified?"APPLY & CHECK MARKET →":"EDIT SEARCH PREFERENCES →"}</b></button>)}
     </div>
    </>}
    {originalTarget?<button type="button" className={styles.resetTarget} onClick={restoreOriginal}>↶ Return to my original search</button>:null}
    {appliedSuggestion&&loading?<p className={styles.suggestionHint}>Rechecking the market with your revised preference…</p>:null}
   </div>
   <div className={styles.evidenceBar}>{result.matchCount>0?<><strong>{result.matchCount} matching {result.matchCount===1?"listing":"listings"} in our market sample</strong><span>Availability isn't a condition or purchase recommendation. Check vehicle history and mechanical condition.</span></>:<><strong>No listings currently meet every limit together.</strong><span>We cannot confirm a viable purchase with the available sample.</span></>}</div>
   <div className={styles.cta}>
    <div><span>MINDFUL MOTOR CO.</span><strong>Want us to find it for you?</strong><p>We have your search preferences. Let us find the right vehicle, check its condition, negotiate the deal, and coordinate delivery.</p><p className={styles.ctaSummary}><b>Your search:</b> {year} {make} {model}{trim?" · "+trim:""} · {money(budget)} · {num(mileage)}-mile target</p></div>
    {!showForm&&!sent?<button onClick={()=>{setManualInquiry(false);setFormError("");setShowForm(true)}}>HAVE MINDFUL MOTORS FIND MY CAR →</button>:null}
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
     <span>{manualInquiry?"DREAM CAR REQUEST":"FIND MY CAR"}</span>
     <h2 id="motor-match-form-title">{manualInquiry?(discoveryMode?"We’ll help you choose the right car.":"Tell us what you’re looking for."):"Let Mindful Motors take it from here."}</h2>
     <p>{manualInquiry?"Tell us what you need, your budget, and what matters to you. We’ll help narrow down the right vehicles.":"Your vehicle, budget, mileage, year, and search area are included automatically. No need to enter them again."}</p>
    </div>
    <form className={styles.leadForm} onSubmit={submitLead}>
     <label><span>NAME</span><input required value={name} onChange={e=>setName(e.target.value)}/></label>
     <label><span>EMAIL</span><input required type="email" value={email} onChange={e=>setEmail(e.target.value)}/></label>
     <label><span>PHONE</span><input required type="tel" value={phone} onChange={e=>setPhone(e.target.value)}/></label>
     <label className={styles.notes}><span>{manualInquiry?"TELL US WHAT YOU NEED, YOUR BUDGET, AND YOUR PRIORITIES":"ANYTHING ELSE WE SHOULD KNOW?"}</span><textarea required={manualInquiry} value={notes} onChange={e=>setNotes(e.target.value)} rows={3} placeholder={manualInquiry?"Tell us the car, year range, trim, or anything else that matters.":""}/></label>
     <button type="submit" disabled={sending}>{sending?"SENDING…":"FIND MY CAR →"}</button>
     {formError?<div className={styles.formError}>{formError}</div>:null}
    </form>
   </div>
  </div>:null}
 </main>;
}

function Field({label,children}:{label:string;children:React.ReactNode}){return <label className={styles.field}><span>{label}</span>{children}</label>}
function Constraint({label,value,works,combined}:{label:string;value:string;works:boolean;combined:boolean}){return <div className={styles.constraint}><span>{label}</span><strong>{value}</strong><b className={works&&combined?styles.good:styles.bad}>{works&&combined?"MATCHED":works?"INDIVIDUALLY POSSIBLE":"NOT VERIFIED"}</b></div>}
function Option({label,value,action,active,onClick}:{label:string;value:string;action:string;active:boolean;onClick:()=>void}){return <button className={styles.option} disabled={!active} onClick={onClick}><span>{label}</span><strong>{value}</strong><b>{action}</b></button>}
