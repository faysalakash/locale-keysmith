import { describe, expect, it } from "vitest";
import {
  deleteValueByPath,
  filterIgnoredKeys,
  flattenKeys,
  getValueByPath,
  isSorted,
  setValueByPath,
  sortObjectKeys
} from "@/keys";

describe("sortObjectKeys", () => {
  it("sorts nested keys", () => {
    expect(sortObjectKeys({ z: "last", a: { c: "third", b: "second" } })).toEqual({
      a: { b: "second", c: "third" },
      z: "last"
    });
  });

  it("recurses through arrays without reordering their items", () => {
    expect(sortObjectKeys({ list: [{ b: 1, a: 2 }, "x"] })).toEqual({
      list: [{ a: 2, b: 1 }, "x"]
    });
  });

  it("returns primitives unchanged", () => {
    expect(sortObjectKeys("hello")).toBe("hello");
    expect(sortObjectKeys(42)).toBe(42);
  });
});

describe("isSorted", () => {
  it("is true when keys are already in order at every level", () => {
    expect(isSorted({ a: { b: "1", c: "2" }, d: "3" })).toBe(true);
  });

  it("is false when any level is out of order", () => {
    expect(isSorted({ b: "1", a: "2" })).toBe(false);
    expect(isSorted({ a: { c: "1", b: "2" } })).toBe(false);
  });
});

describe("flattenKeys", () => {
  it("flattens nested keys", () => {
    expect(flattenKeys({ auth: { login: "Login" }, common: { save: "Save" } })).toEqual([
      "auth.login",
      "common.save"
    ]);
  });
});

describe("filterIgnoredKeys", () => {
  it("filters ignored keys with wildcard patterns", () => {
    expect(filterIgnoredKeys(["auth.login", "debug.trace", "debug.extra.deep"], ["debug.*"])).toEqual([
      "auth.login"
    ]);
  });

  it("returns the input untouched when there are no patterns", () => {
    const keys = ["a.b", "c.d"];
    expect(filterIgnoredKeys(keys, [])).toEqual(keys);
  });
});

describe("getValueByPath", () => {
  it("reads nested values", () => {
    expect(getValueByPath({ a: { b: "x" } }, "a.b")).toBe("x");
  });

  it("returns undefined for missing paths", () => {
    expect(getValueByPath({ a: {} }, "a.b.c")).toBeUndefined();
  });
});

describe("setValueByPath", () => {
  it("creates intermediate objects as needed", () => {
    const target = {};
    setValueByPath(target, "a.b.c", "x");
    expect(target).toEqual({ a: { b: { c: "x" } } });
  });

  it("overwrites a non-object segment on the way down", () => {
    const target = { a: "scalar" };
    setValueByPath(target, "a.b", "x");
    expect(target).toEqual({ a: { b: "x" } });
  });
});

describe("deleteValueByPath", () => {
  it("deletes a leaf and prunes emptied parents", () => {
    const target = { a: { b: { c: "x" } }, keep: "me" };
    deleteValueByPath(target, "a.b.c");
    expect(target).toEqual({ keep: "me" });
  });

  it("leaves siblings in place", () => {
    const target = { a: { b: "x", c: "y" } };
    deleteValueByPath(target, "a.b");
    expect(target).toEqual({ a: { c: "y" } });
  });

  it("is a no-op when the path does not exist", () => {
    const target = { a: { b: "x" } };
    deleteValueByPath(target, "a.z.y");
    expect(target).toEqual({ a: { b: "x" } });
  });
});
