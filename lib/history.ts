export type HistoryRun = {
  id: string;
  createdAt: string;
  completedAt?: string;
  fileName: string;
  fileSize: number;
  pdfSha256: string;
  status: "processing" | "completed" | "failed" | "cancelled";
  caseCount?: number;
  aiUsed?: boolean;
  aiError?: string;
  warnings?: string[];
  error?: string;
  storageId?: string;
};

export type HistoryCall = {
  id: string;
  runId: string;
  index: number;
  createdAt: string;
  completedAt?: string;
  mode: "records" | "pages";
  status: "processing" | "completed" | "failed";
  request: unknown;
  responseText?: string;
  result?: unknown;
  corrected?: number;
  errorCode?: string;
  storageId?: string;
};

const runIdPattern = /^\d{13}-[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
export const historyOwner = "account";

export function sameOrigin(request: Request): boolean {
  const origin = request.headers.get("origin");
  return !origin || origin === new URL(request.url).origin;
}

export function validRunId(value: unknown): value is string {
  return typeof value === "string" && runIdPattern.test(value);
}

export function newRunId(): string {
  const reverseTime = String(9_999_999_999_999 - Date.now()).padStart(13, "0");
  return `${reverseTime}-${crypto.randomUUID()}`;
}

export async function readLimitedBytes(request: Request, maxBytes: number): Promise<Uint8Array> {
  if (!request.body) return new Uint8Array();
  const reader = request.body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      total += value.byteLength;
      if (total > maxBytes) throw new Error("payload_too_large");
      chunks.push(value);
    }
  } finally {
    await reader.cancel().catch(() => undefined);
    reader.releaseLock();
  }
  const bytes = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return bytes;
}

export function historyError(error: unknown): Response {
  if (error instanceof Error && error.message === "history_not_configured") {
    return Response.json({ error: "El archivo de llamadas todavía no está conectado a Google Drive." }, { status: 503 });
  }
  if (error instanceof Error && error.message === "payload_too_large") {
    return Response.json({ error: "El archivo o resultado supera el tamaño permitido." }, { status: 413 });
  }
  console.error("history_storage_error", error);
  return Response.json({ error: "No se pudo archivar el procesamiento." }, { status: 503 });
}
