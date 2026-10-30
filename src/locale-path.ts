import { basename, dirname, extname, join } from "node:path";

export interface LocalePath {
  locale: string;
  /** For `locales/en/common.json` layouts: the file name without extension (`common`). */
  namespace?: string;
  /**
   * Files with the same group are translations of each other. `locales/en.json` and
   * `locales/de.json` share `locales`; `locales/en/common.json` and `locales/de/common.json`
   * share `locales/{locale}/common`.
   */
  group: string;
}

// language[-Script][-REGION], with `-` or `_`: en, pt-BR, zh-Hant, sr_Latn_RS, es-419.
const localeShape = /^([a-z]{2,3})(?:[-_][a-z]{4})?(?:[-_](?:[a-z]{2}|\d{3}))?$/i;

// Valid language codes that are far more often a folder or file name in a project.
const notLocales = new Set([
  "bak",
  "bar",
  "bin",
  "crm",
  "del",
  "ext",
  "mac",
  "nav",
  "new",
  "run",
  "src",
  "swc"
]);

const languageNames = new Intl.DisplayNames(["en"], { type: "language", fallback: "none" });

export function isLocaleCode(name: string): boolean {
  const language = localeShape.exec(name)?.[1].toLowerCase();

  if (!language || notLocales.has(language)) {
    return false;
  }

  try {
    return languageNames.of(language) !== undefined;
  } catch {
    return false;
  }
}

/**
 * Works out which locale a file holds, from its name (`locales/pt-BR.json`) or, for the
 * i18next-http-backend layout, from its directory (`public/locales/pt-BR/common.json`).
 * Returns undefined when neither looks like a locale code (e.g. `src/data/config.json`).
 */
export function parseLocalePath(path: string): LocalePath | undefined {
  const name = basename(path, extname(path));
  const directory = dirname(path);

  if (isLocaleCode(name)) {
    return { locale: name, group: directory };
  }

  const parent = basename(directory);

  if (isLocaleCode(parent)) {
    return { locale: parent, namespace: name, group: join(dirname(directory), "{locale}", name) };
  }

  return undefined;
}

/** Path of the `locale` counterpart of a locale file, e.g. `locales/de.json` for `locales/en.json`. */
export function localeFilePath(path: string, locale: string): string {
  const parsed = parseLocalePath(path);

  if (parsed?.namespace !== undefined) {
    return join(dirname(dirname(path)), locale, basename(path));
  }

  return join(dirname(path), `${locale}${extname(path)}`);
}
