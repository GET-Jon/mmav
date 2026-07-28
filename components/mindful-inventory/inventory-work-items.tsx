"use client";

import { useEffect, useState } from "react";

import type { InventoryWorkItemView } from "@/lib/mindful-inventory/queries";

type InventoryWorkItemsProps = {
  vehicleId: string;
  workItems: InventoryWorkItemView[];
  onChanged: () => void;
};

type WorkItemForm = {
  description: string;
  category: string;
  priority: string;
  status: string;
  vendor: string;
  estimatedCost: string;
  actualCost: string;
  scheduledDate: string;
  completedDate: string;
  requiresApproval: boolean;
  notes: string;
};

const emptyForm: WorkItemForm = {
  description: "",
  category: "mechanical",
  priority: "recommended",
  status: "not_started",
  vendor: "",
  estimatedCost: "0",
  actualCost: "",
  scheduledDate: "",
  completedDate: "",
  requiresApproval: false,
  notes: "",
};

const categoryOptions = [
  ["mechanical", "Mechanical"],
  ["maintenance", "Maintenance"],
  ["tires_wheels", "Tires & Wheels"],
  ["cosmetic", "Cosmetic"],
  ["interior", "Interior"],
  ["detailing", "Detailing"],
  ["transportation", "Transportation"],
  ["title_registration", "Title & Registration"],
  ["inspection", "Inspection"],
  ["photography_listing", "Photography & Listing"],
  ["other", "Other"],
] as const;

const priorityOptions = [
  ["required", "Required"],
  ["recommended", "Recommended"],
  ["optional", "Optional"],
] as const;

const statusOptions = [
  ["not_started", "Not Started"],
  ["awaiting_approval", "Awaiting Approval"],
  ["approved", "Approved"],
  ["scheduled", "Scheduled"],
  ["in_progress", "In Progress"],
  ["complete", "Complete"],
  ["cancelled", "Cancelled"],
] as const;

function money(value: number | null) {
  if (value === null) {
    return "—";
  }

  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 0,
  }).format(value);
}

function labelClass() {
  return "block text-xs font-black uppercase tracking-[0.08em] text-slate-500";
}

function inputClass() {
  return "mt-1 w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm font-semibold text-slate-950 shadow-sm outline-none focus:border-slate-400";
}

function statusClass(status: string) {
  if (status === "complete") {
    return "bg-emerald-50 text-emerald-700 ring-emerald-200";
  }

  if (status === "cancelled") {
    return "bg-slate-100 text-slate-500 ring-slate-200";
  }

  if (status === "awaiting_approval") {
    return "bg-amber-50 text-amber-700 ring-amber-200";
  }

  if (
    status === "approved" ||
    status === "scheduled" ||
    status === "in_progress"
  ) {
    return "bg-blue-50 text-blue-700 ring-blue-200";
  }

  return "bg-slate-100 text-slate-700 ring-slate-200";
}

export function InventoryWorkItems({
  vehicleId,
  workItems,
  onChanged,
}: InventoryWorkItemsProps) {
  const [modalOpen, setModalOpen] = useState(false);
  const [editingItem, setEditingItem] =
    useState<InventoryWorkItemView | null>(null);
  const [form, setForm] = useState<WorkItemForm>(emptyForm);
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!modalOpen) {
      return;
    }

    function handleKeyDown(event: KeyboardEvent) {
      if (
        event.key === "Escape" &&
        !saving &&
        !deleting
      ) {
        closeModal();
      }
    }

    document.addEventListener("keydown", handleKeyDown);

    return () => {
      document.removeEventListener(
        "keydown",
        handleKeyDown,
      );
    };
  });

  function updateField(
    key: keyof WorkItemForm,
    value: string | boolean,
  ) {
    setForm((current) => ({
      ...current,
      [key]: value,
    }));
  }

  function openNewItem() {
    setEditingItem(null);
    setForm(emptyForm);
    setError("");
    setModalOpen(true);
  }

  function openExistingItem(item: InventoryWorkItemView) {
    setEditingItem(item);
    setForm({
      description: item.description,
      category: item.category,
      priority: item.priority,
      status: item.status,
      vendor: item.vendor || "",
      estimatedCost: String(item.estimatedCost),
      actualCost:
        item.actualCost === null
          ? ""
          : String(item.actualCost),
      scheduledDate: item.scheduledDate || "",
      completedDate: item.completedDate || "",
      requiresApproval: item.requiresApproval,
      notes: item.notes || "",
    });
    setError("");
    setModalOpen(true);
  }

  function closeModal() {
    if (saving || deleting) {
      return;
    }

    setModalOpen(false);
    setEditingItem(null);
    setError("");
  }

  async function saveItem() {
    setSaving(true);
    setError("");

    try {
      const url = editingItem
        ? `/api/mindful/inventory/work-items/${editingItem.id}`
        : `/api/mindful/inventory/vehicles/${vehicleId}/work-items`;

      const response = await fetch(url, {
        method: editingItem ? "PATCH" : "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(form),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(
          data.error || "Work item could not be saved.",
        );
      }

      setModalOpen(false);
      setEditingItem(null);
      onChanged();
    } catch (saveError) {
      setError(
        saveError instanceof Error
          ? saveError.message
          : "Work item could not be saved.",
      );
    } finally {
      setSaving(false);
    }
  }

  async function deleteItem() {
    if (!editingItem) {
      return;
    }

    const confirmed = window.confirm(
      `Delete "${editingItem.description}"?`,
    );

    if (!confirmed) {
      return;
    }

    setDeleting(true);
    setError("");

    try {
      const response = await fetch(
        `/api/mindful/inventory/work-items/${editingItem.id}`,
        {
          method: "DELETE",
        },
      );

      const data = await response.json();

      if (!response.ok) {
        throw new Error(
          data.error || "Work item could not be deleted.",
        );
      }

      setModalOpen(false);
      setEditingItem(null);
      onChanged();
    } catch (deleteError) {
      setError(
        deleteError instanceof Error
          ? deleteError.message
          : "Work item could not be deleted.",
      );
    } finally {
      setDeleting(false);
    }
  }

  return (
    <>
      <section className="mt-5 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
        <div className="flex items-center justify-between gap-4">
          <div>
            <h3 className="text-base font-black text-slate-950">
              Work items
            </h3>

            <p className="mt-1 text-sm text-slate-500">
              {workItems.length}{" "}
              {workItems.length === 1 ? "item" : "items"} recorded
            </p>
          </div>

          <button
            type="button"
            onClick={openNewItem}
            className="rounded-xl bg-slate-950 px-3 py-2 text-sm font-extrabold text-white transition hover:bg-slate-800"
          >
            Add Work Item
          </button>
        </div>

        {workItems.length === 0 ? (
          <button
            type="button"
            onClick={openNewItem}
            className="mt-4 w-full rounded-xl border border-dashed border-slate-300 px-4 py-8 text-center text-sm font-semibold text-slate-500 transition hover:border-slate-400 hover:bg-slate-50"
          >
            No work items yet. Add the first one.
          </button>
        ) : (
          <div className="mt-4 space-y-2">
            {workItems.map((item) => (
              <button
                key={item.id}
                type="button"
                onClick={() => openExistingItem(item)}
                className="w-full rounded-xl border border-slate-200 px-4 py-3 text-left transition hover:border-slate-300 hover:bg-slate-50"
              >
                <div className="flex items-start justify-between gap-4">
                  <div className="min-w-0">
                    <div className="font-extrabold text-slate-900">
                      {item.description}
                    </div>

                    <div className="mt-2 flex flex-wrap items-center gap-2">
                      <span className="text-xs font-semibold capitalize text-slate-500">
                        {item.category.replaceAll("_", " ")}
                      </span>

                      <span
                        className={[
                          "rounded-full px-2 py-1 text-[11px] font-extrabold capitalize ring-1 ring-inset",
                          statusClass(item.status),
                        ].join(" ")}
                      >
                        {item.status.replaceAll("_", " ")}
                      </span>

                      {item.vendor ? (
                        <span className="text-xs font-semibold text-slate-500">
                          {item.vendor}
                        </span>
                      ) : null}
                    </div>
                  </div>

                  <div className="shrink-0 text-right">
                    <div className="text-sm font-black text-slate-950">
                      {money(
                        item.actualCost ??
                          item.estimatedCost,
                      )}
                    </div>

                    <div className="mt-1 text-[11px] font-semibold text-slate-500">
                      {item.actualCost === null
                        ? "Estimated"
                        : "Actual"}
                    </div>
                  </div>
                </div>
              </button>
            ))}
          </div>
        )}
      </section>

      {modalOpen ? (
        <div
          className="fixed inset-0 z-[120] flex items-center justify-center bg-slate-950/50 px-4 py-8 backdrop-blur-[2px]"
          onMouseDown={(event) => {
            if (event.target === event.currentTarget) {
              closeModal();
            }
          }}
        >
          <div className="max-h-full w-full max-w-2xl overflow-y-auto rounded-2xl border border-slate-200 bg-[#f7f8fb] shadow-2xl">
            <div className="flex items-start justify-between border-b border-slate-200 bg-white px-6 py-5">
              <div>
                <div className="text-[10px] font-black uppercase tracking-[0.14em] text-slate-400">
                  Inventory work
                </div>

                <h3 className="mt-1 text-xl font-black tracking-[-0.025em] text-slate-950">
                  {editingItem
                    ? "Edit Work Item"
                    : "Add Work Item"}
                </h3>
              </div>

              <button
                type="button"
                onClick={closeModal}
                disabled={saving || deleting}
                className="grid h-9 w-9 place-items-center rounded-full border border-slate-200 bg-white text-lg font-bold text-slate-500 hover:bg-slate-100 disabled:opacity-50"
              >
                ×
              </button>
            </div>

            <div className="space-y-5 p-6">
              <section className="rounded-2xl border border-slate-200 bg-white p-5">
                <div className="grid gap-4 sm:grid-cols-2">
                  <label className={`sm:col-span-2 ${labelClass()}`}>
                    Description
                    <input
                      value={form.description}
                      onChange={(event) =>
                        updateField(
                          "description",
                          event.target.value,
                        )
                      }
                      className={inputClass()}
                      placeholder="Replace front control arms"
                    />
                  </label>

                  <label className={labelClass()}>
                    Category
                    <select
                      value={form.category}
                      onChange={(event) =>
                        updateField(
                          "category",
                          event.target.value,
                        )
                      }
                      className={inputClass()}
                    >
                      {categoryOptions.map(
                        ([value, label]) => (
                          <option key={value} value={value}>
                            {label}
                          </option>
                        ),
                      )}
                    </select>
                  </label>

                  <label className={labelClass()}>
                    Priority
                    <select
                      value={form.priority}
                      onChange={(event) =>
                        updateField(
                          "priority",
                          event.target.value,
                        )
                      }
                      className={inputClass()}
                    >
                      {priorityOptions.map(
                        ([value, label]) => (
                          <option key={value} value={value}>
                            {label}
                          </option>
                        ),
                      )}
                    </select>
                  </label>

                  <label className={labelClass()}>
                    Status
                    <select
                      value={form.status}
                      onChange={(event) =>
                        updateField(
                          "status",
                          event.target.value,
                        )
                      }
                      className={inputClass()}
                    >
                      {statusOptions.map(
                        ([value, label]) => (
                          <option key={value} value={value}>
                            {label}
                          </option>
                        ),
                      )}
                    </select>
                  </label>

                  <label className={labelClass()}>
                    Vendor
                    <input
                      value={form.vendor}
                      onChange={(event) =>
                        updateField(
                          "vendor",
                          event.target.value,
                        )
                      }
                      className={inputClass()}
                      placeholder="EuroPro"
                    />
                  </label>

                  <label className={labelClass()}>
                    Estimated cost
                    <input
                      type="number"
                      min="0"
                      step="0.01"
                      value={form.estimatedCost}
                      onChange={(event) =>
                        updateField(
                          "estimatedCost",
                          event.target.value,
                        )
                      }
                      className={inputClass()}
                    />
                  </label>

                  <label className={labelClass()}>
                    Actual cost
                    <input
                      type="number"
                      min="0"
                      step="0.01"
                      value={form.actualCost}
                      onChange={(event) =>
                        updateField(
                          "actualCost",
                          event.target.value,
                        )
                      }
                      className={inputClass()}
                      placeholder="Leave blank until known"
                    />
                  </label>

                  <label className={labelClass()}>
                    Scheduled date
                    <input
                      type="date"
                      value={form.scheduledDate}
                      onChange={(event) =>
                        updateField(
                          "scheduledDate",
                          event.target.value,
                        )
                      }
                      className={inputClass()}
                    />
                  </label>

                  <label className={labelClass()}>
                    Completed date
                    <input
                      type="date"
                      value={form.completedDate}
                      onChange={(event) =>
                        updateField(
                          "completedDate",
                          event.target.value,
                        )
                      }
                      className={inputClass()}
                    />
                  </label>
                </div>

                <label className="mt-4 flex items-center gap-3 rounded-xl border border-slate-200 bg-slate-50 px-4 py-3">
                  <input
                    type="checkbox"
                    checked={form.requiresApproval}
                    onChange={(event) =>
                      updateField(
                        "requiresApproval",
                        event.target.checked,
                      )
                    }
                    className="h-4 w-4"
                  />

                  <span className="text-sm font-bold text-slate-700">
                    Requires approval before work begins
                  </span>
                </label>

                <label className={`mt-4 ${labelClass()}`}>
                  Notes
                  <textarea
                    rows={4}
                    value={form.notes}
                    onChange={(event) =>
                      updateField(
                        "notes",
                        event.target.value,
                      )
                    }
                    className={inputClass()}
                    placeholder="Parts, diagnosis, quote details..."
                  />
                </label>
              </section>

              {error ? (
                <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm font-semibold text-red-700">
                  {error}
                </div>
              ) : null}
            </div>

            <div className="flex flex-col-reverse gap-3 border-t border-slate-200 bg-white px-6 py-4 sm:flex-row sm:items-center sm:justify-between">
              <div>
                {editingItem ? (
                  <button
                    type="button"
                    disabled={saving || deleting}
                    onClick={() => void deleteItem()}
                    className="rounded-xl border border-red-200 bg-white px-4 py-2.5 text-sm font-extrabold text-red-700 hover:bg-red-50 disabled:opacity-50"
                  >
                    {deleting ? "Deleting..." : "Delete"}
                  </button>
                ) : null}
              </div>

              <div className="flex gap-3">
                <button
                  type="button"
                  disabled={saving || deleting}
                  onClick={closeModal}
                  className="rounded-xl border border-slate-300 bg-white px-4 py-2.5 text-sm font-extrabold text-slate-700 hover:bg-slate-50 disabled:opacity-50"
                >
                  Cancel
                </button>

                <button
                  type="button"
                  disabled={saving || deleting}
                  onClick={() => void saveItem()}
                  className="rounded-xl bg-slate-950 px-5 py-2.5 text-sm font-extrabold text-white hover:bg-slate-800 disabled:opacity-60"
                >
                  {saving
                    ? "Saving..."
                    : editingItem
                      ? "Save Changes"
                      : "Add Work Item"}
                </button>
              </div>
            </div>
          </div>
        </div>
      ) : null}
    </>
  );
}
