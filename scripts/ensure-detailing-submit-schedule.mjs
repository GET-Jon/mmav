import { readFileSync, writeFileSync } from "node:fs";

const path = "components/mindful-inventory/inventory-detailing.tsx";
const source = readFileSync(path, "utf8");

const from = '      setMessage("Detailing submitted.");\n      setEditing(null);\n      router.refresh();';
const to = '      setMessage("Detailing submitted.");\n      setEditing(null);\n      router.push("/mindful/inventory/schedule");';

if (source.includes(to)) {
  console.log("Detailing Submit already routes to Schedule.");
} else if (source.includes(from)) {
  writeFileSync(path, source.replace(from, to), "utf8");
  console.log("Routed Owner Detailing Submit to Schedule.");
} else {
  console.log("Detailing Submit routing marker not found; leaving source unchanged.");
}
