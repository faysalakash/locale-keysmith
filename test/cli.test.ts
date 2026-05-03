import { execFile } from "node:child_process";
import { cp, mkdtemp, readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";
import { describe, expect, it } from "vitest";

const execFileAsync = promisify(execFile);
const repoRoot = join(dirname(fileURLToPath(import.meta.url)), "..");
const cliPath = join(repoRoot, "src", "cli.ts");
const fixturePath = join(repoRoot, "test", "fixtures", "basic-project");
const tsxPath = join(repoRoot, "node_modules", ".bin", "tsx");

async function createProjectCopy(): Promise<string> {
  const project = await mkdtemp(join(tmpdir(), "locale-keysmith-"));
  await cp(fixturePath, project, { recursive: true });
  return project;
}

async function runCli(cwd: string, ...args: string[]): Promise<string> {
  const result = await execFileAsync(tsxPath, [cliPath, ...args], {
    cwd
  });

  return result.stdout;
}

describe("cli", () => {
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
    expect(output).toContain("auth.logout");
    expect(output).toContain("common.zebra");
    expect(output).toContain("unused.old");
  });

  it("reports unused keys from source usage", async () => {
    const project = await createProjectCopy();
    const output = await runCli(project, "unused");

    expect(output).toContain("auth.logout");
    expect(output).toContain("common.zebra");
    expect(output).toContain("unused.old");
    expect(output).not.toContain("auth.login");
    expect(output).not.toContain("common.save");
  });

  it("sorts locale files when write is enabled", async () => {
    const project = await createProjectCopy();
    await runCli(project, "sort", "--write");
    const en = await readFile(join(project, "locales", "en.json"), "utf8");

    expect(en.indexOf('"auth"')).toBeLessThan(en.indexOf('"common"'));
    expect(en.indexOf('"save"')).toBeLessThan(en.indexOf('"zebra"'));
  });

  it("previews unused key removal by default", async () => {
    const project = await createProjectCopy();
    const output = await runCli(project, "remove-unused", "--dry-run");
    const en = await readFile(join(project, "locales", "en.json"), "utf8");

    expect(output).toContain("would remove 3 unused keys");
    expect(en).toContain('"old"');
  });

  it("removes unused keys when write is enabled", async () => {
    const project = await createProjectCopy();
    const output = await runCli(project, "remove-unused", "--write");
    const en = await readFile(join(project, "locales", "en.json"), "utf8");
    const de = await readFile(join(project, "locales", "de.json"), "utf8");

    expect(output).toContain("removed 3 unused keys");
    expect(en).not.toContain('"logout"');
    expect(en).not.toContain('"zebra"');
    expect(en).not.toContain('"unused"');
    expect(de).not.toContain('"unused"');
  });
});
