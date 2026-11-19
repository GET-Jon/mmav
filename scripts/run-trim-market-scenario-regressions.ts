import assert from "node:assert/strict";
import { defaultAssumptions } from "../lib/assumptions";
import { buildTrimMarketScenarios } from "../lib/evaluation/trim-market-scenarios";
import type { MarketComp } from "../types/comps";
const targetMileage = 10000;
const make = (n:number, trim:string, askingPrice:number, mileage:number, extra:Partial<MarketComp>={}):MarketComp=>({
  id:String(n),included:true,source:"MarketCheck/API",region:"Charleston",distance:50,
  year:2025,model:"Camry",trim,mileage,askingPrice,qualityScore:85,
  equivalenceTier:"direct",marketCheckDetails:{vin:"4T1DAACK"+String(n).padStart(9,"0")},
  ...extra,
});
const comps=[
  make(1,"LE",27831,18765),make(2,"LE",24898,5163),
  make(3,"LE",27498,20281),make(4,"LE",28995,16760),
  make(5,"LE",27654,14076),
  make(6,"SE",31200,11000),
  make(7,"XSE",34000,13000,{included:false}),
];
const input={comps,make:"Toyota",model:"Camry",year:2025,targetMileage,assumptions:defaultAssumptions};
const brandedComps=comps.map(comp=>({...comp,model:"Toyota Camry"}));
const brandedScenarios=buildTrimMarketScenarios({...input,comps:brandedComps});
assert.equal(brandedScenarios.length,1,"Branded provider model must match canonical Camry.");
assert.equal(brandedScenarios[0].count,5);
assert.equal(buildTrimMarketScenarios({...input,comps:comps.map(comp=>({...comp,model:"Camry Hybrid"}))}).length,0,"Adjacent model strings must not be silently promoted.");
const scenarios=buildTrimMarketScenarios(input);
assert.equal(scenarios.length,1);
assert.equal(scenarios[0].trim,"LE");
assert.equal(scenarios[0].count,5);
assert.ok(scenarios[0].adjustedMedian>0);
assert.ok(scenarios[0].adjustedLow<=scenarios[0].adjustedMedian);
assert.ok(scenarios[0].adjustedMedian<=scenarios[0].adjustedHigh);
assert.equal(buildTrimMarketScenarios({...input,comps:comps.slice(0,2)}).length,0);
assert.equal(buildTrimMarketScenarios({...input,model:"Corolla"}).length,0);
assert.equal(buildTrimMarketScenarios({...input,year:2024}).length,0);
assert.equal(buildTrimMarketScenarios({...input,comps:comps.slice(0,3).map(x=>({...x,qualityScore:25}))}).length,0);
assert.equal(buildTrimMarketScenarios({...input,comps:comps.slice(0,3).map(x=>({...x,equivalenceTier:"reject"}))}).length,0);
const repeated=make(9,"LE",27000,15000,{marketCheckDetails:{vin:comps[0].marketCheckDetails?.vin}});
assert.equal(buildTrimMarketScenarios({...input,comps:[...comps,repeated]})[0].count,5);
console.log("Trim market scenario regressions passed.");
