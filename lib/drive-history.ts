import { validRunId, type HistoryCall, type HistoryRun } from "./history";

type DriveFile = { id: string; name: string };
type DrivePage = { files?: DriveFile[]; nextPageToken?: string };
type FileKind = "run" | "result";

const api = "https://www.googleapis.com/drive/v3/files";
const uploadApi = "https://www.googleapis.com/upload/drive/v3/files";
const rootName = "Estructura Jurídica - Historial";
const appId = "estructura-juridica-history";
export type DriveCredentials = { clientId?: string; clientSecret?: string; refreshToken?: string };

function property(key: string, value: string): string {
  // Values passed here are fixed strings or validated hex/UUID identifiers.
  return `appProperties has { key='${key}' and value='${value}' }`;
}

function fileQuery(owner: string, kind: FileKind, runId?: string): string {
  const parts = [property("app", appId), property("owner", owner), property("kind", kind), "trashed = false"];
  if (runId) parts.push(property("run", runId));
  return parts.join(" and ");
}

export class DriveHistory {
  private readonly runFolders = new Map<string, string>();
  private constructor(private readonly token: string, private readonly rootId: string,
    private readonly fetchImpl: typeof fetch) {}

  static async create({ clientId, clientSecret, refreshToken }: DriveCredentials,
    fetchImpl: typeof fetch = fetch): Promise<DriveHistory> {
    if (!clientId || !clientSecret || !refreshToken) throw new Error("history_not_configured");
    const tokenResponse = await fetchImpl("https://oauth2.googleapis.com/token", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({ client_id: clientId, client_secret: clientSecret,
        refresh_token: refreshToken, grant_type: "refresh_token" }),
      signal: AbortSignal.timeout(30000),
    });
    if (!tokenResponse.ok) throw new Error("google_token_failed");
    const tokenBody = await tokenResponse.json() as { access_token?: string };
    if (!tokenBody.access_token) throw new Error("google_token_failed");
    const bootstrap = new DriveHistory(tokenBody.access_token, "", fetchImpl);
    const rootQuery = [property("app", appId), property("kind", "root"),
      "mimeType = 'application/vnd.google-apps.folder'", "trashed = false"].join(" and ");
    const roots = await bootstrap.list(rootQuery, 1);
    const rootId = roots.files?.[0]?.id || await bootstrap.createMetadata({
      name: rootName,
      mimeType: "application/vnd.google-apps.folder",
      appProperties: { app: appId, kind: "root" },
    });
    return new DriveHistory(tokenBody.access_token, rootId, fetchImpl);
  }

  private async request(url: string, init: RequestInit = {}): Promise<Response> {
    const response = await this.fetchImpl(url, {
      ...init,
      headers: { Authorization: `Bearer ${this.token}`, ...init.headers },
      signal: init.signal || AbortSignal.timeout(120000),
    });
    if (!response.ok) throw new Error(`google_drive_${response.status}`);
    return response;
  }

  private async list(query: string, pageSize: number, pageToken?: string, orderBy?: string): Promise<DrivePage> {
    const params = new URLSearchParams({ q: query, pageSize: String(pageSize),
      fields: "nextPageToken,files(id,name)", spaces: "drive" });
    if (pageToken) params.set("pageToken", pageToken);
    if (orderBy) params.set("orderBy", orderBy);
    const response = await this.request(`${api}?${params}`);
    return await response.json() as DrivePage;
  }

  private async findOne(owner: string, kind: FileKind, runId: string): Promise<DriveFile | null> {
    const page = await this.list(fileQuery(owner, kind, runId), 1);
    return page.files?.[0] || null;
  }

  private async runFolder(owner: string, runId: string, fileName?: string): Promise<string> {
    const cached = this.runFolders.get(runId);
    if (cached) return cached;
    const query = [property("app", appId), property("owner", owner), property("kind", "folder"),
      property("run", runId), `'${this.rootId}' in parents`, "trashed = false"].join(" and ");
    const existing = (await this.list(query, 1)).files?.[0]?.id;
    const folderId = existing || await this.createMetadata({
      name: `${new Date().toISOString().slice(0, 10)} - ${fileName || runId}`,
      mimeType: "application/vnd.google-apps.folder",
      parents: [this.rootId],
      appProperties: { app: appId, owner, kind: "folder", run: runId },
    });
    this.runFolders.set(runId, folderId);
    return folderId;
  }

  private async createMetadata(metadata: Record<string, unknown>): Promise<string> {
    const response = await this.request(`${api}?fields=id`, {
      method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(metadata),
    });
    const file = await response.json() as { id?: string };
    if (!file.id) throw new Error("google_drive_missing_file_id");
    return file.id;
  }

  private async createFile(parentId: string, name: string, mimeType: string, content: Uint8Array | string,
    appProperties: Record<string, string>): Promise<string> {
    const boundary = `history-${crypto.randomUUID()}`;
    const metadata = { name, mimeType, parents: [parentId], appProperties: { app: appId, ...appProperties } };
    const bytes = typeof content === "string" ? new TextEncoder().encode(content) : content;
    const prefix = `--${boundary}\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n${JSON.stringify(metadata)}\r\n--${boundary}\r\nContent-Type: ${mimeType}\r\n\r\n`;
    const body = new Blob([prefix, bytes.buffer as ArrayBuffer, `\r\n--${boundary}--`]);
    const response = await this.request(`${uploadApi}?uploadType=multipart&fields=id`, {
      method: "POST", headers: { "Content-Type": `multipart/related; boundary=${boundary}` }, body,
    });
    const file = await response.json() as { id?: string };
    if (!file.id) throw new Error("google_drive_missing_file_id");
    return file.id;
  }

  private async updateFile(id: string, mimeType: string, content: string): Promise<void> {
    await this.request(`${uploadApi}/${encodeURIComponent(id)}?uploadType=media`, {
      method: "PATCH", headers: { "Content-Type": mimeType }, body: content,
    });
  }

  private async readFile(id: string): Promise<Response> {
    return await this.request(`${api}/${encodeURIComponent(id)}?alt=media`);
  }

  async deleteFile(id: string): Promise<void> {
    await this.request(`${api}/${encodeURIComponent(id)}`, { method: "DELETE" });
  }

  async getRun(owner: string, id: string): Promise<HistoryRun | null> {
    if (!validRunId(id)) return null;
    const file = await this.findOne(owner, "run", id);
    if (!file) return null;
    const response = await this.readFile(file.id);
    return { ...await response.json() as HistoryRun, storageId: file.id };
  }

  async putRun(owner: string, run: HistoryRun): Promise<void> {
    const content = JSON.stringify(run);
    if (run.storageId) await this.updateFile(run.storageId, "application/json", content);
    else run.storageId = await this.createFile(await this.runFolder(owner, run.id), "registro.json", "application/json", content,
      { owner, kind: "run", run: run.id });
  }

  async putPdf(owner: string, id: string, bytes: Uint8Array, fileName: string): Promise<string> {
    return await this.createFile(await this.runFolder(owner, id, fileName), fileName, "application/pdf", bytes,
      { owner, kind: "pdf", run: id });
  }

  async putResult(owner: string, id: string, text: string): Promise<void> {
    const existing = await this.findOne(owner, "result", id);
    if (existing) await this.updateFile(existing.id, "text/plain; charset=utf-8", text);
    else await this.createFile(await this.runFolder(owner, id), "resultado.txt", "text/plain", text,
      { owner, kind: "result", run: id });
  }

  async putCall(owner: string, call: HistoryCall): Promise<void> {
    const content = JSON.stringify(call);
    if (call.storageId) await this.updateFile(call.storageId, "application/json", content);
    else call.storageId = await this.createFile(
      await this.runFolder(owner, call.runId),
      `llamada-${String(call.index).padStart(5, "0")}-${call.id}.json`,
      "application/json", content,
      { owner, kind: "call", run: call.runId },
    );
  }
}
