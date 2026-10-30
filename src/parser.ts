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

  parsed ??= {};

  if (typeof parsed !== "object" || Array.isArray(parsed)) {
    const found = Array.isArray(parsed) ? "an array" : `a ${typeof parsed}`;
    throw new Error(`Expected ${path} to contain an object of translation keys, but found ${found}.`);
  }

  return {
    path,
    locale: inferLocale(path),
    format,
    data: parsed as LocaleObject,
    original: raw
  };
}

export function writeLocaleFile(file: LocaleFile): void {
  const content =
    file.format === "json" ? toJson(file.data, file.original) : toYaml(file.data, file.original);

  writeFileSync(file.path, content);
  file.original = content;
}

export function inferLocale(path: string): string {
  const filename = path.split(/[\\/]/).at(-1) ?? "";

  return filename.replace(/\.(json|ya?ml)$/i, "");
}

function toJson(data: LocaleObject, original: string | undefined): string {
  const indent = original?.match(/^[ \t]+(?=")/m)?.[0] ?? 2;
  const newline = original?.includes("\r\n") ? "\r\n" : "\n";
  const json = JSON.stringify(data, null, indent).replaceAll("\n", newline);

  return original === undefined || original === "" || original.endsWith("\n") ? `${json}${newline}` : json;
}

/**
 * Serializes `data` as YAML, carrying comments over from the original file by key path
 * so that sorting or removing keys does not strip them.
 */
function toYaml(data: LocaleObject, original: string | undefined): string {
  const doc = new YAML.Document(data);

  if (original) {
    const previous = YAML.parseDocument(original);
    doc.comment = previous.comment;
    doc.commentBefore = previous.commentBefore;

    if (YAML.isMap(previous.contents) && YAML.isMap(doc.contents)) {
      doc.commentBefore ??= takeFileHeader(previous.contents);
      copyComments(previous.contents, doc.contents);
    }
  }

  return doc.toString();
}

// yaml attaches a file header to the first key; split it off at the last blank line so
// the header stays at the top even when that key moves.
function takeFileHeader(map: YAML.YAMLMap): string | null {
  const first = map.items[0]?.key;

  if (!YAML.isNode(first) || !first.commentBefore?.includes("\n\n")) {
    return null;
  }

  const split = first.commentBefore.lastIndexOf("\n\n");
  const header = first.commentBefore.slice(0, split);
  first.commentBefore = first.commentBefore.slice(split + 2);

  return header;
}

function copyComments(from: YAML.YAMLMap, to: YAML.YAMLMap): void {
  to.comment = from.comment;

  for (const pair of to.items) {
    const match = from.items.find(
      (candidate) =>
        YAML.isScalar(candidate.key) && YAML.isScalar(pair.key) && candidate.key.value === pair.key.value
    );

    if (!match || !YAML.isNode(match.key) || !YAML.isNode(pair.key)) {
      continue;
    }

    pair.key.commentBefore = match.key.commentBefore;
    pair.key.spaceBefore = match.key.spaceBefore;

    if (YAML.isMap(match.value) && YAML.isMap(pair.value)) {
      // A comment above a nested map's first entry is attached to the map itself; move it
      // onto that entry's key so it follows the entry when keys are reordered.
      const firstKey = match.value.items[0]?.key;

      if (match.value.commentBefore && YAML.isNode(firstKey)) {
        firstKey.commentBefore = [match.value.commentBefore, firstKey.commentBefore]
          .filter(Boolean)
          .join("\n");
        match.value.commentBefore = null;
      }

      copyComments(match.value, pair.value);
    } else if (YAML.isNode(match.value) && YAML.isNode(pair.value)) {
      pair.value.commentBefore = match.value.commentBefore;
      pair.value.comment = match.value.comment;
    }
  }

  // The first entry should never start with a blank line.
  const first = to.items[0]?.key;

  if (YAML.isNode(first)) {
    first.spaceBefore = false;
  }
}
