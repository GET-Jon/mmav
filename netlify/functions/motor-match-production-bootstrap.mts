// Production Motor Match bootstrap runner.
// Runs only on this dedicated Netlify branch deploy and resumes safely from persisted state.
import {
  getOrCreateMotorMatchBootstrapRun,
  runMotorMatchBootstrapBatch,
} from "../../lib/motor-match/bootstrap";

export default {
  async deploySucceeded() {
    const context = String(process.env.CONTEXT || "");
    const branch = String(process.env.BRANCH || "");

    if (
      context !== "branch-deploy" ||
      branch !== "motor-match-production-bootstrap-run"
    ) {
      return;
    }

    const run = await getOrCreateMotorMatchBootstrapRun();

    while (true) {
      const result = await runMotorMatchBootstrapBatch({
        runId: run.id,
        maxCalls: 10,
      });

      if (result.coreComplete) {
        console.log(
          "Motor Match production bootstrap complete",
          JSON.stringify({
            runId: result.run.id,
            callsUsed: result.run.calls_used,
            observationsStored: result.run.observations_stored,
          }),
        );
        return;
      }

      if (Number(result.run.calls_used || 0) >= 275) {
        console.log(
          "Motor Match production bootstrap reached core budget",
          JSON.stringify({
            runId: result.run.id,
            callsUsed: result.run.calls_used,
            observationsStored: result.run.observations_stored,
          }),
        );
        return;
      }
    }
  },
};
