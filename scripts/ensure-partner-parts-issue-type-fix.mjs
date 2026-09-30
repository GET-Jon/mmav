import { readFileSync, writeFileSync } from "node:fs";

const path = "lib/mindful-inventory/active-work.ts";
let source = readFileSync(path, "utf8");
const original = source;

// Harden Partner-parts lifecycle fields against source-shape changes made by earlier prebuild patches.
if (!source.includes("partnerPartsConfirmationStatus: string | null;")) {
  source = source.replace(
    "  partnerEstimateStatus: string | null;",
    "  partnerEstimateStatus: string | null;\n  partnerPartsConfirmationStatus: string | null;\n  partnerPartsNote: string | null;",
  );
}

if (!source.includes("partner_parts_confirmation_status")) {
  source = source.replace(
    "partner_confirmation_status,partner_estimate_status,",
    "partner_confirmation_status,partner_estimate_status,partner_parts_confirmation_status,partner_parts_note,",
  );
}

if (!source.includes("partnerPartsConfirmationStatus: row.partner_parts_confirmation_status")) {
  source = source.replace(
    "      partnerEstimateStatus: row.partner_estimate_status || null,",
    "      partnerEstimateStatus: row.partner_estimate_status || null,\n      partnerPartsConfirmationStatus: row.partner_parts_confirmation_status || null,\n      partnerPartsNote: row.partner_parts_note || null,",
  );
}

if (source !== original) {
  writeFileSync(path, source, "utf8");
  console.log("Hardened Owner Active Work Partner-parts lifecycle fields.");
} else {
  console.log("Owner Active Work Partner-parts lifecycle fields already hardened.");
}
