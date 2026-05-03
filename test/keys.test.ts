import { describe, expect, it } from "vitest";
import { flattenKeys, sortObjectKeys } from "../src/keys.js";

describe("keys", () => {
  it("sorts nested keys", () => {
    expect(sortObjectKeys({ z: "last", a: { c: "third", b: "second" } })).toEqual({
      a: { b: "second", c: "third" },
      z: "last"
    });
  });

  it("flattens nested keys", () => {
    expect(flattenKeys({ auth: { login: "Login" }, common: { save: "Save" } })).toEqual([
      "auth.login",
      "common.save"
    ]);
  });
});
