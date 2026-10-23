"use client";
import {useEffect,useState} from "react";
import {defaultDealSources,normalizeDealSources,type DealSourceProfile} from "@/lib/deal-source-profiles";

type Props={onClose?:()=>;onSaved?:(sources:DealSourceProfile[])=>void;embedded?:boolean};
const keys=[["auctionFee","Auction / transaction fee"],["transport","Transport"],["recon","Recon reserve"],["detailAdmin","Detail / admin"],["generalRiskReserve","Contingency reserve"]] as const;

export function DealSourcesEditor({onClose,onSaved,embedded=false}:Props) {
  const [sources,setSources]=useState<DealSourceProfile[]>(defaultDealSources);
  const [selected,setSelected]=useState(defaultDealSources[0].id);
  const [loading,setLoading]=useState(true);
  const [saving,setSaving]=useState(false);
  const [canEdit,setCanEdit]=useState(false);
  const [status,setStatus]=useState("");
  useEffect(()=>{let active=true;void (async()=>{try{
    const res=await fetch("/api/deal-sources",{cache:"no-store"});const data=await res.json();
    if(!res.ok)throw new Error(data.error||"Unable to load source profiles");
    if(active){const rows=normalizeDealSources(data.sources);setSources(rows);setSelected(rows[0]?.id||"");setCanEdit(Boolean(data.canEdit));}
  }catch(e){if(active)setStatus(e instanceof Error?e.message:"Unable to load source profiles");}finally{if(active)setLoading(false);}})();
  return()=>{active=false};},[]);
  const current=sources.find(s=>s.id===selected);
  function update(key:keyof DealSourceProfile,value:string|number){setSources(rows=>rows.map(row=>row.id===selected?{...row,[key]:value}:row));setStatus("");}
  function add(){const id=`custom-${Date.now()}`;setSources(rows=>[...rows,{id,name:"New source",auctionFee:0,transport:0,recon:0,detailAdmin:0,generalRiskReserve:0}]);setSelected(id);setStatus("");}
  function remove(){if(sources.length<=1)return;const rows=sources.filter(row=>row.id!==selected);setSources(rows);setSelected(rows[0]?.id||"");setStatus("");}
  async function save(){setSaving(true);setStatus("");try{
    const res=await fetch("/api/deal-sources",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({sources})});
    const data=await res.json();if(!res.ok)throw new Error(data.error||"Unable to save sources");
    setSources(data.sources);setStatus("Saved dealership defaults");onSaved?.(data.sources);
  }catch(e){setStatus(e instanceof Error?e.message:"Unable to save sources");}finally{setSaving(false);}}
  return <div className={embedded?"rounded-2xl border border-slate-200 bg-white p-5":"w-full max-w-xl rounded-2xl bg-white p-5 shadow-2xl"}>
    <div className="mb-4 flex items-start justify-between gap-3">
      <div><h2 className="text-xl font-black text-slate-950">Deal Sources & Costs</h2><p className="mt-1 text-sm text-slate-600">Set defaults for new evaluations. Existing deals will not change.</p></div>
      {onClose?<button type="button" onClick={onClose} className="rounded-lg border border-slate-200 px-3 py-2 text-xs font-bold">Close</button>:null}
    </div>
    {loading?<p className="py-5 text-sm">Loading source profiles…</p>:<div className="space-y-4">
      <label className="block text-xs font-bold text-slate-700">Acquisition source
        <select value={selected} onChange={e=>setSelected(e.target.value)} className="mt-2 w-full rounded-lg border border-slate-200 bg-white p-2.5 text-sm">
          {sources.map(s=><option key={s.id} value={s.id}>{s.name}</option>)}
        </select>
      </label>
      {current?<div className="space-y-3">
        <label className="block text-xs font-bold text-slate-700">Source name
          <input disabled={!canEdit} value={current.name} onChange={e=>update("name",e.target.value)} className="mt-1 w-full rounded-lg border border-slate-200 p-2.5 text-sm"/>
        </label>
        {keys.map(([key,label])=><label key={key} className="flex items-center justify-between gap-3 text-sm font-semibold text-slate-700">
          <span>{label}</span><span className="flex items-center rounded-lg border border-slate-200"><span className="px-2 text-slate-400">$</span><input type="number" min="0" max="1000000" step="1" disabled={!canEdit} value={current[key]} onChange={e=>update(key,Math.max(0,Number(e.target.value)||0))} className="w-28 p-2 text-right"/></span>
        </label>)}
      </div>:null}
      {canEdit?<div className="flex items-center justify-between gap-2">
        <button type="button" onClick={add} className="rounded-lg border border-slate-200 px-3 py-2 text-xs font-bold text-blue-700">+ Add source</button>
        <button type="button" disabled={sources.length<=1} onClick={remove} className="rounded-lg px-3 py-2 text-xs font-bold text-slate-500 disabled:opacity-40">Remove source</button>
      </div>:<p className="text-xs text-slate-500">Only dealership administrators can edit these defaults.</p>}
      {status?<p role="status" className="text-xs font-semibold text-blue-800">{status}</p>:null}
      {canEdit?<button type="button" onClick={()=>void save()} disabled={saving||sources.length===0} className="w-full rounded-xl bg-blue-700 px-4 py-3 text-sm font-black text-white disabled:opacity-50">{saving?"Saving…":"Save Defaults"}</button>:null}
    </div>}
  </div>;
}
