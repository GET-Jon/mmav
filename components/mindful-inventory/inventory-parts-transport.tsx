"use client";

import { FormEvent, useMemo, useState } from "react";
import { useRouter } from "next/navigation";

import type {
  InventoryPartStatus,
  InventoryPartsTransportData,
  InventoryTransportStatus,
} from "@/lib/mindful-inventory/parts-transport";

function money(value: number | null | undefined) {
  if (value === null || value === undefined || !Number.isFinite(value)) {
    return "—";
  }

  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 0,
  }).format(value);
}

function labelize(value: string) {
  return value
    .replaceAll("_", " ")
    .replace(/\b\w/g, (letter) => letter.toUpperCase());
}

function shortDate(value: string | null) {
  if (!value) return "—";

  return new Date(value).toLocaleString("en-US", {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

async function parseResponse(response: Response) {
  const text = await response.text();

  if (!text.trim()) return {} as { error?: string };

  try {
    return JSON.parse(text) as { error?: string };
  } catch {
    throw new Error(
      `Request failed (${response.status}). The server returned a non-JSON response.`,
    );
  }
}

const partStatusStyles: Record<InventoryPartStatus, string> = {
  needed: "bg-amber-100 text-amber-800",
  ordered: "bg-blue-100 text-blue-800",
  backordered: "bg-rose-100 text-rose-800",
  received: "bg-emerald-100 text-emerald-800",
  cancelled: "bg-slate-100 text-slate-500",
};

const transportStatusStyles: Record<InventoryTransportStatus, string> = {
  requested: "bg-amber-100 text-amber-800",
  booked: "bg-blue-100 text-blue-800",
  awaiting_pickup: "bg-violet-100 text-violet-800",
  in_transit: "bg-indigo-100 text-indigo-800",
  delayed: "bg-rose-100 text-rose-800",
  delivered: "bg-emerald-100 text-emerald-800",
  cancelled: "bg-slate-100 text-slate-500",
};

export function InventoryPartsTransport({
  vehicleId,
  data,
}: {
  vehicleId: string;
  data: InventoryPartsTransportData;
}) {
  const router = useRouter();

  const [showPartForm, setShowPartForm] = useState(false);
  const [showTransportForm, setShowTransportForm] = useState(false);

  const [partWorkOrderId, setPartWorkOrderId] = useState(
    data.workOrders[0]?.id || "",
  );
  const [partDescription, setPartDescription] = useState("");
  const [partQuantity, setPartQuantity] = useState("1");
  const [partSupplier, setPartSupplier] = useState("");
  const [partPrice, setPartPrice] = useState("");
  const [partEta, setPartEta] = useState("");
  const [partNotes, setPartNotes] = useState("");

  const [originLocationId, setOriginLocationId] = useState("");
  const [destinationLocationId, setDestinationLocationId] = useState("");
  const [transporterPartnerId, setTransporterPartnerId] = useState("");
  const [externalTransporterName, setExternalTransporterName] = useState("");
  const [pickupScheduledAt, setPickupScheduledAt] = useState("");
  const [expectedDeliveryAt, setExpectedDeliveryAt] = useState("");
  const [quotedCost, setQuotedCost] = useState("");
  const [transportNotes, setTransportNotes] = useState("");

  const [workingId, setWorkingId] = useState<string | null>(null);
  const [message, setMessage] = useState("");

  const partCounts = useMemo(() => {
    const active = data.parts.filter((part) => part.status !== "cancelled");

    return {
      needed: active.filter((part) => part.status === "needed").length,
      ordered: active.filter((part) => part.status === "ordered").length,
      backordered: active.filter((part) => part.status === "backordered").length,
      received: active.filter((part) => part.status === "received").length,
    };
  }, [data.parts]);

  const workOrdersWaitingOnParts = useMemo(
    () =>
      new Set(
        data.parts
          .filter(
            (part) =>
              part.status !== "received" && part.status !== "cancelled",
          )
          .map((part) => part.workOrderId),
      ),
    [data.parts],
  );

  const locationName = (id: string | null) =>
    data.locations.find((location) => location.id === id)?.name || "Unspecified";

  const partnerName = (id: string | null) => {
    const partner = data.partners.find((item) => item.id === id);
    if (!partner) return null;

    return partner.companyName
      ? `${partner.name} · ${partner.companyName}`
      : partner.name;
  };

  async function addPart(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setWorkingId("new-part");
    setMessage("");

    try {
      const response = await fetch(
        `/api/mindful/inventory/vehicles/${vehicleId}/parts`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            workOrderId: partWorkOrderId,
            description: partDescription,
            quantity: partQuantity,
            supplier: partSupplier,
            quotedUnitPrice: partPrice || null,
            etaAt: partEta ? new Date(partEta).toISOString() : null,
            notes: partNotes,
          }),
        },
      );

      const payload = await parseResponse(response);

      if (!response.ok) {
        throw new Error(payload.error || "Failed to add part.");
      }

      setPartDescription("");
      setPartQuantity("1");
      setPartSupplier("");
      setPartPrice("");
      setPartEta("");
      setPartNotes("");
      setShowPartForm(false);
      setMessage("Part added.");
      router.refresh();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Failed to add part.");
    } finally {
      setWorkingId(null);
    }
  }

  async function updatePartStatus(
    partId: string,
    status: InventoryPartStatus,
  ) {
    setWorkingId(partId);
    setMessage("");

    try {
      const response = await fetch(
        `/api/mindful/inventory/vehicles/${vehicleId}/parts`,
        {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ partId, status }),
        },
      );

      const payload = await parseResponse(response);

      if (!response.ok) {
        throw new Error(payload.error || "Failed to update part.");
      }

      setMessage(`Part marked ${labelize(status)}.`);
      router.refresh();
    } catch (error) {
      setMessage(
        error instanceof Error ? error.message : "Failed to update part.",
      );
    } finally {
      setWorkingId(null);
    }
  }

  async function addTransport(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setWorkingId("new-transport");
    setMessage("");

    try {
      const response = await fetch(
        `/api/mindful/inventory/vehicles/${vehicleId}/transportation`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            originLocationId: originLocationId || null,
            destinationLocationId: destinationLocationId || null,
            transporterPartnerId: transporterPartnerId || null,
            externalTransporterName:
              transporterPartnerId ? null : externalTransporterName,
            pickupScheduledAt: pickupScheduledAt
              ? new Date(pickupScheduledAt).toISOString()
              : null,
            expectedDeliveryAt: expectedDeliveryAt
              ? new Date(expectedDeliveryAt).toISOString()
              : null,
            quotedCost: quotedCost || null,
            notes: transportNotes,
          }),
        },
      );

      const payload = await parseResponse(response);

      if (!response.ok) {
        throw new Error(payload.error || "Failed to request transport.");
      }

      setOriginLocationId("");
      setDestinationLocationId("");
      setTransporterPartnerId("");
      setExternalTransporterName("");
      setPickupScheduledAt("");
      setExpectedDeliveryAt("");
      setQuotedCost("");
      setTransportNotes("");
      setShowTransportForm(false);
      setMessage("Transport requested.");
      router.refresh();
    } catch (error) {
      setMessage(
        error instanceof Error ? error.message : "Failed to request transport.",
      );
    } finally {
      setWorkingId(null);
    }
  }

  async function updateTransportStatus(
    transportationId: string,
    status: InventoryTransportStatus,
  ) {
    setWorkingId(transportationId);
    setMessage("");

    try {
      const response = await fetch(
        `/api/mindful/inventory/vehicles/${vehicleId}/transportation`,
        {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ transportationId, status }),
        },
      );

      const payload = await parseResponse(response);

      if (!response.ok) {
        throw new Error(payload.error || "Failed to update transport.");
      }

      setMessage(`Transport marked ${labelize(status)}.`);
      router.refresh();
    } catch (error) {
      setMessage(
        error instanceof Error
          ? error.message
          : "Failed to update transport.",
      );
    } finally {
      setWorkingId(null);
    }
  }

  return (
    <div className="space-y-6">
      <section className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
        <div className="flex flex-col gap-5 lg:flex-row lg:items-start lg:justify-between">
          <div>
            <div className="text-xs font-black uppercase tracking-[0.1em] text-slate-400">
              Logistics
            </div>
            <h2 className="mt-1 text-2xl font-black text-slate-950">
              Parts & Transport
            </h2>
            <p className="mt-2 max-w-3xl text-sm font-medium leading-6 text-slate-500">
              Track what authorized work is waiting on, and keep vehicle
              movements visible before they become schedule blockers.
            </p>
          </div>

          <div className="grid grid-cols-4 gap-2">
            <div className="rounded-xl bg-amber-50 px-4 py-3">
              <div className="text-[10px] font-black uppercase text-amber-600">
                Needed
              </div>
              <div className="mt-1 text-xl font-black text-amber-900">
                {partCounts.needed}
              </div>
            </div>

            <div className="rounded-xl bg-blue-50 px-4 py-3">
              <div className="text-[10px] font-black uppercase text-blue-600">
                Ordered
              </div>
              <div className="mt-1 text-xl font-black text-blue-900">
                {partCounts.ordered}
              </div>
            </div>

            <div className="rounded-xl bg-rose-50 px-4 py-3">
              <div className="text-[10px] font-black uppercase text-rose-600">
                Backordered
              </div>
              <div className="mt-1 text-xl font-black text-rose-900">
                {partCounts.backordered}
              </div>
            </div>

            <div className="rounded-xl bg-emerald-50 px-4 py-3">
              <div className="text-[10px] font-black uppercase text-emerald-600">
                Received
              </div>
              <div className="mt-1 text-xl font-black text-emerald-900">
                {partCounts.received}
              </div>
            </div>
          </div>
        </div>

        {message ? (
          <div className="mt-4 rounded-xl bg-slate-50 px-4 py-3 text-sm font-bold text-slate-700">
            {message}
          </div>
        ) : null}
      </section>

      <section className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
        <div className="flex items-start justify-between gap-4">
          <div>
            <div className="text-xs font-black uppercase tracking-[0.1em] text-slate-400">
              Parts Readiness
            </div>
            <h3 className="mt-1 text-xl font-black text-slate-950">
              Parts by Work Order
            </h3>
          </div>

          <button
            type="button"
            disabled={data.workOrders.length === 0}
            onClick={() => setShowPartForm((value) => !value)}
            className="rounded-xl bg-slate-950 px-4 py-2.5 text-sm font-black text-white disabled:cursor-not-allowed disabled:opacity-40"
          >
            + Add Part
          </button>
        </div>

        {data.workOrders.length === 0 ? (
          <div className="mt-5 rounded-xl border border-dashed border-slate-300 bg-slate-50 p-5 text-sm font-medium text-slate-500">
            No authorized Work Orders yet. Approve the Work Plan before adding
            required parts.
          </div>
        ) : null}

        {showPartForm ? (
          <form
            onSubmit={addPart}
            className="mt-5 grid gap-4 rounded-2xl border border-slate-200 bg-slate-50 p-5 lg:grid-cols-2"
          >
            <label className="text-sm font-bold text-slate-700">
              Work Order
              <select
                value={partWorkOrderId}
                onChange={(event) => setPartWorkOrderId(event.target.value)}
                className="mt-1.5 w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5"
              >
                {data.workOrders.map((work) => (
                  <option key={work.id} value={work.id}>
                    {work.title}
                  </option>
                ))}
              </select>
            </label>

            <label className="text-sm font-bold text-slate-700">
              Part / Material
              <input
                required
                value={partDescription}
                onChange={(event) => setPartDescription(event.target.value)}
                placeholder="Rear muffler assembly"
                className="mt-1.5 w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5"
              />
            </label>

            <label className="text-sm font-bold text-slate-700">
              Quantity
              <input
                type="number"
                min="0.01"
                step="0.01"
                value={partQuantity}
                onChange={(event) => setPartQuantity(event.target.value)}
                className="mt-1.5 w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5"
              />
            </label>

            <label className="text-sm font-bold text-slate-700">
              Supplier
              <input
                value={partSupplier}
                onChange={(event) => setPartSupplier(event.target.value)}
                placeholder="FCP Euro"
                className="mt-1.5 w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5"
              />
            </label>

            <label className="text-sm font-bold text-slate-700">
              Quoted Unit Cost
              <input
                type="number"
                min="0"
                step="0.01"
                value={partPrice}
                onChange={(event) => setPartPrice(event.target.value)}
                placeholder="425"
                className="mt-1.5 w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5"
              />
            </label>

            <label className="text-sm font-bold text-slate-700">
              ETA
              <input
                type="datetime-local"
                value={partEta}
                onChange={(event) => setPartEta(event.target.value)}
                className="mt-1.5 w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5"
              />
            </label>

            <label className="text-sm font-bold text-slate-700 lg:col-span-2">
              Notes
              <textarea
                value={partNotes}
                onChange={(event) => setPartNotes(event.target.value)}
                rows={2}
                className="mt-1.5 w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5"
              />
            </label>

            <div className="flex gap-2 lg:col-span-2">
              <button
                type="submit"
                disabled={workingId === "new-part"}
                className="rounded-xl bg-slate-950 px-5 py-2.5 text-sm font-black text-white disabled:opacity-50"
              >
                Add Part
              </button>

              <button
                type="button"
                onClick={() => setShowPartForm(false)}
                className="rounded-xl border border-slate-200 bg-white px-5 py-2.5 text-sm font-black text-slate-700"
              >
                Cancel
              </button>
            </div>
          </form>
        ) : null}

        <div className="mt-5 space-y-4">
          {data.workOrders.map((work) => {
            const parts = data.parts.filter(
              (part) => part.workOrderId === work.id,
            );
            const waiting = workOrdersWaitingOnParts.has(work.id);

            return (
              <article
                key={work.id}
                className="rounded-2xl border border-slate-200 p-5"
              >
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div>
                    <div className="text-xs font-black uppercase text-slate-400">
                      Work Order
                    </div>
                    <div className="mt-1 text-base font-black text-slate-950">
                      {work.title}
                    </div>
                  </div>

                  <span
                    className={`rounded-full px-3 py-1.5 text-xs font-black ${
                      waiting
                        ? "bg-amber-100 text-amber-800"
                        : parts.length > 0
                          ? "bg-emerald-100 text-emerald-800"
                          : "bg-slate-100 text-slate-500"
                    }`}
                  >
                    {waiting
                      ? "Waiting on Parts"
                      : parts.length > 0
                        ? "Parts Ready"
                        : "No Parts Listed"}
                  </span>
                </div>

                {parts.length === 0 ? (
                  <div className="mt-4 text-sm font-medium text-slate-400">
                    No parts attached to this Work Order.
                  </div>
                ) : (
                  <div className="mt-4 space-y-2">
                    {parts.map((part) => (
                      <div
                        key={part.id}
                        className="rounded-xl bg-slate-50 p-4"
                      >
                        <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
                          <div>
                            <div className="flex flex-wrap items-center gap-2">
                              <span
                                className={`rounded-full px-2.5 py-1 text-[10px] font-black uppercase tracking-wide ${partStatusStyles[part.status]}`}
                              >
                                {labelize(part.status)}
                              </span>
                              <span className="text-sm font-black text-slate-950">
                                {part.description}
                              </span>
                            </div>

                            <div className="mt-2 flex flex-wrap gap-2 text-xs font-bold text-slate-500">
                              <span>Qty {part.quantity}</span>
                              <span>·</span>
                              <span>{part.supplier || "Supplier TBD"}</span>
                              <span>·</span>
                              <span>{money(part.quotedUnitPrice)}</span>

                              {part.etaAt ? (
                                <>
                                  <span>·</span>
                                  <span>ETA {shortDate(part.etaAt)}</span>
                                </>
                              ) : null}
                            </div>
                          </div>

                          <div className="flex flex-wrap gap-2">
                            {part.status === "needed" ? (
                              <>
                                <button
                                  type="button"
                                  disabled={workingId === part.id}
                                  onClick={() =>
                                    updatePartStatus(part.id, "ordered")
                                  }
                                  className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs font-black"
                                >
                                  Mark Ordered
                                </button>

                                <button
                                  type="button"
                                  disabled={workingId === part.id}
                                  onClick={() =>
                                    updatePartStatus(part.id, "backordered")
                                  }
                                  className="rounded-lg border border-rose-200 bg-white px-3 py-2 text-xs font-black text-rose-700"
                                >
                                  Backordered
                                </button>
                              </>
                            ) : null}

                            {part.status === "ordered" ||
                            part.status === "backordered" ? (
                              <button
                                type="button"
                                disabled={workingId === part.id}
                                onClick={() =>
                                  updatePartStatus(part.id, "received")
                                }
                                className="rounded-lg bg-slate-950 px-3 py-2 text-xs font-black text-white"
                              >
                                Mark Received
                              </button>
                            ) : null}
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </article>
            );
          })}
        </div>
      </section>

      <section className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
        <div className="flex items-start justify-between gap-4">
          <div>
            <div className="text-xs font-black uppercase tracking-[0.1em] text-slate-400">
              Vehicle Movement
            </div>
            <h3 className="mt-1 text-xl font-black text-slate-950">
              Transport
            </h3>
            <p className="mt-1 text-sm font-medium text-slate-500">
              Keep outside transport visible before it disrupts downstream work.
            </p>
          </div>

          <button
            type="button"
            onClick={() => setShowTransportForm((value) => !value)}
            className="rounded-xl bg-slate-950 px-4 py-2.5 text-sm font-black text-white"
          >
            + Request Transport
          </button>
        </div>

        {showTransportForm ? (
          <form
            onSubmit={addTransport}
            className="mt-5 grid gap-4 rounded-2xl border border-slate-200 bg-slate-50 p-5 lg:grid-cols-2"
          >
            <label className="text-sm font-bold text-slate-700">
              Origin
              <select
                value={originLocationId}
                onChange={(event) => setOriginLocationId(event.target.value)}
                className="mt-1.5 w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5"
              >
                <option value="">Unspecified</option>
                {data.locations.map((location) => (
                  <option key={location.id} value={location.id}>
                    {location.name}
                  </option>
                ))}
              </select>
            </label>

            <label className="text-sm font-bold text-slate-700">
              Destination
              <select
                value={destinationLocationId}
                onChange={(event) =>
                  setDestinationLocationId(event.target.value)
                }
                className="mt-1.5 w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5"
              >
                <option value="">Unspecified</option>
                {data.locations.map((location) => (
                  <option key={location.id} value={location.id}>
                    {location.name}
                  </option>
                ))}
              </select>
            </label>

            {data.partners.length > 0 ? (
              <label className="text-sm font-bold text-slate-700">
                Saved Transport Partner
                <select
                  value={transporterPartnerId}
                  onChange={(event) =>
                    setTransporterPartnerId(event.target.value)
                  }
                  className="mt-1.5 w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5"
                >
                  <option value="">Use outside transporter</option>
                  {data.partners.map((partner) => (
                    <option key={partner.id} value={partner.id}>
                      {partner.companyName
                        ? `${partner.name} · ${partner.companyName}`
                        : partner.name}
                    </option>
                  ))}
                </select>
              </label>
            ) : null}

            {!transporterPartnerId ? (
              <label className="text-sm font-bold text-slate-700">
                Outside Transporter
                <input
                  value={externalTransporterName}
                  onChange={(event) =>
                    setExternalTransporterName(event.target.value)
                  }
                  placeholder="Transporter name"
                  className="mt-1.5 w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5"
                />
              </label>
            ) : null}

            <label className="text-sm font-bold text-slate-700">
              Pickup
              <input
                type="datetime-local"
                value={pickupScheduledAt}
                onChange={(event) =>
                  setPickupScheduledAt(event.target.value)
                }
                className="mt-1.5 w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5"
              />
            </label>

            <label className="text-sm font-bold text-slate-700">
              Expected Delivery
              <input
                type="datetime-local"
                value={expectedDeliveryAt}
                onChange={(event) =>
                  setExpectedDeliveryAt(event.target.value)
                }
                className="mt-1.5 w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5"
              />
            </label>

            <label className="text-sm font-bold text-slate-700">
              Quoted Cost
              <input
                type="number"
                min="0"
                step="0.01"
                value={quotedCost}
                onChange={(event) => setQuotedCost(event.target.value)}
                className="mt-1.5 w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5"
              />
            </label>

            <label className="text-sm font-bold text-slate-700 lg:col-span-2">
              Notes
              <textarea
                value={transportNotes}
                onChange={(event) => setTransportNotes(event.target.value)}
                rows={2}
                className="mt-1.5 w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5"
              />
            </label>

            <div className="flex gap-2 lg:col-span-2">
              <button
                type="submit"
                disabled={workingId === "new-transport"}
                className="rounded-xl bg-slate-950 px-5 py-2.5 text-sm font-black text-white disabled:opacity-50"
              >
                Request Transport
              </button>

              <button
                type="button"
                onClick={() => setShowTransportForm(false)}
                className="rounded-xl border border-slate-200 bg-white px-5 py-2.5 text-sm font-black text-slate-700"
              >
                Cancel
              </button>
            </div>
          </form>
        ) : null}

        {data.locations.length === 0 ? (
          <div className="mt-4 rounded-xl bg-amber-50 px-4 py-3 text-sm font-bold text-amber-800">
            No saved Inventory locations yet. Transport can still be requested
            now; location management can be added later.
          </div>
        ) : null}

        <div className="mt-5 space-y-3">
          {data.transportation.length === 0 ? (
            <div className="rounded-xl border border-dashed border-slate-300 bg-slate-50 p-5 text-sm font-medium text-slate-500">
              No transport requests for this vehicle.
            </div>
          ) : (
            data.transportation.map((transport) => {
              const transporter =
                partnerName(transport.transporterPartnerId) ||
                transport.externalTransporterName ||
                "Transporter TBD";

              return (
                <article
                  key={transport.id}
                  className="rounded-2xl border border-slate-200 p-5"
                >
                  <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
                    <div>
                      <div className="flex flex-wrap items-center gap-2">
                        <span
                          className={`rounded-full px-2.5 py-1 text-[10px] font-black uppercase tracking-wide ${transportStatusStyles[transport.status]}`}
                        >
                          {labelize(transport.status)}
                        </span>
                        <span className="text-sm font-black text-slate-950">
                          {locationName(transport.originLocationId)} →{" "}
                          {locationName(transport.destinationLocationId)}
                        </span>
                      </div>

                      <div className="mt-3 flex flex-wrap gap-2 text-xs font-bold text-slate-500">
                        <span>{transporter}</span>
                        <span>·</span>
                        <span>Pickup {shortDate(transport.pickupScheduledAt)}</span>
                        <span>·</span>
                        <span>
                          Delivery {shortDate(transport.expectedDeliveryAt)}
                        </span>
                        <span>·</span>
                        <span>{money(transport.quotedCost)}</span>
                      </div>
                    </div>

                    <div className="flex flex-wrap gap-2">
                      {transport.status === "requested" ? (
                        <button
                          type="button"
                          disabled={workingId === transport.id}
                          onClick={() =>
                            updateTransportStatus(transport.id, "booked")
                          }
                          className="rounded-lg border border-slate-200 px-3 py-2 text-xs font-black"
                        >
                          Mark Booked
                        </button>
                      ) : null}

                      {transport.status === "booked" ? (
                        <button
                          type="button"
                          disabled={workingId === transport.id}
                          onClick={() =>
                            updateTransportStatus(
                              transport.id,
                              "awaiting_pickup",
                            )
                          }
                          className="rounded-lg border border-slate-200 px-3 py-2 text-xs font-black"
                        >
                          Awaiting Pickup
                        </button>
                      ) : null}

                      {transport.status === "awaiting_pickup" ||
                      transport.status === "delayed" ? (
                        <button
                          type="button"
                          disabled={workingId === transport.id}
                          onClick={() =>
                            updateTransportStatus(transport.id, "in_transit")
                          }
                          className="rounded-lg bg-slate-950 px-3 py-2 text-xs font-black text-white"
                        >
                          In Transit
                        </button>
                      ) : null}

                      {transport.status === "in_transit" ? (
                        <>
                          <button
                            type="button"
                            disabled={workingId === transport.id}
                            onClick={() =>
                              updateTransportStatus(transport.id, "delayed")
                            }
                            className="rounded-lg border border-rose-200 px-3 py-2 text-xs font-black text-rose-700"
                          >
                            Delayed
                          </button>

                          <button
                            type="button"
                            disabled={workingId === transport.id}
                            onClick={() =>
                              updateTransportStatus(transport.id, "delivered")
                            }
                            className="rounded-lg bg-slate-950 px-3 py-2 text-xs font-black text-white"
                          >
                            Delivered
                          </button>
                        </>
                      ) : null}
                    </div>
                  </div>
                </article>
              );
            })
          )}
        </div>
      </section>
    </div>
  );
}
