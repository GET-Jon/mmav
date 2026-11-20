#!/usr/bin/env node
/**
 * Isolated, opt-in VIN decode benchmark. Never called by the Lot Logic evaluator.
 *
 * Dry run (no API requests): node scripts/benchmark-vin-decoders.mjs
 * Execute first 5 (up to 5 Auto.dev quota calls and 5 free NHTSA requests):
 *   AUTODEV_API_KEY=... node scripts/benchmark-vin-decoders.mjs --execute --limit 5
 * Test the Camry pair: ... --execute --make Toyota --limit 2
 * Test one specific VIN: ... --execute --vin 4T1DAACK6SU615158 --limit 1
 * Execute all 15: ... --execute --limit 15
 *
 * Results are saved locally, not committed. DO NOT supply keys as CLI arguments.
 */
import fs from "node:fs";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, "..");
const fixtures = JSON.parse(fs.readFileSync(path.join(root, "benchmarks/vin/fixtures.json"), "utf8")).cases;
const flags = new Set(process.argv.slice(2));
const index = process.argv.indexOf("--limit");
const limit = index === -1 ? 5 : Number(process.argv[index + 1]);
const makeIndex = process.argv.indexOf("--make");
const makeFilter = makeIndex === -1 ? "" : String(process.argv[makeIndex + 1] || "").toLowerCase();
const vinIndex = process.argv.indexOf("--vin");
const vinFilter = vinIndex === -1 ? "" : String(process.argv[vinIndex + 1] || "").toUpperCase();
const eligible = fixtures.filter(v => (!makeFilter || v.make.toLowerCase() === makeFilter) && (!vinFilter || v.vin === vinFilter));
const outIndex = process.argv.indexOf("--out");
const outfile = outIndex === -1 ? path.join(root, "tmp", "vin-benchmark-results.json") : path.resolve(process.argv[outIndex + 1] || "");
const execute = flags.has("--execute");
const provider = flags.has("--nhtsa-only") ? "nhtsa" : flags.has("--autodev-only") ? "autodev" : "both";
if (!Number.isInteger(limit) || limit < 1 || limit > Math.min(15, eligible.length)) {
  console.error("Invalid --limit. Must be 1 to " + Math.min(15, eligible.length)); process.exit(2);
}
if (flags.has("--nhtsa-only") && flags.has("--autodev-only")) {
  console.error("Select only one provider filter."); process.exit(2);
}
if (outIndex !== -1 && (!process.argv[outIndex + 1] || process.argv[outIndex + 1].startsWith("--"))) {
  console.error("Supply a file path after --out."); process.exit(2);
}
const chosen = eligible.slice(0,limit);
const scrub = (s) => String(s ?? "").toLowerCase()
  .replace(/\b(?:4wd|awd|fwd|rwd|4x4|2wd|all wheel drive|front wheel drive|rear wheel drive)\b/g," ")
  .replace(/[^a-z0-9]+/g," ").trim().replace(/\s+/g," ");
const trims = (data) => [...new Set([
  ...(Array.isArray(data?.trims) ? data.trims : []),
  ...(Array.isArray(data?.styles) ? data.styles.map((s) => s?.trim) : []),
].filter(Boolean).map(String))];
function scoreAuto(ref, data) {
  if (!data || data.error || data.status >= 400) return "request_failed";
  const truth = scrub(ref.trim), claimed = scrub(data.trim);
  const options = trims(data).map(scrub);
  // An explicit ambiguity is NOT a verified exact trim even if 'trim' is populated.
  if (data.ambiguous === true || (options.length > 1 && new Set(options).size > 1)) {
    return options.includes(truth) || claimed === truth ? "ambiguous_contains_truth" : "ambiguous_excludes_truth";
  }
  if (!claimed) return "missing";
  return claimed === truth ? "exact_correct" : "confident_wrong";
}
function scoreNhtsa(ref, raw) {
  if (!raw || raw.error) return "request_failed";
  const truth = scrub(ref.trim);
  // NHTSA Trim may be empty; Series is NEVER considered a verified trim.
  const claimed = scrub(raw.Trim);
  return !claimed ? "missing" : claimed === truth ? "exact_correct" : "confident_wrong";
}
async function fetchJson(url, headers={}, signal=undefined) {
  try {
    const response = await fetch(url,{headers,signal});
    const body = await response.json().catch(()=>({error:"Non-JSON response"}));
    return {httpStatus:response.status,body};
  } catch(error) {
    return {httpStatus:0,body:{error:error instanceof Error ? error.message : String(error)}};
  }
}
async function main() {
  if (!execute) {
    console.log(JSON.stringify({mode:"DRY RUN - NO API CALLS",provider,selected:chosen.length,
      maximumAutoDevCalls:provider==="nhtsa"?0:chosen.length,
      vins:chosen.map(v=>({vin:v.vin,truth:v.trim,make:v.make,model:v.model})),
      instruction:"Add --execute to use real network calls. Results remain local."},null,2));
    return;
  }
  if (provider!=="nhtsa" && !process.env.AUTODEV_API_KEY) {
    console.error("AUTODEV_API_KEY missing. No calls were made. Use --nhtsa-only or configure the key on the runner."); process.exitCode=2; return;
  }
  const rows=[];
  for (const v of chosen) {
    const nhtsa = provider==="autodev"?null:await fetchJson(
      "https://vpic.nhtsa.dot.gov/api/vehicles/DecodeVinValues/"+encodeURIComponent(v.vin)+"?format=json");
    const auto = provider==="nhtsa"?null:await fetchJson(
      "https://api.auto.dev/vin/"+encodeURIComponent(v.vin),
      {Authorization:"Bearer "+process.env.AUTODEV_API_KEY,Accept:"application/json"});
    const nhtsaFields = nhtsa?.body?.Results?.[0] || (nhtsa ? {error:nhtsa.body?.error || "No decode response"} : null);
    const autoFields = auto?.body || null;
    const score = {
      autoDev: auto ? (auto.httpStatus >= 400 ? "request_failed" : scoreAuto(v,autoFields)) : "not_run",
      nhtsa: nhtsa ? (nhtsa.httpStatus >= 400 ? "request_failed" : scoreNhtsa(v,nhtsaFields)) : "not_run",
    };
    rows.push({reference:v,score,httpStatus:{nhtsa:nhtsa?.httpStatus??null,autoDev:auto?.httpStatus??null},
      nhtsa:nhtsaFields,autoDev:autoFields});
    console.log(v.vin+" "+v.make+" "+v.model+" ["+v.trim+"] NHTSA="+score.nhtsa+" Auto.dev="+score.autoDev);
  }
  const count=(name,kind)=>rows.filter(r=>r.score[name]===kind).length;
  const summary = Object.fromEntries(["nhtsa","autoDev"].map(providerName=>[providerName,Object.fromEntries(
    ["exact_correct","confident_wrong","missing","ambiguous_contains_truth","ambiguous_excludes_truth","request_failed","not_run"]
      .map(k=>[k,count(providerName,k)]))]));
  const result={version:1,generatedAt:new Date().toISOString(),live:true,provider,selected:chosen.length,
    scoringNote:"Exact score only when explicit non-ambiguous trim equals independently verified trim; ambiguous style confidence is NOT subject-level confidence. Source labels need independent review.",
    summary,rows};
  fs.mkdirSync(path.dirname(outfile),{recursive:true});
  fs.writeFileSync(outfile,JSON.stringify(result,null,2)+"\n",{mode:0o600});
  console.log("\nSaved: "+outfile+"\n"+JSON.stringify(summary,null,2));
}
await main();
