async function saveProbe(result: { configured: boolean; status: string; row_count: number | null; error: string | null }) {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) return;
  await fetch(`${url}/rest/v1/motor_match_probe_results`, {
    method: "POST",
    headers: {
      apikey: key,
      Authorization: `Bearer ${key}`,
      "Content-Type": "application/json",
      Prefer: "return=minimal",
    },
    body: JSON.stringify(result),
  });
}

export default {
  async deploySucceeded() {
    const url = process.env.MOTOR_MATCH_PROD_DB_URL;
    const key = process.env.MOTOR_MATCH_PROD_DB_ANON_KEY;
    const token = process.env.MOTOR_MATCH_PROD_DB_TEST_TOKEN;

    if (!url || !key || !token) {
      await saveProbe({
        configured: false,
        status: "missing_env",
        row_count: null,
        error: [!url ? "url" : "", !key ? "key" : "", !token ? "token" : ""].filter(Boolean).join(","),
      });
      return;
    }

    try {
      const response = await fetch(`${url}/rest/v1/rpc/motor_match_test_rows`, {
        method: "POST",
        headers: {
          apikey: key,
          Authorization: `Bearer ${key}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          p_token: token,
          p_make: "BMW",
          p_model: "3 Series",
          p_year_min: 2019,
          p_year_max: 2026,
          p_trim: null,
          p_max_price: null,
          p_max_miles: null,
        }),
      });

      const payload = await response.json().catch(() => null);
      await saveProbe({
        configured: true,
        status: String(response.status),
        row_count: Array.isArray(payload) ? payload.length : null,
        error: response.ok ? null : String(payload?.message || payload?.error || "unknown"),
      });
    } catch (error) {
      await saveProbe({
        configured: true,
        status: "fetch_error",
        row_count: null,
        error: error instanceof Error ? error.message : String(error),
      });
    }
  },
};
