import assert from "node:assert/strict";
import {
  decodeProviders, isValidVinFormat, reconcileVinResults, normalizeDecodeDriveType, type ProviderOutcome,
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

// Identical drivetrain descriptions must not become false conflicts.
assert.equal(normalizeDecodeDriveType("Front-Wheel Drive (FWD)"),"FWD");
assert.equal(normalizeDecodeDriveType("Rear Wheel Drive"),"RWD");
assert.equal(normalizeDecodeDriveType("all-wheel drive"),"AWD");
assert.equal(normalizeDecodeDriveType("Four Wheel Drive"),"4WD");
assert.equal(normalizeDecodeDriveType("2WD"),"");
const fwd=run([out("nhtsa",nhtsa({DriveType:"Front-Wheel Drive (FWD)"})),out("auto_dev",auto({drive:"FWD"}))]);
assert.ok(fwd);
assert.equal(fwd.driveType,"FWD");
assert.equal(fwd.identityEvidence.conflicts.includes("driveType"),false);
assert.equal(fwd.identityEvidence.attributes.driveType?.confidence,"corroborated");
assert.equal(fwd.identityEvidence.attributes.driveType?.reported.nhtsa,"Front-Wheel Drive (FWD)");
assert.equal(fwd.identityEvidence.attributes.driveType?.reported.auto_dev,"FWD");
const rwd=run([out("nhtsa",nhtsa({DriveType:"Rear-Wheel Drive (RWD)"})),out("auto_dev",auto({drive:"RWD"}))]);
assert.equal(rwd?.driveType,"RWD");
const awd=run([out("nhtsa",nhtsa({DriveType:"All Wheel Drive"})),out("auto_dev",auto({drive:"AWD"}))]);
assert.equal(awd?.driveType,"AWD");
const fourWd=run([out("nhtsa",nhtsa({DriveType:"Four Wheel Drive"})),out("auto_dev",auto({drive:"4x4"}))]);
assert.equal(fourWd?.driveType,"4WD");
const trueDisagreement=run([out("nhtsa",nhtsa({DriveType:"FWD"})),out("auto_dev",auto({drive:"AWD"}))]);
assert.ok(trueDisagreement);
assert.equal(trueDisagreement.driveType,"");
assert.ok(trueDisagreement.identityEvidence.conflicts.includes("driveType"));
assert.equal(trueDisagreement.identityEvidence.attributes.driveType?.confidence,"conflict");
assert.equal(trueDisagreement.identityEvidence.attributes.engineCylinders?.confidence,"corroborated");
const distinctAwd4wd=run([out("nhtsa",nhtsa({DriveType:"4WD"})),out("auto_dev",auto({drive:"AWD"}))]);
assert.equal(distinctAwd4wd?.identityEvidence.attributes.driveType?.confidence,"conflict");
const unresolved2wd=run([out("nhtsa",nhtsa({DriveType:"2WD"})),out("auto_dev",auto({drive:"FWD"}))]);
assert.equal(unresolved2wd?.driveType,"");
assert.equal(unresolved2wd?.identityEvidence.attributes.driveType?.confidence,"conflict");

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

async function checkConcurrency() {
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

}
void checkConcurrency().then(() => console.log("VIN identity regression suite passed (format, dual, fallback, ambiguity, conflict, failure, concurrency).")).catch(error => { console.error(error); process.exitCode=1; });
