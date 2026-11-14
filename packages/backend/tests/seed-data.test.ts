import { describe, expect, it } from "vitest";
import { generateDocuments } from "../src/db/seed-data.js";
import { DOCUMENT_CATEGORIES } from "../src/models/document.js";
import { validateDocument } from "../src/models/document.js";

describe("generateDocuments", () => {
  it("generates the requested number of documents", () => {
    expect(generateDocuments({ count: 150 })).toHaveLength(150);
  });

  it("defaults to 200 documents", () => {
    expect(generateDocuments()).toHaveLength(200);
  });

  it("is deterministic for the same input", () => {
    const a = generateDocuments({ count: 50 });
    const b = generateDocuments({ count: 50 });
    expect(a).toEqual(b);
  });

  it("produces unique _id values", () => {
    const documents = generateDocuments({ count: 300 });
    const ids = new Set(documents.map((d) => d._id));
    expect(ids.size).toBe(documents.length);
  });

  it("covers every category", () => {
    const documents = generateDocuments({ count: 240 });
    const categories = new Set(documents.map((d) => d.category));
    for (const category of DOCUMENT_CATEGORIES) {
      expect(categories.has(category)).toBe(true);
    }
  });

  it("produces documents that pass validation", () => {
    const documents = generateDocuments({ count: 200 });
    for (const document of documents) {
      const result = validateDocument(document);
      expect(result.errors).toEqual([]);
    }
  });

  it("never sets updatedAt before createdAt", () => {
    const documents = generateDocuments({ count: 200 });
    for (const document of documents) {
      expect(document.updatedAt.getTime()).toBeGreaterThanOrEqual(
        document.createdAt.getTime()
      );
    }
  });

  it("keeps tags within the allowed count", () => {
    const documents = generateDocuments({ count: 200 });
    for (const document of documents) {
      expect(document.tags.length).toBeGreaterThanOrEqual(1);
      expect(document.tags.length).toBeLessThanOrEqual(10);
    }
  });
});