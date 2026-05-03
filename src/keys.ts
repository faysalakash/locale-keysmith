import type { LocaleObject, LocaleValue } from "./types.js";

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

  for (const segment of segments.slice(0, -1)) {
    const child: LocaleValue | undefined = current[segment];
    if (!isPlainObject(child)) return;
    current = child;
  }

  delete current[segments.at(-1) as string];
}

function isPlainObject(value: unknown): value is LocaleObject {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}
