import { flattenKeys } from "@/keys";
import type { LocaleFile, LocaleObject, LocaleValue } from "@/types";

// i18next plural keys: `item_one`, `item_other`, and ordinals like `place_ordinal_two`.
const pluralKey = /^(.+?)_(ordinal_)?(zero|one|two|few|many|other)$/;
const pluralCategories = ["zero", "one", "two", "few", "many", "other"];

export interface TypeMismatch {
  key: string;
  /** Value kind in the source file: string, number, boolean, null, array or object. */
  source: string;
  target: string;
}

/**
 * The keys a target locale should contain: the source keys, with plural forms adjusted to
 * the target language. English `item_one`/`item_other` becomes `item_one`/`item_few`/
 * `item_many`/`item_other` for Polish and just `item_other` for Japanese.
 */
export function expectedKeys(sourceKeys: string[], targetLocale: string): string[] {
  const available = new Set(sourceKeys);
  const expanded = new Set<string>();
  const expected: string[] = [];

  for (const key of sourceKeys) {
    const plural = parsePluralKey(key, available);

    if (!plural) {
      expected.push(key);
      continue;
    }

    if (expanded.has(plural.stem)) {
      continue;
    }

    expanded.add(plural.stem);

    // `_zero` is optional in i18next, so it is only expected when the source has one.
    const categories = categoriesFor(targetLocale, plural.ordinal);
    const wanted = pluralCategories.filter(
      (category) => categories.has(category) || (category === "zero" && available.has(`${plural.stem}zero`))
    );
    expected.push(...wanted.map((category) => `${plural.stem}${category}`));
  }

  return expected;
}

export function missingKeys(sourceKeys: string[], target: LocaleFile): string[] {
  const present = new Set(flattenKeys(target.data));

  return expectedKeys(sourceKeys, target.locale).filter((key) => !present.has(key));
}

/** Keys in the target that the source does not have (allowing for the target's plural forms). */
export function extraKeys(sourceKeys: string[], target: LocaleFile): string[] {
  const expected = new Set(expectedKeys(sourceKeys, target.locale));
  const available = new Set(sourceKeys);

  return flattenKeys(target.data).filter((key) => {
    if (expected.has(key)) {
      return false;
    }

    // An optional `_zero` form is fine wherever the base key is a plural.
    const plural = pluralKey.exec(key);

    return !(plural?.[3] === "zero" && available.has(`${plural[1]}_${plural[2] ?? ""}other`));
  });
}

/**
 * Keys written more than once in a file. `{ "a.b": "x", "a": { "b": "y" } }` defines `a.b`
 * twice, and i18next only ever reads one of the two values.
 */
export function duplicateKeys(file: LocaleFile): string[] {
  const seen = new Set<string>();
  const duplicates = new Set<string>();

  for (const key of flattenKeys(file.data)) {
    (seen.has(key) ? duplicates : seen).add(key);
  }

  return [...duplicates];
}

/** Keys whose value is an empty or whitespace-only string, or null. */
export function emptyValueKeys(file: LocaleFile): string[] {
  return leafEntries(file.data)
    .filter(([, value]) => value === null || (typeof value === "string" && value.trim() === ""))
    .map(([key]) => key);
}

/** Keys that hold a different kind of value in the target than in the source. */
export function typeMismatches(source: LocaleObject, target: LocaleObject, prefix = ""): TypeMismatch[] {
  return Object.entries(source).flatMap(([key, sourceValue]): TypeMismatch[] => {
    if (!Object.hasOwn(target, key)) {
      return [];
    }

    const path = prefix ? `${prefix}.${key}` : key;
    const targetValue = target[key];
    const sourceKind = kindOf(sourceValue);
    const targetKind = kindOf(targetValue);

    if (sourceKind !== targetKind) {
      return [{ key: path, source: sourceKind, target: targetKind }];
    }

    return sourceKind === "object"
      ? typeMismatches(sourceValue as LocaleObject, targetValue as LocaleObject, path)
      : [];
  });
}

/**
 * For a plural form the source language does not have (Polish `_few` from English), the
 * source text to translate from: the `_other` form, which i18next treats as the general one.
 */
export function pluralFallbackKey(key: string): string | undefined {
  const plural = pluralKey.exec(key);

  return plural && plural[3] !== "other" ? `${plural[1]}_${plural[2] ?? ""}other` : undefined;
}

function parsePluralKey(key: string, available: Set<string>): { stem: string; ordinal: boolean } | undefined {
  const match = pluralKey.exec(key);

  if (!match) {
    return undefined;
  }

  const stem = `${match[1]}_${match[2] ?? ""}`;

  // Only treat it as a plural when the group has the mandatory `_other` form; a key like
  // `step_one` on its own is just a name.
  return available.has(`${stem}other`) ? { stem, ordinal: Boolean(match[2]) } : undefined;
}

function categoriesFor(locale: string, ordinal: boolean): Set<string> {
  const tag = locale.replaceAll("_", "-");
  const type = ordinal ? "ordinal" : "cardinal";

  try {
    if (Intl.PluralRules.supportedLocalesOf(tag).length > 0) {
      return new Set(new Intl.PluralRules(tag, { type }).resolvedOptions().pluralCategories);
    }
  } catch {
    // Not a valid tag: fall through and keep every form.
  }

  return new Set(pluralCategories);
}

function leafEntries(value: LocaleObject, prefix = ""): Array<[string, LocaleValue]> {
  return Object.entries(value).flatMap(([key, child]): Array<[string, LocaleValue]> => {
    const path = prefix ? `${prefix}.${key}` : key;

    return kindOf(child) === "object" ? leafEntries(child as LocaleObject, path) : [[path, child]];
  });
}

function kindOf(value: LocaleValue): string {
  if (value === null) {
    return "null";
  }

  if (Array.isArray(value)) {
    return "array";
  }

  return typeof value;
}
