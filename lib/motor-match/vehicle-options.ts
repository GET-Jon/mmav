import {vehicleGenerationRules} from "@/lib/vehicle-generations/rules";
import {canonicalVehicleMake,normalizeVehicleText} from "@/lib/marketcheck/vehicle-identity";

const pretty=(value:string)=>value.split(" ").map(part=>part?part[0].toUpperCase()+part.slice(1):part).join(" ");
const makeLabel=(value:string)=>{
 const canonical=canonicalVehicleMake(value);
 if(canonical==="bmw")return "BMW";
 if(canonical==="gmc")return "GMC";
 if(canonical==="mercedes benz")return "Mercedes-Benz";
 if(canonical==="volkswagen")return "Volkswagen";
 return pretty(canonical);
};
const modelParts=(value:string)=>String(value||"").split("/").map(v=>v.trim()).filter(Boolean);
const same=(a:string,b:string)=>normalizeVehicleText(a)===normalizeVehicleText(b);

export function motorMatchMakes(){
 const map=new Map<string,string>();
 for(const rule of vehicleGenerationRules){
  const key=canonicalVehicleMake(rule.make);
  if(key&&!map.has(key))map.set(key,makeLabel(rule.make));
 }
 return [...map.values()].sort((a,b)=>a.localeCompare(b));
}

export function motorMatchModels(make:string){
 const values=new Map<string,string>();
 const target=canonicalVehicleMake(make);
 for(const rule of vehicleGenerationRules){
  if(canonicalVehicleMake(rule.make)!==target)continue;
  for(const part of modelParts(rule.model)){
   const key=normalizeVehicleText(part);
   if(key&&!values.has(key))values.set(key,part);
  }
 }
 return [...values.values()].sort((a,b)=>a.localeCompare(b,undefined,{numeric:true}));
}

export function motorMatchYears(make:string,model:string){
 const targetMake=canonicalVehicleMake(make);
 const years=new Set<number>();
 for(const rule of vehicleGenerationRules){
  if(canonicalVehicleMake(rule.make)!==targetMake)continue;
  if(!modelParts(rule.model).some(part=>same(part,model)))continue;
  for(let year=rule.startYear;year<=rule.endYear;year++)years.add(year);
 }
 return [...years].sort((a,b)=>b-a);
}
