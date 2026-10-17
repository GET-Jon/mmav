// One-shot production Motor Match bootstrap runner.
// This file is removed after the initial 275-call market build completes.
import {
  getOrCreateMotorMatchBootstrapRun,
  runMotorMatchBootstrapBatch,
} from "../../lib/motor-match/bootstrap";

export default {
  async deploySucceeded() {
    const run = await getOrCreateMotorMatchBootstrapRun();

    while (Number(run.calls_used || 0) < 275) {
      const result = await runMotorMatchBootstrapBatch({
        runId: run.id,
        maxCalls: 10,
      });

      Object.assign(run, result.run);

      if (result.coreComplete) return;
    }
  },
};
