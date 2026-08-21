import { InventorySectionPlaceholder } from "@/components/mindful-inventory/inventory-section-placeholder";

export default function InventoryMediaPage() {
  return <InventorySectionPlaceholder eyebrow="Evidence" title="Media" description="Vehicle photos, partner uploads, inspection evidence, receipts, and completion media will live here instead of being scattered across operational pages." items={["Vehicle gallery", "Inspection evidence", "Partner uploads", "Receipts & documents", "Completion photos", "Merchandising assets"]} />;
}
