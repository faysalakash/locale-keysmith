import { mkdir, mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { describe, expect, it } from "vitest";
import { CONFIG_FILENAME } from "@/config";
import { findLocaleFiles, groupLocaleFiles, loadLocaleFiles, scanTranslationFiles } from "@/scanner";
import type { LocaleFile } from "@/types";

async function tempProject(files: Record<string, string>): Promise<string> {
  const root = await mkdtemp(join(tmpdir(), "lk-scanner-"));

  for (const [relativePath, contents] of Object.entries(files)) {
    const absolute = join(root, relativePath);
    await mkdir(dirname(absolute), { recursive: true });
    await writeFile(absolute, contents);
  }

  return root;
}

describe("findLocaleFiles", () => {
  it("scans only the src folder by default", async () => {
    const root = await tempProject({
      "src/locales/en.json": '{ "a": "1" }',
      "src/locales/de.yaml": "a: eins\n",
      "app/locales/fr.json": '{ "a": "un" }',
      "public/locales/es.json": '{ "a": "uno" }'
    });

    const locales = (await loadLocaleFiles(root)).map((file) => file.locale).sort();

    expect(locales).toEqual(["de", "en"]);
  });

  it("scans the folders listed in roots, across json/yml/yaml", async () => {
    const root = await tempProject({
      [CONFIG_FILENAME]: JSON.stringify({ roots: ["app", "packages"] }),
      "app/locales/en.json": '{ "a": "1" }',
      "packages/ui/i18n/de.yaml": "a: eins\n",
      "packages/ui/i18n/fr.yml": "a: un\n",
      "src/locales/es.json": '{ "a": "uno" }'
    });

    const files = await loadLocaleFiles(root);
    const locales = files.map((file) => file.locale).sort();

    expect(locales).toEqual(["de", "en", "fr"]);
    expect(files.find((file) => file.locale === "de")?.format).toBe("yaml");
    expect(files.find((file) => file.locale === "fr")?.data).toEqual({ a: "un" });
  });

  it("ignores build and dependency directories inside a root", async () => {
    const root = await tempProject({
      [CONFIG_FILENAME]: JSON.stringify({ roots: ["."] }),
      "locales/en.json": '{ "a": "1" }',
      "node_modules/pkg/locales/de.json": '{ "a": "zwei" }',
      "dist/locales/fr.json": '{ "a": "trois" }'
    });

    const paths = await findLocaleFiles(root);

    expect(paths).toHaveLength(1);
    expect(paths[0].endsWith(join("locales", "en.json"))).toBe(true);
  });

  it("skips JSON/YAML files that are not named after a locale", async () => {
    const root = await tempProject({
      "src/locales/en.json": '{ "a": "1" }',
      "src/data/config.json": '{ "apiUrl": "https://example.com" }',
      "src/settings.yaml": "theme: dark\n"
    });

    const paths = await findLocaleFiles(root);

    expect(paths).toHaveLength(1);
    expect(paths[0].endsWith(join("locales", "en.json"))).toBe(true);
  });

  it("does not pick up project files when a root is the project itself", async () => {
    const root = await tempProject({
      [CONFIG_FILENAME]: JSON.stringify({ roots: ["."] }),
      "package.json": '{ "name": "app" }',
      "tsconfig.json": "{}",
      "pnpm-lock.yaml": "lockfileVersion: '9.0'\n",
      "locales/en.json": '{ "a": "1" }'
    });

    const paths = await findLocaleFiles(root);

    expect(paths.map((path) => path.slice(root.length + 1))).toEqual([join("locales", "en.json")]);
  });

  it("infers the locale from the directory in the i18next-http-backend layout", async () => {
    const root = await tempProject({
      [CONFIG_FILENAME]: JSON.stringify({ roots: ["public"] }),
      "public/locales/en/common.json": '{ "a": "1" }',
      "public/locales/de/common.json": '{ "a": "eins" }'
    });

    const locales = (await loadLocaleFiles(root)).map((file) => file.locale).sort();

    expect(locales).toEqual(["de", "en"]);
  });
});

describe("scanTranslationFiles", () => {
  it("returns the matched files that are not locale files as skipped", async () => {
    const root = await tempProject({
      "src/locales/en.json": '{ "a": "1" }',
      "src/locales/english.json": '{ "a": "1" }',
      "src/data/config.json": '{ "apiUrl": "https://example.com" }'
    });

    const { localeFiles, skipped } = await scanTranslationFiles(root);
    const relative = (paths: string[]): string[] => paths.map((path) => path.slice(root.length + 1)).sort();

    expect(relative(localeFiles)).toEqual([join("src", "locales", "en.json")]);
    expect(relative(skipped)).toEqual([
      join("src", "data", "config.json"),
      join("src", "locales", "english.json")
    ]);
  });

  it("does not list the config file as skipped", async () => {
    const root = await tempProject({
      [CONFIG_FILENAME]: JSON.stringify({ roots: ["."] }),
      "locales/en.json": '{ "a": "1" }'
    });

    expect((await scanTranslationFiles(root)).skipped).toEqual([]);
  });
});

describe("groupLocaleFiles", () => {
  const file = (path: string, locale: string): LocaleFile => ({ path, locale, format: "json", data: {} });

  it("keeps separate sets of translations apart", () => {
    const groups = groupLocaleFiles(
      [
        file(join("src", "locales", "en.json"), "en"),
        file(join("src", "locales", "de.json"), "de"),
        file(join("plugin", "locales", "en.json"), "en"),
        file(join("plugin", "locales", "fr.json"), "fr")
      ],
      "en"
    );

    expect(groups.map((group) => [group.source?.path, group.targets.map((target) => target.locale)])).toEqual(
      [
        [join("src", "locales", "en.json"), ["de"]],
        [join("plugin", "locales", "en.json"), ["fr"]]
      ]
    );
  });

  it("groups namespaced files by namespace", () => {
    const groups = groupLocaleFiles(
      [
        file(join("locales", "en", "common.json"), "en"),
        file(join("locales", "en", "home.json"), "en"),
        file(join("locales", "de", "common.json"), "de")
      ],
      "en"
    );

    expect(groups).toHaveLength(2);
    expect(groups[0].targets.map((target) => target.path)).toEqual([join("locales", "de", "common.json")]);
    expect(groups[1].targets).toEqual([]);
  });

  it("rejects two files for the same locale in one group", () => {
    expect(() =>
      groupLocaleFiles([file(join("locales", "en.json"), "en"), file(join("locales", "en.yaml"), "en")], "en")
    ).toThrow(/two "en" locale files/);
  });
});
