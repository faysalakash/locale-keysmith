#!/usr/bin/env node

import chalk from "chalk";
import { Command } from "commander";
import { loadConfig } from "./config.js";
import { deleteValueByPath, flattenKeys, sortObjectKeys } from "./keys.js";
import { writeLocaleFile } from "./parser.js";
import { loadLocaleFiles } from "./scanner.js";
import { translateMissingKeys } from "./translate.js";
import { findUsedKeys } from "./usage.js";

const program = new Command();

program
  .name("lingo-keysmith")
  .description("Sort, audit, clean, and translate locale files")
  .version("0.1.0");

program.command("scan").description("Find translation files").action(async () => {
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

program.command("missing").description("Find keys missing from non-source locales").action(async () => {
  const config = loadConfig();
  const files = await loadLocaleFiles();
  const source = files.find((file) => file.locale === config.sourceLocale);

  if (!source) {
    throw new Error(`Source locale "${config.sourceLocale}" was not found.`);
  }

  const sourceKeys = flattenKeys(source.data);

  for (const file of files.filter((candidate) => candidate.path !== source.path)) {
    const targetKeys = new Set(flattenKeys(file.data));
    const missing = sourceKeys.filter((key) => !targetKeys.has(key));

    console.log(chalk.bold(file.locale));
    if (missing.length === 0) {
      console.log(chalk.green("  no missing keys"));
      continue;
    }

    for (const key of missing) console.log(`  ${key}`);
  }
});

program.command("unused").description("Find translation keys not used in source files").action(async () => {
  const config = loadConfig();
  const files = await loadLocaleFiles();
  const source = files.find((file) => file.locale === config.sourceLocale);

  if (!source) {
    throw new Error(`Source locale "${config.sourceLocale}" was not found.`);
  }

  const used = await findUsedKeys();
  const unused = flattenKeys(source.data).filter((key) => !used.has(key));

  if (unused.length === 0) {
    console.log(chalk.green("No unused keys found."));
    return;
  }

  for (const key of unused) console.log(key);
});

program
  .command("remove-unused")
  .description("Remove unused translation keys from all locale files")
  .option("--write", "Write changes to disk")
  .action(async (options: { write?: boolean }) => {
    const config = loadConfig();
    const files = await loadLocaleFiles();
    const source = files.find((file) => file.locale === config.sourceLocale);

    if (!source) {
      throw new Error(`Source locale "${config.sourceLocale}" was not found.`);
    }

    const used = await findUsedKeys();
    const unused = flattenKeys(source.data).filter((key) => !used.has(key));

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
    const source = files.find((file) => file.locale === options.from);

    if (!source) throw new Error(`Source locale "${options.from}" was not found.`);

    const sourceKeys = flattenKeys(source.data);
    const targets = new Set(options.to.split(",").map((locale) => locale.trim()).filter(Boolean));

    for (const target of files.filter((file) => targets.has(file.locale))) {
      const targetKeys = new Set(flattenKeys(target.data));
      const missing = sourceKeys.filter((key) => !targetKeys.has(key));

      if (missing.length === 0) {
        console.log(chalk.green(`${target.locale}: no missing keys`));
        continue;
      }

      if (!options.write) {
        console.log(`${target.locale}: would translate ${missing.length} keys`);
        continue;
      }

      const changed = await translateMissingKeys({
        source,
        target,
        targetLanguage: target.locale,
        keys: missing
      });
      target.data = sortObjectKeys(target.data);
      writeLocaleFile(target);
      console.log(`${target.locale}: translated ${changed} keys`);
    }
  });

program.parseAsync().catch((error: unknown) => {
  console.error(chalk.red(error instanceof Error ? error.message : String(error)));
  process.exitCode = 1;
});
