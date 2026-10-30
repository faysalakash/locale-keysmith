import { mkdtemp, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { inferLocale, readLocaleFile, writeLocaleFile } from "@/parser";

async function writeTemp(name: string, content: string): Promise<string> {
  const dir = await mkdtemp(join(tmpdir(), "lk-parser-"));
  const path = join(dir, name);
  await writeFile(path, content);

  return path;
}

describe("inferLocale", () => {
  it("derives the locale from the file name, ignoring the extension", () => {
    expect(inferLocale("/a/b/en.json")).toBe("en");
    expect(inferLocale("/a/b/pt-BR.yaml")).toBe("pt-BR");
    expect(inferLocale("de.yml")).toBe("de");
  });

  it("derives the locale from the directory for namespaced files", () => {
    expect(inferLocale("/app/public/locales/pt-BR/common.json")).toBe("pt-BR");
  });
});

describe("readLocaleFile", () => {
  it("parses JSON locale files", async () => {
    const path = await writeTemp("en.json", '{ "auth": { "login": "Login" } }');
    const file = readLocaleFile(path);

    expect(file.format).toBe("json");
    expect(file.locale).toBe("en");
    expect(file.data).toEqual({ auth: { login: "Login" } });
  });

  it("parses YAML locale files (.yml and .yaml)", async () => {
    const yml = readLocaleFile(await writeTemp("de.yml", "auth:\n  login: Anmelden\n"));
    const yaml = readLocaleFile(await writeTemp("fr.yaml", "auth:\n  login: Connexion\n"));

    expect(yml.format).toBe("yaml");
    expect(yml.data).toEqual({ auth: { login: "Anmelden" } });
    expect(yaml.data).toEqual({ auth: { login: "Connexion" } });
  });

  it("treats an empty file as an empty object", async () => {
    const file = readLocaleFile(await writeTemp("en.json", ""));
    expect(file.data).toEqual({});
  });

  it.each([
    ["an array", "en.json", '["a", "b"]'],
    ["a string", "en.json", '"just a string"'],
    ["a number", "en.yaml", "42\n"]
  ])("rejects a file whose root is %s", async (found, name, content) => {
    const path = await writeTemp(name, content);
    expect(() => readLocaleFile(path)).toThrow(`but found ${found}`);
  });

  it("throws with the file path when parsing fails", async () => {
    const path = await writeTemp("broken.json", "{ definitely not json ");
    expect(() => readLocaleFile(path)).toThrow(/Failed to parse .*broken\.json/);
  });
});

describe("writeLocaleFile", () => {
  it("round-trips JSON through read and write", async () => {
    const path = await writeTemp("en.json", "{}");
    writeLocaleFile({ path, locale: "en", format: "json", data: { b: "2", a: "1" } });

    const reread = readLocaleFile(path);
    expect(reread.data).toEqual({ b: "2", a: "1" });
  });

  it("round-trips YAML through read and write", async () => {
    const path = await writeTemp("de.yaml", "");
    writeLocaleFile({ path, locale: "de", format: "yaml", data: { auth: { login: "Anmelden" } } });

    const reread = readLocaleFile(path);
    expect(reread.data).toEqual({ auth: { login: "Anmelden" } });
  });

  it("keeps the original JSON indentation and trailing newline", async () => {
    const path = await writeTemp("en.json", '{\n    "b": "2",\n    "a": "1"\n}');
    const file = readLocaleFile(path);
    file.data = { a: "1", b: "2" };
    writeLocaleFile(file);

    expect(await readFile(path, "utf8")).toBe('{\n    "a": "1",\n    "b": "2"\n}');
  });

  it("keeps tab indentation", async () => {
    const path = await writeTemp("en.json", '{\n\t"a": "1"\n}\n');
    const file = readLocaleFile(path);
    writeLocaleFile(file);

    expect(await readFile(path, "utf8")).toBe('{\n\t"a": "1"\n}\n');
  });

  it("keeps YAML comments attached to their keys when keys are reordered", async () => {
    const path = await writeTemp(
      "en.yaml",
      [
        "# Translations for the app",
        "",
        "zeta: Z # last letter",
        "auth:",
        "  # shown in the header",
        "  logout: Logout",
        "  # shown on the login page",
        "  login: Login",
        ""
      ].join("\n")
    );
    const file = readLocaleFile(path);
    file.data = { auth: { login: "Login", logout: "Logout" }, zeta: "Z" };
    writeLocaleFile(file);

    expect(await readFile(path, "utf8")).toBe(
      [
        "# Translations for the app",
        "",
        "auth:",
        "  # shown on the login page",
        "  login: Login",
        "  # shown in the header",
        "  logout: Logout",
        "zeta: Z # last letter",
        ""
      ].join("\n")
    );
  });
});
