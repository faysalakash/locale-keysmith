import { readFileSync } from "node:fs";
import { loadConfig } from "@/config";
import { globFiles } from "@/glob";

export interface KeyUsage {
  /** Keys referenced literally, e.g. `t("app.title")` or a `"app.title"` constant. */
  keys: Set<string>;
  /** Static prefixes of dynamically built keys, e.g. `theme.` from t(`theme.${mode}`). */
  prefixes: Set<string>;
}

// An optional i18next namespace (`common:`) followed by a dotted key path.
const namespace = "(?:[A-Za-z0-9_-]+:)?";
const segment = "[A-Za-z0-9_$-]+";

// Literals may not contain quotes or newlines, so a stray apostrophe (`Don't`) cannot
// open a fake string that swallows the code after it.
const callPatterns = [
  /(?<![\w$])(?:t|\$t|translate)\(\s*(["'`])([^"'`\n]+)\1/g, // t("key"), i18n.t('key'), $t(`key`), translate("key")
  /\bi18nKey\s*=\s*\{?\s*(["'`])([^"'`\n]+)\1/g // <Trans i18nKey="key" />, i18nKey={"key"}
];

// Any quoted string shaped like a dotted key path, wherever it appears.
const keyLiteralPattern = new RegExp(`(["'\`])(${namespace}${segment}(?:\\.${segment})+)\\1`, "g");

const prefixPatterns = [
  new RegExp(`\`(${namespace}(?:${segment}\\.)+)\\$\\{`, "g"), // `theme.${mode}`
  new RegExp(`(["'\`])(${namespace}(?:${segment}\\.)+)\\1\\s*\\+`, "g") // "theme." + mode
];

export async function findKeyUsage(cwd = process.cwd()): Promise<KeyUsage> {
  const files = await globFiles(loadConfig(cwd).src, cwd);
  const usage: KeyUsage = { keys: new Set(), prefixes: new Set() };

  for (const file of files) {
    collectKeyUsage(readFileSync(file, "utf8"), usage);
  }

  return usage;
}

export async function findUsedKeys(cwd = process.cwd()): Promise<Set<string>> {
  return (await findKeyUsage(cwd)).keys;
}

export function collectKeyUsage(
  content: string,
  usage: KeyUsage = { keys: new Set(), prefixes: new Set() }
): KeyUsage {
  for (const pattern of callPatterns) {
    for (const match of content.matchAll(pattern)) {
      if (!match[2].includes("${")) {
        addWithoutNamespace(usage.keys, match[2]);
      }
    }
  }

  for (const match of content.matchAll(keyLiteralPattern)) {
    addWithoutNamespace(usage.keys, match[2]);
  }

  for (const pattern of prefixPatterns) {
    for (const match of content.matchAll(pattern)) {
      addWithoutNamespace(usage.prefixes, match.at(-1) as string);
    }
  }

  return usage;
}

export function collectUsedKeys(content: string, used = new Set<string>()): Set<string> {
  collectKeyUsage(content, { keys: used, prefixes: new Set() });

  return used;
}

/**
 * Whether a locale key is referenced, directly or the way i18next resolves it at runtime:
 * `t("cart.item", { count })` reads `cart.item_one` / `cart.item_other` (and `_zero`,
 * `_few`, ...), `{ context: "male" }` reads `cart.item_male`, and t(`theme.${mode}`) may
 * read any key under `theme.`.
 */
export function isKeyUsed(key: string, usage: KeyUsage): boolean {
  if (usage.keys.has(key)) {
    return true;
  }

  for (const prefix of usage.prefixes) {
    if (key.startsWith(prefix)) {
      return true;
    }
  }

  const lastSegment = key.lastIndexOf(".") + 1;

  for (let index = key.indexOf("_", lastSegment); index !== -1; index = key.indexOf("_", index + 1)) {
    if (usage.keys.has(key.slice(0, index))) {
      return true;
    }
  }

  return false;
}

// `common:app.title` refers to `app.title` in the `common` namespace; record both forms.
function addWithoutNamespace(target: Set<string>, key: string): void {
  target.add(key);

  const separator = key.indexOf(":");

  if (separator !== -1) {
    target.add(key.slice(separator + 1));
  }
}
