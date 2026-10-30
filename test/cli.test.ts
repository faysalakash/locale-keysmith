import { execFile } from "node:child_process";
import { cp, mkdir, mkdtemp, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";
import { describe, expect, it } from "vitest";

const execFileAsync = promisify(execFile);
const repoRoot = join(dirname(fileURLToPath(import.meta.url)), "..");
const cliPath = join(repoRoot, "src", "cli.ts");
const tsconfigPath = join(repoRoot, "tsconfig.json");
const fixturesPath = join(repoRoot, "test", "fixtures");
const tsxPath = join(repoRoot, "node_modules", ".bin", "tsx");

async function createProjectCopy(fixture = "basic-project"): Promise<string> {
  const project = await mkdtemp(join(tmpdir(), "locale-keysmith-"));
  await cp(join(fixturesPath, fixture), project, { recursive: true });

  return project;
}

async function runCli(cwd: string, ...args: string[]): Promise<string> {
  try {
    // tsx resolves tsconfig `paths` relative to cwd, so point it at the repo tsconfig.
    const result = await execFileAsync(tsxPath, [cliPath, ...args], {
      cwd,
      env: { ...process.env, TSX_TSCONFIG_PATH: tsconfigPath }
    });

    return result.stdout;
  } catch (error) {
    // Commands like `health` exit non-zero when they find issues; keep their stdout.
    return (error as { stdout?: string }).stdout ?? "";
  }
}

describe("cli", () => {
  it("starts with a node shebang so npm's bin link can execute it", async () => {
    const source = await readFile(cliPath, "utf8");

    expect(source.startsWith("#!/usr/bin/env node\n")).toBe(true);
  });

  it("reports the version from package.json", async () => {
    const { version } = JSON.parse(await readFile(join(repoRoot, "package.json"), "utf8")) as {
      version: string;
    };
    const output = await runCli(repoRoot, "--version");

    expect(output.trim()).toBe(version);
  });

  it("scans locale files", async () => {
    const project = await createProjectCopy();
    const output = await runCli(project, "scan");

    expect(output).toContain("en");
    expect(output).toContain("de");
    expect(output).toContain("locales/en.json");
    expect(output).toContain("locales/de.json");
  });

  it("reports missing keys against the source locale", async () => {
    const project = await createProjectCopy();
    const output = await runCli(project, "missing");

    expect(output).toContain("de");
    expect(output).toContain("status.offline");
    expect(output).toContain("legacy.oldButton");
    expect(output).toContain("legacy.deprecatedTooltip");
    expect(output).toContain("draft.placeholder");
  });

  const usedKeys = [
    "app.title", // (1) direct t() in JSX
    "app.tagline", // (2) i18n.t()
    "app.menuLabel", // (3) t() in a JSX attribute
    "banner.welcome", // (4) <Trans i18nKey="...">
    "status.online", // (5) ternary branch
    "status.offline", // (5) ternary branch
    "priority.low", // (6) lookup-object value
    "priority.medium", // (6) lookup-object value
    "priority.high", // (6) lookup-object value
    "tag.work", // (7) array of keys
    "tag.personal", // (7) array of keys
    "tag.urgent", // (7) array of keys
    "footer.copyright", // (8) standalone constant
    "action.save" // (9) template literal, no interpolation
  ];

  it("recognises keys used in every form and only reports the truly unused", async () => {
    const project = await createProjectCopy();
    const output = await runCli(project, "unused");
    const reported = output.split("\n").filter(Boolean);

    // None of the referenced keys — direct, indirect, ternary, array, etc. — are flagged.
    for (const key of usedKeys) {
      expect(reported).not.toContain(key);
    }

    // Genuinely unreferenced keys are reported...
    expect(reported).toContain("legacy.oldButton");
    expect(reported).toContain("legacy.deprecatedTooltip");
    expect(reported).toContain("draft.placeholder");

    // Keys under a dynamic `t(\`theme.${mode}\`)` prefix count as used, so they are never deleted.
    expect(reported).not.toContain("theme.dark");
    expect(reported).not.toContain("theme.light");

    // Exactly the three unreferenced keys, nothing more.
    expect(reported).toHaveLength(3);
  });

  it("sorts locale files when write is enabled", async () => {
    const project = await createProjectCopy();
    await runCli(project, "sort", "--write");
    const en = await readFile(join(project, "locales", "en.json"), "utf8");

    // Top-level keys sorted alphabetically: "action" before "app".
    expect(en.indexOf('"action"')).toBeLessThan(en.indexOf('"app"'));
    // Nested keys sorted too: within "priority", "high" before "low".
    expect(en.indexOf('"high"')).toBeLessThan(en.indexOf('"low"'));
  });

  it("only reports files that sorting would change", async () => {
    const project = await createProjectCopy();
    await runCli(project, "sort", "--write");
    const output = await runCli(project, "sort");

    expect(output).toContain("All locale files are already sorted.");
    expect(output).not.toContain("would sort");
  });

  it("previews unused key removal by default", async () => {
    const project = await createProjectCopy();
    const output = await runCli(project, "remove-unused", "--dry-run");
    const en = await readFile(join(project, "locales", "en.json"), "utf8");

    expect(output).toContain("would remove 3 unused keys");
    expect(output).toContain("  legacy.oldButton");
    expect(en).toContain('"legacy"');
  });

  it("removes unused keys when write is enabled", async () => {
    const project = await createProjectCopy();
    const output = await runCli(project, "remove-unused", "--write");
    const en = await readFile(join(project, "locales", "en.json"), "utf8");
    const de = await readFile(join(project, "locales", "de.json"), "utf8");

    expect(output).toContain("removed 3 unused keys");
    expect(en).not.toContain('"legacy"');
    expect(en).not.toContain('"draft"');
    expect(en).toContain('"theme"');
    expect(en).toContain('"priority"');
    expect(de).not.toContain('"legacy"');
  });

  it("keeps plural, context, namespaced, dynamic and apostrophe-adjacent keys on remove-unused", async () => {
    const project = await createProjectCopy("usage-edge-cases");
    const output = await runCli(project, "remove-unused", "--write");
    const en = JSON.parse(await readFile(join(project, "locales", "en.json"), "utf8")) as Record<
      string,
      unknown
    >;

    expect(output).toContain("removed 1 unused keys");
    expect(output).toContain("  unused.really");
    expect(Object.keys(en)).toEqual(["cart", "common", "friend", "nav", "theme"]);
    expect(en.cart).toEqual({
      item_one: "{{count}} item",
      item_other: "{{count}} items",
      item_zero: "No items"
    });
    expect(en.nav).toEqual({ about: "About", home: "Home" });
  });

  it("previews translations for an existing target locale without an API key", async () => {
    const project = await createProjectCopy();
    const output = await runCli(project, "translate", "--to", "de");

    expect(output).toContain("de: would translate 4 keys");
  });

  it("translates from the configured source locale and honours ignoreKeys", async () => {
    const project = await createProjectCopy();
    await writeFile(
      join(project, "locale-keysmith.config.json"),
      JSON.stringify({
        sourceLocale: "de",
        translationFiles: ["locales/*.json"],
        src: ["src/**/*.tsx"],
        ignoreKeys: ["app.*"]
      })
    );

    const output = await runCli(project, "translate", "--to", "fr");

    // de.json has 15 keys, 3 of them under app.*
    expect(output).toContain("fr: would translate 12 keys");
  });

  it("previews translations for a brand-new target locale", async () => {
    const project = await createProjectCopy();
    const output = await runCli(project, "translate", "--to", "fr");

    expect(output).toContain("fr: would translate 19 keys");
  });

  it("reports missing keys, unused keys, and unsorted files via health", async () => {
    const project = await createProjectCopy();
    const output = await runCli(project, "health");

    expect(output).toContain("unsorted");
    expect(output).toContain("missing de status.offline");
    expect(output).toContain("unused legacy.oldButton");
    expect(output).toContain("issues found");
  });

  it("reports a clean bill of health when nothing is wrong", async () => {
    const project = await mkdtemp(join(tmpdir(), "locale-keysmith-"));
    await mkdir(join(project, "locales"), { recursive: true });
    await mkdir(join(project, "src"), { recursive: true });
    await writeFile(
      join(project, "locale-keysmith.config.json"),
      JSON.stringify({ sourceLocale: "en", translationFiles: ["locales/*.json"], src: ["src/**/*.tsx"] })
    );
    await writeFile(
      join(project, "locales", "en.json"),
      '{\n  "greeting": {\n    "hello": "Hello"\n  }\n}\n'
    );
    await writeFile(
      join(project, "locales", "de.json"),
      '{\n  "greeting": {\n    "hello": "Hallo"\n  }\n}\n'
    );
    await writeFile(join(project, "src", "App.tsx"), 't("greeting.hello");\n');

    const output = await runCli(project, "health");

    expect(output).toContain("All locale files are healthy.");
  });

  it("never touches JSON files that are not locale files", async () => {
    const project = await createProjectCopy();
    const config = '{\n  "zeta": 1,\n  "apiUrl": "https://example.com"\n}\n';
    await mkdir(join(project, "src", "data"), { recursive: true });
    await writeFile(join(project, "src", "data", "config.json"), config);
    await writeFile(
      join(project, "locale-keysmith.config.json"),
      JSON.stringify({ sourceLocale: "en", roots: ["."] })
    );

    const scan = await runCli(project, "scan");
    await runCli(project, "sort", "--write");
    await runCli(project, "remove-unused", "--write");

    expect(scan).not.toContain("config.json");
    expect(scan).not.toContain("package.json");
    expect(await readFile(join(project, "src", "data", "config.json"), "utf8")).toBe(config);
  });

  it("compares each set of translations with its own source file", async () => {
    const project = await mkdtemp(join(tmpdir(), "locale-keysmith-"));
    const files: Record<string, string> = {
      "locale-keysmith.config.json": JSON.stringify({ roots: ["app", "plugin"] }),
      "app/locales/en.json": '{ "app": { "title": "App" } }',
      "app/locales/de.json": '{ "app": { "title": "App" } }',
      "plugin/locales/en.json": '{ "plugin": { "name": "Plugin" } }',
      "plugin/locales/de.json": "{}",
      "app/src/main.ts": 't("app.title"); t("plugin.name");'
    };

    for (const [path, contents] of Object.entries(files)) {
      await mkdir(dirname(join(project, path)), { recursive: true });
      await writeFile(join(project, path), contents);
    }

    const output = await runCli(project, "health");

    // The app's de.json is complete; only the plugin's de.json misses its key.
    expect(output).toContain(`missing de (${join("plugin", "locales", "de.json")}) plugin.name`);
    expect(output).not.toContain("missing de (app");
    expect(output).toContain("1 issue found.");
  });

  it("translates namespaced files into the matching locale directory", async () => {
    const project = await mkdtemp(join(tmpdir(), "locale-keysmith-"));
    await mkdir(join(project, "public", "locales", "en"), { recursive: true });
    await writeFile(join(project, "locale-keysmith.config.json"), JSON.stringify({ roots: ["public"] }));
    await writeFile(join(project, "public", "locales", "en", "common.json"), '{ "a": { "b": "x" } }');
    await writeFile(join(project, "public", "locales", "en", "home.json"), '{ "c": { "d": "y" } }');

    const output = await runCli(project, "translate", "--to", "fr");

    expect(output).toContain(
      `fr (${join("public", "locales", "fr", "common.json")}): would translate 1 keys`
    );
    expect(output).toContain(`fr (${join("public", "locales", "fr", "home.json")}): would translate 1 keys`);
  });

  it("reports extra keys, empty values and type mismatches via health", async () => {
    const project = await mkdtemp(join(tmpdir(), "locale-keysmith-"));
    await mkdir(join(project, "locales"), { recursive: true });
    await mkdir(join(project, "src"), { recursive: true });
    await writeFile(
      join(project, "locale-keysmith.config.json"),
      JSON.stringify({ translationFiles: ["locales/*.json"], src: ["src/**/*.ts"] })
    );
    await writeFile(
      join(project, "locales", "en.json"),
      JSON.stringify(
        {
          cart: { item_one: "{{count}} item", item_other: "{{count}} items" },
          menu: { open: "Open" },
          title: ""
        },
        null,
        2
      )
    );
    await writeFile(
      join(project, "locales", "pl.json"),
      JSON.stringify(
        {
          cart: { item_few: "a", item_many: "b", item_one: "c", item_other: "d" },
          legacy: "Stare",
          menu: "Menu",
          title: "Tytuł"
        },
        null,
        2
      )
    );
    await writeFile(
      join(project, "src", "app.ts"),
      't("cart.item", { count }); t("menu.open"); t("title"); t("legacy");'
    );

    const output = await runCli(project, "health");

    expect(output).toContain("empty en title");
    expect(output).toContain("extra pl legacy");
    expect(output).toContain("type-mismatch pl menu (object in the source, string here)");
    // Polish plural forms are neither missing nor extra, and menu.open is reported once (as the mismatch).
    expect(output).not.toContain("item_few");
    expect(output).not.toContain("missing pl menu.open");
    expect(output).toContain("3 issues found.");
  });
});
