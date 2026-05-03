import fg from "fast-glob";
import { loadConfig } from "./config.js";
import { readLocaleFile } from "./parser.js";
import type { LocaleFile } from "./types.js";

export async function findLocaleFiles(cwd = process.cwd()): Promise<string[]> {
  const config = loadConfig(cwd);
  return fg(config.translationFiles, {
    cwd,
    absolute: true,
    ignore: ["**/node_modules/**", "**/dist/**", "**/.next/**"]
  });
}

export async function loadLocaleFiles(cwd = process.cwd()): Promise<LocaleFile[]> {
  const paths = await findLocaleFiles(cwd);
  return paths.map(readLocaleFile);
}
