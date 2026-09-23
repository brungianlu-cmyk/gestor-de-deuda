import vinext from "vinext";
import { readFileSync } from "node:fs";
import { defineConfig } from "vite";

function localEnvValue(name: string): string | undefined {
  try {
    const line = readFileSync(new URL("./.env.local", import.meta.url), "utf8")
      .split(/\r?\n/).find((entry) => entry.trimStart().startsWith(`${name}=`));
    return line?.split("=").slice(1).join("=").trim().replace(/^(['"])(.*)\1$/, "$2");
  } catch (error) {
    if (error && typeof error === "object" && "code" in error && error.code === "ENOENT") return undefined;
    throw error;
  }
}

export default defineConfig(async ({ command }) => {
  // The API key is injected only into the local Worker. Production reads the
  // OPENAI_API_KEY secret configured in Cloudflare, never from the build.
  const localVars: Record<string, string> = {};
  if (command === "serve") {
    const apiKey = localEnvValue("OPENAI_API_KEY") || process.env.OPENAI_API_KEY;
    const model = localEnvValue("OPENAI_MODEL") || process.env.OPENAI_MODEL || "gpt-6-luna";
    if (apiKey) localVars.OPENAI_API_KEY = apiKey;
    localVars.OPENAI_MODEL = model;
  }

  const { cloudflare } = await import("@cloudflare/vite-plugin");
  return {
    plugins: [
      vinext(),
      cloudflare({
        viteEnvironment: { name: "rsc", childEnvironments: ["ssr"] },
        inspectorPort: false,
        ...(command === "serve" ? { config: { vars: localVars } } : {}),
      }),
    ],
  };
});
