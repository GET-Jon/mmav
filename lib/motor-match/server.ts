import { createSupabaseAdminClient } from "@/lib/supabase/server";
import { resolveVehicleGeneration } from "@/lib/vehicle-generations";
type Listing={vin:string|null;year:number|null;make:string|null;model:string|null;trim:string|null;price:number|null;miles:number|null;dealer:string|null;city:string|null;state:string|null;url:string|null};
type CachedCohort={
 expiresAt:number;listings:Listing[];providerTotal:number;calls:number;trim:string;source:"database"|"auto_dev";
 targetYear:number;generation:string|null;generationStartYear:number;generationEndYear:number
};

const CACHE_TTL_MS=30*60*1000;
const SAMPLE_LIMIT=100;
const cache=new Map<string,CachedCohort>();
const DB_MIN_SAMPLE=1;
const DB_MAX_SAMPLE=500;
const n=(v:unknown)=>{const x=Number(v);return Number.isFinite(x)?x:null};
const s=(v:unknown)=>String(v||"").trim();

function median(values:number[]){
 const sorted=values.filter(Number.isFinite).sort((a,b)=>a-b);
 if(!sorted.length)return null;
 const mid=Math.floor(sorted.length/2);
 return sorted.length%2?sorted[mid]:(sorted[mid-1]+sorted[mid])/2;
}

function cleanListings(rows:Listing[]){
 const basic=rows.filter(l=>
  typeof l.price==="number"&&l.price>=2500&&
  typeof l.miles==="number"&&l.miles>=0&&l.miles<=250000
 );
 if(basic.length<5)return basic;
 const med=median(basic.map(l=>l.price as number));
 if(!med)return basic;
 const low=Math.max(2500,med*.3);
 const high=med*4;
 return basic.filter(l=>(l.price as number)>=low&&(l.price as number)<=high);
}

function map(payload:any):Listing[]{return (Array.isArray(payload?.data)?payload.data:[]).map((row:any)=>{const v=row?.vehicle||{};const r=row?.retailListing||{};return{vin:s(v.vin||row?.vin)||null,year:n(v.year),make:s(v.make)||null,model:s(v.model)||null,trim:s(v.trim)||null,price:n(r.price),miles:n(r.miles??r.mileage),dealer:s(r.dealer)||null,city:s(r.city)||null,state:s(r.state)||null,url:s(r.vdp)||null}}).filter((l:Listing)=>typeof l.price==="number"&&l.price>0&&typeof l.miles==="number"&&l.miles>=0)}

function keyFor({make,model,trim,zip,distance,year}:{make:string;model:string;trim:string;zip:string;distance:number;year:number}){
 return [make,model,trim||"*",zip||"national",zip?distance:"all",year].map(v=>String(v).trim().toLowerCase()).join("|");
}

async function queryStoredRows(args:{
 make:string;model:string;trim:string;yearMin:number;yearMax:number;maxPrice?:number|null;maxMiles?:number|null
}){
 const remoteUrl=process.env.MOTOR_MATCH_PROD_DB_URL;
 const remoteKey=process.env.MOTOR_MATCH_PROD_DB_ANON_KEY;
 const testToken=process.env.MOTOR_MATCH_PROD_DB_TEST_TOKEN;

 if(remoteUrl&&remoteKey&&testToken){
  const response=await fetch(`${remoteUrl}/rest/v1/rpc/motor_match_test_rows`,{
   method:"POST",
   headers:{
    apikey:remoteKey,
    Authorization:`Bearer ${remoteKey}`,
    "Content-Type":"application/json"
   },
   body:JSON.stringify({
    p_token:testToken,
    p_make:args.make,
    p_model:args.model,
    p_year_min:args.yearMin,
    p_year_max:args.yearMax,
    p_trim:args.trim||null,
    p_max_price:args.maxPrice??null,
    p_max_miles:args.maxMiles??null
   }),
   cache:"no-store"
  });
  const payload=await response.json().catch(()=>null);
  if(!response.ok)throw new Error(typeof payload?.message==="string"?payload.message:"Production Motor Match database test query failed.");
  return cleanListings((Array.isArray(payload)?payload:[]).map((row:any)=>({
   vin:null,
   year:n(row.year),
   make:s(row.make)||null,
   model:s(row.model)||null,
   trim:s(row.trim_name)||null,
   price:n(row.price),
   miles:n(row.miles),
   dealer:null,
   city:null,
   state:null,
   url:null
  })).filter((l:Listing)=>typeof l.price==="number"&&l.price>0&&typeof l.miles==="number"&&l.miles>=0));
 }

 const supabase=createSupabaseAdminClient();
 let q=supabase
  .from("motor_match_market_observations")
  .select("vin,year,make,model,trim,price,miles,dealer,city,state,listing_url")
  .eq("bucket_make",args.make)
  .eq("bucket_model",args.model)
  .gte("year",args.yearMin)
  .lte("year",args.yearMax)
  .order("observed_at",{ascending:false})
  .limit(DB_MAX_SAMPLE);

 if(args.trim)q=q.ilike("trim",`%${args.trim}%`);
 if(typeof args.maxPrice==="number")q=q.lte("price",args.maxPrice);
 if(typeof args.maxMiles==="number")q=q.lte("miles",args.maxMiles);

 const {data,error}=await q;
 if(error)throw error;

 return cleanListings((data||[]).map((row:any)=>({
  vin:s(row.vin)||null,
  year:n(row.year),
  make:s(row.make)||null,
  model:s(row.model)||null,
  trim:s(row.trim)||null,
  price:n(row.price),
  miles:n(row.miles),
  dealer:s(row.dealer)||null,
  city:s(row.city)||null,
  state:s(row.state)||null,
  url:s(row.listing_url)||null
 })).filter((l:Listing)=>typeof l.price==="number"&&l.price>0&&typeof l.miles==="number"&&l.miles>=0));
}

async function queryStoredCohort(input:{make:string;model:string;trim:string;zip:string;distance:number;year:number}){
 const generation=resolveVehicleGeneration({
  year:input.year,
  make:input.make,
  model:input.model,
  trim:input.trim
 });
 const startYear=generation?.startYear??input.year;
 const endYear=generation?.endYear??input.year;
 const listings=await queryStoredRows({
  make:input.make,
  model:input.model,
  trim:input.trim,
  yearMin:startYear,
  yearMax:endYear
 });
 return{
  listings,
  generation:generation?.generation??null,
  startYear,
  endYear
 };
}

export async function findOlderYearFromDatabase(input:{make:string;model:string;trim:string;year:number;budget:number;mileage:number}){
 if(input.year<=1991)return null;
 const rows=await queryStoredRows({
  make:input.make,
  model:input.model,
  trim:input.trim,
  yearMin:Math.max(1990,input.year-3),
  yearMax:input.year-1,
  maxPrice:Math.round(input.budget),
  maxMiles:Math.round(input.mileage)
 });
 const counts=new Map<number,number>();
 for(const row of rows){
  if(row.year)counts.set(row.year,(counts.get(row.year)||0)+1);
 }
 return Array.from(counts.entries())
  .filter(([,count])=>count>=3)
  .sort((a,b)=>b[0]-a[0])[0]?.[0]
  ||Array.from(counts.keys()).sort((a,b)=>b-a)[0]
  ||null;
}

async function query(apiKey:string,params:Record<string,string|number|boolean|null|undefined>,timeoutMs=9000){
 const q=new URLSearchParams();Object.entries(params).forEach(([k,v])=>{if(v!==null&&v!==undefined&&v!=="")q.set(k,String(v))});
 const controller=new AbortController();
 const timer=setTimeout(()=>controller.abort(),timeoutMs);
 try{
  const res=await fetch("https://api.auto.dev/listings?"+q.toString(),{headers:{Authorization:"Bearer "+apiKey,Accept:"application/json"},cache:"no-store",signal:controller.signal});
  const raw=await res.text();let payload:any=null;try{payload=raw?JSON.parse(raw):null}catch{payload={message:raw}}
  if(!res.ok)throw new Error(typeof payload?.message==="string"?payload.message:"Auto.dev request failed.");
  return{total:typeof payload?.total==="number"?payload.total:map(payload).length,listings:map(payload)};
 }catch(error){
  if(error instanceof Error&&error.name==="AbortError")throw new Error("Auto.dev timed out.");
  throw error;
 }finally{clearTimeout(timer)}
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
 const key=keyFor(input),now=Date.now(),existing=cache.get(key);
 if(!force&&existing&&existing.expiresAt>now)return{key,cohort:existing,cacheHit:true,calls:0};

 if(!force){
  const stored=await queryStoredCohort(input);
  const cohort:CachedCohort={
   expiresAt:now+CACHE_TTL_MS,
   listings:stored.listings,
   providerTotal:stored.listings.length,
   calls:0,
   trim:input.trim,
   source:"database",
   targetYear:input.year,
   generation:stored.generation,
   generationStartYear:stored.startYear,
   generationEndYear:stored.endYear
  };
  cache.set(key,cohort);
  return{key,cohort,cacheHit:false,calls:0};
 }

 const apiKey=process.env.AUTODEV_API_KEY;if(!apiKey)throw new Error("Motor Match is missing Auto.dev configuration.");
 const base:Record<string,string|number|boolean>={"vehicle.make":input.make,"vehicle.model":input.model,"vehicle.year":input.year,"retailListing.used":true,includes:"total",limit:SAMPLE_LIMIT};
 if(input.trim)base["vehicle.trim"]=input.trim;
 if(input.zip){base.zip=input.zip;base.distance=input.distance}
 const settled=await Promise.allSettled([
  query(apiKey,{...base,sort:"price.asc"}),
  query(apiKey,{...base,sort:"miles.asc"})
 ]);
 const successful=settled.flatMap(item=>item.status==="fulfilled"?[item.value]:[]);
 if(!successful.length)throw new Error("The market data provider is taking too long. Please try again.");
 const listings=dedupe(successful.map(item=>item.listings));
 const cohort:CachedCohort={expiresAt:now+CACHE_TTL_MS,listings,providerTotal:Math.max(...successful.map(item=>item.total)),calls:2,trim:input.trim,source:"auto_dev",targetYear:input.year,generation:null,generationStartYear:input.year,generationEndYear:input.year};
 cache.set(key,cohort);
 if(cache.size>200){for(const [k,v] of cache){if(v.expiresAt<=now)cache.delete(k)}}
 return{key,cohort,cacheHit:false,calls:2};
}

function directionalThreshold(values:number[]){
 const sorted=values.filter(v=>Number.isFinite(v)&&v>0).sort((a,b)=>a-b);
 if(!sorted.length)return null;
 return sorted[Math.min(4,sorted.length-1)];
}

function estimateAnnualYearAdjustment(listings:Listing[]){
 const byYear=new Map<number,number[]>();
 for(const l of listings){
  if(!l.year||!l.price)continue;
  const values=byYear.get(l.year)||[];
  values.push(l.price);
  byYear.set(l.year,values);
 }
 const medians=Array.from(byYear.entries())
  .map(([year,prices])=>({year,price:median(prices) as number}))
  .filter(row=>Number.isFinite(row.price))
  .sort((a,b)=>a.year-b.year);
 const slopes:number[]=[];
 for(let i=0;i<medians.length;i++){
  for(let j=i+1;j<medians.length;j++){
   const dy=medians[j].year-medians[i].year;
   if(dy>0)slopes.push((medians[j].price-medians[i].price)/dy);
  }
 }
 const cohortMedian=median(listings.map(l=>l.price as number).filter(Boolean))||0;
 const raw=median(slopes)||0;
 const cap=Math.max(750,cohortMedian*.18);
 return Math.max(0,Math.min(raw,cap));
}

function adjustedPriceForYear(listing:Listing,targetYear:number,annualAdjustment:number){
 if(!listing.price)return null;
 if(!listing.year||!annualAdjustment)return listing.price;
 return Math.max(0,listing.price+annualAdjustment*(targetYear-listing.year));
}

export function solveMotorMatch(
 listings:Listing[],
 budget:number,
 mileage:number,
 targetYear?:number,
 generationStartYear?:number
){
 const year=targetYear??listings.find(l=>l.year)?.year??new Date().getFullYear();
 const annualAdjustment=estimateAnnualYearAdjustment(listings);
 const normalized=listings.map(l=>({
  ...l,
  adjustedPrice:adjustedPriceForYear(l,year,annualAdjustment)
 })).filter(l=>typeof l.adjustedPrice==="number"&&l.adjustedPrice>0);

 const exact=normalized.filter(l=>(l.adjustedPrice??Infinity)<=budget&&(l.miles??Infinity)<=mileage);
 const withinMileage=normalized.filter(l=>(l.miles??Infinity)<=mileage);
 const withinBudget=normalized.filter(l=>(l.adjustedPrice??Infinity)<=budget);
 const priceNeeded=directionalThreshold(withinMileage.map(l=>l.adjustedPrice as number));
 const mileageNeeded=directionalThreshold(withinBudget.map(l=>l.miles as number));
 const state=exact.length>=5?"green":exact.length>0?"yellow":"red";
 const depth=exact.length>=10?"strong":exact.length>=5?"healthy":exact.length>0?"thin":"none";
 const confidence=listings.length>=20?"strong":listings.length>=8?"adequate":listings.length>=3?"limited":"none";

 let yearNeeded:null|number=null;
 const floor=Math.max(generationStartYear??year-3,1990);
 if(state!=="green"){
  for(let candidate=year-1;candidate>=floor;candidate--){
   const count=listings.filter(l=>{
    const adjusted=adjustedPriceForYear(l,candidate,annualAdjustment);
    return (adjusted??Infinity)<=budget&&(l.miles??Infinity)<=mileage;
   }).length;
   const needed=confidence==="strong"?3:1;
   if(count>=needed){yearNeeded=candidate;break}
  }
 }

 return{
  state,depth,confidence,matchCount:exact.length,
  constraintStatus:{priceWorks:withinBudget.length>0,mileageWorks:withinMileage.length>0},
  market:{
   priceNeeded,
   mileageNeeded,
   yearNeeded,
   priceMatchCount:priceNeeded?normalized.filter(l=>(l.adjustedPrice??Infinity)<=priceNeeded&&(l.miles??Infinity)<=mileage).length:0,
   mileageMatchCount:mileageNeeded?normalized.filter(l=>(l.adjustedPrice??Infinity)<=budget&&(l.miles??Infinity)<=mileageNeeded).length:0,
   yearMatchCount:yearNeeded?listings.filter(l=>{
    const adjusted=adjustedPriceForYear(l,yearNeeded as number,annualAdjustment);
    return (adjusted??Infinity)<=budget&&(l.miles??Infinity)<=mileage;
   }).length:0
  },
  model:{annualYearAdjustment:Math.round(annualAdjustment),generationSampleSize:listings.length},
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
