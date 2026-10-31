import { describe, expect, it } from "vitest";
import {
  duplicateKeys,
  emptyValueKeys,
  expectedKeys,
  extraKeys,
  missingKeys,
  pluralFallbackKey,
  typeMismatches
} from "@/checks";
import type { LocaleFile, LocaleObject } from "@/types";

function localeFile(locale: string, data: LocaleObject): LocaleFile {
  return { path: `${locale}.json`, locale, format: "json", data };
}

const englishKeys = ["cart.item_one", "cart.item_other", "title"];

describe("expectedKeys", () => {
  it("adapts plural forms to the target language", () => {
    expect(expectedKeys(englishKeys, "pl")).toEqual([
      "cart.item_one",
      "cart.item_few",
      "cart.item_many",
      "cart.item_other",
      "title"
    ]);
    expect(expectedKeys(englishKeys, "ja")).toEqual(["cart.item_other", "title"]);
    expect(expectedKeys(englishKeys, "de")).toEqual(englishKeys);
  });

  it("uses ordinal rules for _ordinal_ keys", () => {
    expect(
      expectedKeys(
        ["place_ordinal_one", "place_ordinal_two", "place_ordinal_few", "place_ordinal_other"],
        "de"
      )
    ).toEqual(["place_ordinal_other"]);
  });

  it("keeps an explicit _zero form from the source", () => {
    expect(expectedKeys(["n_zero", "n_one", "n_other"], "ja")).toEqual(["n_zero", "n_other"]);
  });

  it("does not treat a lone _one key as a plural", () => {
    expect(expectedKeys(["step_one", "step_two"], "ja")).toEqual(["step_one", "step_two"]);
  });

  it("keeps the source forms for locales Intl does not know", () => {
    expect(expectedKeys(englishKeys, "xx")).toEqual(expect.arrayContaining(englishKeys));
  });
});

describe("missingKeys / extraKeys", () => {
  it("does not report a language's own plural forms as missing or extra", () => {
    const polish = localeFile("pl", {
      cart: { item_one: "1", item_few: "2", item_many: "5", item_other: "1.5" },
      title: "Tytuł"
    });
    const japanese = localeFile("ja", { cart: { item_other: "x" }, title: "y" });

    expect(missingKeys(englishKeys, polish)).toEqual([]);
    expect(extraKeys(englishKeys, polish)).toEqual([]);
    expect(missingKeys(englishKeys, japanese)).toEqual([]);
    expect(extraKeys(englishKeys, japanese)).toEqual([]);
  });

  it("reports the plural forms a language needs but lacks", () => {
    const polish = localeFile("pl", { cart: { item_one: "1", item_other: "x" }, title: "t" });

    expect(missingKeys(englishKeys, polish)).toEqual(["cart.item_few", "cart.item_many"]);
  });

  it("reports keys the source does not have", () => {
    const german = localeFile("de", {
      cart: { item_one: "1", item_other: "x", item_few: "nope" },
      title: "t",
      old: { label: "Alt" }
    });

    expect(extraKeys(englishKeys, german)).toEqual(["cart.item_few", "old.label"]);
  });

  it("allows an optional _zero form on a plural", () => {
    const german = localeFile("de", { cart: { item_zero: "0", item_one: "1", item_other: "x" }, title: "t" });

    expect(extraKeys(englishKeys, german)).toEqual([]);
  });
});

describe("duplicateKeys", () => {
  it("finds a key written both as a dotted key and nested", () => {
    const file = localeFile("en", {
      "a.b": "x",
      a: { b: "y", c: "z" },
      "d.e": { f: "1" },
      d: { "e.f": "2" }
    });

    expect(duplicateKeys(file)).toEqual(["a.b", "d.e.f"]);
  });

  it("reports nothing when every key is written once", () => {
    expect(duplicateKeys(localeFile("en", { "a.b": "x", a: { c: "y" } }))).toEqual([]);
  });
});

describe("emptyValueKeys", () => {
  it("finds empty, whitespace-only and null values at any depth", () => {
    const file = localeFile("de", { a: "", b: "  ", c: null, d: { e: "", f: "ok" }, g: 0, h: [] });

    expect(emptyValueKeys(file)).toEqual(["a", "b", "c", "d.e"]);
  });
});

describe("typeMismatches", () => {
  it("reports keys whose value kind differs, without descending into them", () => {
    expect(
      typeMismatches(
        { title: "x", menu: { open: "Open" }, count: 1, list: ["a"], same: { deep: "ok" } },
        { title: { short: "x" }, menu: "Menu", count: "1", list: ["b"], same: { deep: "ok" }, extra: "e" }
      )
    ).toEqual([
      { key: "title", source: "string", target: "object" },
      { key: "menu", source: "object", target: "string" },
      { key: "count", source: "number", target: "string" }
    ]);
  });
});

describe("pluralFallbackKey", () => {
  it("points plural forms at their _other form", () => {
    expect(pluralFallbackKey("cart.item_few")).toBe("cart.item_other");
    expect(pluralFallbackKey("place_ordinal_two")).toBe("place_ordinal_other");
    expect(pluralFallbackKey("cart.item_other")).toBeUndefined();
    expect(pluralFallbackKey("title")).toBeUndefined();
  });
});
