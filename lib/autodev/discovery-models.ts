function normalizeText(value: unknown) { return String(value || "").trim().toLowerCase().replace(/[^a-z0-9]+/g, " ").trim(); }
function uniqueStrings(values: Array<string | null | undefined>) {
  const seen = new Set<string>();
  return values.map(value => String(value || "").trim()).filter(value => {
    const key = value.toLowerCase().replace(/[^a-z0-9]/g, "");
    if (!key || seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

export function buildDiscoveryModels(
  make: string,
  model: string,
  trim: string,
  providerAliases: string[] = [],
) {
  const models = [model, ...providerAliases];
  const normalizedMake = normalizeText(make);
  const normalizedModel = normalizeText(model);
  const normalizedTrim = normalizeText(trim);
  if (normalizedMake.includes("mercedes")) {
    const eqBadge = normalizedTrim.match(/\b(eq[a-z]*\d*)/i)?.[1] || normalizedModel.match(/\b(eq[a-z]*)/i)?.[1];
    if (eqBadge) {
      const family = eqBadge.replace(/\d+$/g, "").toUpperCase();
      models.push(family);
      if (normalizedModel.includes("suv")) models.push(`${family} SUV`);
    }
    const withoutClass = model.replace(/[-\s]*class\b/gi, "").replace(/\s+/g, " ").trim();
    if (withoutClass && withoutClass !== model) models.push(withoutClass);
  }
  return uniqueStrings(models).slice(0, 4);
}

