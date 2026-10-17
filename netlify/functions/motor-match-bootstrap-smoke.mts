// Preview-only bootstrap smoke runner.
export default {
  async deploySucceeded() {
    const token = process.env.MOTOR_MATCH_BOOTSTRAP_SMOKE_TOKEN;
    console.log("bootstrap-smoke token-present", Boolean(token));
    if (!token) return;

    try {
      const response = await fetch(
        "https://deploy-preview-20--mmav.netlify.app/api/admin/motor-match/bootstrap",
        {
          method: "GET",
          headers: {
            "x-motor-match-bootstrap-token": token,
            Accept: "application/json",
          },
        },
      );

      const body = await response.text();
      console.log("bootstrap-smoke response", response.status, body);
    } catch (error) {
      console.log(
        "bootstrap-smoke fetch-error",
        error instanceof Error ? error.message : String(error),
      );
    }
  },
};
