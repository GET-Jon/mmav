import { NextResponse } from "next/server";
import { recordApiUsageEvent } from "@/lib/observability/api-usage";
import {
  decodeProviders, isValidVinFormat, type ProviderFetcher, type ProviderOutcome,
  type ResilientVinDecode,
} from "@/lib/vin/resilient-identity";

export const dynamic = "force-dynamic";

// Per-instance cache, bounded: best effort on serverless, not a persistent cache.
const MAX_CACHE = 250;
const cache = new Map<string,{expires: number; value: ResilientVinDecode | null}>();
const inFlight = new Map<string,Promise<{decoded:ResilientVinDecode|null;outcomes:ProviderOutcome[]}>>();

function getCached(vin:string) {
  const hit=cache.get(vin);
  if(!hit) return undefined;
  if(hit.expires < Date.now()) { cache.delete(vin); return undefined; }
  return hit.value;
}
function setCached(vin:string,value:ResilientVinDecode|null) {
  cache.delete(vin);
  cache.set(vin,{expires:Date.now() + (value ? 24*3600*1000 : 15*1000),value});
  if(cache.size > MAX_CACHE) cache.delete(cache.keys().next().value!);
}

const fetchProvider:ProviderFetcher = async(provider,vin,timeoutMs)=>{
  const started=Date.now();
  const key=process.env.AUTODEV_API_KEY;
  if(provider==="auto_dev" && !key) return {provider,httpStatus:0,durationMs:0,body:null,error:"not_configured"};
  const endpoint=provider==="nhtsa"
    ? "https://vpic.nhtsa.dot.gov/api/vehicles/DecodeVinValues/"+encodeURIComponent(vin)+"?format=json"
    : "https://api.auto.dev/vin/"+encodeURIComponent(vin)+"?ambiguity=false";
  try {
    const response=await fetch(endpoint,{
      headers:provider==="auto_dev" ? {Authorization:"Bearer "+key,Accept:"application/json"} : {Accept:"application/json"},
      cache:"no-store",
      signal:AbortSignal.timeout(timeoutMs),
    });
    const body=await response.json().catch(()=>null);
    return {provider,httpStatus:response.status,body:body && typeof body === "object" ? body : null,durationMs:Date.now()-started};
  } catch(error) {
    const reason=error instanceof Error && error.name === "TimeoutError" ? "timeout" : "unavailable";
    return {provider,httpStatus:0,body:null,durationMs:Date.now()-started,error:reason};
  }
};

function recordProviderTelemetry(vin:string,outcomes:ProviderOutcome[]) {
  for(const outcome of outcomes) {
    if(outcome.error === "not_configured") continue;
    // Never store raw responses, credentials or complete VIN in usage telemetry.
    void recordApiUsageEvent({
      provider:outcome.provider==="nhtsa"?"nhtsa_vpic":"auto_dev",
      endpoint:outcome.provider==="nhtsa"?"/api/vehicles/DecodeVinValues":"/vin",
      apiCallsMade:1,
      status:outcome.httpStatus || 504,
      stopReason:outcome.error || "vin_identity",
      metadata:{durationMs:outcome.durationMs,vinSuffix:vin.slice(-6),stage:"vehicle_identity"},
    }).catch(()=>undefined);
  }
}

export async function POST(request:Request) {
  const started=Date.now();
  try {
    const body=await request.json();
    const vin=String(body?.vin || "").trim().toUpperCase();
    if(!isValidVinFormat(vin)) {
      return NextResponse.json({error:"Enter a valid 17-character VIN."},{status:400});
    }
    const cached=getCached(vin);
    if(cached !== undefined) {
      if(cached) {
        return NextResponse.json({...cached,identityEvidence:{...cached.identityEvidence,cache:"hit"}},{
          headers:{"Cache-Control":"private, no-store","Server-Timing":"vin;dur=0;desc=memory-cache"},
        });
      }
      return NextResponse.json({error:"Vehicle identification is temporarily unavailable. Try again or use Manual entry."},{status:503});
    }
    let job=inFlight.get(vin);
    if(!job) {
      job=decodeProviders(vin,fetchProvider);
      inFlight.set(vin,job);
      void job.finally(()=>{ if(inFlight.get(vin) === job) inFlight.delete(vin); });
    }
    const {decoded,outcomes}=await job;
    setCached(vin,decoded);
    recordProviderTelemetry(vin,outcomes);
    const headers={"Cache-Control":"private, no-store",
      "Server-Timing":"vin;dur="+(Date.now()-started)+";desc=dual-source"};
    if(!decoded) {
      return NextResponse.json({
        error:"Vehicle identity could not be established confidently. Check the VIN or use Manual entry.",
        retryable:true,
      },{status:503,headers});
    }
    return NextResponse.json(decoded,{headers});
  } catch {
    return NextResponse.json({error:"VIN lookup is temporarily unavailable. Try again or use Manual entry."},{status:503});
  }
}
