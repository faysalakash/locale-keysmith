import { afterEach, describe, expect, it, vi } from "vitest";
import { getValueByPath } from "@/keys";
import { maskPlaceholders, translateMissingKeys, unmaskPlaceholders } from "@/translate";
import type { LocaleFile, LocaleObject } from "@/types";

function localeFile(data: LocaleObject, locale = "de"): LocaleFile {
  return { path: "mem.json", locale, format: "json", data };
}

interface RequestBody {
  q: string[];
  source: string;
  target: string;
  format: string;
}

/** Fakes the v2 API: "translates" each string with `translate` and records every request. */
function mockTranslateApi(
  translate: (text: string) => string | undefined = (text) => text.replace("Login", "Anmelden")
) {
  const requests: Array<{ url: string; headers: Record<string, string>; body: RequestBody }> = [];

  vi.stubGlobal(
    "fetch",
    vi.fn(async (url: string, init: RequestInit) => {
      const body = JSON.parse(init.body as string) as RequestBody;
      requests.push({ url, headers: init.headers as Record<string, string>, body });
      const translations = body.q.map((text) => ({ translatedText: translate(text) }));

      return new Response(JSON.stringify({ data: { translations } }), { status: 200 });
    })
  );

  return requests;
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
        source: localeFile({ auth: { login: "Login" } }, "en"),
        target: localeFile({}),
        targetLanguage: "de",
        keys: ["auth.login"]
      })
    ).rejects.toThrow(/GOOGLE_TRANSLATE_API_KEY/);
  });

  it("translates string values, skips non-strings/blanks/missing, and returns the count", async () => {
    vi.stubEnv("GOOGLE_TRANSLATE_API_KEY", "test-key");
    mockTranslateApi();

    const target = localeFile({});
    const result = await translateMissingKeys({
      source: localeFile({ auth: { login: "Login" }, blank: "", count: 5 }, "en"),
      target,
      targetLanguage: "de",
      keys: ["auth.login", "blank", "count", "does.not.exist"]
    });

    expect(result).toEqual({ translated: 1, skipped: [] });
    expect(getValueByPath(target.data, "auth.login")).toBe("Anmelden");
  });

  it("sends the API key in a header, never in the URL", async () => {
    vi.stubEnv("GOOGLE_TRANSLATE_API_KEY", "secret-key");
    const requests = mockTranslateApi();

    await translateMissingKeys({
      source: localeFile({ a: "Login" }, "en"),
      target: localeFile({}),
      targetLanguage: "pt_BR",
      keys: ["a"]
    });

    expect(requests[0].url).not.toContain("secret-key");
    expect(requests[0].headers["X-goog-api-key"]).toBe("secret-key");
    expect(requests[0].body).toMatchObject({ source: "en", target: "pt-BR", format: "html" });
  });

  it("batches many keys into few requests", async () => {
    vi.stubEnv("GOOGLE_TRANSLATE_API_KEY", "test-key");
    const requests = mockTranslateApi();
    const source: LocaleObject = {};
    const keys = Array.from({ length: 250 }, (_, index) => `k${index}`);
    keys.forEach((key) => (source[key] = `text ${key}`));

    const result = await translateMissingKeys({
      source: localeFile(source, "en"),
      target: localeFile({}),
      targetLanguage: "de",
      keys
    });

    expect(result.translated).toBe(250);
    expect(requests.map((request) => request.body.q.length)).toEqual([100, 100, 50]);
  });

  it("does not write the source text when the API returns no translation", async () => {
    vi.stubEnv("GOOGLE_TRANSLATE_API_KEY", "test-key");
    mockTranslateApi(() => undefined);

    const target = localeFile({});
    const result = await translateMissingKeys({
      source: localeFile({ a: "Login" }, "en"),
      target,
      targetLanguage: "de",
      keys: ["a"]
    });

    expect(result).toEqual({ translated: 0, skipped: ["a"] });
    expect(target.data).toEqual({});
  });

  it("keeps placeholders intact through translation", async () => {
    vi.stubEnv("GOOGLE_TRANSLATE_API_KEY", "test-key");
    const requests = mockTranslateApi((text) => text.replace("Hello", "Hallo").replace("items", "Artikel"));

    const target = localeFile({});
    await translateMissingKeys({
      source: localeFile({ a: "Hello {{name}}, <0>{count} items</0> & more" }, "en"),
      target,
      targetLanguage: "de",
      keys: ["a"]
    });

    expect(requests[0].body.q[0]).not.toContain("name");
    expect(target.data.a).toBe("Hallo {{name}}, <0>{count} Artikel</0> & more");
  });

  it("skips a key whose translation lost a placeholder", async () => {
    vi.stubEnv("GOOGLE_TRANSLATE_API_KEY", "test-key");
    mockTranslateApi((text) => text.replace(/<span[^>]*>\d+<\/span>/, ""));

    const result = await translateMissingKeys({
      source: localeFile({ a: "Hello {{name}}" }, "en"),
      target: localeFile({}),
      targetLanguage: "de",
      keys: ["a"]
    });

    expect(result).toEqual({ translated: 0, skipped: ["a"] });
  });

  it("keeps the batches translated before a failed request in the target", async () => {
    vi.stubEnv("GOOGLE_TRANSLATE_API_KEY", "test-key");
    let calls = 0;
    vi.stubGlobal(
      "fetch",
      vi.fn(async (_url: string, init: RequestInit) => {
        calls += 1;

        if (calls === 2) {
          return new Response(JSON.stringify({ error: { message: "Daily limit exceeded" } }), {
            status: 403
          });
        }

        const body = JSON.parse(init.body as string) as RequestBody;

        return new Response(
          JSON.stringify({ data: { translations: body.q.map((text) => ({ translatedText: `de ${text}` })) } })
        );
      })
    );
    const source: LocaleObject = {};
    const keys = Array.from({ length: 150 }, (_, index) => `k${index}`);
    keys.forEach((key) => (source[key] = key));
    const target = localeFile({});

    await expect(
      translateMissingKeys({ source: localeFile(source, "en"), target, targetLanguage: "de", keys })
    ).rejects.toThrow("Google Translate request failed with status 403: Daily limit exceeded");
    expect(Object.keys(target.data)).toHaveLength(100);
    expect(target.data.k0).toBe("de k0");
  });

  it("raises when the translation request fails", async () => {
    vi.stubEnv("GOOGLE_TRANSLATE_API_KEY", "test-key");
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => new Response("nope", { status: 500 }))
    );

    await expect(
      translateMissingKeys({
        source: localeFile({ auth: { login: "Login" } }, "en"),
        target: localeFile({}),
        targetLanguage: "de",
        keys: ["auth.login"]
      })
    ).rejects.toThrow(/status 500/);
  });
});

describe("maskPlaceholders / unmaskPlaceholders", () => {
  it.each([
    "Hello {{name}}",
    "You have {count, plural, one {# item} other {# items}}",
    "Click <0>here</0> or <br/> <strong>now</strong>",
    "See $t(common.title) and %s or %1$s",
    "Tom & Jerry <3 > 2"
  ])("round-trips %s", (text) => {
    const { html, placeholders } = maskPlaceholders(text);

    expect(unmaskPlaceholders(html, placeholders)).toBe(text);
  });

  it("hides placeholder text from the translator", () => {
    const { html, placeholders } = maskPlaceholders("Hi {{name}} <0>x</0>");

    expect(html).toBe(
      'Hi <span translate="no">0</span> <span translate="no">1</span>x<span translate="no">2</span>'
    );
    expect(placeholders).toEqual(["{{name}}", "<0>", "</0>"]);
  });

  it("rejects translations with missing or duplicated placeholders", () => {
    const { placeholders } = maskPlaceholders("{{a}} {{b}}");

    expect(unmaskPlaceholders('<span translate="no">0</span>', placeholders)).toBeUndefined();
    expect(
      unmaskPlaceholders('<span translate="no">0</span><span translate="no">0</span>', placeholders)
    ).toBeUndefined();
  });
});
