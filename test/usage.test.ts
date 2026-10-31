import { mkdir, mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { describe, expect, it } from "vitest";
import { collectKeyUsage, collectUsedKeys, findKeyUsage, findUsedKeys, isKeyUsed } from "@/usage";

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

describe("collectKeyUsage", () => {
  it("is not thrown off by an apostrophe earlier in the file", () => {
    const source = `
      export const Page = () => <p>Don't panic</p>;
      // it's fine
      const nav = { home: 'nav.home' };
      const label = t('nav.about');
    `;
    const { keys } = collectKeyUsage(source);

    expect(keys.has("nav.home")).toBe(true);
    expect(keys.has("nav.about")).toBe(true);
  });

  it("finds a key on the same line as an apostrophe", () => {
    expect(collectKeyUsage("<p>Don't</p> {t('nav.home')}").keys.has("nav.home")).toBe(true);
  });

  it("records namespaced keys with and without the namespace", () => {
    const { keys } = collectKeyUsage(`t("common:common.title"); t("common:save");`);

    expect(keys.has("common.title")).toBe(true);
    expect(keys.has("common:common.title")).toBe(true);
    expect(keys.has("save")).toBe(true);
  });

  it("applies a useTranslation keyPrefix to the keys in the file", () => {
    const source = `
      const { t } = useTranslation("translation", { keyPrefix: "settings" });
      t("title"); t("common:save"); t(\`tabs.\${tab}\`);
      const LABEL = "profile.name";
    `;
    const { keys, prefixes } = collectKeyUsage(source);

    expect(keys.has("settings.title")).toBe(true);
    expect(keys.has("settings.save")).toBe(true);
    expect(keys.has("settings.profile.name")).toBe(true);
    expect(prefixes.has("settings.tabs.")).toBe(true);
    // The unprefixed forms are kept too: another t in the same file may not use the prefix.
    expect(keys.has("title")).toBe(true);
  });

  it("applies the keyPrefix argument of getFixedT", () => {
    const { keys } = collectKeyUsage(
      `const t = i18next.getFixedT(null, "admin", 'users.table'); t("empty");`
    );

    expect(keys.has("users.table.empty")).toBe(true);
  });

  it("ignores a keyPrefix built at runtime", () => {
    const { keys } = collectKeyUsage("useTranslation('x', { keyPrefix: `${area}` }); t('title');");

    expect([...keys]).toEqual(["title"]);
  });

  it("records the static prefix of dynamically built keys", () => {
    const { keys, prefixes } = collectKeyUsage('t(`theme.${mode}`); t("errors." + code); t(`${ns}.x`);');

    expect([...prefixes].sort()).toEqual(["errors.", "theme."]);
    expect([...keys].some((key) => key.includes("${"))).toBe(false);
  });
});

describe("isKeyUsed", () => {
  const usage = collectKeyUsage(`
    t("cart.item", { count });
    t("friend.greeting", { context: gender });
    t(\`theme.\${mode}\`);
  `);

  it.each(["cart.item_one", "cart.item_other", "cart.item_zero", "cart.item_few", "cart.item_many"])(
    "treats the plural form %s as used",
    (key) => {
      expect(isKeyUsed(key, usage)).toBe(true);
    }
  );

  it("treats context and context+plural forms as used", () => {
    expect(isKeyUsed("friend.greeting_male", usage)).toBe(true);
    expect(isKeyUsed("friend.greeting_male_one", usage)).toBe(true);
  });

  it("treats every key under a dynamic prefix as used", () => {
    expect(isKeyUsed("theme.dark", usage)).toBe(true);
    expect(isKeyUsed("theme.nested.light", usage)).toBe(true);
  });

  it("does not match unrelated keys", () => {
    expect(isKeyUsed("cart.total", usage)).toBe(false);
    expect(isKeyUsed("cart.itemized", usage)).toBe(false);
    expect(isKeyUsed("themes.dark", usage)).toBe(false);
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

  it("aggregates dynamic prefixes across files", async () => {
    const root = await mkdtemp(join(tmpdir(), "lk-usage-"));
    await mkdir(join(root, "src"), { recursive: true });
    await writeFile(join(root, "src", "a.ts"), "t(`theme.${mode}`);\n");

    const usage = await findKeyUsage(root);

    expect(usage.prefixes.has("theme.")).toBe(true);
  });
});
