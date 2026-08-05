import { readFileSync } from "node:fs";
import { loadConfig } from "@/config";
import { globFiles } from "@/glob";

const callPatterns = [
  /\b(?:t|i18n\.t|\$t|translate)\(\s*["'`]([^"'`]+)["'`]/g, // t("key"), i18n.t('key'), $t(`key`), translate("key")
  /\bi18nKey\s*=\s*["'`]([^"'`]+)["'`]/g // <Trans i18nKey="key" />, useTranslation-style i18nKey props
];

const stringLiteralPattern = /(["'`])((?:\\.|(?!\1)[^\\])*)\1/g;

const keyShape = /^[A-Za-z0-9_$-]+(?:\.[A-Za-z0-9_$-]+)+$/;

export async function findUsedKeys(cwd = process.cwd()): Promise<Set<string>> {
  const files = await globFiles(loadConfig(cwd).src, cwd);
  const used = new Set<string>();

  for (const file of files) {
    collectUsedKeys(readFileSync(file, "utf8"), used);
  }

  return used;
}

export function collectUsedKeys(content: string, used = new Set<string>()): Set<string> {
  for (const pattern of callPatterns) {
    for (const match of content.matchAll(pattern)) {
      if (match[1] && !match[1].includes("${")) {
        used.add(match[1]);
      }
    }
  }

  for (const match of content.matchAll(stringLiteralPattern)) {
    const literal = match[2];

    if (keyShape.test(literal)) {
      used.add(literal);
    }
  }

  return used;
}
