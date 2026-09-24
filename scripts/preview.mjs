import { spawn } from "node:child_process";
import { rmSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("../", import.meta.url));
const vite = fileURLToPath(new URL("../node_modules/vite/bin/vite.js", import.meta.url));
const localVars = fileURLToPath(new URL("../dist/server/.dev.vars", import.meta.url));

const names = ["OPENAI_API_KEY", "GOOGLE_DRIVE_CLIENT_ID", "GOOGLE_DRIVE_CLIENT_SECRET", "GOOGLE_DRIVE_REFRESH_TOKEN"];
const entries = names.flatMap((name) => {
  const value = process.env[name]?.trim();
  if (!value) return [];
  if (/[\r\n]/.test(value)) throw new Error(`${name} contiene un salto de línea no permitido.`);
  if (name === "OPENAI_API_KEY" && !/^sk-[A-Za-z0-9_-]+$/.test(value)) {
    throw new Error("OPENAI_API_KEY tiene un formato local no admitido.");
  }
  return [`${name}=${value}`];
});
if (entries.length) writeFileSync(localVars, `${entries.join("\n")}\n`, { mode: 0o600 });

const child = spawn(process.execPath, [vite, "preview", "--host", "127.0.0.1", ...process.argv.slice(2)], {
  cwd: root,
  env: process.env,
  stdio: "inherit",
});
const cleanup = () => rmSync(localVars, { force: true });
process.on("exit", cleanup);
process.on("SIGINT", () => { cleanup(); child.kill("SIGINT"); });
process.on("SIGTERM", () => { cleanup(); child.kill("SIGTERM"); });
child.on("error", (error) => { cleanup(); throw error; });
child.on("exit", (code) => { cleanup(); process.exitCode = code ?? 1; });
