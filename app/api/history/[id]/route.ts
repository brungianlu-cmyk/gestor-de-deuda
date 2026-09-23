import {
  historyError, historyOwner, readLimitedBytes, sameOrigin, validRunId,
} from "@/lib/history";
import { createDriveHistory } from "@/lib/drive-runtime";

export const runtime = "edge";

type RouteContext = { params: Promise<{ id: string }> };

export async function PATCH(request: Request, context: RouteContext) {
  if (!sameOrigin(request)) return Response.json({ error: "Origen no permitido." }, { status: 403 });
  const { id } = await context.params;
  if (!validRunId(id)) return Response.json({ error: "Registro no encontrado." }, { status: 404 });
  let payload: Record<string, unknown>;
  try { payload = JSON.parse(new TextDecoder().decode(await readLimitedBytes(request, 5 * 1024 * 1024))); }
  catch (error) { return error instanceof Error && error.message === "payload_too_large" ? historyError(error) : Response.json({ error: "Datos inválidos." }, { status: 400 }); }
  if (!["completed", "failed", "cancelled"].includes(String(payload.status))) {
    return Response.json({ error: "Estado inválido." }, { status: 400 });
  }
  if (payload.status === "completed" && (typeof payload.resultText !== "string" || !payload.resultText.trim())) {
    return Response.json({ error: "Falta el resultado." }, { status: 400 });
  }
  try {
    const storage = await createDriveHistory();
    const run = await storage.getRun(historyOwner, id);
    if (!run) return Response.json({ error: "Registro no encontrado." }, { status: 404 });
    if (run.status !== "processing") return Response.json({ error: "Este registro ya está cerrado." }, { status: 409 });
    const warnings = Array.isArray(payload.warnings) ? payload.warnings.filter((item): item is string => typeof item === "string" && item.length <= 500).slice(0, 20) : [];
    if (payload.status === "completed") {
      await storage.putResult(historyOwner, id, payload.resultText as string);
    }
    run.status = payload.status as typeof run.status;
    run.completedAt = new Date().toISOString();
    run.caseCount = Number.isInteger(payload.caseCount) && Number(payload.caseCount) >= 0 ? Number(payload.caseCount) : 0;
    run.aiUsed = payload.aiUsed === true;
    run.warnings = warnings;
    if (typeof payload.aiError === "string") run.aiError = payload.aiError.slice(0, 500);
    if (typeof payload.error === "string") run.error = payload.error.slice(0, 500);
    await storage.putRun(historyOwner, run);
    return Response.json({ ok: true });
  } catch (error) {
    return historyError(error);
  }
}
