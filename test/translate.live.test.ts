import { execFile } from "node:child_process";
import { mkdir, mkdtemp, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";
import { afterEach, describe, expect, it, vi } from "vitest";
import { getValueByPath } from "@/keys";
import { translateMissingKeys } from "@/translate";
import type { LocaleFile, LocaleObject } from "@/types";

// Calls the real Google Translate API, so it only runs when asked to:
//   LIVE_TRANSLATE=1 GOOGLE_TRANSLATE_API_KEY=... pnpm run test:live
// A full run sends roughly 2,000 characters.
const live = process.env.LIVE_TRANSLATE === "1";

if (live && !process.env.GOOGLE_TRANSLATE_API_KEY) {
  throw new Error("LIVE_TRANSLATE=1 needs GOOGLE_TRANSLATE_API_KEY to be set.");
}

const execFileAsync = promisify(execFile);
const repoRoot = join(dirname(fileURLToPath(import.meta.url)), "..");

function localeFile(data: LocaleObject, locale: string): LocaleFile {
  return { path: `${locale}.json`, locale, format: "json", data };
}

async function translate(data: LocaleObject, targetLanguage: string, source = "en") {
  const target = localeFile({}, targetLanguage);
  const result = await translateMissingKeys({
    source: localeFile(data, source),
    target,
    targetLanguage,
    keys: Object.keys(data)
  });

  return { result, target };
}

afterEach(() => {
  vi.unstubAllEnvs();
});

describe.runIf(live)("translate against the real Google Translate API", () => {
  it("translates plain text", async () => {
    const { result, target } = await translate(
      { greeting: "Good morning", farewell: "See you tomorrow" },
      "de"
    );

    expect(result).toEqual({ translated: 2, skipped: [] });
    expect(target.data.greeting).toMatch(/morgen/i);
    expect(target.data.farewell).not.toBe("See you tomorrow");
  });

  it("keeps every kind of placeholder intact", async () => {
    const source = {
      i18next: "Hello {{name}}, welcome back",
      icu: "You have {count} new messages",
      icuPlural: "{count, plural, one {# file} other {# files}} selected",
      trans: "<0>Click here</0> to continue",
      selfClosing: "First line<br/>Second line",
      nesting: "Read the $t(legal.terms) first",
      printf: "%s files uploaded by %1$s"
    };
    const { result, target } = await translate(source, "de");

    expect(result.skipped).toEqual([]);
    expect(target.data.i18next).toContain("{{name}}");
    expect(target.data.icu).toContain("{count}");
    expect(target.data.icuPlural).toContain("{count, plural, one {# file} other {# files}}");
    expect(target.data.trans).toMatch(/<0>.+<\/0>/);
    expect(target.data.selfClosing).toContain("<br/>");
    expect(target.data.nesting).toContain("$t(legal.terms)");
    expect(target.data.printf).toContain("%s");
    expect(target.data.printf).toContain("%1$s");
  });

  it("returns plain text, not HTML entities", async () => {
    const { target } = await translate({ text: `Don't close the "Settings" window & wait` }, "fr");

    expect(target.data.text).not.toMatch(/&(?:amp|quot|#39|lt|gt);/);
  });

  it("accepts underscore locales such as pt_BR and regional sources such as en-GB", async () => {
    const { result } = await translate({ save: "Save changes" }, "pt_BR", "en-GB");

    expect(result.translated).toBe(1);
  });

  it("translates more keys than fit in one request", async () => {
    const data = Object.fromEntries(Array.from({ length: 120 }, (_, i) => [`item${i}`, `Item number ${i}`]));
    const { result, target } = await translate(data, "es");

    expect(result.translated).toBe(120);
    expect(getValueByPath(target.data, "item119")).toMatch(/119/);
  });

  it("reports the API's own error message for a bad key", async () => {
    vi.stubEnv("GOOGLE_TRANSLATE_API_KEY", "not-a-real-key");

    await expect(translate({ a: "Hello" }, "de")).rejects.toThrow(
      /Google Translate request failed with status 400: .*API key/i
    );
  });

  it("writes the translations to disk through the CLI", async () => {
    const project = await mkdtemp(join(tmpdir(), "locale-keysmith-live-"));
    await mkdir(join(project, "src", "locales"), { recursive: true });
    await writeFile(
      join(project, "src", "locales", "en.json"),
      '{\n  "cart": {\n    "item_one": "{{count}} item",\n    "item_other": "{{count}} items"\n  }\n}\n'
    );

    await execFileAsync(
      join(repoRoot, "node_modules", ".bin", "tsx"),
      [join(repoRoot, "src", "cli.ts"), "translate", "--to", "pl", "--write"],
      { cwd: project, env: { ...process.env, TSX_TSCONFIG_PATH: join(repoRoot, "tsconfig.json") } }
    );

    const polish = JSON.parse(await readFile(join(project, "src", "locales", "pl.json"), "utf8")) as {
      cart: Record<string, string>;
    };

    // Polish needs _few and _many, which English lacks; they are translated from _other.
    expect(Object.keys(polish.cart).sort()).toEqual(["item_few", "item_many", "item_one", "item_other"]);
    expect(Object.values(polish.cart).every((text) => text.includes("{{count}}"))).toBe(true);
  });
});
