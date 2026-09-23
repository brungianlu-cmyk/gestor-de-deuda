import {
  historyError, historyOwner, newRunId, readLimitedBytes, sameOrigin, type HistoryRun,
} from "@/lib/history";
import { createDriveHistory } from "@/lib/drive-runtime";

export const runtime = "edge";

const maxPdfBytes = 20 * 1024 * 1024;

export async function POST(request: Request) {
  if (!sameOrigin(request)) return Response.json({ error: "Origen no permitido." }, { status: 403 });
  if (request.headers.get("content-type")?.split(";")[0] !== "application/pdf") {
    return Response.json({ error: "Adjuntá un archivo PDF." }, { status: 415 });
  }
  const encodedName = request.headers.get("x-file-name") || "";
  let fileName: string;
  try { fileName = decodeURIComponent(encodedName).trim(); }
  catch { return Response.json({ error: "Nombre de archivo inválido." }, { status: 400 }); }
  if (!fileName || fileName.length > 180 || !fileName.toLowerCase().endsWith(".pdf") || /[\\/\x00-\x1f]/.test(fileName)) {
    return Response.json({ error: "Nombre de archivo inválido." }, { status: 400 });
  }
  try {
    const bytes = await readLimitedBytes(request, maxPdfBytes);
    if (bytes.length < 5 || new TextDecoder().decode(bytes.subarray(0, 5)) !== "%PDF-") {
      return Response.json({ error: "El archivo no parece ser un PDF válido." }, { status: 400 });
    }
    const digest = await crypto.subtle.digest("SHA-256", bytes.buffer as ArrayBuffer);
    const pdfSha256 = [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, "0")).join("");
    const id = newRunId();
    const storage = await createDriveHistory();
    const pdfId = await storage.putPdf(historyOwner, id, bytes, fileName);
    const run: HistoryRun = {
      id, createdAt: new Date().toISOString(), fileName, fileSize: bytes.length,
      pdfSha256, status: "processing",
    };
    try { await storage.putRun(historyOwner, run); }
    catch (error) { await storage.deleteFile(pdfId).catch(() => undefined); throw error; }
    return Response.json({ id }, { status: 201 });
  } catch (error) {
    return historyError(error);
  }
}
