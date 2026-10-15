import {NextResponse} from "next/server";
import {findOlderYear,getMotorMatchCohort,solveMotorMatch} from "@/lib/motor-match/server";
export const dynamic="force-dynamic";
const s=(v:unknown)=>String(v||"").trim();

export async function POST(request:Request){
 try{
  const body=await request.json();
  const make=s(body.make),model=s(body.model),trim=s(body.trim),zip=/^\d{5}$/.test(s(body.zip))?s(body.zip):"",distance=Math.min(Math.max(Number(body.distance)||500,25),1000),year=Math.round(Number(body.year)||new Date().getFullYear()),budget=Math.max(0,Number(body.budget)||0),mileage=Math.max(0,Number(body.mileage)||0);
  if(!make||!model||!year||!budget||!mileage)return NextResponse.json({error:"Year, make, model, budget and mileage are required."},{status:400});
  const loaded=await getMotorMatchCohort({make,model,trim,zip,distance,year});
  const solved=solveMotorMatch(loaded.cohort.listings,budget,mileage);
  let yearCalls=0;
  if(solved.state!=="green"){
   const apiKey=process.env.AUTODEV_API_KEY;
   if(apiKey){
    solved.market.yearNeeded=await findOlderYear(apiKey,{make,model,trim,zip,distance,year,budget,mileage});
    yearCalls=1;
   }
  }
  return NextResponse.json({
   ...solved,
   searchKey:loaded.key,
   providerTotal:loaded.cohort.providerTotal,
   sampleSize:loaded.cohort.listings.length,
   cache:{hit:loaded.cacheHit,ttlSeconds:Math.max(0,Math.floor((loaded.cohort.expiresAt-Date.now())/1000))},
   apiUsage:{callsThisUpdate:loaded.calls+yearCalls,breakdown:[
    ...(loaded.calls?[{label:"Market cohort",purpose:"Build a private exact-year sample from low-price, low-mileage, and recent inventory."}]:[]),
    ...(yearCalls?[{label:"Older-year check",purpose:"Check whether a nearby older model year satisfies both limits."}]:[])
   ]}
  });
 }catch(cause){
  return NextResponse.json({error:cause instanceof Error?cause.message:"Motor Match market check failed."},{status:502});
 }
}
