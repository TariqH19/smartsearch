import { describe, expect, it } from "vitest";
import {
  DEFAULT_PAGE_SIZE,
  MAX_PAGE,
  MAX_PAGE_SIZE,
  MAX_QUERY_LENGTH,
  parseSearchParams,
  sanitizeText,
} from "../src/search/query.js";

describe("sanitizeText", () => {
  it("collapses whitespace and trims", () => {
    expect(sanitizeText("  hello   world  ")).toBe("hello world");
  });

  it("strips control characters", () => {
    expect(sanitizeText("hello\u0000\u0007world")).toBe("hello world");
  });
});

describe("parseSearchParams", () => {
  it("applies defaults for an empty query string", () => {
    const result = parseSearchParams({});

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.query).toEqual({
        q: "",
        tags: [],
        page: 1,
        pageSize: DEFAULT_PAGE_SIZE,
        sort: "created",
      });
    }
  });

  it("uses relevance sort when a query is present", () => {
    const result = parseSearchParams({ q: "mongodb indexes" });

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.query.q).toBe("mongodb indexes");
      expect(result.query.sort).toBe("relevance");
    }
  });

  it("accepts a valid category", () => {
    const result = parseSearchParams({ category: "Data" });

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.query.category).toBe("data");
    }
  });

  it("rejects an unknown category", () => {
    const result = parseSearchParams({ category: "astrology" });

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.errors.join(" ")).toMatch(/category must be one of/);
    }
  });

  it("parses comma-separated tags and lowercases them", () => {
    const result = parseSearchParams({ tags: "MongoDB, aggregation ,TYPESCRIPT" });

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.query.tags).toEqual(["mongodb", "aggregation", "typescript"]);
    }
  });

  it("rejects invalid tag characters", () => {
    const result = parseSearchParams({ tags: "not a tag" });

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.errors.join(" ")).toMatch(/tag "not a tag" is invalid/);
    }
  });

  it("rejects supplying more tags than the maximum", () => {
    const tags = Array.from({ length: 12 }, (_, i) => `tag-${i}`).join(",");
    const result = parseSearchParams({ tags });

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.errors.join(" ")).toMatch(/at most 10 tags/);
    }
  });

  it("accepts exactly the maximum number of tags", () => {
    const tags = Array.from({ length: 10 }, (_, i) => `tag-${i}`).join(",");
    const result = parseSearchParams({ tags });

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.query.tags).toHaveLength(10);
    }
  });

  it("rejects a non-integer page", () => {
    const result = parseSearchParams({ page: "abc" });

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.errors.join(" ")).toMatch(/page must be an integer/);
    }
  });

  it("rejects a page below 1", () => {
    const result = parseSearchParams({ page: "0" });

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.errors.join(" ")).toMatch(/page must be between/);
    }
  });

  it("rejects a pageSize above the maximum", () => {
    const result = parseSearchParams({ pageSize: String(MAX_PAGE_SIZE + 1) });

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.errors.join(" ")).toMatch(/pageSize must be between/);
    }
  });

  it("accepts the maximum pageSize", () => {
    const result = parseSearchParams({ pageSize: String(MAX_PAGE_SIZE) });

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.query.pageSize).toBe(MAX_PAGE_SIZE);
    }
  });

  it("rejects an unknown sort", () => {
    const result = parseSearchParams({ q: "test", sort: "random" });

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.errors.join(" ")).toMatch(/sort must be one of/);
    }
  });

  it("rejects relevance sort without a query", () => {
    const result = parseSearchParams({ sort: "relevance" });

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.errors.join(" ")).toMatch(/sort=relevance requires a non-empty q/);
    }
  });

  it("accepts explicit created and updated sorts", () => {
    for (const sort of ["created", "updated"]) {
      const result = parseSearchParams({ sort });
      expect(result.ok).toBe(true);
    }
  });

  it("truncates an over-long query instead of rejecting it", () => {
    const result = parseSearchParams({ q: "a".repeat(MAX_QUERY_LENGTH + 50) });

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.errors.join(" ")).toMatch(/q must be at most/);
    }
  });

  it("reports every validation problem at once", () => {
    const result = parseSearchParams({
      q: "a".repeat(MAX_QUERY_LENGTH + 1),
      category: "nope",
      page: "0",
      sort: "random",
    });

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.errors.length).toBeGreaterThanOrEqual(4);
    }
  });

  it("ignores array-wrapped parameters from the query string", () => {
    const result = parseSearchParams({ q: ["mongodb", "ignored"] });

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.query.q).toBe("mongodb");
    }
  });
});

describe("pagination depth limits", () => {
  it("accepts the maximum page number", () => {
    const result = parseSearchParams({ page: String(MAX_PAGE) });

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.query.page).toBe(MAX_PAGE);
    }
  });

  it("rejects the first page beyond the maximum", () => {
    const result = parseSearchParams({ page: String(MAX_PAGE + 1) });

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.errors.join(" ")).toMatch(
        new RegExp(`page must be between 1 and ${MAX_PAGE}`)
      );
    }
  });

  it("rejects a very large page that would force a deep skip", () => {
    const result = parseSearchParams({ page: "500000" });

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.errors.join(" ")).toMatch(/page must be between/);
    }
  });

  it("bounds the maximum offset at page 1000 with the max page size", () => {
    const result = parseSearchParams({
      page: String(MAX_PAGE),
      pageSize: String(MAX_PAGE_SIZE),
    });

    expect(result.ok).toBe(true);
    if (result.ok) {
      // Documents skipped before the first returned page.
      expect((result.query.page - 1) * result.query.pageSize).toBe(
        (MAX_PAGE - 1) * MAX_PAGE_SIZE
      );
    }
  });
});