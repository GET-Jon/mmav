require('./register.cjs');
const assert = require('node:assert/strict');
const { test } = require('node:test');
const { buildEvidenceProfile: build, compareEvidence: compare, normalizeTransmission } = require('../../lib/evaluation/identity-evidence.ts');
const { subjectEvidence, candidateEvidence } = require('../../lib/evaluation/identity-pilot-adapters.ts');
const { preserveNhtsaEvidence } = require('../../lib/evaluation/vin-evidence.ts');
const car = {year:2020,make:'Honda',model:'Civic',trim:'Sport',bodyType:'Sedan',fuelType:'Gasoline',drivetrain:'FWD',transmission:'Automatic',engine:'2.0L I4'};
const profile = (changes={}, vin) => build([{id:'listing',vehicle:{...car,...changes}}],vin);
test('documented matching configuration is a direct identity peer',()=>assert.equal(compare(profile(),profile()).outcome,'direct'));
test('missing transmission never acts as wildcard',()=>assert.equal(compare(profile(),profile({transmission:''})).outcome,'needs-verification'));
test('two missing transmissions do not establish equality',()=>assert.equal(compare(profile({transmission:''}),profile({transmission:''})).outcome,'needs-verification'));
test('known manual/automatic difference needs no speculative dollar adjustment',()=>assert.equal(compare(profile(),profile({transmission:'manual'})).outcome,'supporting'));
test('automatic with manual mode is automatic',()=>assert.equal(normalizeTransmission('Automatic With Manual Mode'),'automatic'));
test('automated manual is not a conventional manual',()=>assert.equal(normalizeTransmission('Automated Manual'),'automatic'));
test('body mismatch excludes even when other facts are missing',()=>assert.equal(compare(profile(),profile({bodyType:'Convertible',transmission:''})).outcome,'excluded'));
test('known engine mismatch precedes unrelated missing transmission',()=>assert.equal(compare(profile(),profile({engine:'1.5L I4',transmission:''})).outcome,'supporting'));
test('engine missing cannot become a direct peer',()=>assert.equal(compare(profile(),profile({engine:''})).outcome,'needs-verification'));
test('conflicting sources are retained rather than silently overwritten',()=>{
 const p=build([{id:'listing',vehicle:car},{id:'decoder',vehicle:{...car,transmission:'Manual'}}]);
 assert.equal(p.facts.transmission.status,'conflicting');assert.equal(p.facts.transmission.claims.length,2);
 assert.equal(compare(profile(),p).outcome,'needs-verification');
});
test('repeated claims never upgrade reported to verified',()=>{
 const p=build([{id:'one',vehicle:car},{id:'two',vehicle:car}]);assert.equal(p.facts.transmission.status,'reported');
});
test('claim order does not change resolution',()=>{
 const s=[{id:'a',vehicle:car},{id:'b',vehicle:{...car,transmission:'Manual'}}];
 assert.deepEqual(build(s).facts.transmission.possibilities,build(s.toReversed()).facts.transmission.possibilities);
});
test('VIN equality cannot supply independent pricing evidence',()=>assert.equal(compare(profile({},'TESTVIN'),profile({},'testvin')).outcome,'excluded'));
test('removing a required fact never increases direct eligibility',()=>{
 for(const k of ['make','model','trim','bodyType','fuelType','drivetrain','transmission','engine']) assert.equal(compare(profile(),profile({[k]:''})).directPeerEligible,false,k);
});
test('enumerated Bronco trims stay unresolved',()=>{
 const p=profile({make:'Ford',model:'Bronco',trim:'Base, Big Bend, Black Diamond, Outer Banks'});
 assert.equal(p.facts.configuration.status,'unknown');
});
test('NHTSA series descriptor does not become a retail grade',()=>assert.equal(profile({make:'Toyota',model:'Tacoma',trim:'45 Series'}).facts.configuration.status,'unknown'));
test('Velar engine badge and equipment grade are separate',()=>{
 const p=profile({make:'Land Rover',model:'Range Rover Velar',trim:'P300 R-Dynamic S'});
 assert.equal(p.facts.powertrainBadge.value,'p300');assert.equal(p.facts.configuration.value,'r dynamic s');
});
test('Velar different badge cannot be cancelled by equal engine displacement',()=>{
 const v={make:'Land Rover',model:'Range Rover Velar',trim:'P300 R-Dynamic S'};
 assert.equal(compare(profile(v),profile({...v,trim:'P250 R Dynamic S'})).outcome,'supporting');
});
test('badge missing on one side requires evidence',()=>{
 const v={make:'Land Rover',model:'Range Rover Velar'};
 assert.equal(compare(profile({...v,trim:'P300 S'}),profile({...v,trim:'S'})).outcome,'needs-verification');
});
test('all wheel and four wheel remain distinct without a scoped equivalence',()=>assert.equal(compare(profile({drivetrain:'AWD'}),profile({drivetrain:'4WD'})).outcome,'supporting'));
test('unsupported EV variants cannot be declared direct',()=>assert.equal(compare(profile({fuelType:'Electric'}),profile({fuelType:'Electric'})).outcome,'needs-verification'));
test('candidate make is not inherited from targetMake',()=>{
 const p=candidateEvidence({year:2020,model:'Civic',trim:'Sport',details:{targetMake:'Honda'}});
 assert.equal(p.facts.make.status,'unknown');
});
test('saved subject retains newly captured transmission',()=>assert.equal(subjectEvidence({decoded:{...car,bodyClass:'Sedan',driveType:'FWD',transmission:'Automatic'}}).facts.transmission.value,'automatic'));
test('decoder observations retain blank fields, ambiguity and errors without arbitrary payload data',()=>{
 const r=preserveNhtsaEvidence({TransmissionStyle:'',Series:'80 Series',ErrorCode:'1',PossibleValues:'SE; XSE',unrelated:'secret'});
 assert.equal(r.fields.TransmissionStyle,'');assert.equal(r.fields.Series,'80 Series');assert.equal(r.fields.ErrorCode,'1');assert.equal(r.fields.unrelated,undefined);
});
test('existing equivalence regression suite remains unchanged',()=>{
 const r=require('../../lib/marketcheck/vehicle-equivalence-regression.ts').assertVehicleEquivalenceRegressionCases();
 assert.ok(r.passed>0);console.log('Existing equivalence cases:',r.passed);
});
test('explicit-text extractor passes 20 authored controls including abstentions',()=>{
 const {extract}=require('./extract.cjs');
 for(const c of require('./extraction-cases.json')) assert.deepEqual(extract(c.text),c.expected,c.id);
});
