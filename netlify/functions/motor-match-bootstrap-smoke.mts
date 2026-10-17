// Preview-only bootstrap smoke runner.
import {
  getOrCreateMotorMatchBootstrapRun,
  runMotorMatchBootstrapBatch,
} from "../../lib/motor-match/bootstrap";

export default {
  async deploySucceeded() {
    const run = await getOrCreateMotorMatchBootstrapRun();
    if (Number(run.calls_used || 0) > 0) return;
    await runMotorMatchBootstrapBatch({ runId: run.id, maxCalls: 3 });
  },
};
