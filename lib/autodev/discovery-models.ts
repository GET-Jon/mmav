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

function normalizedModelIncludesBody(model: string, body: string) {
  return normalizeText(model).split(" ").includes(body);
}

export function buildDiscoveryModels(
  make: string,
  model: string,
  trim: string,
  providerAliases: string[] = [],
) {
  const models = [model, ...providerAliases];
  // Providers may index a body-style derivative as its own model (e.g.
  // "Cayenne Coupe" or "Cayenne Turbo Coupe") rather than a Cayenne trim.
  // These are RETRIEVAL aliases only: returned cars still pass the same
  // independent identity, body and pricing-qualification checks.
  const bodyDerivative = normalizeText(trim).match(/\\b(coupe|convertible|cabriolet|wagon|sedan)\\b/)?.[1];
  if (bodyDerivative && !normalizedModelIncludesBody(model, bodyDerivative)) {
    models.push(`${model} ${bodyDerivative}`);
    const specificTrim = String(trim || "").trim();
    if (normalizeText(specificTrim) !== bodyDerivative &&
        normalizeText(specificTrim).length <= 28) {
      models.push(`${model} ${specificTrim}`);
    }
  }
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
  return uniqueStrings(models).slice(0, 5);
}


/**
 * Search rare, high-value Mercedes derivatives before paging through a broad
 * S-Class model population. This is a provider retrieval hint, NOT evidence
 * that a returned listing qualifies for pricing.
 *
 * Auto.dev documents vehicle.trim as a comma-separated OR filter.
 * The unfiltered model attempts must always remain available as fallback.
 */
export function buildDiscoveryTrimFilter(make: string, model: string, trim: string): string | null {
  const normalizedMake = normalizeText(make);
  const normalizedModel = normalizeText(model);
  const compactTrim = normalizeText([model, trim].join(" ")).replace(/\s+/g, "");
  // Preserve the proven S63/S65 aliases, then use the same focused-first
  // strategy for any manufacturer with a specific, unambiguous trim.
  if (normalizedMake.includes("mercedes") && /(?:s class|s ?63|s ?65)/.test(normalizedModel)) {
    const derivative = compactTrim.includes("s63") ? "63" : compactTrim.includes("s65") ? "65" : null;
    if (derivative) {
      return [
        `AMG S${derivative}`,
        `S ${derivative} AMG 4MATIC`,
        `S${derivative} AMG`,
        `S ${derivative} AMG`,
        `AMG S ${derivative}`,
      ].join(",");
    }
  }

  const proposed = String(trim || "").trim();
  const normalized = normalizeText(proposed);
  const compactProposed = normalized.replace(/[^a-z0-9]/g, "");
  const compactModel = normalizedModel.replace(/[^a-z0-9]/g, "");
  // Avoid extra calls for absent, ambiguous or purely drivetrain labels.
  if (!normalized || compactProposed.length < 3 ||
      compactProposed === compactModel ||
      /^(base|standard|unknown|other|all|unspecified|awd|4wd|fwd|rwd|quattro|xdrive|4matic)$/.test(compactProposed) ||
      /[,;/|]/.test(proposed) || normalized.split(" ").length > 5) return null;

  // Retrieval hint only: the provider may use a different trim spelling.
  // A broad model query always follows if the focused search is insufficient.
  return proposed;
}
