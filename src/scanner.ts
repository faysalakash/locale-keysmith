import { CONFIG_FILENAME, loadConfig } from "@/config";
import { globFiles } from "@/glob";
import { parseLocalePath } from "@/locale-path";
import { readLocaleFile } from "@/parser";
import type { LocaleFile } from "@/types";

export interface LocaleGroup {
  /** Shared location of the files, e.g. `src/locales` or `public/locales/{locale}/common`. */
  id: string;
  /** The source-locale file, if the group has one. */
  source?: LocaleFile;
  /** Every other locale file in the group. */
  targets: LocaleFile[];
}

export interface TranslationFileScan {
  /** Files whose name or directory is a locale code. */
  localeFiles: string[];
  /** Files matched by the config globs that are not locale files, e.g. `src/data/config.json`. */
  skipped: string[];
}

/** Splits the files matched by the config globs into locale files and skipped files. */
export async function scanTranslationFiles(cwd = process.cwd()): Promise<TranslationFileScan> {
  const paths = await globFiles(loadConfig(cwd).translationFiles, cwd, [`**/${CONFIG_FILENAME}`]);
  const localeFiles: string[] = [];
  const skipped: string[] = [];

  for (const path of paths) {
    (parseLocalePath(path) === undefined ? skipped : localeFiles).push(path);
  }

  return { localeFiles, skipped };
}

/** Locale files matched by the config globs whose name or directory is a locale code. */
export async function findLocaleFiles(cwd = process.cwd()): Promise<string[]> {
  return (await scanTranslationFiles(cwd)).localeFiles;
}

export async function loadLocaleFiles(cwd = process.cwd()): Promise<LocaleFile[]> {
  const paths = await findLocaleFiles(cwd);

  return paths.map(readLocaleFile);
}

/**
 * Groups locale files that translate each other, so that `src/locales/en.json` is compared
 * with `src/locales/de.json` and not with an unrelated `plugins/x/locales/de.json`.
 */
export function groupLocaleFiles(files: LocaleFile[], sourceLocale: string): LocaleGroup[] {
  const groups = new Map<string, LocaleGroup>();

  for (const file of files) {
    const id = parseLocalePath(file.path)?.group ?? file.path;
    const group = groups.get(id) ?? { id, targets: [] };
    groups.set(id, group);

    const duplicate = [group.source, ...group.targets].find((other) => other?.locale === file.locale);

    if (duplicate) {
      throw new Error(
        `Found two "${file.locale}" locale files for the same translations: ${duplicate.path} and ${file.path}. ` +
          "Remove one, or narrow translationFiles in the config."
      );
    }

    if (file.locale === sourceLocale) {
      group.source = file;
    } else {
      group.targets.push(file);
    }
  }

  return [...groups.values()];
}
