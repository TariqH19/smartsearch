import { describe, expect, it } from "vitest";
import {
  MAX_FUZZY_EDITS,
  parseAdvancedSearchParams,
} from "../src/search/advanced-query.js";
import { MAX_PAGE, MAX_PAGE_SIZE } from "../src/search/query.js";
import { parseSuggestParams } from "../src/search/suggest-query.js";
import { MAX_SUGGEST_LIMIT } from "../src/search/suggest-repository.js";

describe("parseAdvancedSearchParams", () => {
  it("applies defaults for an empty query", () => {
    const result = parseAdvancedSearchParams({});

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.params).toMatchObject({
        q: "",
        tags: [],
        page: 1,
        pageSize: 20,
        fuzzy: true,
        fuzzyMaxEdits: 1,
        fuzzyPrefixLength: 0,
      });
    }
  });

  it("accepts a text query", () => {
    const result = parseAdvancedSearchParams({ q: "aggregation pipeline" });

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.params.q).toBe("aggregation pipeline");
    }
  });

  it("accepts a valid category", () => {
    const result = parseAdvancedSearchParams({ category: "DATA" });

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.params.category).toBe("data");
    }
  });

  it("rejects an unknown category", () => {
    const result = parseAdvancedSearchParams({ category: "astrology" });

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.errors.join(" ")).toMatch(/category must be one of/);
    }
  });

  it("parses comma-separated tags", () => {
    const result = parseAdvancedSearchParams({ tags: "MongoDB, Aggregation" });

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.params.tags).toEqual(["mongodb", "aggregation"]);
    }
  });

  it("rejects invalid tag characters", () => {
    const result = parseAdvancedSearchParams({ tags: "not a tag" });

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.errors.join(" ")).toMatch(/tag "not a tag" is invalid/);
    }
  });

  it("accepts fuzzy=true and fuzzy=false", () => {
    for (const value of ["true", "false"]) {
      const result = parseAdvancedSearchParams({ fuzzy: value });
      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.params.fuzzy).toBe(value === "true");
      }
    }
  });

  it("rejects a non-boolean fuzzy value", () => {
    const result = parseAdvancedSearchParams({ fuzzy: "maybe" });

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.errors.join(" ")).toMatch(/fuzzy must be true or false/);
    }
  });

  it("accepts the maximum fuzzy edits", () => {
    const result = parseAdvancedSearchParams({ fuzzyMaxEdits: String(MAX_FUZZY_EDITS) });

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.params.fuzzyMaxEdits).toBe(MAX_FUZZY_EDITS);
    }
  });

  it("rejects fuzzy edits above the maximum", () => {
    const result = parseAdvancedSearchParams({ fuzzyMaxEdits: "3" });

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.errors.join(" ")).toMatch(/fuzzyMaxEdits must be between/);
    }
  });

  it("rejects fuzzyPrefixLength above 3", () => {
    const result = parseAdvancedSearchParams({ fuzzyPrefixLength: "9" });

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.errors.join(" ")).toMatch(/fuzzyPrefixLength must be between/);
    }
  });

  it("rejects a page beyond the depth limit", () => {
    const result = parseAdvancedSearchParams({ page: String(MAX_PAGE + 1) });

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.errors.join(" ")).toMatch(new RegExp(`page must be between 1 and ${MAX_PAGE}`));
    }
  });

  it("rejects a pageSize above the maximum", () => {
    const result = parseAdvancedSearchParams({ pageSize: String(MAX_PAGE_SIZE + 1) });

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.errors.join(" ")).toMatch(/pageSize must be between/);
    }
  });

  it("reports every problem at once", () => {
    const result = parseAdvancedSearchParams({
      category: "nope",
      tags: "bad tag",
      page: "0",
      fuzzy: "maybe",
    });

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.errors.length).toBeGreaterThanOrEqual(4);
    }
  });
});

describe("parseSuggestParams", () => {
  it("applies the default limit", () => {
    const result = parseSuggestParams({ q: "mon" });

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.params).toEqual({ q: "mon", limit: 5 });
    }
  });

  it("accepts a bounded limit", () => {
    const result = parseSuggestParams({ q: "mon", limit: "3" });

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.params.limit).toBe(3);
    }
  });

  it("rejects a limit above the maximum", () => {
    const result = parseSuggestParams({ q: "mon", limit: String(MAX_SUGGEST_LIMIT + 1) });

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.errors.join(" ")).toMatch(new RegExp(`limit must be between 1 and ${MAX_SUGGEST_LIMIT}`));
    }
  });

  it("rejects a non-integer limit", () => {
    const result = parseSuggestParams({ q: "mon", limit: "abc" });

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.errors.join(" ")).toMatch(/limit must be an integer/);
    }
  });

  it("treats an empty query as valid with no suggestions expected", () => {
    const result = parseSuggestParams({});

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.params.q).toBe("");
    }
  });

  it("treats a single-character query as valid but too short to suggest", () => {
    const result = parseSuggestParams({ q: "m" });

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.params.q).toBe("m");
    }
  });
});