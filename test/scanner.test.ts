import { mkdir, mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { describe, expect, it } from "vitest";
import { CONFIG_FILENAME } from "@/config";
import { findLocaleFiles, loadLocaleFiles } from "@/scanner";

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
});
