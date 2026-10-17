import {
  getOrCreateMotorMatchBootstrapRun,
  runMotorMatchBootstrapBatch,
} from "../../lib/motor-match/bootstrap";

export default async (request: Request) => {
  const expected = process.env.MOTOR_MATCH_BOOTSTRAP_RUN_TOKEN || "";
  const provided = request.headers.get("x-motor-match-bootstrap-token") || "";

  if (!expected || provided !== expected) {
    return new Response("Unauthorized", { status: 401 });
  }

  const run = await getOrCreateMotorMatchBootstrapRun();

  while (Number(run.calls_used || 0) < 275) {
    const result = await runMotorMatchBootstrapBatch({
      runId: run.id,
      maxCalls: 10,
    });

    Object.assign(run, result.run);

    if (result.coreComplete) break;
  }

  return new Response(null, { status: 204 });
};

export const config = {
  background: true,
};
