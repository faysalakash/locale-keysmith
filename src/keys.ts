import type { LocaleObject, LocaleValue } from "@/types";

// A fixed collator keeps the sort order identical on every machine; the default
// `localeCompare()` follows the runtime locale, so CI and laptops could disagree.
const collator = new Intl.Collator("en");

export function isSorted(value: LocaleObject): boolean {
  return JSON.stringify(value) === JSON.stringify(sortObjectKeys(value));
}

export function sortObjectKeys<T extends LocaleValue>(value: T): T {
  if (Array.isArray(value)) {
    return value.map((item) => sortObjectKeys(item)) as T;
  }

  if (isPlainObject(value)) {
    const sorted = Object.keys(value)
      .sort(collator.compare)
      .reduce<LocaleObject>((result, key) => {
        result[key] = sortObjectKeys(value[key]);

        return result;
      }, {});

    return sorted as T;
  }

  return value;
}

export function flattenKeys(value: LocaleObject, prefix = ""): string[] {
  return Object.entries(value).flatMap(([key, child]) => {
    const path = prefix ? `${prefix}.${key}` : key;

    if (isPlainObject(child)) {
      return flattenKeys(child, path);
    }

    return [path];
  });
}

export function filterIgnoredKeys(keys: string[], ignorePatterns: string[]): string[] {
  if (ignorePatterns.length === 0) {
    return keys;
  }

  const matchers = ignorePatterns.map(patternToRegExp);

  return keys.filter((key) => !matchers.some((matcher) => matcher.test(key)));
}

export function getValueByPath(value: LocaleObject, path: string): LocaleValue | undefined {
  const chain = findKeyChain(value, path.split("."));

  if (!chain) {
    return undefined;
  }

  return chain.reduce<LocaleValue>((current, key) => (current as LocaleObject)[key], value);
}

export function setValueByPath(value: LocaleObject, path: string, nextValue: LocaleValue): void {
  const segments = path.split(".");
  const existing = findKeyChain(value, segments);

  if (existing) {
    const parent = existing.slice(0, -1).reduce((current, key) => current[key] as LocaleObject, value);
    parent[existing.at(-1) as string] = nextValue;

    return;
  }

  let current = value;

  for (const segment of segments.slice(0, -1)) {
    const child = current[segment];

    if (!isPlainObject(child)) {
      current[segment] = {};
    }

    current = current[segment] as LocaleObject;
  }

  current[segments.at(-1) as string] = nextValue;
}

export function deleteValueByPath(value: LocaleObject, path: string): void {
  const chain = findKeyChain(value, path.split("."));

  if (!chain) {
    return;
  }

  const parents: Array<{ object: LocaleObject; key: string }> = [];
  let current = value;

  for (const key of chain.slice(0, -1)) {
    parents.push({ object: current, key });
    current = current[key] as LocaleObject;
  }

  delete current[chain.at(-1) as string];

  for (const parent of parents.reverse()) {
    const child = parent.object[parent.key];

    if (isPlainObject(child) && Object.keys(child).length === 0) {
      delete parent.object[parent.key];
    }
  }
}

/**
 * Resolves a dotted path to the actual object keys it refers to. A key may itself
 * contain dots (`{ "a.b": "x" }`), so `a.b` can mean `a` → `b` or the single key
 * `a.b`; like i18next, nesting is tried first and joined segments second.
 */
function findKeyChain(value: LocaleObject, segments: string[]): string[] | undefined {
  for (let size = 1; size <= segments.length; size += 1) {
    const key = segments.slice(0, size).join(".");

    if (!Object.hasOwn(value, key)) {
      continue;
    }

    const rest = segments.slice(size);

    if (rest.length === 0) {
      return [key];
    }

    const child = value[key];

    if (isPlainObject(child)) {
      const chain = findKeyChain(child, rest);

      if (chain) {
        return [key, ...chain];
      }
    }
  }

  return undefined;
}

function isPlainObject(value: unknown): value is LocaleObject {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function patternToRegExp(pattern: string): RegExp {
  const escaped = pattern.replace(/[.+?^${}()|[\]\\]/g, "\\$&").replaceAll("*", ".*");

  return new RegExp(`^${escaped}$`);
}
