import { mkdir, mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { describe, expect, it } from "vitest";
import { IGNORED_DIRECTORIES, globFiles } from "@/glob";

async function write(root: string, relativePath: string): Promise<void> {
  const absolute = join(root, relativePath);
  await mkdir(dirname(absolute), { recursive: true });
  await writeFile(absolute, "{}");
}

describe("globFiles", () => {
  it("resolves matches to absolute paths and skips build/dependency dirs", async () => {
    const root = await mkdtemp(join(tmpdir(), "lk-glob-"));
    await write(root, "keep/a.json");
    await write(root, "node_modules/pkg/b.json");
    await write(root, "dist/c.json");
    await write(root, ".next/d.json");

    const matches = await globFiles(["**/*.json"], root);

    expect(matches).toHaveLength(1);
    expect(matches[0]).toBe(join(root, "keep", "a.json"));
  });

  it("exposes the ignored directory list", () => {
    expect(IGNORED_DIRECTORIES).toContain("**/node_modules/**");
    expect(IGNORED_DIRECTORIES).toContain("**/dist/**");
  });
});
