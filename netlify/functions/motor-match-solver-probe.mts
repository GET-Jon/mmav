import { solveMotorMatch, type MotorMatchListing } from "../../lib/motor-match/solver";

export default {
  async deploySucceeded() {
    const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
    if (!url || !key) return;

    const headers = {
      apikey: key,
      Authorization: `Bearer ${key}`,
      "Content-Type": "application/json",
    };

    const query = new URLSearchParams({
      select: "year,make,model,trim,price,miles",
      bucket_make: "eq.BMW",
      bucket_model: "eq.3 Series",
      year: "gte.2019",
      order: "year.asc",
      limit: "500",
    });

    const response = await fetch(
      `${url}/rest/v1/motor_match_market_observations?${query.toString()}&year=lte.2026`,
      { headers },
    );
    const payload = await response.json().catch(() => []);
    const listings: MotorMatchListing[] = (Array.isArray(payload) ? payload : []).map((row: any) => ({
      vin: null,
      year: Number(row.year) || null,
      make: row.make || null,
      model: row.model || null,
      trim: row.trim || null,
      price: Number(row.price) || null,
      miles: Number(row.miles) || null,
      dealer: null,
      city: null,
      state: null,
      url: null,
    }));

    const result = solveMotorMatch({
      listings,
      budget: 19500,
      mileage: 60000,
      targetYear: 2021,
      generationStartYear: 2019,
    });

    await fetch(`${url}/rest/v1/motor_match_probe_results`, {
      method: "POST",
      headers: { ...headers, Prefer: "return=minimal" },
      body: JSON.stringify({
        configured: true,
        status: `${result.state}/${result.confidence}`,
        row_count: result.summary.sampleSize,
        error: JSON.stringify({
          raw: listings.length,
          matches: result.matchCount,
          value: result.summary.marketCenter,
          low: result.summary.marketLow,
          high: result.summary.marketHigh,
          priceNeeded: result.market.priceNeeded,
          priceMatches: result.market.priceMatchCount,
          mileageNeeded: result.market.mileageNeeded,
          mileageMatches: result.market.mileageMatchCount,
          yearNeeded: result.market.yearNeeded,
          yearMatches: result.market.yearMatchCount,
        }),
      }),
    });
  },
};
