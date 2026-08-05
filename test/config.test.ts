import { mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { CONFIG_FILENAME, loadConfig } from "@/config";

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
