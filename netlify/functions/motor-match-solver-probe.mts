export default {
  async deploySucceeded() {
    const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
    if (!url || !key) return;

    const response = await fetch(
      "https://deploy-preview-21--mmav.netlify.app/api/motor_match",
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          make: "BMW",
          model: "3 Series",
          trim: "",
          year: 2021,
          budget: 19500,
          mileage: 60000,
          zip: "",
          distance: 500,
        }),
      },
    );

    const result = await response.json().catch(() => null);

    await fetch(`${url}/rest/v1/motor_match_probe_results`, {
      method: "POST",
      headers: {
        apikey: key,
        Authorization: `Bearer ${key}`,
        "Content-Type": "application/json",
        Prefer: "return=minimal",
      },
      body: JSON.stringify({
        configured: true,
        status: `route-${response.status}`,
        row_count:
          typeof result?.sampleSize === "number" ? result.sampleSize : null,
        error: JSON.stringify({
          state: result?.state ?? null,
          confidence: result?.confidence ?? null,
          raw: result?.rawSampleSize ?? null,
          clean: result?.sampleSize ?? null,
          generation: result?.generation ?? null,
          value: result?.summary?.marketCenter ?? null,
          low: result?.summary?.marketLow ?? null,
          high: result?.summary?.marketHigh ?? null,
          priceNeeded: result?.market?.priceNeeded ?? null,
          priceMatches: result?.market?.priceMatchCount ?? null,
          mileageNeeded: result?.market?.mileageNeeded ?? null,
          mileageMatches: result?.market?.mileageMatchCount ?? null,
          yearNeeded: result?.market?.yearNeeded ?? null,
          yearMatches: result?.market?.yearMatchCount ?? null,
          apiCalls: result?.apiUsage?.callsThisUpdate ?? null,
          source: result?.marketScope ?? null,
          error: result?.error ?? null,
        }),
      }),
    });
  },
};
