import assert from "node:assert/strict";
import {
  decodeProviders, isValidVinFormat, reconcileVinResults, type ProviderOutcome,
} from "../lib/vin/resilient-identity";

const VIN="4T1DAACK6SU615158";
const nhtsa=(overrides:Record<string,string>={})=>({
  Results:[{ModelYear:"2025",Make:"TOYOTA",Model:"Camry",Series:"80 Series",
    Trim:"",BodyClass:"Sedan/Saloon",EngineCylinders:"4",DisplacementL:"2.5",
    FuelTypePrimary:"Gasoline",ElectrificationLevel:"HEV (Hybrid Electric Vehicle)",
    ...overrides}],
});
const auto=(overrides:Record<string,unknown>={})=>({
  vin:VIN,vinValid:true,vehicle:{year:2025,make:"Toyota",model:"Camry"},
  make:"Toyota",model:"Camry",trim:null,style:null,ambiguous:true,trims:["LE","SE","XLE","XSE"],
  body:"Sedan",engine:"2.5L I4 Hybrid",fuel:"Hybrid",drive:"FWD",...overrides,
});
const out=(provider:"nhtsa"|"auto_dev",body:unknown,status=200):ProviderOutcome=>({
  provider,httpStatus:status,durationMs:5,body:body as ProviderOutcome["body"],
});
const run=(x:ProviderOutcome[])=>reconcileVinResults(VIN,x,100);
assert.equal(isValidVinFormat(VIN),true);
assert.equal(isValidVinFormat("1234"),false);
assert.equal(isValidVinFormat("4T1DAACK6SU61515I"),false);

const both=run([out("nhtsa",nhtsa()),out("auto_dev",auto())]);
assert.ok(both);
assert.equal(both.trim,"");
assert.equal(both.fuelType,"Hybrid");
assert.equal(both.identityEvidence.confidence,"partial");
assert.equal(both.identityEvidence.ambiguousTrim,true);
assert.ok(both.identityEvidence.possibleTrims.includes("SE"));
assert.ok(!both.identityEvidence.conflicts.includes("fuelType"));

const failNhtsa=run([out("nhtsa",{},503),out("auto_dev",auto({trim:"SE",ambiguous:false,trims:["SE"]}))]);
assert.ok(failNhtsa);
assert.equal(failNhtsa.identityEvidence.sources.join(","),"auto_dev");
assert.equal(failNhtsa.trim,"SE");

const failAuto=run([out("nhtsa",nhtsa()),out("auto_dev",{},503)]);
assert.ok(failAuto);
assert.equal(failAuto.identityEvidence.sources.join(","),"nhtsa");

const dispute=run([out("nhtsa",nhtsa({Trim:"LE",EngineCylinders:"4"})),
  out("auto_dev",auto({trim:"SE",ambiguous:false,trims:["SE"],engine:"3.0L V6"}))]);
assert.ok(dispute);
assert.equal(dispute.trim,"");
assert.equal(dispute.engineCylinders,"");
assert.equal(dispute.displacementL,"");
assert.ok(dispute.identityEvidence.conflicts.includes("trim"));
assert.ok(dispute.identityEvidence.conflicts.includes("engineCylinders"));
assert.equal(dispute.identityEvidence.confidence,"conflict");

const mismatch=run([out("nhtsa",nhtsa()),out("auto_dev",auto({model:"Corolla",vehicle:{year:2025,make:"Toyota",model:"Corolla"}}))]);
assert.equal(mismatch,null);

const noData=run([out("nhtsa",{},503),out("auto_dev",{},503)]);
assert.equal(noData,null);

const concurrent=await decodeProviders(VIN,async(provider,vin,timeoutMs)=>{
  assert.equal(vin,VIN);assert.equal(timeoutMs,1800);
  if(provider==="nhtsa") { await new Promise(resolve=>setTimeout(resolve,25)); return out("nhtsa",nhtsa()); }
  await new Promise(resolve=>setTimeout(resolve,25));
  return out("auto_dev",auto());
});
assert.ok(concurrent.decoded);
assert.equal(concurrent.outcomes.length,2);
assert.ok(concurrent.decoded.identityEvidence.durationMs < 200,
  "Requests must be concurrent, not serial.");

console.log("VIN identity regression suite passed (format, dual, fallback, ambiguity, conflict, failure, concurrency).");
