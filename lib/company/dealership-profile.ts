import type { SupabaseClient } from "@supabase/supabase-js";
import { lookup } from "zipcodes";
import { defaultAssumptions, normalizeAssumptions } from "@/lib/assumptions";
import { buildExpansionMarkets } from "@/lib/marketcheck/metro-expansion";

export type DealershipProfile = { zip: string; websiteUrl: string };

export function readDealershipProfile(value: unknown): DealershipProfile {
  const profile = (value || {}) as Partial<DealershipProfile>;
  return { zip: String(profile.zip || ""), websiteUrl: String(profile.websiteUrl || "") };
}

export function validateDealershipProfile(zipInput: unknown, websiteInput: unknown): DealershipProfile {
  const zip = String(zipInput || "").trim();
  const location = /^\d{5}$/.test(zip) ? lookup(zip) : undefined;
  if (!location || location.country !== "US") {
    throw new Error("Enter a valid 5-digit US dealership ZIP code.");
  }
  let websiteUrl = String(websiteInput || "").trim();
  if (websiteUrl) {
    try {
      const url = new URL(/^https?:\/\//i.test(websiteUrl) ? websiteUrl : `https://${websiteUrl}`);
      if (!['https:', 'http:'].includes(url.protocol) || !url.hostname.includes('.') || url.username || url.password) throw new Error();
      websiteUrl = url.toString();
    } catch {
      throw new Error("Enter a valid dealership website URL, or leave it blank.");
    }
  }
  return { zip, websiteUrl };
}

export function dealershipMarkets(zip: string) {
  const location = lookup(zip);
  if (!location) throw new Error("Dealership ZIP code could not be located.");
  const home = {
    market: `${location.city}, ${location.state}`,
    zip, order: 1, enabled: true,
    latitude: location.latitude, longitude: location.longitude,
  };
  return buildExpansionMarkets([home], [home.zip], [home.market]).slice(0, 10).map((market, index) => ({ ...market, order: index + 1 }));
}

export async function loadCompanyAssumptions(admin: SupabaseClient, companyId: string, companySlug: string) {
  const { data, error } = await admin.from("company_assumptions").select("assumptions").eq("company_id", companyId).maybeSingle();
  if (error) throw new Error(error.message);
  let raw = data?.assumptions;
  if (!raw && companySlug === "mindful-motor-co") {
    const { data: legacy, error: legacyError } = await admin.from("app_settings").select("payload").eq("key", "underwriting_assumptions").maybeSingle();
    if (legacyError) throw new Error(legacyError.message);
    raw = legacy?.payload;
  }
  const profile = readDealershipProfile(raw?.dealershipProfile);
  const assumptions = raw ? normalizeAssumptions(raw) : { ...defaultAssumptions };
  // Public customers must never silently inherit Mindful's Charleston markets.
  if (companySlug !== "mindful-motor-co" && !raw?.regionalMarkets?.length) assumptions.regionalMarkets = [];
  return { assumptions, profile, raw: raw || {}, source: raw ? "saved" : "default" };
}

export async function saveDealershipProfile(admin: SupabaseClient, companyId: string, userId: string, profile: DealershipProfile, companySlug = "") {
  const existing = await loadCompanyAssumptions(admin, companyId, companySlug);
  const markets = existing.profile.zip === profile.zip && existing.assumptions.regionalMarkets.length
    ? existing.assumptions.regionalMarkets : dealershipMarkets(profile.zip);
  const { error } = await admin.from("company_assumptions").upsert({
    company_id: companyId,
    assumptions: { ...existing.assumptions, ...existing.raw, regionalMarkets: markets, dealershipProfile: profile },
    updated_by: userId,
    updated_at: new Date().toISOString(),
  }, { onConflict: "company_id" });
  if (error) throw new Error(error.message);
}
