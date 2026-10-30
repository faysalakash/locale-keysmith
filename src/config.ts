import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { isLocaleCode } from "@/locale-path";
import type { LocaleLintConfig } from "@/types";

export const CONFIG_FILENAME = "locale-keysmith.config.json";

export const LOCALE_EXTENSIONS = ["json", "yml", "yaml"];

export const SOURCE_EXTENSIONS = ["ts", "tsx", "js", "jsx", "mjs", "cjs", "vue", "svelte"];

const DEFAULT_ROOTS = ["src"];

const STRING_LIST_FIELDS = ["roots", "translationFiles", "src", "ignoreKeys"] as const;

// `$schema` is accepted so editors can attach a JSON schema to the file.
const KNOWN_FIELDS = ["$schema", "sourceLocale", ...STRING_LIST_FIELDS];

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

/**
 * Checks a parsed config file and returns it typed, or throws one error that lists every
 * problem, so a typo like `"roots": "src"` fails up front instead of deep inside a command.
 */
export function validateConfig(value: unknown): Partial<LocaleLintConfig> {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    throw new Error(`Invalid ${CONFIG_FILENAME}: expected a JSON object, found ${describe(value)}.`);
  }

  const config = value as Record<string, unknown>;
  const problems: string[] = [];

  for (const field of Object.keys(config)) {
    if (!KNOWN_FIELDS.includes(field)) {
      const suggestion = closestField(field);
      problems.push(`unknown field "${field}"${suggestion ? ` (did you mean "${suggestion}"?)` : ""}`);
    }
  }

  if ("sourceLocale" in config) {
    const locale = config.sourceLocale;

    if (typeof locale !== "string") {
      problems.push(`"sourceLocale" must be a string such as "en", found ${describe(locale)}`);
    } else if (!isLocaleCode(locale)) {
      problems.push(`"sourceLocale" must be a locale code such as "en" or "pt-BR", found "${locale}"`);
    }
  }

  for (const field of STRING_LIST_FIELDS) {
    if (!(field in config)) {
      continue;
    }

    const list = config[field];

    if (typeof list === "string") {
      problems.push(`"${field}" must be an array of strings: use ["${list}"] instead of "${list}"`);
    } else if (!Array.isArray(list) || list.some((item) => typeof item !== "string" || item.trim() === "")) {
      problems.push(`"${field}" must be an array of non-empty strings, found ${describe(list)}`);
    }
  }

  if (problems.length > 0) {
    throw new Error(`Invalid ${CONFIG_FILENAME}:\n${problems.map((problem) => `  - ${problem}`).join("\n")}`);
  }

  return config as Partial<LocaleLintConfig>;
}

function readUserConfig(path: string): Partial<LocaleLintConfig> {
  if (!existsSync(path)) {
    return {};
  }

  let parsed: unknown;

  try {
    parsed = JSON.parse(readFileSync(path, "utf8"));
  } catch (error) {
    const detail = error instanceof Error ? error.message : String(error);
    throw new Error(`Failed to parse ${CONFIG_FILENAME}: ${detail}`, { cause: error });
  }

  return validateConfig(parsed);
}

function describe(value: unknown): string {
  if (Array.isArray(value)) {
    return `${JSON.stringify(value)}`;
  }

  if (value === null) {
    return "null";
  }

  return typeof value === "string" ? `"${value}"` : `${typeof value} ${JSON.stringify(value)}`;
}

/** A known field within two edits of `field` (case-insensitive), to catch typos. */
function closestField(field: string): string | undefined {
  const candidates = KNOWN_FIELDS.map((known) => ({ known, distance: editDistance(field, known) }));
  const best = candidates.sort((a, b) => a.distance - b.distance)[0];

  return best.distance <= 2 ? best.known : undefined;
}

function editDistance(a: string, b: string): number {
  const left = a.toLowerCase();
  const right = b.toLowerCase();
  let previous = Array.from({ length: right.length + 1 }, (_, index) => index);

  for (let i = 1; i <= left.length; i += 1) {
    const current = [i];

    for (let j = 1; j <= right.length; j += 1) {
      const cost = left[i - 1] === right[j - 1] ? 0 : 1;
      current[j] = Math.min(previous[j] + 1, current[j - 1] + 1, previous[j - 1] + cost);
    }

    previous = current;
  }

  return previous[right.length];
}
