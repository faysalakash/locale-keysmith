import { afterEach, describe, expect, it, vi } from "vitest";
import { getValueByPath } from "@/keys";
import { translateMissingKeys } from "@/translate";
import type { LocaleFile, LocaleObject } from "@/types";

function localeFile(data: LocaleObject): LocaleFile {
  return { path: "mem.json", locale: "de", format: "json", data };
}

function mockTranslateResponse(translatedText: string): void {
  vi.stubGlobal(
    "fetch",
    vi.fn(
      async () =>
        new Response(JSON.stringify({ data: { translations: [{ translatedText }] } }), {
          status: 200
        })
    )
  );
}

afterEach(() => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
});

describe("translateMissingKeys", () => {
  it("throws when the API key is not set", async () => {
    vi.stubEnv("GOOGLE_TRANSLATE_API_KEY", "");

    await expect(
      translateMissingKeys({
        source: localeFile({ auth: { login: "Login" } }),
        target: localeFile({}),
        targetLanguage: "de",
        keys: ["auth.login"]
      })
    ).rejects.toThrow(/GOOGLE_TRANSLATE_API_KEY/);
  });

  it("translates string values, skips non-strings/blanks/missing, and returns the count", async () => {
    vi.stubEnv("GOOGLE_TRANSLATE_API_KEY", "test-key");
    mockTranslateResponse("Anmelden");

    const target = localeFile({});
    const changed = await translateMissingKeys({
      source: localeFile({ auth: { login: "Login" }, blank: "", count: 5 }),
      target,
      targetLanguage: "de",
      keys: ["auth.login", "blank", "count", "does.not.exist"]
    });

    expect(changed).toBe(1);
    expect(getValueByPath(target.data, "auth.login")).toBe("Anmelden");
    expect(fetch).toHaveBeenCalledTimes(1);
  });

  it("raises when the translation request fails", async () => {
    vi.stubEnv("GOOGLE_TRANSLATE_API_KEY", "test-key");
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => new Response("nope", { status: 500 }))
    );

    await expect(
      translateMissingKeys({
        source: localeFile({ auth: { login: "Login" } }),
        target: localeFile({}),
        targetLanguage: "de",
        keys: ["auth.login"]
      })
    ).rejects.toThrow(/status 500/);
  });
});
