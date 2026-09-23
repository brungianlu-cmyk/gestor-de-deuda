import { spawnSync } from "node:child_process";
import { rmSync } from "node:fs";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("../", import.meta.url));
const cli = fileURLToPath(new URL("../node_modules/vinext/dist/cli.js", import.meta.url));
const localSecretCopy = fileURLToPath(new URL("../dist/server/.dev.vars", import.meta.url));

try {
  const result = spawnSync(process.execPath, [cli, "build", ...process.argv.slice(2)], {
    cwd: root,
    stdio: "inherit",
  });
  if (result.error) throw result.error;
  process.exitCode = result.status ?? 1;
} finally {
  // The Cloudflare Vite plugin writes this local preview file when .env.local
  // exists. Remove it so the finished build contains no copy of the API key.
  rmSync(localSecretCopy, { force: true });
}
