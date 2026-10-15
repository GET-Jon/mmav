type Listing={vin:string|null;year:number|null;make:string|null;model:string|null;trim:string|null;price:number|null;miles:number|null;dealer:string|null;city:string|null;state:string|null;url:string|null};
type CachedCohort={expiresAt:number;listings:Listing[];providerTotal:number;calls:number;trim:string};

const CACHE_TTL_MS=30*60*1000;
const SAMPLE_LIMIT=100;
const cache=new Map<string,CachedCohort>();
const n=(v:unknown)=>{const x=Number(v);return Number.isFinite(x)?x:null};
const s=(v:unknown)=>String(v||"").trim();

function map(payload:any):Listing[]{return (Array.isArray(payload?.data)?payload.data:[]).map((row:any)=>{const v=row?.vehicle||{};const r=row?.retailListing||{};return{vin:s(v.vin||row?.vin)||null,year:n(v.year),make:s(v.make)||null,model:s(v.model)||null,trim:s(v.trim)||null,price:n(r.price),miles:n(r.miles??r.mileage),dealer:s(r.dealer)||null,city:s(r.city)||null,state:s(r.state)||null,url:s(r.vdp)||null}}).filter((l:Listing)=>typeof l.price==="number"&&l.price>0&&typeof l.miles==="number"&&l.miles>=0)}

function keyFor({make,model,trim,zip,distance,year}:{make:string;model:string;trim:string;zip:string;distance:number;year:number}){
 return [make,model,trim||"*",zip||"national",zip?distance:"all",year].map(v=>String(v).trim().toLowerCase()).join("|");
}

async function query(apiKey:string,params:Record<string,string|number|boolean|null|undefined>){
 const q=new URLSearchParams();Object.entries(params).forEach(([k,v])=>{if(v!==null&&v!==undefined&&v!=="")q.set(k,String(v))});
 const res=await fetch("https://api.auto.dev/listings?"+q.toString(),{headers:{Authorization:"Bearer "+apiKey,Accept:"application/json"},cache:"no-store"});
 const raw=await res.text();let payload:any=null;try{payload=raw?JSON.parse(raw):null}catch{payload={message:raw}}
 if(!res.ok)throw new Error(typeof payload?.message==="string"?payload.message:"Auto.dev request failed.");
 return{total:typeof payload?.total==="number"?payload.total:map(payload).length,listings:map(payload)};
}

function dedupe(groups:Listing[][]){
 const seen=new Set<string>();const out:Listing[]=[];
 for(const listing of groups.flat()){
  const id=listing.vin||listing.url||[listing.year,listing.make,listing.model,listing.trim,listing.price,listing.miles,listing.dealer].join("|");
  if(seen.has(id))continue;seen.add(id);out.push(listing);
 }
 return out;
}

export async function getMotorMatchCohort(input:{make:string;model:string;trim:string;zip:string;distance:number;year:number},force=false){
 const apiKey=process.env.AUTODEV_API_KEY;if(!apiKey)throw new Error("Motor Match is missing Auto.dev configuration.");
 const key=keyFor(input),now=Date.now(),existing=cache.get(key);
 if(!force&&existing&&existing.expiresAt>now)return{key,cohort:existing,cacheHit:true,calls:0};
 const base:Record<string,string|number|boolean>={"vehicle.make":input.make,"vehicle.model":input.model,"vehicle.year":input.year,"retailListing.used":true,includes:"total",limit:SAMPLE_LIMIT};
 if(input.trim)base["vehicle.trim"]=input.trim;
 if(input.zip){base.zip=input.zip;base.distance=input.distance}
 const [cheap,lowMiles]=await Promise.all([
  query(apiKey,{...base,sort:"price.asc"}),
  query(apiKey,{...base,sort:"miles.asc"})
 ]);
 const listings=dedupe([cheap.listings,lowMiles.listings]);
 const cohort={expiresAt:now+CACHE_TTL_MS,listings,providerTotal:Math.max(cheap.total,lowMiles.total),calls:2,trim:input.trim};
 cache.set(key,cohort);
 if(cache.size>200){for(const [k,v] of cache){if(v.expiresAt<=now)cache.delete(k)}}
 return{key,cohort,cacheHit:false,calls:3};
}

function fifth(values:number[]){const sorted=values.filter(v=>Number.isFinite(v)&&v>0).sort((a,b)=>a-b);return sorted.length?sorted[Math.min(4,sorted.length-1)]:null}

export function solveMotorMatch(listings:Listing[],budget:number,mileage:number){
 const exact=listings.filter(l=>(l.price??Infinity)<=budget&&(l.miles??Infinity)<=mileage);
 const withinMileage=listings.filter(l=>(l.miles??Infinity)<=mileage);
 const withinBudget=listings.filter(l=>(l.price??Infinity)<=budget);
 const priceNeeded=fifth(withinMileage.map(l=>l.price as number));
 const mileageNeeded=fifth(withinBudget.map(l=>l.miles as number));
 const state=exact.length>=5?"green":exact.length>0?"yellow":"red";
 const depth=exact.length>=10?"strong":exact.length>=5?"healthy":exact.length>0?"thin":"none";
 return{
  state,depth,matchCount:exact.length,
  constraintStatus:{priceWorks:withinBudget.length>0,mileageWorks:withinMileage.length>0},
  market:{priceNeeded,mileageNeeded,yearNeeded:null as number|null},
  message:state==="green"?"Your price and mileage overlap with a healthy current market.":state==="yellow"?"Your target is possible, but there are only a few current options.":"We could not find a current listing satisfying both limits at once."
 };
}

export async function findOlderYear(apiKey:string,input:{make:string;model:string;trim:string;zip:string;distance:number;year:number;budget:number;mileage:number}){
 if(input.year<=1991)return null;
 const base:Record<string,string|number|boolean>={"vehicle.make":input.make,"vehicle.model":input.model,"vehicle.year":Math.max(1990,input.year-3)+"-"+(input.year-1),"retailListing.used":true,"retailListing.price":"1-"+Math.round(input.budget),"retailListing.miles":"1-"+Math.round(input.mileage),limit:100,sort:"year.desc"};
 if(input.trim)base["vehicle.trim"]=input.trim;if(input.zip){base.zip=input.zip;base.distance=input.distance}
 const r=await query(apiKey,base);const counts=new Map<number,number>();r.listings.forEach(l=>{if(l.year)counts.set(l.year,(counts.get(l.year)||0)+1)});
 return Array.from(counts.entries()).filter(([,c])=>c>=3).sort((a,b)=>b[0]-a[0])[0]?.[0]||Array.from(counts.keys()).sort((a,b)=>b-a)[0]||null;
}

export function closestListings(listings:Listing[],input:{budget:number;mileage:number},limit=3){
 const priceScale=Math.max(input.budget,10000),mileageScale=Math.max(input.mileage,20000);
 return [...listings].sort((a,b)=>{
  const score=(l:Listing)=>Math.abs((l.price??priceScale)-input.budget)/priceScale+Math.abs((l.miles??mileageScale)-input.mileage)/mileageScale;
  return score(a)-score(b);
 }).slice(0,limit);
}

export function getCachedMotorMatch(key:string){const c=cache.get(key);return c&&c.expiresAt>Date.now()?c:null}
export type MotorMatchListing=Listing;
