import {NextResponse} from "next/server";
import {findOlderYear,getMotorMatchCohort,solveMotorMatch} from "@/lib/motor-match/server";
import {resolveVehicleGeneration} from "@/lib/vehicle-generations";
import {motorMatchYears} from "@/lib/motor-match/vehicle-options";
export const dynamic="force-dynamic";
const s=(v:unknown)=>String(v||"").trim();

export async function POST(request:Request){
 try{
  const body=await request.json();
  const make=s(body.make),model=s(body.model),trim=s(body.trim),zip=/^\d{5}$/.test(s(body.zip))?s(body.zip):"",distance=Math.min(Math.max(Number(body.distance)||500,25),1000),year=Math.round(Number(body.year)||new Date().getFullYear()),budget=Math.max(0,Number(body.budget)||0),mileage=Math.max(0,Number(body.mileage)||0);
  if(!make||!model||!year||!budget||!mileage)return NextResponse.json({error:"Year, make, model, budget and mileage are required."},{status:400});
  const validYears=motorMatchYears(make,model);
  if(validYears.length&&!validYears.includes(year)){
   const successor=make.toLowerCase().replace(/[^a-z]/g,"")==="mercedesbenz"&&/^(m[ -]?class|ml[ -]?class)$/i.test(model);
   return NextResponse.json({
    code:"invalid_model_year",
    error:successor?"The Mercedes-Benz M-Class ended with the 2015 model year. Its successor is the GLE.":year+" is not a supported model year for "+make+" "+model+".",
    validYears,
    suggestion:successor?{model:"GLE",year:Math.min(new Date().getFullYear(),2026)}:null,
    vehicle:{year,make,model,trim}
   },{status:422});
  }
  const identityMatch=resolveVehicleGeneration({year,make,model,trim});
  const loaded=await getMotorMatchCohort({make,model,trim,zip,distance,year});
  if(!validYears.length&&!identityMatch&&loaded.cohort.listings.length===0){
   return NextResponse.json({
    code:"vehicle_unverified",
    error:"We couldn't verify that vehicle. Check the make, model, and year.",
    vehicle:{year,make,model,trim}
   },{status:422});
  }
  const solved=solveMotorMatch(loaded.cohort.listings,budget,mileage);
  let yearCalls=0;
  if(solved.state!=="green"){
   const apiKey=process.env.AUTODEV_API_KEY;
   if(apiKey){
    try{
     solved.market.yearNeeded=await findOlderYear(apiKey,{make,model,trim,zip,distance,year,budget,mileage,validYears});
     if(validYears.some(y=>y<year))yearCalls=1;
    }catch{
     // Alternative lookup failure should never block the primary market result.
    }
   }
  }
  const fallbackOptions:Array<{kind:"year"|"trim"|"distance";value:number|string;label:string;detail:string}>=[];
  if(solved.state!=="green"){
   const older=validYears.filter(y=>y<year).sort((a,b)=>b-a);
   if(older.length){
    const candidate=older.find(y=>y<=year-3)||older[0];
    fallbackOptions.push({kind:"year",value:candidate,label:"Explore "+candidate+" models",detail:"Another valid model year; availability not yet confirmed"});
   }
   if(trim)fallbackOptions.push({kind:"trim",value:"",label:"Consider any trim",detail:"Remove the trim restriction to expand the sample"});
   if(zip&&distance<1000)fallbackOptions.push({kind:"distance",value:Math.min(1000,distance===100?250:distance===250?500:1000),label:"Expand search distance",detail:"Look farther away for a larger sample"});
  }
  return NextResponse.json({
   ...solved,
   fallbackOptions,
   searchKey:loaded.key,
   providerTotal:loaded.cohort.providerTotal,
   sampleSize:loaded.cohort.listings.length,
   cache:{hit:loaded.cacheHit,ttlSeconds:Math.max(0,Math.floor((loaded.cohort.expiresAt-Date.now())/1000))},
   apiUsage:{callsThisUpdate:loaded.calls+yearCalls,breakdown:[
    ...(loaded.calls?[{label:"Market cohort",purpose:"Build a private exact-year sample from the lowest-price and lowest-mileage inventory."}]:[]),
    ...(yearCalls?[{label:"Older-year check",purpose:"Check whether a nearby older model year satisfies both limits."}]:[])
   ]}
  });
 }catch(cause){
  return NextResponse.json({error:cause instanceof Error?cause.message:"Motor Match market check failed."},{status:502});
 }
}
