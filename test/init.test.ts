import { mkdir, mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { describe, expect, it } from "vitest";
import { loadConfig } from "@/config";
import { detectConfig } from "@/init";

async function tempProject(files: Record<string, string>): Promise<string> {
  const root = await mkdtemp(join(tmpdir(), "lk-init-"));

  for (const [relativePath, contents] of Object.entries(files)) {
    const absolute = join(root, relativePath);
    await mkdir(dirname(absolute), { recursive: true });
    await writeFile(absolute, contents);
  }

  return root;
}

describe("detectConfig", () => {
  it("finds locale folders and source folders", async () => {
    const root = await tempProject({
      "public/locales/en/common.json": '{ "a": "1" }',
      "public/locales/de/common.json": '{ "a": "eins" }',
      "src/main.ts": 't("a");',
      "package.json": '{ "name": "app" }',
      "src/data/config.json": "{}"
    });

    const detection = await detectConfig(root);

    expect(detection.config).toEqual({ sourceLocale: "en", roots: ["public", "src"], ignoreKeys: [] });
    expect(detection.locales).toEqual(["de", "en"]);
    expect(detection.localeFiles).toEqual([
      join("public", "locales", "de", "common.json"),
      join("public", "locales", "en", "common.json")
    ]);
  });

  it("ignores locale files in tests, fixtures and dependencies", async () => {
    const root = await tempProject({
      "src/locales/en.json": "{}",
      "test/fixtures/app/locales/fr.json": "{}",
      "node_modules/pkg/locales/es.json": "{}"
    });

    const detection = await detectConfig(root);

    expect(detection.locales).toEqual(["en"]);
    expect(detection.config.roots).toEqual(["src"]);
  });

  it("uses an English variant as the source when there is no plain en", async () => {
    const root = await tempProject({ "locales/en-US.json": "{}", "locales/de.json": "{}" });

    expect((await detectConfig(root)).config.sourceLocale).toBe("en-US");
  });

  it("otherwise picks the locale with the most keys as the source", async () => {
    const root = await tempProject({
      "locales/de.json": '{ "a": "1", "b": "2", "c": "3" }',
      "locales/fr.json": '{ "a": "1" }'
    });

    expect((await detectConfig(root)).config.sourceLocale).toBe("de");
  });

  it("falls back to the defaults when nothing is found", async () => {
    const root = await tempProject({ "README.md": "hi" });

    expect((await detectConfig(root)).config).toEqual({ sourceLocale: "en", roots: ["src"], ignoreKeys: [] });
  });

  it("produces a config that passes validation", async () => {
    const root = await tempProject({ "src/i18n/pt_BR.yaml": "a: b\n", "src/i18n/en.yaml": "a: b\n" });
    const { config } = await detectConfig(root);
    await writeFile(join(root, "locale-keysmith.config.json"), JSON.stringify(config));

    expect(loadConfig(root).sourceLocale).toBe("en");
  });
});
