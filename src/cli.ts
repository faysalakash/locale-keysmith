#!/usr/bin/env node
import { createRequire } from "node:module";
import { relative } from "node:path";
import chalk from "chalk";
import { Command } from "commander";
import { emptyValueKeys, extraKeys, missingKeys, typeMismatches } from "@/checks";
import { loadConfig } from "@/config";
import { deleteValueByPath, filterIgnoredKeys, flattenKeys, isSorted, sortObjectKeys } from "@/keys";
import { writeLocaleFile } from "@/parser";
import { localeFilePath } from "@/locale-path";
import { groupLocaleFiles, loadLocaleFiles } from "@/scanner";
import type { LocaleGroup } from "@/scanner";
import { translateMissingKeys } from "@/translate";
import type { TranslationResult } from "@/translate";
import type { LocaleFile, LocaleLintConfig } from "@/types";
import { findKeyUsage, isKeyUsed } from "@/usage";
import type { KeyUsage } from "@/usage";

// Resolves to the package root from both src/cli.ts (tsx) and dist/cli.js (published).
const { version } = createRequire(import.meta.url)("../package.json") as { version: string };

const program = new Command();

program
  .name("locale-keysmith")
  .description("Sort, audit, clean, and translate locale files")
  .version(version);

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
    const unsorted = (await loadLocaleFiles()).filter((file) => !isSorted(file.data));

    if (unsorted.length === 0) {
      console.log(chalk.green("All locale files are already sorted."));

      return;
    }

    for (const file of unsorted) {
      file.data = sortObjectKeys(file.data);

      if (options.write) {
        writeLocaleFile(file);
      }

      console.log(`${options.write ? "sorted" : "would sort"} ${file.path}`);
    }
  });

program
  .command("missing")
  .description("Find keys missing from non-source locales")
  .action(async () => {
    const config = loadConfig();
    const groups = await loadGroups(config.sourceLocale);

    for (const { source, targets } of groups) {
      const sourceKeys = filterIgnoredKeys(flattenKeys(source.data), config.ignoreKeys);

      for (const file of targets) {
        const missing = missingKeys(sourceKeys, file);
        console.log(chalk.bold(label(file, groups)));

        if (missing.length === 0) {
          console.log(chalk.green("  no missing keys"));
          continue;
        }

        for (const key of missing) {
          console.log(`  ${key}`);
        }
      }
    }
  });

program
  .command("unused")
  .description("Find translation keys not used in source files")
  .action(async () => {
    const config = loadConfig();
    const groups = await loadGroups(config.sourceLocale);
    const usage = await findKeyUsage();
    let total = 0;

    for (const { source } of groups) {
      const unused = findUnusedKeys(source, config.ignoreKeys, usage);
      total += unused.length;

      if (groups.length > 1 && unused.length > 0) {
        console.log(chalk.bold(relative(process.cwd(), source.path)));
      }

      for (const key of unused) {
        console.log(groups.length > 1 ? `  ${key}` : key);
      }
    }

    if (total === 0) {
      console.log(chalk.green("No unused keys found."));
    }
  });

program
  .command("health")
  .description(
    "Report unsorted files, missing/extra/unused keys, empty values and type mismatches (exits non-zero on any issue)"
  )
  .action(async () => {
    const config = loadConfig();
    const groups = await loadGroups(config.sourceLocale);
    const issues = collectHealthIssues(groups, config, await findKeyUsage());

    for (const issue of issues) {
      console.log(formatIssue(issue, groups));
    }

    if (issues.length === 0) {
      console.log(chalk.green("All locale files are healthy."));

      return;
    }

    console.log(chalk.bold(`\n${issues.length} issue${issues.length === 1 ? "" : "s"} found.`));
    process.exitCode = 1;
  });

program
  .command("remove-unused")
  .description("Remove unused translation keys from all locale files")
  .option("--dry-run", "Preview changes without writing to disk")
  .option("--write", "Write changes to disk")
  .action(async (options: { dryRun?: boolean; write?: boolean }) => {
    const config = loadConfig();
    const groups = await loadGroups(config.sourceLocale);
    const usage = await findKeyUsage();
    let total = 0;

    for (const group of groups) {
      const unused = findUnusedKeys(group.source, config.ignoreKeys, usage);

      if (unused.length === 0) {
        continue;
      }

      total += unused.length;

      if (groups.length > 1) {
        console.log(chalk.bold(relative(process.cwd(), group.source.path)));
      }

      // List every key so a deletion can be reviewed (and diffed against `unused`).
      for (const key of unused) {
        console.log(`  ${key}`);
      }

      // Only touch files that translate this source, never unrelated locale files.
      for (const file of [group.source, ...group.targets]) {
        for (const key of unused) {
          deleteValueByPath(file.data, key);
        }
        file.data = sortObjectKeys(file.data);

        if (options.write) {
          writeLocaleFile(file);
        }
      }
    }

    if (total === 0) {
      console.log(chalk.green("No unused keys found."));

      return;
    }

    console.log(`${options.write ? "removed" : "would remove"} ${total} unused keys`);
  });

program
  .command("translate")
  .description("Translate missing keys from the source locale")
  .requiredOption("--to <locales>", "Comma-separated target locales")
  .option("--from <locale>", "Source locale (default: sourceLocale from the config)")
  .option("--write", "Write changes to disk")
  .action(async (options: { to: string; from?: string; write?: boolean }) => {
    const config = loadConfig();
    const groups = await loadGroups(options.from ?? config.sourceLocale);
    const targetLocales = new Set(
      options.to
        .split(",")
        .map((locale) => locale.trim())
        .filter(Boolean)
    );

    for (const { source, targets } of groups) {
      const sourceKeys = filterIgnoredKeys(flattenKeys(source.data), config.ignoreKeys);

      for (const locale of targetLocales) {
        if (locale === source.locale) {
          continue;
        }

        const target =
          targets.find((file) => file.locale === locale) ?? createEmptyLocaleFile(source, locale);
        const name = label(target, groups);
        const missing = missingKeys(sourceKeys, target);

        if (missing.length === 0) {
          console.log(chalk.green(`${name}: no missing keys`));
          continue;
        }

        if (!options.write) {
          console.log(`${name}: would translate ${missing.length} keys`);
          continue;
        }

        // Saves whatever has been translated so far; also runs when a request fails midway,
        // so a rerun only has to translate the remaining keys.
        const save = (): number => {
          const present = new Set(flattenKeys(target.data));
          const translated = missing.filter((key) => present.has(key)).length;

          if (translated > 0) {
            target.data = sortObjectKeys(target.data);
            writeLocaleFile(target);
          }

          return translated;
        };

        let result: TranslationResult;

        try {
          result = await translateMissingKeys({ source, target, targetLanguage: locale, keys: missing });
        } catch (error) {
          console.log(`${name}: saved ${save()} translated keys before the error`);
          throw error;
        }

        save();
        console.log(`${name}: translated ${result.translated} keys`);

        for (const key of result.skipped) {
          console.warn(
            chalk.yellow(`${name}: skipped ${key} (the translation did not keep its placeholders)`)
          );
        }
      }
    }
  });

program.parseAsync().catch((error: unknown) => {
  console.error(chalk.red(error instanceof Error ? error.message : String(error)));
  process.exitCode = 1;
});

type SourcedGroup = LocaleGroup & { source: LocaleFile };

/** Locale files grouped by what they translate; groups without a source file are skipped. */
async function loadGroups(sourceLocale: string): Promise<SourcedGroup[]> {
  const groups = groupLocaleFiles(await loadLocaleFiles(), sourceLocale);
  const sourced = groups.filter((group): group is SourcedGroup => group.source !== undefined);

  if (sourced.length === 0) {
    throw new Error(`Source locale "${sourceLocale}" was not found.`);
  }

  for (const group of groups) {
    if (!group.source) {
      const where = relative(process.cwd(), group.id);
      console.warn(chalk.yellow(`skipped ${where}: no "${sourceLocale}" file to compare against`));
    }
  }

  return sourced;
}

/** The locale, plus the file path when there is more than one group to tell apart. */
function label(file: LocaleFile, groups: LocaleGroup[]): string {
  return groups.length > 1 ? `${file.locale} (${relative(process.cwd(), file.path)})` : file.locale;
}

type IssueType = "unsorted" | "missing" | "extra" | "empty" | "type-mismatch" | "unused";

interface Issue {
  type: IssueType;
  file: LocaleFile;
  key?: string;
  /** For type mismatches: what the key holds in the source and in this file. */
  kinds?: { source: string; target: string };
}

function collectHealthIssues(groups: SourcedGroup[], config: LocaleLintConfig, usage: KeyUsage): Issue[] {
  const issues: Issue[] = [];
  const keep = (keys: string[]): string[] => filterIgnoredKeys(keys, config.ignoreKeys);

  for (const file of groups.flatMap((group) => [group.source, ...group.targets])) {
    if (!isSorted(file.data)) {
      issues.push({ type: "unsorted", file });
    }
  }

  for (const { source, targets } of groups) {
    const sourceKeys = keep(flattenKeys(source.data));

    for (const key of keep(emptyValueKeys(source))) {
      issues.push({ type: "empty", file: source, key });
    }

    for (const file of targets) {
      const mismatches = typeMismatches(source.data, file.data).filter(
        (mismatch) => keep([mismatch.key]).length > 0
      );
      // A key with the wrong shape would also show up as missing/extra keys below it; report it once.
      const underMismatch = (key: string): boolean =>
        mismatches.some((mismatch) => key === mismatch.key || key.startsWith(`${mismatch.key}.`));

      for (const mismatch of mismatches) {
        issues.push({ type: "type-mismatch", file, key: mismatch.key, kinds: mismatch });
      }

      for (const key of missingKeys(sourceKeys, file).filter((key) => !underMismatch(key))) {
        issues.push({ type: "missing", file, key });
      }

      for (const key of keep(extraKeys(sourceKeys, file)).filter((key) => !underMismatch(key))) {
        issues.push({ type: "extra", file, key });
      }

      for (const key of keep(emptyValueKeys(file))) {
        issues.push({ type: "empty", file, key });
      }
    }

    for (const key of findUnusedKeys(source, config.ignoreKeys, usage)) {
      issues.push({ type: "unused", file: source, key });
    }
  }

  return issues;
}

function formatIssue(issue: Issue, groups: LocaleGroup[]): string {
  const name = label(issue.file, groups);

  switch (issue.type) {
    case "unsorted":
      return `${chalk.yellow("unsorted")} ${issue.file.path}`;
    case "unused":
      return `${chalk.red("unused")} ${issue.key}${groups.length > 1 ? ` (${relative(process.cwd(), issue.file.path)})` : ""}`;
    case "type-mismatch":
      return `${chalk.red("type-mismatch")} ${name} ${issue.key} (${issue.kinds?.source} in the source, ${issue.kinds?.target} here)`;
    case "empty":
      return `${chalk.yellow("empty")} ${name} ${issue.key}`;
    default:
      return `${chalk.red(issue.type)} ${name} ${issue.key}`;
  }
}

function findUnusedKeys(source: LocaleFile, ignoreKeys: string[], usage: KeyUsage): string[] {
  return filterIgnoredKeys(flattenKeys(source.data), ignoreKeys).filter((key) => !isKeyUsed(key, usage));
}

function createEmptyLocaleFile(source: LocaleFile, locale: string): LocaleFile {
  return {
    path: localeFilePath(source.path, locale),
    locale,
    format: source.format,
    data: {}
  };
}
