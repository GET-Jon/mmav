import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

type Listing={vin:string|null;year:number|null;make:string|null;model:string|null;trim:string|null;price:number|null;miles:number|null;dealer:string|null;city:string|null;state:string|null;url:string|null};
type ApiCall={label:string;purpose:string};
const n=(v:unknown)=>{const x=Number(v);return Number.isFinite(x)?x:null};
const s=(v:unknown)=>String(v||"").trim();

function map(payload:any):Listing[]{return (Array.isArray(payload?.data)?payload.data:[]).map((row:any)=>{const v=row?.vehicle||{};const r=row?.retailListing||{};return{vin:s(v.vin||row?.vin)||null,year:n(v.year),make:s(v.make)||null,model:s(v.model)||null,trim:s(v.trim)||null,price:n(r.price),miles:n(r.miles??r.mileage),dealer:s(r.dealer)||null,city:s(r.city)||null,state:s(r.state)||null,url:s(r.vdp)||null}})}

async function query(apiKey:string,params:Record<string,string|number|boolean|null|undefined>){
  const q=new URLSearchParams();
  Object.entries(params).forEach(([k,v])=>{if(v!==null&&v!==undefined&&v!=="")q.set(k,String(v))});
  const res=await fetch("https://api.auto.dev/listings?"+q.toString(),{headers:{Authorization:"Bearer "+apiKey,Accept:"application/json"},cache:"no-store"});
  const raw=await res.text();let payload:any=null;try{payload=raw?JSON.parse(raw):null}catch{payload={message:raw}}
  if(!res.ok)throw new Error(typeof payload?.message==="string"?payload.message:"Auto.dev request failed.");
  return{total:typeof payload?.total==="number"?payload.total:map(payload).length,listings:map(payload)};
}

function fifth(rows:Listing[],field:"price"|"miles"){const values=rows.map(r=>r[field]).filter((v):v is number=>typeof v==="number"&&v>0).sort((a,b)=>a-b);return values.length?values[Math.min(4,values.length-1)]:null}

export async function POST(request:Request){
  const apiKey=process.env.AUTODEV_API_KEY;
  if(!apiKey)return NextResponse.json({error:"Motor Match is missing Auto.dev configuration."},{status:500});
  const body=await request.json();
  const year=Number(body.year),budget=Number(body.budget),mileage=Number(body.mileage),make=s(body.make),model=s(body.model),trim=s(body.trim),zip=/^\d{5}$/.test(s(body.zip))?s(body.zip):"",distance=Math.min(Math.max(Number(body.distance)||500,25),1000);
  if(!Number.isFinite(year)||!Number.isFinite(budget)||!Number.isFinite(mileage)||!make||!model)return NextResponse.json({error:"Year, make, model, budget and mileage are required."},{status:400});

  const base:Record<string,string|number|boolean>={"vehicle.year":year,"vehicle.make":make,"vehicle.model":model,"retailListing.used":true};
  if(trim)base["vehicle.trim"]=trim;
  if(zip){base.zip=zip;base.distance=distance}

  const calls:ApiCall[]=[];
  const run=async(label:string,purpose:string,params:Record<string,string|number|boolean|null|undefined>)=>{
    calls.push({label,purpose});
    return query(apiKey,params);
  };

  try{
    const exact=await run("Exact match","Check all current limits together",{...base,"retailListing.price":"1-"+Math.round(budget),"retailListing.miles":"1-"+Math.round(mileage),includes:"total",limit:20,sort:"price.asc"});
    let priceNeeded:number|null=null,mileageNeeded:number|null=null,yearNeeded:number|null=null;

    if(exact.total<5){
      const [p,m,y]=await Promise.all([
        run("Price target","Find the budget needed while keeping mileage",{...base,"retailListing.miles":"1-"+Math.round(mileage),limit:20,sort:"price.asc"}),
        run("Mileage target","Find the mileage needed while keeping budget",{...base,"retailListing.price":"1-"+Math.round(budget),limit:20,sort:"miles.asc"}),
        run("Year target","Find an older year that fits budget and mileage",{...base,"vehicle.year":Math.max(1990,year-6)+"-"+(year-1),"retailListing.price":"1-"+Math.round(budget),"retailListing.miles":"1-"+Math.round(mileage),limit:100,sort:"year.desc"})
      ]);
      priceNeeded=fifth(p.listings,"price");
      mileageNeeded=fifth(m.listings,"miles");
      const counts=new Map<number,number>();
      y.listings.forEach(l=>{if(l.year)counts.set(l.year,(counts.get(l.year)||0)+1)});
      yearNeeded=Array.from(counts.entries()).filter(([,c])=>c>=3).sort((a,b)=>b[0]-a[0])[0]?.[0]||Array.from(counts.keys()).sort((a,b)=>b-a)[0]||null;
    }

    const state=exact.total>=5?"green":exact.total>0?"yellow":"red";
    const message=state==="green"?"There is enough current inventory to call this a realistic target.":state==="yellow"?"A few cars fit, but the market is thin. A small adjustment gives you more room for color, condition and options.":"We could not find a current listing satisfying all of those limits at once. Change one constraint and the market can open back up.";

    return NextResponse.json({
      state,message,matchCount:exact.total,
      market:{priceNeeded,mileageNeeded,yearNeeded},
      listings:exact.listings,
      apiUsage:{callsThisUpdate:calls.length,breakdown:calls}
    });
  }catch(cause){
    return NextResponse.json({error:cause instanceof Error?cause.message:"Motor Match market check failed.",apiUsage:{callsThisUpdate:calls.length,breakdown:calls}},{status:502});
  }
}
