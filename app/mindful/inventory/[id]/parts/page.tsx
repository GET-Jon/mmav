import { InventorySectionPlaceholder } from "@/components/mindful-inventory/inventory-section-placeholder";

export default function InventoryPartsPage() {
  return <InventorySectionPlaceholder eyebrow="Logistics" title="Parts & Transport" description="Procurement and vehicle movement live together here so operational dependencies are visible without cluttering the Car Plan or Work pages." items={["Parts requests", "Orders & ETAs", "Received / installed", "Transport requests", "Booked / in transit", "Delivery confirmation"]} />;
}
