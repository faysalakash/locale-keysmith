import { extname } from "node:path";
import { readFileSync, writeFileSync } from "node:fs";
import YAML from "yaml";
import type { LocaleFile, LocaleObject } from "@/types";

export function readLocaleFile(path: string): LocaleFile {
  const format: LocaleFile["format"] = extname(path).toLowerCase() === ".json" ? "json" : "yaml";
  const raw = readFileSync(path, "utf8");

  let parsed: unknown = {};

  if (raw.trim() !== "") {
    try {
      parsed = format === "json" ? JSON.parse(raw) : YAML.parse(raw);
    } catch (error) {
      const detail = error instanceof Error ? error.message : String(error);
      throw new Error(`Failed to parse ${path}: ${detail}`, { cause: error });
    }
  }

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
