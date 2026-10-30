import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { isLocaleCode, localeFilePath, parseLocalePath } from "@/locale-path";

describe("isLocaleCode", () => {
  it.each(["en", "de", "pt-BR", "pt_BR", "zh-Hant", "zh-Hant-TW", "sr_Latn_RS", "es-419", "fil", "id"])(
    "accepts %s",
    (name) => {
      expect(isLocaleCode(name)).toBe(true);
    }
  );

  it.each([
    "config",
    "package",
    "tsconfig",
    "pnpm-lock",
    "common",
    "app",
    "api",
    "data",
    "src",
    "bin",
    "nav",
    "xx"
  ])("rejects %s", (name) => {
    expect(isLocaleCode(name)).toBe(false);
  });
});

describe("parseLocalePath", () => {
  it("reads the locale from the file name", () => {
    expect(parseLocalePath(join("src", "locales", "pt-BR.json"))).toEqual({
      locale: "pt-BR",
      group: join("src", "locales")
    });
  });

  it("reads the locale from the directory in the i18next-http-backend layout", () => {
    expect(parseLocalePath(join("public", "locales", "en", "common.json"))).toEqual({
      locale: "en",
      namespace: "common",
      group: join("public", "locales", "{locale}", "common")
    });
  });

  it("returns undefined for files that are not locale files", () => {
    expect(parseLocalePath(join("src", "data", "config.json"))).toBeUndefined();
    expect(parseLocalePath("package.json")).toBeUndefined();
    expect(parseLocalePath(join("src", "settings.json"))).toBeUndefined();
  });
});

describe("localeFilePath", () => {
  it("swaps the file name for flat layouts", () => {
    expect(localeFilePath(join("locales", "en.json"), "fr")).toBe(join("locales", "fr.json"));
  });

  it("swaps the directory for namespaced layouts", () => {
    expect(localeFilePath(join("public", "locales", "en", "common.json"), "fr")).toBe(
      join("public", "locales", "fr", "common.json")
    );
  });
});
