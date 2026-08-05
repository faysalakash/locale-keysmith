import { mkdir, mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { describe, expect, it } from "vitest";
import { collectUsedKeys, findUsedKeys } from "@/usage";

describe("collectUsedKeys", () => {
  it("detects keys passed directly to translation calls and aliases", () => {
    const source = `
      t("app.title");
      i18n.t("app.tagline");
      $t("app.menuLabel");
      translate("footer.copyright");
    `;

    expect([...collectUsedKeys(source)].sort()).toEqual([
      "app.menuLabel",
      "app.tagline",
      "app.title",
      "footer.copyright"
    ]);
  });

  it("detects keys passed as a JSX i18nKey prop", () => {
    expect(collectUsedKeys(`<Trans i18nKey="banner.welcome" />;`).has("banner.welcome")).toBe(true);
  });

  it("detects both keys of a ternary", () => {
    const used = collectUsedKeys(`t(online ? "status.online" : "status.offline");`);
    expect(used.has("status.online")).toBe(true);
    expect(used.has("status.offline")).toBe(true);
  });

  it("detects keys referenced indirectly through a lookup object", () => {
    const source = `
      const priorityKey: Record<string, string> = {
        low: "priority.low",
        medium: "priority.medium",
        high: "priority.high"
      };
      const label = t(priorityKey[priority]);
    `;

    expect([...collectUsedKeys(source)]).toEqual(
      expect.arrayContaining(["priority.low", "priority.medium", "priority.high"])
    );
  });

  it("detects keys stored in an array and mapped over", () => {
    const source = `const tagKeys = ["tag.work", "tag.personal", "tag.urgent"];`;
    const used = collectUsedKeys(source);

    expect(used.has("tag.work")).toBe(true);
    expect(used.has("tag.personal")).toBe(true);
    expect(used.has("tag.urgent")).toBe(true);
  });

  it("detects a key held in a standalone constant", () => {
    expect(collectUsedKeys(`const FOOTER_KEY = "footer.copyright";`).has("footer.copyright")).toBe(true);
  });

  it("detects a template literal without interpolation", () => {
    expect(collectUsedKeys("t(`action.save`);").has("action.save")).toBe(true);
  });

  it("ignores dynamic template keys and non-key literals", () => {
    const source = `
      import { useTranslation } from "react-i18next";
      const path = "./components/App";
      const ns = "node:fs";
      const label = t(\`theme.\${mode}\`);
    `;

    const used = collectUsedKeys(source);

    expect(used.has("react-i18next")).toBe(false);
    expect(used.has("./components/App")).toBe(false);
    expect(used.has("node:fs")).toBe(false);
    expect([...used].some((key) => key.includes("${"))).toBe(false);
  });
});

describe("findUsedKeys", () => {
  it("scans configured source files and aggregates their keys", async () => {
    const root = await mkdtemp(join(tmpdir(), "lk-usage-"));
    const componentPath = join(root, "src", "Notes.tsx");
    await mkdir(dirname(componentPath), { recursive: true });
    await writeFile(componentPath, `const map = { work: "tag.work" };\nt(map.work);\nt("app.title");\n`);

    const used = await findUsedKeys(root);

    expect(used.has("tag.work")).toBe(true);
    expect(used.has("app.title")).toBe(true);
  });
});
