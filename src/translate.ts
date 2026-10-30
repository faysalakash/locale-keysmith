import { pluralFallbackKey } from "@/checks";
import { getValueByPath, setValueByPath } from "@/keys";
import type { LocaleFile } from "@/types";

const ENDPOINT = "https://translation.googleapis.com/language/translate/v2";

// The v2 API accepts up to 128 strings per request; also keep each request well below its
// payload size limit.
const MAX_BATCH_SIZE = 100;
const MAX_BATCH_CHARACTERS = 20_000;

export interface TranslationResult {
  /** Number of keys written to the target. */
  translated: number;
  /** Keys left untranslated because the translation lost or mangled a placeholder. */
  skipped: string[];
}

interface Entry {
  key: string;
  text: string;
}

/**
 * Translates `keys` from the source file into `target.data`, batch by batch. Results are
 * applied as each batch completes, so if a later request fails, the keys translated so far
 * are already in `target.data` and can still be saved.
 */
export async function translateMissingKeys(options: {
  source: LocaleFile;
  target: LocaleFile;
  targetLanguage: string;
  keys: string[];
}): Promise<TranslationResult> {
  const apiKey = process.env.GOOGLE_TRANSLATE_API_KEY;

  if (!apiKey) {
    throw new Error("GOOGLE_TRANSLATE_API_KEY is required for the translate command.");
  }

  const entries = options.keys.flatMap((key): Entry[] => {
    const fallback = pluralFallbackKey(key);
    const text =
      getValueByPath(options.source.data, key) ??
      (fallback === undefined ? undefined : getValueByPath(options.source.data, fallback));

    return typeof text === "string" && text.trim() !== "" ? [{ key, text }] : [];
  });
  const result: TranslationResult = { translated: 0, skipped: [] };

  for (const batch of toBatches(entries)) {
    const masked = batch.map((entry) => maskPlaceholders(entry.text));
    const translations = await requestTranslations(
      masked.map((item) => item.html),
      toGoogleLanguage(options.source.locale).split("-")[0],
      toGoogleLanguage(options.targetLanguage),
      apiKey
    );

    batch.forEach((entry, index) => {
      const text = unmaskPlaceholders(translations[index], masked[index].placeholders);

      if (text === undefined) {
        result.skipped.push(entry.key);

        return;
      }

      setValueByPath(options.target.data, entry.key, text);
      result.translated += 1;
    });
  }

  return result;
}

function toBatches(entries: Entry[]): Entry[][] {
  const batches: Entry[][] = [];
  let current: Entry[] = [];
  let characters = 0;

  for (const entry of entries) {
    if (
      current.length === MAX_BATCH_SIZE ||
      (current.length > 0 && characters + entry.text.length > MAX_BATCH_CHARACTERS)
    ) {
      batches.push(current);
      current = [];
      characters = 0;
    }

    current.push(entry);
    characters += entry.text.length;
  }

  if (current.length > 0) {
    batches.push(current);
  }

  return batches;
}

// Google expects BCP 47 tags with hyphens (pt-BR), while locale files often use pt_BR.
function toGoogleLanguage(locale: string): string {
  return locale.replaceAll("_", "-");
}

async function requestTranslations(
  texts: string[],
  source: string,
  target: string,
  apiKey: string
): Promise<Array<string | undefined>> {
  const response = await fetch(ENDPOINT, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      // A header, not the `key` query parameter, so the key does not end up in proxy or server logs.
      "X-goog-api-key": apiKey
    },
    body: JSON.stringify({ q: texts, source, target, format: "html" })
  });

  if (!response.ok) {
    const detail = await response
      .json()
      .then((body: { error?: { message?: string } }) => body.error?.message)
      .catch(() => undefined);

    throw new Error(
      `Google Translate request failed with status ${response.status}${detail ? `: ${detail}` : "."}`
    );
  }

  const payload = (await response.json()) as {
    data?: { translations?: Array<{ translatedText?: string }> };
  };
  const translations = payload.data?.translations ?? [];

  if (translations.length !== texts.length) {
    throw new Error(
      `Google Translate returned ${translations.length} translations for ${texts.length} strings.`
    );
  }

  return translations.map((translation) => translation.translatedText);
}

// Interpolation that must reach the translation unchanged: i18next {{name}}, ICU {count} and
// {count, plural, ...} (any balanced braces), <0>/</0>/<br/>/<b> tags from <Trans>, i18next
// nesting $t(key), and printf-style %s / %1$s.
const placeholderAt = [/^<\/?[A-Za-z0-9][^<>]*>/, /^\$t\([^)]*\)/, /^%(?:\d+\$)?[sdif@]/];

/**
 * Turns `text` into HTML in which every placeholder is replaced by its index inside a
 * `translate="no"` span, which the API leaves untouched in `format: "html"` mode.
 */
export function maskPlaceholders(text: string): { html: string; placeholders: string[] } {
  const placeholders: string[] = [];
  let html = "";
  let index = 0;

  while (index < text.length) {
    const placeholder = text[index] === "{" ? balancedBraces(text, index) : matchAt(text, index);

    if (placeholder) {
      html += `<span translate="no">${placeholders.length}</span>`;
      placeholders.push(placeholder);
      index += placeholder.length;
      continue;
    }

    html += escapeHtml(text[index]);
    index += 1;
  }

  return { html, placeholders };
}

/** Restores masked placeholders; undefined when any placeholder was lost or duplicated. */
export function unmaskPlaceholders(html: string | undefined, placeholders: string[]): string | undefined {
  if (html === undefined) {
    return undefined;
  }

  // With one capture group, split() alternates text and placeholder index: [text, 0, text, 1, text].
  const parts = html.split(/<span[^>]*translate=["']?no["']?[^>]*>\s*(\d+)\s*<\/span>/);
  const restored = new Set<number>();
  let text = "";

  for (const [position, part] of parts.entries()) {
    if (position % 2 === 0) {
      // Only translated text is decoded, never the placeholders (which may contain `&` or `<b>`).
      text += decodeHtml(part);
      continue;
    }

    const index = Number(part);

    if (index >= placeholders.length || restored.has(index)) {
      return undefined;
    }

    restored.add(index);
    text += placeholders[index];
  }

  return restored.size === placeholders.length ? text : undefined;
}

function balancedBraces(text: string, start: number): string | undefined {
  let depth = 0;

  for (let index = start; index < text.length; index += 1) {
    if (text[index] === "{") {
      depth += 1;
    } else if (text[index] === "}") {
      depth -= 1;

      if (depth === 0) {
        return text.slice(start, index + 1);
      }
    }
  }

  return undefined;
}

function matchAt(text: string, index: number): string | undefined {
  const rest = text.slice(index);

  for (const pattern of placeholderAt) {
    const match = pattern.exec(rest);

    if (match) {
      return match[0];
    }
  }

  return undefined;
}

function escapeHtml(text: string): string {
  return text.replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;");
}

function decodeHtml(text: string): string {
  const named: Record<string, string> = { amp: "&", lt: "<", gt: ">", quot: '"', apos: "'", nbsp: " " };

  return text.replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (entity, name: string) => {
    if (name.startsWith("#x") || name.startsWith("#X")) {
      return String.fromCodePoint(Number.parseInt(name.slice(2), 16));
    }

    if (name.startsWith("#")) {
      return String.fromCodePoint(Number(name.slice(1)));
    }

    return named[name.toLowerCase()] ?? entity;
  });
}
