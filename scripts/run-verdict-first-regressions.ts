import assert from "node:assert/strict";
import { assessVerdictFirst, type VerdictFirstInputs } from "../lib/evaluation/verdict-first";

const baseline: VerdictFirstInputs = {
  identityKnown:true, retailTrimUnknown:true, identityConflicts:[],
  selectedComps:6, closePeers:0, pricingDecisionReady:false,
  marketConfidence:"Limited", conditionStatus:"no_material_issues",
  materialConditionRisk:false, hasPurchasePrice:true, purchasePrice:5000,
  indicativeMarketLow:24200, indicativeMarketMedian:30100,
  hasSupportedSalePrice:false, hardPass:false, reviewRequired:true,
};
const camry=assessVerdictFirst(baseline);
assert.equal(camry.verdict,"Investigate");
assert.equal(camry.confidence,"Limited");
assert.equal(camry.action,"trim");
assert.equal(camry.opportunityDetected,true);
assert.ok(camry.summary.includes("not a verified profit"));
assert.ok(!camry.summary.includes("buy now"));
const badIdentity=assessVerdictFirst({...baseline,identityConflicts:["engineCylinders"]});
assert.equal(badIdentity.action,"identity");
assert.equal(badIdentity.identityConfidence,"Limited");
const missingData=assessVerdictFirst({...baseline,selectedComps:0,indicativeMarketLow:0});
assert.equal(missingData.verdict,"Insufficient information");
assert.equal(missingData.opportunityDetected,false);
const conditionUnknown=assessVerdictFirst({...baseline,retailTrimUnknown:false,conditionStatus:"unknown"});
assert.equal(conditionUnknown.action,"condition");
assert.equal(conditionUnknown.acquisitionConfidence,"Limited");
const ready:VerdictFirstInputs={...baseline,retailTrimUnknown:false,closePeers:6,
  pricingDecisionReady:true,marketConfidence:"High",conditionStatus:"no_material_issues",
  indicativeMarketLow:26000,hasSupportedSalePrice:true,reviewRequired:false};
const pursue=assessVerdictFirst(ready);
assert.equal(pursue.verdict,"Pursue");
assert.equal(pursue.confidence,"High");
const pass=assessVerdictFirst({...ready,hardPass:true});
assert.equal(pass.verdict,"Pass");
assert.equal(assessVerdictFirst({...baseline,indicativeMarketLow:0}).opportunityDetected,false);
assert.equal(assessVerdictFirst({...baseline,hasPurchasePrice:false}).verdict,"Insufficient information");
console.log("Verdict-first confidence and decision safety regressions passed.");
