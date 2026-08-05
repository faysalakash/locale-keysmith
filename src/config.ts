import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import type { LocaleLintConfig } from "@/types";

export const CONFIG_FILENAME = "locale-keysmith.config.json";

export const LOCALE_EXTENSIONS = ["json", "yml", "yaml"];

export const SOURCE_EXTENSIONS = ["ts", "tsx", "js", "jsx", "mjs", "cjs", "vue", "svelte"];

const DEFAULT_ROOTS = ["src"];

function rootGlob(root: string, extensions: string[]): string {
  const clean = root.replace(/^\.\/+/, "").replace(/\/+$/, "");
  const prefix = clean === "" || clean === "." ? "" : `${clean}/`;

  return `${prefix}**/*.{${extensions.join(",")}}`;
}

export function loadConfig(cwd = process.cwd()): LocaleLintConfig {
  const userConfig = readUserConfig(join(cwd, CONFIG_FILENAME));
  const roots = userConfig.roots ?? DEFAULT_ROOTS;

  return structuredClone({
    sourceLocale: userConfig.sourceLocale ?? "en",
    roots,
    translationFiles: userConfig.translationFiles ?? roots.map((root) => rootGlob(root, LOCALE_EXTENSIONS)),
    src: userConfig.src ?? roots.map((root) => rootGlob(root, SOURCE_EXTENSIONS)),
    ignoreKeys: userConfig.ignoreKeys ?? []
  });
}

function readUserConfig(path: string): Partial<LocaleLintConfig> {
  if (!existsSync(path)) {
    return {};
  }

  try {
    return JSON.parse(readFileSync(path, "utf8")) as Partial<LocaleLintConfig>;
  } catch (error) {
    const detail = error instanceof Error ? error.message : String(error);
    throw new Error(`Failed to parse ${CONFIG_FILENAME}: ${detail}`, { cause: error });
  }
}
