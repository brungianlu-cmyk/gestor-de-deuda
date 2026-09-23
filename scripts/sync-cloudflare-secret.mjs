import { spawn } from "node:child_process";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("../", import.meta.url));
const source = readFileSync(new URL("../.env.local", import.meta.url), "utf8");
const line = source.split(/\r?\n/).find((entry) => /^\s*OPENAI_API_KEY\s*=/.test(entry));
const key = line?.split("=").slice(1).join("=").trim().replace(/^(['"])(.*)\1$/, "$2");
if (!key?.startsWith("sk-")) {
  throw new Error("No se encontró OPENAI_API_KEY en .env.local.");
}

const cli = fileURLToPath(new URL("../node_modules/wrangler/bin/wrangler.js", import.meta.url));
const child = spawn(process.execPath, [cli, "secret", "put", "OPENAI_API_KEY"], {
  cwd: root,
  env: {
    ...process.env,
    WRANGLER_SEND_METRICS: "false",
    WRANGLER_LOG_PATH: fileURLToPath(new URL("../.wrangler/logs", import.meta.url)),
  },
  stdio: ["pipe", "inherit", "inherit"],
});
child.stdin.end(`${key}\n`);
child.on("error", (error) => { throw error; });
child.on("exit", (code) => { process.exitCode = code ?? 1; });
