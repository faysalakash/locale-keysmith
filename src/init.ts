import { existsSync, statSync } from "node:fs";
import { join, relative, sep } from "node:path";
import { CONFIG_FILENAME, LOCALE_EXTENSIONS } from "@/config";
import { globFiles } from "@/glob";
import { flattenKeys } from "@/keys";
import { parseLocalePath } from "@/locale-path";
import { readLocaleFile } from "@/parser";

/** Folders that usually hold application source code. */
const SOURCE_DIRECTORIES = ["src", "app", "pages", "components", "lib", "packages"];

/** Locale files in these folders are test data, not the project's translations. */
const IGNORED_FOR_DETECTION = [
  "**/{test,tests,__tests__,fixtures,__fixtures__,e2e,coverage}/**",
  `**/${CONFIG_FILENAME}`
];

export interface StarterConfig {
  sourceLocale: string;
  roots: string[];
  ignoreKeys: string[];
}

export interface Detection {
  config: StarterConfig;
  /** Locale files found, relative to the project. */
  localeFiles: string[];
  locales: string[];
}

/** Builds a starter config from the locale files and source folders found in `cwd`. */
export async function detectConfig(cwd = process.cwd()): Promise<Detection> {
  const paths = await globFiles([`**/*.{${LOCALE_EXTENSIONS.join(",")}}`], cwd, IGNORED_FOR_DETECTION);
  const localePaths = paths.filter((path) => parseLocalePath(path) !== undefined).sort();
  const localeFiles = localePaths.map((path) => relative(cwd, path));
  const locales = [...new Set(localePaths.map((path) => parseLocalePath(path)?.locale as string))].sort();

  const localeRoots = localeFiles.map((path) => (path.includes(sep) ? path.split(sep)[0] : "."));
  const sourceRoots = SOURCE_DIRECTORIES.filter((name) => isDirectory(join(cwd, name)));
  const roots = [...new Set([...localeRoots, ...sourceRoots])].sort();

  return {
    config: {
      sourceLocale: pickSourceLocale(localePaths, locales),
      roots: roots.length > 0 ? roots : ["src"],
      ignoreKeys: []
    },
    localeFiles,
    locales
  };
}

/** `en` (or an English variant) when present, otherwise the locale with the most keys. */
function pickSourceLocale(paths: string[], locales: string[]): string {
  const english =
    locales.find((locale) => locale === "en") ?? locales.find((locale) => /^en[-_]/i.test(locale));

  if (english || locales.length === 0) {
    return english ?? "en";
  }

  const keyCounts = new Map<string, number>();

  for (const path of paths) {
    const locale = parseLocalePath(path)?.locale as string;

    try {
      keyCounts.set(locale, (keyCounts.get(locale) ?? 0) + flattenKeys(readLocaleFile(path).data).length);
    } catch {
      // An unreadable file just does not count towards its locale.
    }
  }

  return locales.reduce((best, locale) =>
    (keyCounts.get(locale) ?? 0) > (keyCounts.get(best) ?? 0) ? locale : best
  );
}

function isDirectory(path: string): boolean {
  return existsSync(path) && statSync(path).isDirectory();
}
