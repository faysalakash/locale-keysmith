import { mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { CONFIG_FILENAME, loadConfig, validateConfig } from "@/config";

async function tempDir(): Promise<string> {
  return mkdtemp(join(tmpdir(), "lk-config-"));
}

describe("loadConfig", () => {
  it("defaults to scanning only the src folder when no config file exists", async () => {
    const config = loadConfig(await tempDir());

    expect(config.sourceLocale).toBe("en");
    expect(config.roots).toEqual(["src"]);
    expect(config.translationFiles).toEqual(["src/**/*.{json,yml,yaml}"]);
    expect(config.src).toEqual(["src/**/*.{ts,tsx,js,jsx,mjs,cjs,vue,svelte}"]);
    expect(config.ignoreKeys).toEqual([]);
  });

  it("derives translationFiles and src from user-provided roots", async () => {
    const dir = await tempDir();
    await writeFile(join(dir, CONFIG_FILENAME), JSON.stringify({ roots: ["app", "packages/ui/"] }));

    const config = loadConfig(dir);

    expect(config.roots).toEqual(["app", "packages/ui/"]);
    expect(config.translationFiles).toEqual(["app/**/*.{json,yml,yaml}", "packages/ui/**/*.{json,yml,yaml}"]);
    expect(config.src).toEqual([
      "app/**/*.{ts,tsx,js,jsx,mjs,cjs,vue,svelte}",
      "packages/ui/**/*.{ts,tsx,js,jsx,mjs,cjs,vue,svelte}"
    ]);
  });

  it("lets explicit translationFiles/src globs override the roots derivation", async () => {
    const dir = await tempDir();
    await writeFile(
      join(dir, CONFIG_FILENAME),
      JSON.stringify({ roots: ["app"], translationFiles: ["custom/*.json"] })
    );

    const config = loadConfig(dir);

    expect(config.translationFiles).toEqual(["custom/*.json"]);
    expect(config.src).toEqual(["app/**/*.{ts,tsx,js,jsx,mjs,cjs,vue,svelte}"]);
  });

  it("merges user overrides on top of defaults", async () => {
    const dir = await tempDir();
    await writeFile(
      join(dir, CONFIG_FILENAME),
      JSON.stringify({ sourceLocale: "fr", ignoreKeys: ["debug.*"] })
    );

    const config = loadConfig(dir);

    expect(config.sourceLocale).toBe("fr");
    expect(config.ignoreKeys).toEqual(["debug.*"]);
    expect(config.roots).toEqual(["src"]);
    expect(config.translationFiles.length).toBeGreaterThan(0);
  });

  it("throws a helpful error with the original cause on invalid JSON", async () => {
    const dir = await tempDir();
    await writeFile(join(dir, CONFIG_FILENAME), "{ not valid json ");

    try {
      loadConfig(dir);
      expect.unreachable("loadConfig should have thrown");
    } catch (error) {
      expect(error).toBeInstanceOf(Error);
      expect((error as Error).message).toContain(`Failed to parse ${CONFIG_FILENAME}`);
      expect((error as Error).cause).toBeDefined();
    }
  });

  it("returns an isolated copy so callers cannot mutate shared defaults", async () => {
    const dir = await tempDir();

    const first = loadConfig(dir);
    first.translationFiles.push("**/mutated/**");
    first.sourceLocale = "zz";

    const second = loadConfig(dir);

    expect(second.translationFiles).not.toContain("**/mutated/**");
    expect(second.sourceLocale).toBe("en");
  });
});

describe("validateConfig", () => {
  it("accepts a valid config, including $schema", () => {
    const config = {
      $schema: "./schema.json",
      sourceLocale: "pt-BR",
      roots: ["src"],
      translationFiles: ["locales/*.json"],
      src: ["src/**/*.ts"],
      ignoreKeys: ["debug.*"]
    };

    expect(validateConfig(config)).toEqual(config);
  });

  it.each([
    [[], "expected a JSON object, found []"],
    ["en", 'expected a JSON object, found "en"'],
    [null, "expected a JSON object, found null"]
  ])("rejects a non-object config %j", (config, message) => {
    expect(() => validateConfig(config)).toThrow(message);
  });

  it("suggests the array form when a list field is a plain string", () => {
    expect(() => validateConfig({ roots: "src" })).toThrow(
      '"roots" must be an array of strings: use ["src"]'
    );
  });

  it("rejects list fields with non-string or empty entries", () => {
    expect(() => validateConfig({ ignoreKeys: ["ok", 3] })).toThrow(
      '"ignoreKeys" must be an array of non-empty strings, found ["ok",3]'
    );
    expect(() => validateConfig({ src: [""] })).toThrow('"src" must be an array of non-empty strings');
  });

  it("rejects a sourceLocale that is not a locale code", () => {
    expect(() => validateConfig({ sourceLocale: "english" })).toThrow(
      '"sourceLocale" must be a locale code such as "en" or "pt-BR", found "english"'
    );
    expect(() => validateConfig({ sourceLocale: 1 })).toThrow('"sourceLocale" must be a string');
  });

  it("rejects unknown fields and suggests the closest known one", () => {
    expect(() => validateConfig({ ignoredKeys: [] })).toThrow(
      'unknown field "ignoredKeys" (did you mean "ignoreKeys"?)'
    );
    expect(() => validateConfig({ banana: true })).toThrow(/unknown field "banana"$/m);
  });

  it("lists every problem in one error", () => {
    expect(() => validateConfig({ roots: "src", sourceLocale: "english", rooots: [] })).toThrow(
      [
        `Invalid ${CONFIG_FILENAME}:`,
        '  - unknown field "rooots" (did you mean "roots"?)',
        '  - "sourceLocale" must be a locale code such as "en" or "pt-BR", found "english"',
        '  - "roots" must be an array of strings: use ["src"] instead of "src"'
      ].join("\n")
    );
  });

  it("is applied when the config file is loaded", async () => {
    const dir = await tempDir();
    await writeFile(join(dir, CONFIG_FILENAME), JSON.stringify({ roots: "app" }));

    expect(() => loadConfig(dir)).toThrow(`Invalid ${CONFIG_FILENAME}`);
  });
});
