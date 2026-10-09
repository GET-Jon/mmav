import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

type Listing={vin:string|null;year:number|null;make:string|null;model:string|null;trim:string|null;price:number|null;miles:number|null;dealer:string|null;city:string|null;state:string|null;url:string|null};
type CachedCohort={expiresAt:number;listings:Listing[];providerTotal:number};
type ApiCall={label:string;purpose:string};

const CACHE_TTL_MS=30*60*1000;
const MAX_LISTINGS=100;
const cohortCache=new Map<string,CachedCohort>();
const n=(v:unknown)=>{const x=Number(v);return Number.isFinite(x)?x:null};
const s=(v:unknown)=>String(v||"").trim();

function map(payload:any):Listing[]{return (Array.isArray(payload?.data)?payload.data:[]).map((row:any)=>{const v=row?.vehicle||{};const r=row?.retailListing||{};return{vin:s(v.vin||row?.vin)||null,year:n(v.year),make:s(v.make)||null,model:s(v.model)||null,trim:s(v.trim)||null,price:n(r.price),miles:n(r.miles??r.mileage),dealer:s(r.dealer)||null,city:s(r.city)||null,state:s(r.state)||null,url:s(r.vdp)||null}})}

function keyFor(make:string,model:string,trim:string,zip:string,distance:number){
  return [make,model,trim||"*",zip||"national",zip?distance:"all"].map(v=>String(v).trim().toLowerCase()).join("|");
}

async function query(apiKey:string,params:Record<string,string|number|boolean|null|undefined>){
  const q=new URLSearchParams();
  Object.entries(params).forEach(([k,v])=>{if(v!==null&&v!==undefined&&v!=="")q.set(k,String(v))});
  const res=await fetch("https://api.auto.dev/listings?"+q.toString(),{headers:{Authorization:"Bearer "+apiKey,Accept:"application/json"},cache:"no-store"});
  const raw=await res.text();let payload:any=null;try{payload=raw?JSON.parse(raw):null}catch{payload={message:raw}}
  if(!res.ok)throw new Error(typeof payload?.message==="string"?payload.message:"Auto.dev request failed.");
  return{total:typeof payload?.total==="number"?payload.total:map(payload).length,listings:map(payload)};
}

export async function POST(request:Request){
  const apiKey=process.env.AUTODEV_API_KEY;
  if(!apiKey)return NextResponse.json({error:"Motor Match is missing Auto.dev configuration."},{status:500});

  const body=await request.json();
  const make=s(body.make),model=s(body.model),trim=s(body.trim),zip=/^\d{5}$/.test(s(body.zip))?s(body.zip):"",distance=Math.min(Math.max(Number(body.distance)||500,25),1000);
  if(!make||!model)return NextResponse.json({error:"Make and model are required."},{status:400});

  const cacheKey=keyFor(make,model,trim,zip,distance);
  const now=Date.now();
  const cached=cohortCache.get(cacheKey);
  if(cached&&cached.expiresAt>now){
    return NextResponse.json({
      cohort:cached.listings,
      providerTotal:cached.providerTotal,
      cache:{hit:true,key:cacheKey,ttlSeconds:Math.max(0,Math.floor((cached.expiresAt-now)/1000))},
      apiUsage:{callsThisUpdate:0,breakdown:[] as ApiCall[]}
    });
  }

  const currentYear=new Date().getFullYear();
  const base:Record<string,string|number|boolean>={
    "vehicle.make":make,
    "vehicle.model":model,
    "vehicle.year":(currentYear-8)+"-"+(currentYear+1),
    "retailListing.used":true,
    includes:"total",
    limit:MAX_LISTINGS,
    sort:"updatedAt.desc"
  };
  if(trim)base["vehicle.trim"]=trim;
  if(zip){base.zip=zip;base.distance=distance}

  try{
    const result=await query(apiKey,base);
    const value:CachedCohort={expiresAt:now+CACHE_TTL_MS,listings:result.listings,providerTotal:result.total};
    cohortCache.set(cacheKey,value);

    if(cohortCache.size>150){
      for(const [key,item] of cohortCache){if(item.expiresAt<=now)cohortCache.delete(key)}
    }

    return NextResponse.json({
      cohort:value.listings,
      providerTotal:value.providerTotal,
      cache:{hit:false,key:cacheKey,ttlSeconds:Math.floor(CACHE_TTL_MS/1000)},
      apiUsage:{callsThisUpdate:1,breakdown:[{label:"Market cohort",purpose:"Fetch a broad vehicle inventory set; sliders are solved from this cache."}]}
    });
  }catch(cause){
    return NextResponse.json({
      error:cause instanceof Error?cause.message:"Motor Match market check failed.",
      apiUsage:{callsThisUpdate:1,breakdown:[{label:"Market cohort",purpose:"Fetch a broad vehicle inventory set."}]}
    },{status:502});
  }
}
