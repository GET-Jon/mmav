// One-shot production Motor Match bootstrap trigger.
// This file is removed after the initial 275-call market build completes.
export default {
  async deploySucceeded() {
    const token = process.env.MOTOR_MATCH_BOOTSTRAP_RUN_TOKEN || "";
    if (!token) return;

    await fetch(
      "https://yourlotlogic.com/.netlify/functions/motor-match-bootstrap-background",
      {
        method: "POST",
        headers: {
          "x-motor-match-bootstrap-token": token,
        },
      },
    );
  },
};
