import { getValueByPath, setValueByPath } from "@/keys";
import type { LocaleFile, LocaleValue } from "@/types";

export async function translateMissingKeys(options: {
  source: LocaleFile;
  target: LocaleFile;
  targetLanguage: string;
  keys: string[];
}): Promise<number> {
  const apiKey = process.env.GOOGLE_TRANSLATE_API_KEY;
  if (!apiKey) {
    throw new Error("GOOGLE_TRANSLATE_API_KEY is required for the translate command.");
  }

  let changed = 0;

  for (const key of options.keys) {
    const sourceValue = getValueByPath(options.source.data, key);
    if (typeof sourceValue !== "string" || sourceValue.trim() === "") continue;

    const translated = await translateText(sourceValue, options.targetLanguage, apiKey);
    setValueByPath(options.target.data, key, translated);
    changed += 1;
  }

  return changed;
}

async function translateText(text: string, target: string, apiKey: string): Promise<LocaleValue> {
  const response = await fetch(`https://translation.googleapis.com/language/translate/v2?key=${apiKey}`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      q: text,
      target,
      format: "text"
    })
  });

  if (!response.ok) {
    throw new Error(`Google Translate request failed with status ${response.status}.`);
  }

  const payload = (await response.json()) as {
    data?: { translations?: Array<{ translatedText?: string }> };
  };

  return payload.data?.translations?.[0]?.translatedText ?? text;
}
