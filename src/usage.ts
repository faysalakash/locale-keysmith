import { readFileSync } from "node:fs";
import fg from "fast-glob";
import { loadConfig } from "./config.js";

const usagePatterns = [
  /\b(?:t|i18n\.t|\$t)\(\s*["'`]([^"'`]+)["'`]/g,
  /\b(?:Trans|Translation)\s+[^>]*i18nKey=["'`]([^"'`]+)["'`]/g
];

export async function findUsedKeys(cwd = process.cwd()): Promise<Set<string>> {
  const config = loadConfig(cwd);
  const files = await fg(config.src, {
    cwd,
    absolute: true,
    ignore: ["**/node_modules/**", "**/dist/**", "**/.next/**"]
  });
  const used = new Set<string>();

  for (const file of files) {
    const content = readFileSync(file, "utf8");

    for (const pattern of usagePatterns) {
      for (const match of content.matchAll(pattern)) {
        if (match[1]) used.add(match[1]);
      }
    }
  }

  return used;
}
