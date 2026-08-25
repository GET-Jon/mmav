"use client";

import { FormEvent, useState } from "react";
import { useRouter } from "next/navigation";
import type { AdminLocation } from "@/lib/admin/locations";

const input = "w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm font-semibold text-slate-900 outline-none focus:border-slate-500";
const locationTypes = ["mindful_facility", "partner", "auction", "storage", "transport", "other"];
const resourceTypes = ["bay", "lift", "detail_space", "parking", "storage", "paint", "other"];

function labelize(value: string) {
  return value.replaceAll("_", " ").replace(/\b\w/g, (letter) => letter.toUpperCase());
}

export function LocationResourceAdmin({ locations }: { locations: AdminLocation[] }) {
  const router = useRouter();
  const [editingLocationId, setEditingLocationId] = useState<string | null>(null);
  const [addingLocation, setAddingLocation] = useState(false);
  const [addingResourceTo, setAddingResourceTo] = useState<string | null>(null);
  const [working, setWorking] = useState(false);
  const [message, setMessage] = useState("");

  async function submitLocation(event: FormEvent<HTMLFormElement>, locationId?: string) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    setWorking(true); setMessage("");
    try {
      const body = Object.fromEntries(form.entries());
      body.active = form.get("active") ? "true" : "false";
      const response = await fetch(locationId ? `/api/admin/locations/${locationId}` : "/api/admin/locations", {
        method: locationId ? "PATCH" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...body, active: body.active === "true" }),
      });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error || "Failed to save location.");
      setAddingLocation(false); setEditingLocationId(null); setMessage("Location saved."); router.refresh();
    } catch (error) { setMessage(error instanceof Error ? error.message : "Failed to save location."); }
    finally { setWorking(false); }
  }

  async function submitResource(event: FormEvent<HTMLFormElement>, locationId: string, resourceId?: string) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    setWorking(true); setMessage("");
    try {
      const response = await fetch(resourceId ? `/api/admin/resources/${resourceId}` : "/api/admin/resources", {
        method: resourceId ? "PATCH" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ locationId, name: form.get("name"), resourceType: form.get("resourceType"), notes: form.get("notes"), active: Boolean(form.get("active")) }),
      });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error || "Failed to save resource.");
      setAddingResourceTo(null); setMessage("Resource saved."); router.refresh();
    } catch (error) { setMessage(error instanceof Error ? error.message : "Failed to save resource."); }
    finally { setWorking(false); }
  }

  function LocationForm({ location }: { location?: AdminLocation }) {
    return <form onSubmit={(event) => submitLocation(event, location?.id)} className="grid gap-3 rounded-2xl border border-slate-200 bg-slate-50 p-4 md:grid-cols-2 xl:grid-cols-4">
      <input name="name" required defaultValue={location?.name || ""} placeholder="Location name" className={input} />
      <select name="locationType" defaultValue={location?.locationType || "mindful_facility"} className={input}>{locationTypes.map((type) => <option key={type} value={type}>{labelize(type)}</option>)}</select>
      <input name="addressLine1" defaultValue={location?.addressLine1 || ""} placeholder="Street address" className={input} />
      <input name="addressLine2" defaultValue={location?.addressLine2 || ""} placeholder="Suite / unit" className={input} />
      <input name="city" defaultValue={location?.city || ""} placeholder="City" className={input} />
      <input name="state" defaultValue={location?.state || ""} placeholder="State" className={input} />
      <input name="postalCode" defaultValue={location?.postalCode || ""} placeholder="ZIP" className={input} />
      <input name="country" defaultValue={location?.country || "US"} placeholder="Country" className={input} />
      <textarea name="notes" defaultValue={location?.notes || ""} placeholder="Notes" className={`${input} min-h-20 md:col-span-2 xl:col-span-3`} />
      <div className="flex items-center justify-between gap-3"><label className="flex items-center gap-2 text-sm font-bold"><input name="active" type="checkbox" defaultChecked={location?.active ?? true} /> Active</label><button disabled={working} className="rounded-xl bg-slate-950 px-4 py-2.5 text-sm font-black text-white">Save</button></div>
    </form>;
  }

  return <div className="space-y-4">
    <div className="flex items-center justify-between gap-3"><div className="text-sm font-semibold text-slate-500">{message}</div><button onClick={() => setAddingLocation((value) => !value)} className="rounded-xl bg-slate-950 px-4 py-2.5 text-sm font-black text-white">+ Add Location</button></div>
    {addingLocation ? <LocationForm /> : null}
    {locations.map((location) => <section key={location.id} className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
      <div className="flex flex-col gap-3 border-b border-slate-200 p-5 sm:flex-row sm:items-center sm:justify-between">
        <div><div className="flex flex-wrap items-center gap-2"><h2 className="text-lg font-black">{location.name}</h2><span className="rounded-full bg-slate-100 px-2 py-1 text-[10px] font-black uppercase text-slate-600">{labelize(location.locationType)}</span>{!location.active ? <span className="rounded-full bg-red-50 px-2 py-1 text-[10px] font-black uppercase text-red-600">Inactive</span> : null}</div><div className="mt-1 text-sm text-slate-500">{[location.addressLine1, location.city, location.state].filter(Boolean).join(", ") || "No address configured"}</div></div>
        <button onClick={() => setEditingLocationId(editingLocationId === location.id ? null : location.id)} className="rounded-lg border border-slate-200 px-3 py-2 text-xs font-black">{editingLocationId === location.id ? "Close" : "Edit Location"}</button>
      </div>
      {editingLocationId === location.id ? <div className="p-4"><LocationForm location={location} /></div> : null}
      <div className="p-5">
        <div className="mb-3 flex items-center justify-between"><div><h3 className="font-black">Resources</h3><p className="text-xs text-slate-500">Bays, lifts, detail spaces, parking, and other schedulable capacity at this location.</p></div><button onClick={() => setAddingResourceTo(addingResourceTo === location.id ? null : location.id)} className="rounded-lg border border-slate-200 px-3 py-2 text-xs font-black">+ Add Resource</button></div>
        {addingResourceTo === location.id ? <form onSubmit={(event) => submitResource(event, location.id)} className="mb-3 grid gap-2 rounded-xl bg-slate-50 p-3 sm:grid-cols-[1fr_180px_1fr_auto_auto]"><input name="name" required placeholder="Resource name" className={input}/><select name="resourceType" className={input}>{resourceTypes.map((type) => <option key={type} value={type}>{labelize(type)}</option>)}</select><input name="notes" placeholder="Notes" className={input}/><label className="flex items-center gap-2 text-xs font-bold"><input name="active" type="checkbox" defaultChecked/> Active</label><button disabled={working} className="rounded-lg bg-slate-950 px-3 py-2 text-xs font-black text-white">Add</button></form> : null}
        <div className="space-y-2">{location.resources.length ? location.resources.map((resource) => <form key={resource.id} onSubmit={(event) => submitResource(event, location.id, resource.id)} className="grid gap-2 rounded-xl border border-slate-200 p-3 sm:grid-cols-[1fr_180px_1fr_auto_auto]"><input name="name" defaultValue={resource.name} className={input}/><select name="resourceType" defaultValue={resource.resourceType} className={input}>{resourceTypes.map((type) => <option key={type} value={type}>{labelize(type)}</option>)}</select><input name="notes" defaultValue={resource.notes || ""} className={input}/><label className="flex items-center gap-2 text-xs font-bold"><input name="active" type="checkbox" defaultChecked={resource.active}/> Active</label><button disabled={working} className="rounded-lg border border-slate-200 px-3 py-2 text-xs font-black">Save</button></form>) : <div className="rounded-xl border border-dashed border-slate-300 p-5 text-sm font-semibold text-slate-400">No resources configured.</div>}</div>
      </div>
    </section>)}
  </div>;
}
