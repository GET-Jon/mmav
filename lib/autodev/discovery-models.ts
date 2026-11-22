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
  const models = [model];
  // Providers may index a body-style derivative as its own model (e.g.
  // "Cayenne Coupe" or "Cayenne Turbo Coupe") rather than a Cayenne trim.
  // These are RETRIEVAL aliases only: returned cars still pass the same
  // independent identity, body and pricing-qualification checks.
  const bodyDerivative = normalizeText(trim).match(/\b(coupe|convertible|cabriolet|wagon|sedan)\b/)?.[1];
  if (bodyDerivative && !normalizedModelIncludesBody(model, bodyDerivative)) {
    const bodyLabel = bodyDerivative.charAt(0).toUpperCase() + bodyDerivative.slice(1);
    models.push(`${model} ${bodyLabel}`);
    const specificTrim = String(trim || "").trim();
    if (normalizeText(specificTrim) !== bodyDerivative &&
        normalizeText(specificTrim).length <= 28) {
      models.push(`${model} ${specificTrim}`);
    }
  }
  models.push(...providerAliases);
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

/**
 * When a provider indexes a derivative in model rather than trim, try the
 * remaining performance trim explicitly (Cayenne Coupe + Turbo). Retrieval
 * hints do not bypass independent body/trim identity qualification.
 */
export function buildBodyModelTrimSearch(
  model: string,
  trim: string,
): { model: string; trimFilter: string } | null {
  const normalized = normalizeText(trim);
  const body = normalized.match(/\b(coupe|convertible|cabriolet|wagon|sedan)\b/)?.[1];
  if (!body || normalizedModelIncludesBody(model, body)) return null;
  const performanceTrim = String(trim || "").replace(new RegExp(`\\b${body}\\b`, "ig"), "").trim();
  if (!performanceTrim || normalizeText(performanceTrim) === "base") return null;
  return {
    model: `${model} ${body.charAt(0).toUpperCase() + body.slice(1)}`,
    trimFilter: performanceTrim,
  };
}

/**
 * Discovery stop gate, deliberately stricter than provider auto-selection.
 * An auto-selected Supporting vehicle is useful context, not a close pricing
 * peer. This only decides whether to keep searching; calculateCompSummary
 * remains authoritative for actual acquisition readiness.
 */
export function countCloseDiscoveryCandidates(
  comps: Array<{
    included?: boolean;
    equivalenceTier?: string | null;
    qualityScore?: number | null;
    year?: number | null;
    mileage?: number | null;
  }>,
  targetYear: number,
  targetMileage: number,
): number {
  if (!Number.isFinite(targetYear) || !Number.isFinite(targetMileage) || targetMileage < 0) return 0;
  return comps.filter(comp =>
    comp.included === true &&
    comp.equivalenceTier === "direct" &&
    Number(comp.qualityScore) >= 75 &&
    Number.isFinite(comp.year) &&
    Math.abs(Number(comp.year) - targetYear) <= 1 &&
    Number.isFinite(comp.mileage) &&
    Math.abs(Number(comp.mileage) - targetMileage) <= 20000
  ).length;
}
