import { describe, expect, it } from "vitest";
import * as api from "@/index";

describe("public API", () => {
  it("re-exports the core helpers", () => {
    const exported = [
      "sortObjectKeys",
      "flattenKeys",
      "filterIgnoredKeys",
      "getValueByPath",
      "setValueByPath",
      "deleteValueByPath",
      "readLocaleFile",
      "writeLocaleFile",
      "inferLocale",
      "findLocaleFiles",
      "loadLocaleFiles",
      "findUsedKeys",
      "collectUsedKeys"
    ] as const;

    for (const name of exported) {
      expect(typeof api[name]).toBe("function");
    }
  });
});
