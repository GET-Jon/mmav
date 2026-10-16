import {NextResponse} from "next/server";
import {motorMatchMakes,motorMatchModels,motorMatchYears} from "@/lib/motor-match/vehicle-options";

export const dynamic="force-dynamic";
const s=(v:unknown)=>String(v||"").trim();

export async function GET(request:Request){
 const url=new URL(request.url);
 const make=s(url.searchParams.get("make"));
 const model=s(url.searchParams.get("model"));
 if(!make)return NextResponse.json({makes:motorMatchMakes()});
 if(!model)return NextResponse.json({models:motorMatchModels(make)});
 return NextResponse.json({years:motorMatchYears(make,model)});
}
