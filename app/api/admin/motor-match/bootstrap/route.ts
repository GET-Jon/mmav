import { NextResponse } from "next/server";
import { getPlatformAdminAccess } from "@/lib/admin/platform-admin";
import {
  getOrCreateMotorMatchBootstrapRun,
  getMotorMatchBootstrapStatus,
  runMotorMatchBootstrapBatch,
} from "@/lib/motor-match/bootstrap";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  const access = await getPlatformAdminAccess();
  if (!access) {
    return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  }

  let body: any = {};
  try {
    body = await request.json();
  } catch {
    body = {};
  }

  const action = String(body.action || "status");

  try {
    if (action === "start") {
      const run = await getOrCreateMotorMatchBootstrapRun(
        body.cycleKey ? String(body.cycleKey) : undefined,
      );
      return NextResponse.json({
        ok: true,
        run,
        status: await getMotorMatchBootstrapStatus(run.id),
      });
    }

    if (action === "run") {
      const runId = String(body.runId || "").trim();
      if (!runId) {
        return NextResponse.json({ error: "runId is required." }, { status: 400 });
      }

      const maxCalls = Number(body.maxCalls || 5);
      const result = await runMotorMatchBootstrapBatch({ runId, maxCalls });
      return NextResponse.json({ ok: true, ...result });
    }

    if (action === "status") {
      const runId = String(body.runId || "").trim();
      if (!runId) {
        return NextResponse.json({ error: "runId is required." }, { status: 400 });
      }
      return NextResponse.json({
        ok: true,
        status: await getMotorMatchBootstrapStatus(runId),
      });
    }

    return NextResponse.json({ error: "Unknown action." }, { status: 400 });
  } catch (error) {
    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "Motor Match bootstrap request failed.",
      },
      { status: 500 },
    );
  }
}
