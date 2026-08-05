import { dirname, extname, join } from "node:path";
import chalk from "chalk";
import { Command } from "commander";
import { loadConfig } from "@/config";
import { deleteValueByPath, filterIgnoredKeys, flattenKeys, isSorted, sortObjectKeys } from "@/keys";
import { writeLocaleFile } from "@/parser";
import { loadLocaleFiles } from "@/scanner";
import { translateMissingKeys } from "@/translate";
import type { LocaleFile } from "@/types";
import { findUsedKeys } from "@/usage";

const program = new Command();

program
  .name("locale-keysmith")
  .description("Sort, audit, clean, and translate locale files")
  .version("0.1.0");

program
  .command("scan")
  .description("Find translation files")
  .action(async () => {
    const files = await loadLocaleFiles();

    if (files.length === 0) {
      console.log(chalk.yellow("No locale files found."));
      return;
    }

    for (const file of files) {
      console.log(`${chalk.green(file.locale)} ${file.path}`);
    }
  });

program
  .command("sort")
  .description("Sort locale keys alphabetically")
  .option("--write", "Write changes to disk")
  .action(async (options: { write?: boolean }) => {
    const files = await loadLocaleFiles();

    for (const file of files) {
      file.data = sortObjectKeys(file.data);
      if (options.write) writeLocaleFile(file);
      console.log(`${options.write ? "sorted" : "would sort"} ${file.path}`);
    }
  });

program
  .command("missing")
  .description("Find keys missing from non-source locales")
  .action(async () => {
    const config = loadConfig();
    const files = await loadLocaleFiles();
    const source = requireSourceLocale(files, config.sourceLocale);
    const sourceKeys = filterIgnoredKeys(flattenKeys(source.data), config.ignoreKeys);

    for (const file of files) {
      if (file.path === source.path) continue;

      const missing = missingKeysFor(sourceKeys, file);
      console.log(chalk.bold(file.locale));

      if (missing.length === 0) {
        console.log(chalk.green("  no missing keys"));
        continue;
      }

      for (const key of missing) console.log(`  ${key}`);
    }
  });

program
  .command("unused")
  .description("Find translation keys not used in source files")
  .action(async () => {
    const config = loadConfig();
    const files = await loadLocaleFiles();
    const source = requireSourceLocale(files, config.sourceLocale);
    const unused = await findUnusedKeys(source, config.ignoreKeys);

    if (unused.length === 0) {
      console.log(chalk.green("No unused keys found."));
      return;
    }

    for (const key of unused) console.log(key);
  });

program
  .command("health")
  .description("Report missing keys, unused keys, and unsorted files (exits non-zero on any issue)")
  .action(async () => {
    const config = loadConfig();
    const files = await loadLocaleFiles();
    const source = requireSourceLocale(files, config.sourceLocale);

    let issues = 0;

    const unsorted = files.filter((file) => !isSorted(file.data));
    for (const file of unsorted) {
      console.log(`${chalk.yellow("unsorted")} ${file.path}`);
    }
    issues += unsorted.length;

    const sourceKeys = filterIgnoredKeys(flattenKeys(source.data), config.ignoreKeys);
    for (const file of files) {
      if (file.path === source.path) continue;

      const missing = missingKeysFor(sourceKeys, file);
      for (const key of missing) console.log(`${chalk.red("missing")} ${file.locale} ${key}`);
      issues += missing.length;
    }

    const unused = await findUnusedKeys(source, config.ignoreKeys);
    for (const key of unused) console.log(`${chalk.red("unused")} ${key}`);
    issues += unused.length;

    if (issues === 0) {
      console.log(chalk.green("All locale files are healthy."));
      return;
    }

    console.log(chalk.bold(`\n${issues} issue${issues === 1 ? "" : "s"} found.`));
    process.exitCode = 1;
  });

program
  .command("remove-unused")
  .description("Remove unused translation keys from all locale files")
  .option("--dry-run", "Preview changes without writing to disk")
  .option("--write", "Write changes to disk")
  .action(async (options: { dryRun?: boolean; write?: boolean }) => {
    const config = loadConfig();
    const files = await loadLocaleFiles();
    const source = requireSourceLocale(files, config.sourceLocale);
    const unused = await findUnusedKeys(source, config.ignoreKeys);

    if (unused.length === 0) {
      console.log(chalk.green("No unused keys found."));
      return;
    }

    for (const file of files) {
      for (const key of unused) deleteValueByPath(file.data, key);
      file.data = sortObjectKeys(file.data);
      if (options.write) writeLocaleFile(file);
    }

    console.log(`${options.write ? "removed" : "would remove"} ${unused.length} unused keys`);
  });

program
  .command("translate")
  .description("Translate missing keys from the source locale")
  .requiredOption("--to <locales>", "Comma-separated target locales")
  .option("--from <locale>", "Source locale", "en")
  .option("--write", "Write changes to disk")
  .action(async (options: { to: string; from: string; write?: boolean }) => {
    const files = await loadLocaleFiles();
    const source = requireSourceLocale(files, options.from);
    const sourceKeys = flattenKeys(source.data);
    const targetLocales = new Set(
      options.to
        .split(",")
        .map((locale) => locale.trim())
        .filter(Boolean)
    );

    for (const locale of targetLocales) {
      if (locale === source.locale) continue;

      const target = files.find((file) => file.locale === locale) ?? createEmptyLocaleFile(source, locale);
      const missing = missingKeysFor(sourceKeys, target);

      if (missing.length === 0) {
        console.log(chalk.green(`${locale}: no missing keys`));
        continue;
      }

      if (!options.write) {
        console.log(`${locale}: would translate ${missing.length} keys`);
        continue;
      }

      const changed = await translateMissingKeys({
        source,
        target,
        targetLanguage: locale,
        keys: missing
      });
      target.data = sortObjectKeys(target.data);
      writeLocaleFile(target);
      console.log(`${locale}: translated ${changed} keys`);
    }
  });

program.parseAsync().catch((error: unknown) => {
  console.error(chalk.red(error instanceof Error ? error.message : String(error)));
  process.exitCode = 1;
});

function requireSourceLocale(files: LocaleFile[], locale: string): LocaleFile {
  const source = files.find((file) => file.locale === locale);
  if (!source) throw new Error(`Source locale "${locale}" was not found.`);
  return source;
}

function missingKeysFor(sourceKeys: string[], target: LocaleFile): string[] {
  const present = new Set(flattenKeys(target.data));
  return sourceKeys.filter((key) => !present.has(key));
}

async function findUnusedKeys(source: LocaleFile, ignoreKeys: string[]): Promise<string[]> {
  const used = await findUsedKeys();
  return filterIgnoredKeys(flattenKeys(source.data), ignoreKeys).filter((key) => !used.has(key));
}

function createEmptyLocaleFile(source: LocaleFile, locale: string): LocaleFile {
  return {
    path: join(dirname(source.path), `${locale}${extname(source.path)}`),
    locale,
    format: source.format,
    data: {}
  };
}
