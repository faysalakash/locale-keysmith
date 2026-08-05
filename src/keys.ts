import type { LocaleObject, LocaleValue } from "@/types";

export function isSorted(value: LocaleObject): boolean {
  return JSON.stringify(value) === JSON.stringify(sortObjectKeys(value));
}

export function sortObjectKeys<T extends LocaleValue>(value: T): T {
  if (Array.isArray(value)) {
    return value.map((item) => sortObjectKeys(item)) as T;
  }

  if (isPlainObject(value)) {
    const sorted = Object.keys(value)
      .sort((a, b) => a.localeCompare(b))
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
  if (ignorePatterns.length === 0) return keys;
  const matchers = ignorePatterns.map(patternToRegExp);
  return keys.filter((key) => !matchers.some((matcher) => matcher.test(key)));
}

export function getValueByPath(value: LocaleObject, path: string): LocaleValue | undefined {
  return path.split(".").reduce<LocaleValue | undefined>((current, segment) => {
    if (!isPlainObject(current)) return undefined;
    return current[segment];
  }, value);
}

export function setValueByPath(value: LocaleObject, path: string, nextValue: LocaleValue): void {
  const segments = path.split(".");
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
  const segments = path.split(".");
  let current: LocaleObject | undefined = value;
  const parents: Array<{ object: LocaleObject; key: string }> = [];

  for (const segment of segments.slice(0, -1)) {
    const child: LocaleValue | undefined = current[segment];
    if (!isPlainObject(child)) return;
    parents.push({ object: current, key: segment });
    current = child;
  }

  delete current[segments.at(-1) as string];

  for (const parent of parents.reverse()) {
    const child = parent.object[parent.key];
    if (isPlainObject(child) && Object.keys(child).length === 0) {
      delete parent.object[parent.key];
    }
  }
}

function isPlainObject(value: unknown): value is LocaleObject {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function patternToRegExp(pattern: string): RegExp {
  const escaped = pattern.replace(/[.+?^${}()|[\]\\]/g, "\\$&").replaceAll("*", ".*");
  return new RegExp(`^${escaped}$`);
}
