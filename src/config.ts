import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import type { LocaleLintConfig } from "./types.js";

const defaultConfig: LocaleLintConfig = {
  sourceLocale: "en",
  translationFiles: [
    "**/locales/**/*.{json,yml,yaml}",
    "**/i18n/**/*.{json,yml,yaml}",
    "**/translations/**/*.{json,yml,yaml}"
  ],
  src: ["src/**/*.{ts,tsx,js,jsx,vue,svelte}"],
  ignoreKeys: []
};

export function loadConfig(cwd = process.cwd()): LocaleLintConfig {
  const path = join(cwd, "locale-keysmith.config.json");
  if (!existsSync(path)) return defaultConfig;

  const userConfig = JSON.parse(readFileSync(path, "utf8")) as Partial<LocaleLintConfig>;

  return {
    sourceLocale: userConfig.sourceLocale ?? defaultConfig.sourceLocale,
    translationFiles: userConfig.translationFiles ?? defaultConfig.translationFiles,
    src: userConfig.src ?? defaultConfig.src,
    ignoreKeys: userConfig.ignoreKeys ?? defaultConfig.ignoreKeys
  };
}
