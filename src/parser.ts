import { extname } from "node:path";
import { readFileSync, writeFileSync } from "node:fs";
import YAML from "yaml";
import type { LocaleFile, LocaleObject } from "./types.js";

export function readLocaleFile(path: string): LocaleFile {
  const extension = extname(path).toLowerCase();
  const raw = readFileSync(path, "utf8");
  const format = extension === ".json" ? "json" : "yaml";
  const parsed = format === "json" ? JSON.parse(raw) : YAML.parse(raw);

  return {
    path,
    locale: inferLocale(path),
    format,
    data: (parsed ?? {}) as LocaleObject
  };
}

export function writeLocaleFile(file: LocaleFile): void {
  const content =
    file.format === "json"
      ? `${JSON.stringify(file.data, null, 2)}\n`
      : YAML.stringify(file.data, { sortMapEntries: false });

  writeFileSync(file.path, content);
}

export function inferLocale(path: string): string {
  const filename = path.split(/[\\/]/).at(-1) ?? "";
  return filename.replace(/\.(json|ya?ml)$/i, "");
}
