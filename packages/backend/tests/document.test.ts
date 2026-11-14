import { describe, expect, it } from "vitest";
import {
  DOCUMENT_CATEGORIES,
  validateDocument,
  type DocumentRecord,
} from "../src/models/document.js";

function validDocument(overrides: Partial<DocumentRecord> = {}): DocumentRecord {
  return {
    _id: "doc-0001",
    title: "A Practical Guide to typed API contracts",
    description:
      "A concise walkthrough covering the decisions, trade-offs and concrete examples that matter when applying typed API contracts day to day.",
    content: "First paragraph.\n\nSecond paragraph with enough detail to pass validation.",
    category: "engineering",
    tags: ["typescript", "api-design"],
    author: "Amara Okafor",
    createdAt: new Date("2026-01-01T00:00:00.000Z"),
    updatedAt: new Date("2026-01-02T00:00:00.000Z"),
    ...overrides,
  };
}

describe("validateDocument", () => {
  it("accepts a well-formed document", () => {
    expect(validateDocument(validDocument())).toEqual({ valid: true, errors: [] });
  });

  it("accepts every declared category", () => {
    for (const category of DOCUMENT_CATEGORIES) {
      const result = validateDocument(validDocument({ category }));
      expect(result.valid).toBe(true);
    }
  });

  it("rejects non-object input", () => {
    expect(validateDocument(null).valid).toBe(false);
    expect(validateDocument("nope").valid).toBe(false);
  });

  it("rejects an unknown category", () => {
    const result = validateDocument(
      validDocument({ category: "astrology" as DocumentRecord["category"] })
    );
    expect(result.valid).toBe(false);
    expect(result.errors.join(" ")).toMatch(/category must be one of/);
  });

  it("rejects an empty title", () => {
    const result = validateDocument(validDocument({ title: "  " }));
    expect(result.valid).toBe(false);
    expect(result.errors.join(" ")).toMatch(/title/);
  });

  it("rejects an empty content field", () => {
    const result = validateDocument(validDocument({ content: "" }));
    expect(result.valid).toBe(false);
    expect(result.errors.join(" ")).toMatch(/content/);
  });

  it("rejects too many tags", () => {
    const result = validateDocument(
      validDocument({ tags: Array.from({ length: 11 }, (_, i) => `tag-${i}`) })
    );
    expect(result.valid).toBe(false);
    expect(result.errors.join(" ")).toMatch(/tags must contain/);
  });

  it("rejects duplicate tags", () => {
    const result = validateDocument(validDocument({ tags: ["typescript", "typescript"] }));
    expect(result.valid).toBe(false);
    expect(result.errors.join(" ")).toMatch(/duplicates/);
  });

  it("rejects updatedAt earlier than createdAt", () => {
    const result = validateDocument(
      validDocument({
        createdAt: new Date("2026-02-01T00:00:00.000Z"),
        updatedAt: new Date("2026-01-01T00:00:00.000Z"),
      })
    );
    expect(result.valid).toBe(false);
    expect(result.errors.join(" ")).toMatch(/updatedAt/);
  });

  it("rejects an invalid Date", () => {
    const result = validateDocument(
      validDocument({ createdAt: new Date("not-a-date") })
    );
    expect(result.valid).toBe(false);
    expect(result.errors.join(" ")).toMatch(/createdAt/);
  });

  it("reports every problem at once", () => {
    const result = validateDocument(
      validDocument({ title: "", description: "", author: "" })
    );
    expect(result.valid).toBe(false);
    expect(result.errors.length).toBeGreaterThanOrEqual(3);
  });
});