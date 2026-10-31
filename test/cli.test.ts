import { execFile } from "node:child_process";
import { cp, mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
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

async function runCliWithStatus(
  cwd: string,
  ...args: string[]
): Promise<{ stdout: string; stderr: string; code: number }> {
  try {
    const result = await execFileAsync(tsxPath, [cliPath, ...args], {
      cwd,
      env: { ...process.env, TSX_TSCONFIG_PATH: tsconfigPath }
    });

    return { stdout: result.stdout, stderr: result.stderr, code: 0 };
  } catch (error) {
    const failed = error as { stdout?: string; stderr?: string; code?: number };

    return { stdout: failed.stdout ?? "", stderr: failed.stderr ?? "", code: failed.code ?? -1 };
  }
}

async function createHealthyProject(): Promise<string> {
  const project = await mkdtemp(join(tmpdir(), "locale-keysmith-"));
  await mkdir(join(project, "locales"), { recursive: true });
  await mkdir(join(project, "src"), { recursive: true });
  await writeFile(
    join(project, "locale-keysmith.config.json"),
    JSON.stringify({ translationFiles: ["locales/*.json"], src: ["src/**/*.ts"] })
  );
  await writeFile(join(project, "locales", "en.json"), '{\n  "greeting": {\n    "hello": "Hello"\n  }\n}\n');
  await writeFile(join(project, "locales", "de.json"), '{\n  "greeting": {\n    "hello": "Hallo"\n  }\n}\n');
  await writeFile(join(project, "src", "app.ts"), 't("greeting.hello");\n');

  return project;
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

    const [found, skipped] = scan.split("Skipped");
    expect(found).not.toContain("config.json");
    expect(skipped).toContain(join("src", "data", "config.json"));
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

  it("reports a key defined twice in one file via health", async () => {
    const project = await createHealthyProject();
    await writeFile(
      join(project, "locales", "de.json"),
      '{\n  "greeting": {\n    "hello": "Hallo"\n  },\n  "greeting.hello": "Servus"\n}\n'
    );

    const text = await runCli(project, "health");
    const { stdout, code } = await runCliWithStatus(project, "health", "--json");

    expect(text).toContain("duplicate de greeting.hello");
    expect(code).toBe(1);
    expect((JSON.parse(stdout) as { issues: unknown[] }).issues).toContainEqual(
      expect.objectContaining({ type: "duplicate", locale: "de", key: "greeting.hello" })
    );
  });

  it("keeps keys read through a useTranslation keyPrefix", async () => {
    const project = await createHealthyProject();
    await writeFile(
      join(project, "locales", "en.json"),
      '{\n  "greeting": {\n    "hello": "Hello"\n  },\n  "settings": {\n    "old": "Old",\n    "title": "Settings"\n  }\n}\n'
    );
    await writeFile(join(project, "locales", "de.json"), "{}\n");
    await writeFile(
      join(project, "src", "settings.ts"),
      'const { t } = useTranslation("translation", { keyPrefix: "settings" });\nt("title");\n'
    );

    await runCli(project, "remove-unused", "--write");
    const source = JSON.parse(await readFile(join(project, "locales", "en.json"), "utf8")) as unknown;

    expect(source).toEqual({ greeting: { hello: "Hello" }, settings: { title: "Settings" } });
  });

  it("counts a key defined twice in the source only once", async () => {
    const project = await createHealthyProject();
    await writeFile(
      join(project, "locales", "en.json"),
      '{\n  "greeting": {\n    "hello": "Hello"\n  },\n  "greeting.hello": "Hi",\n  "old": {\n    "x": "a"\n  },\n  "old.x": "b"\n}\n'
    );
    await writeFile(join(project, "locales", "de.json"), "{}\n");

    const missing = await runCli(project, "missing");
    await runCli(project, "remove-unused", "--write");
    const source = JSON.parse(await readFile(join(project, "locales", "en.json"), "utf8")) as unknown;

    expect(missing.match(/greeting\.hello/g)).toHaveLength(1);
    expect(missing.match(/old\.x/g)).toHaveLength(1);
    // Both copies of the unused key are removed.
    expect(source).toEqual({ greeting: { hello: "Hello" }, "greeting.hello": "Hi" });
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

describe("cli output for CI", () => {
  it("prints scan results as JSON with relative paths", async () => {
    const project = await createProjectCopy();
    const { stdout, code } = await runCliWithStatus(project, "scan", "--json");

    expect(code).toBe(0);
    expect(JSON.parse(stdout)).toEqual({
      files: expect.arrayContaining([
        { path: join("locales", "en.json"), locale: "en", format: "json" },
        { path: join("locales", "de.json"), locale: "de", format: "json" }
      ]),
      skipped: []
    });
  });

  it("lists the files scan skipped, and why", async () => {
    const project = await createProjectCopy();
    await writeFile(join(project, "locales", "english.json"), '{ "a": "1" }');

    const text = await runCli(project, "scan");
    const { stdout } = await runCliWithStatus(project, "scan", "--json");

    expect(text).toContain("Skipped 1 file whose name or folder is not a locale code:");
    expect(text).toContain(`  ${join("locales", "english.json")}`);
    expect((JSON.parse(stdout) as { skipped: string[] }).skipped).toEqual([join("locales", "english.json")]);
  });

  it("still lists skipped files when no locale file is found", async () => {
    const project = await createProjectCopy();
    await rm(join(project, "locales", "en.json"));
    await rm(join(project, "locales", "de.json"));
    await writeFile(join(project, "locales", "messages.json"), '{ "a": "1" }');

    const output = await runCli(project, "scan");

    expect(output).toContain("No locale files found.");
    expect(output).toContain(join("locales", "messages.json"));
  });

  it("prints missing keys as JSON and exits 1", async () => {
    const project = await createProjectCopy();
    const { stdout, code } = await runCliWithStatus(project, "missing", "--json");
    const { missing } = JSON.parse(stdout) as {
      missing: Array<{ file: string; locale: string; key: string }>;
    };

    expect(code).toBe(1);
    expect(missing).toContainEqual({ file: join("locales", "de.json"), locale: "de", key: "status.offline" });
    expect(missing).toHaveLength(4);
  });

  it("prints unused keys as JSON and exits 1", async () => {
    const project = await createProjectCopy();
    const { stdout, code } = await runCliWithStatus(project, "unused", "--json");
    const { unused } = JSON.parse(stdout) as { unused: Array<{ file: string; key: string }> };

    expect(code).toBe(1);
    expect(unused.map((entry) => entry.key).sort()).toEqual([
      "draft.placeholder",
      "legacy.deprecatedTooltip",
      "legacy.oldButton"
    ]);
    expect(unused[0].file).toBe(join("locales", "en.json"));
  });

  it("prints health issues as JSON and exits 1", async () => {
    const project = await createProjectCopy();
    const { stdout, code } = await runCliWithStatus(project, "health", "--json");
    const report = JSON.parse(stdout) as {
      healthy: boolean;
      issueCount: number;
      issues: Array<{ type: string; file: string; locale: string; key?: string }>;
    };

    expect(code).toBe(1);
    expect(report.healthy).toBe(false);
    expect(report.issueCount).toBe(report.issues.length);
    expect(report.issues).toContainEqual({
      type: "missing",
      file: join("locales", "de.json"),
      locale: "de",
      key: "status.offline"
    });
    expect(report.issues.some((issue) => issue.type === "unsorted")).toBe(true);
  });

  it("exits 0 with empty results when there is nothing to report", async () => {
    const project = await createHealthyProject();

    for (const command of ["missing", "unused", "health"]) {
      const { code } = await runCliWithStatus(project, command);
      expect(code, command).toBe(0);
    }

    const { stdout } = await runCliWithStatus(project, "health", "--json");
    expect(JSON.parse(stdout)).toEqual({ healthy: true, issueCount: 0, issues: [] });
  });

  it("exits 2 when the command itself fails", async () => {
    const project = await createHealthyProject();
    await writeFile(join(project, "locale-keysmith.config.json"), JSON.stringify({ roots: "src" }));

    const { stderr, code } = await runCliWithStatus(project, "health", "--json");

    expect(code).toBe(2);
    expect(stderr).toContain('"roots" must be an array of strings');
  });
});

describe("cli init", () => {
  it("writes a config that the other commands pick up", async () => {
    const project = await createProjectCopy();
    await rm(join(project, "locale-keysmith.config.json"));

    const init = await runCliWithStatus(project, "init");
    const config = JSON.parse(
      await readFile(join(project, "locale-keysmith.config.json"), "utf8")
    ) as unknown;
    const scan = await runCliWithStatus(project, "scan", "--json");

    expect(init.code).toBe(0);
    expect(init.stdout).toContain("Found 2 locale files (de, en).");
    expect(config).toEqual({ sourceLocale: "en", roots: ["locales", "src"], ignoreKeys: [] });
    expect((JSON.parse(scan.stdout) as { files: unknown[] }).files).toHaveLength(2);
  });

  it("refuses to overwrite an existing config without --force", async () => {
    const project = await createProjectCopy();
    const configPath = join(project, "locale-keysmith.config.json");
    const before = await readFile(configPath, "utf8");

    const refused = await runCliWithStatus(project, "init");
    expect(refused.code).toBe(2);
    expect(refused.stderr).toContain("already exists. Use --force");
    expect(await readFile(configPath, "utf8")).toBe(before);

    const forced = await runCliWithStatus(project, "init", "--force");
    expect(forced.code).toBe(0);
    expect(await readFile(configPath, "utf8")).not.toBe(before);
  });
});
