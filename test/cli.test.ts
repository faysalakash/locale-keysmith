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

    // ...as are keys reachable only through a dynamic `t(\`theme.${mode}\`)`,
    // which cannot be resolved statically.
    expect(reported).toContain("theme.dark");
    expect(reported).toContain("theme.light");

    // Exactly the five unresolved keys, nothing more.
    expect(reported).toHaveLength(5);
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

    expect(output).toContain("would remove 5 unused keys");
    expect(en).toContain('"legacy"');
  });

  it("removes unused keys when write is enabled", async () => {
    const project = await createProjectCopy();
    const output = await runCli(project, "remove-unused", "--write");
    const en = await readFile(join(project, "locales", "en.json"), "utf8");
    const de = await readFile(join(project, "locales", "de.json"), "utf8");

    expect(output).toContain("removed 5 unused keys");
    expect(en).not.toContain('"legacy"');
    expect(en).not.toContain('"draft"');
    expect(en).not.toContain('"theme"');
    expect(en).toContain('"priority"');
    expect(de).not.toContain('"theme"');
  });

  it("previews translations for an existing target locale without an API key", async () => {
    const project = await createProjectCopy();
    const output = await runCli(project, "translate", "--to", "de");

    expect(output).toContain("de: would translate 4 keys");
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
});
