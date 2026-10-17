export default {
  async deploySucceeded() {
    const token = process.env.MOTOR_MATCH_BOOTSTRAP_TEST_TOKEN;
    if (!token) throw new Error("Missing MOTOR_MATCH_BOOTSTRAP_TEST_TOKEN.");

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
    if (!response.ok) {
      throw new Error(
        `Motor Match bootstrap smoke test failed: ${response.status} ${body}`,
      );
    }

    console.log("Motor Match bootstrap smoke test:", body);
  },
};
