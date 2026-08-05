import { CONFIG_FILENAME, loadConfig } from "@/config";
import { globFiles } from "@/glob";
import { readLocaleFile } from "@/parser";
import type { LocaleFile } from "@/types";

export async function findLocaleFiles(cwd = process.cwd()): Promise<string[]> {
  return globFiles(loadConfig(cwd).translationFiles, cwd, [`**/${CONFIG_FILENAME}`]);
}

export async function loadLocaleFiles(cwd = process.cwd()): Promise<LocaleFile[]> {
  const paths = await findLocaleFiles(cwd);
  return paths.map(readLocaleFile);
}
