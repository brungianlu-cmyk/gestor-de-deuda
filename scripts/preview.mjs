import { spawn } from "node:child_process";
import { readFileSync, rmSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("../", import.meta.url));
const vite = fileURLToPath(new URL("../node_modules/vite/bin/vite.js", import.meta.url));
const localVars = fileURLToPath(new URL("../dist/server/.dev.vars", import.meta.url));

let key;
try {
    const source = readFileSync(new URL("../.env.local", import.meta.url), "utf8");
    const line = source.split(/\r?\n/).find((entry) => /^\s*OPENAI_API_KEY\s*=/.test(entry));
    key = line?.split("=").slice(1).join("=").trim().replace(/^(['"])(.*)\1$/, "$2");
} catch (error) {
  if (error?.code !== "ENOENT") throw error;
}
key ||= process.env.OPENAI_API_KEY;
if (key) {
  if (!/^sk-[A-Za-z0-9_-]+$/.test(key)) throw new Error("OPENAI_API_KEY tiene un formato local no admitido.");
  writeFileSync(localVars, `OPENAI_API_KEY=${key}\n`, { mode: 0o600 });
}

const child = spawn(process.execPath, [vite, "preview", "--host", "127.0.0.1", ...process.argv.slice(2)], {
  cwd: root,
  env: { ...process.env, ...(key ? { OPENAI_API_KEY: key } : {}) },
  stdio: "inherit",
});
const cleanup = () => rmSync(localVars, { force: true });
process.on("exit", cleanup);
process.on("SIGINT", () => { cleanup(); child.kill("SIGINT"); });
process.on("SIGTERM", () => { cleanup(); child.kill("SIGTERM"); });
child.on("error", (error) => { cleanup(); throw error; });
child.on("exit", (code) => { cleanup(); process.exitCode = code ?? 1; });
