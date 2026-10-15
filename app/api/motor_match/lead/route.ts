import {NextResponse} from "next/server";
import {closestListings,getCachedMotorMatch,getMotorMatchCohort} from "@/lib/motor-match/server";

export const dynamic="force-dynamic";
const s=(v:unknown)=>String(v||"").trim();

export async function POST(request:Request){
 try{
  const body=await request.json();
  const name=s(body.name),email=s(body.email).toLowerCase(),phone=s(body.phone),notes=s(body.notes),searchKey=s(body.searchKey);
  const req=body.request||{},res=body.result||{};
  const year=Math.round(Number(req.year)||0),make=s(req.make),model=s(req.model),trim=s(req.trim),budget=Math.max(0,Number(req.budget)||0),mileage=Math.max(0,Number(req.mileage)||0),zip=/^\d{5}$/.test(s(req.zip))?s(req.zip):"",distance=Math.min(Math.max(Number(req.distance)||500,25),1000);
  if(!name||!email.includes("@")||!phone)return NextResponse.json({error:"Name, email, and phone are required."},{status:400});
  if(!year||!make||!model||!budget||!mileage)return NextResponse.json({error:"Motor Match details are incomplete."},{status:400});

  let cohort=searchKey?getCachedMotorMatch(searchKey):null;
  if(!cohort){
   const loaded=await getMotorMatchCohort({year,make,model,trim,zip,distance});
   cohort=loaded.cohort;
  }
  const closest=closestListings(cohort.listings,{budget,mileage},3);
  const lines=closest.map((l,i)=>[
   `${i+1}. ${[l.year,l.make,l.model,l.trim].filter(Boolean).join(" ")}`,
   `   Price: ${l.price?"$"+Number(l.price).toLocaleString("en-US"):"n/a"}`,
   `   Mileage: ${l.miles?Number(l.miles).toLocaleString("en-US")+" mi":"n/a"}`,
   `   Dealer/location: ${[l.dealer,[l.city,l.state].filter(Boolean).join(", ")].filter(Boolean).join(" — ")||"n/a"}`,
   `   Link: ${l.url||"n/a"}`
  ].join("\n")).join("\n\n");

  const subject=`Motor Match lead — ${year} ${make} ${model}${trim?" "+trim:""}`;
  const text=[
   "NEW MOTOR MATCH LEAD","",
   `Name: ${name}`,`Email: ${email}`,`Phone: ${phone}`,`Notes: ${notes||"—"}`,"",
   "CUSTOMER TARGET",
   `Vehicle: ${year} ${make} ${model}${trim?" "+trim:""}`,
   `Budget: $${budget.toLocaleString("en-US")}`,
   `Max mileage: ${mileage.toLocaleString("en-US")} mi`,
   `Location: ${zip||"National"}${zip?` within ${distance} mi`:""}`,"",
   "MOTOR MATCH RESULT",
   `State: ${s(res.state)||"n/a"}`,`Market depth: ${s(res.depth)||"n/a"}`,`Current matches: ${Number(res.matchCount)||0}`,
   `Healthier price target: ${res.priceNeeded?"$"+Number(res.priceNeeded).toLocaleString("en-US"):"n/a"}`,
   `Healthier mileage target: ${res.mileageNeeded?Number(res.mileageNeeded).toLocaleString("en-US")+" mi":"n/a"}`,
   `Older year suggestion: ${res.yearNeeded||"n/a"}`,"",
   "PRIVATE — THREE CLOSEST CURRENT LISTINGS",
   lines||"No private listings available in the cached cohort."
  ].join("\n");

  const apiKey=process.env.RESEND_API_KEY;
  const from=process.env.MOTOR_MATCH_FROM_EMAIL||"Motor Match <motor-match@drivemindful.com>";
  if(!apiKey)return NextResponse.json({error:"Lead email delivery is not configured yet."},{status:503});
  const mail=await fetch("https://api.resend.com/emails",{method:"POST",headers:{Authorization:`Bearer ${apiKey}`,"Content-Type":"application/json"},body:JSON.stringify({from,to:["itsyours@drivemindful.com"],reply_to:email,subject,text})});
  const payload=await mail.json().catch(()=>null);
  if(!mail.ok)throw new Error(typeof payload?.message==="string"?payload.message:"Lead email could not be sent.");
  return NextResponse.json({sent:true});
 }catch(cause){
  return NextResponse.json({error:cause instanceof Error?cause.message:"Lead could not be submitted."},{status:500});
 }
}
