import {NextResponse} from "next/server";
import {findOlderYear,findOlderYearFromDatabase,getMotorMatchCohort,solveMotorMatch} from "@/lib/motor-match/server";
import {resolveVehicleGeneration} from "@/lib/vehicle-generations";
export const dynamic="force-dynamic";
const s=(v:unknown)=>String(v||"").trim();

export async function POST(request:Request){
 try{
  const body=await request.json();
  const make=s(body.make),model=s(body.model),trim=s(body.trim),zip=/^\d{5}$/.test(s(body.zip))?s(body.zip):"",distance=Math.min(Math.max(Number(body.distance)||500,25),1000),year=Math.round(Number(body.year)||new Date().getFullYear()),budget=Math.max(0,Number(body.budget)||0),mileage=Math.max(0,Number(body.mileage)||0);
  if(!make||!model||!year||!budget||!mileage)return NextResponse.json({error:"Year, make, model, budget and mileage are required."},{status:400});
  const identityMatch=resolveVehicleGeneration({year,make,model,trim});
  const loaded=await getMotorMatchCohort({make,model,trim,zip,distance,year});
  if(!identityMatch&&loaded.cohort.listings.length===0){
   return NextResponse.json({
    code:"vehicle_unverified",
    error:"We couldn't verify that vehicle. Check the make, model, and year.",
    vehicle:{year,make,model,trim}
   },{status:422});
  }
  const solved=solveMotorMatch(loaded.cohort.listings,budget,mileage);
  let yearCalls=0;
  if(solved.state!=="green"){
   if(loaded.cohort.source==="database"){
    solved.market.yearNeeded=await findOlderYearFromDatabase({make,model,trim,year,budget,mileage});
   }else{
    const apiKey=process.env.AUTODEV_API_KEY;
    if(apiKey){
     solved.market.yearNeeded=await findOlderYear(apiKey,{make,model,trim,zip,distance,year,budget,mileage});
     yearCalls=1;
    }
   }
  }
  return NextResponse.json({
   ...solved,
   searchKey:loaded.key,
   providerTotal:loaded.cohort.providerTotal,
   sampleSize:loaded.cohort.listings.length,
   dataSource:loaded.cohort.source,
   marketScope:loaded.cohort.source==="database"?"stored national snapshot":"live geographic query",
   cache:{hit:loaded.cacheHit,ttlSeconds:Math.max(0,Math.floor((loaded.cohort.expiresAt-Date.now())/1000))},
   apiUsage:{callsThisUpdate:0,breakdown:[
    ...(loaded.cohort.source==="database"?[{label:"Stored market database",purpose:"Use the stored Motor Match market snapshot without a live provider call."}]:[]),
    ...(yearCalls?[{label:"Older-year check",purpose:"Check whether a nearby older model year satisfies both limits."}]:[])
   ]}
  });
 }catch(cause){
  return NextResponse.json({error:cause instanceof Error?cause.message:"Motor Match market check failed."},{status:502});
 }
}
