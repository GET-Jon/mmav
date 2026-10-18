export default {
  async deploySucceeded() {
    const url = Netlify.env.get("MOTOR_MATCH_PROD_DB_URL");
    const key = Netlify.env.get("MOTOR_MATCH_PROD_DB_ANON_KEY");
    const token = Netlify.env.get("MOTOR_MATCH_PROD_DB_TEST_TOKEN");

    if (!url || !key || !token) {
      console.log("motor-match-db-probe", JSON.stringify({
        configured: false,
        url: Boolean(url),
        key: Boolean(key),
        token: Boolean(token),
      }));
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
      console.log("motor-match-db-probe", JSON.stringify({
        configured: true,
        status: response.status,
        rows: Array.isArray(payload) ? payload.length : null,
        error: response.ok ? null : (payload?.message || payload?.error || "unknown"),
      }));
    } catch (error) {
      console.log("motor-match-db-probe", JSON.stringify({
        configured: true,
        status: "fetch_error",
        error: error instanceof Error ? error.message : String(error),
      }));
    }
  },
};
