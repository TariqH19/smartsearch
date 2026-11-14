export const DOCUMENT_CATEGORIES = [
  "engineering",
  "data",
  "devops",
  "security",
  "design",
  "product",
] as const;

export type DocumentCategory = (typeof DOCUMENT_CATEGORIES)[number];

export interface DocumentRecord {
  _id: string;
  title: string;
  description: string;
  content: string;
  category: DocumentCategory;
  tags: string[];
  author: string;
  createdAt: Date;
  updatedAt: Date;
}

export interface ValidationResult {
  valid: boolean;
  errors: string[];
}

const LIMITS = {
  title: { min: 3, max: 200 },
  description: { min: 10, max: 500 },
  content: { min: 20, max: 20000 },
  author: { min: 2, max: 100 },
  tag: { min: 1, max: 40 },
  tags: { min: 1, max: 10 },
} as const;

function isNonEmptyString(value: unknown, min: number, max: number): boolean {
  return (
    typeof value === "string" &&
    value.trim().length >= min &&
    value.trim().length <= max
  );
}

/**
 * Runtime validation for a document record.
 *
 * Returns a result object instead of throwing so callers (seed scripts, API
 * routes) can report every problem at once and tests can assert on them.
 */
export function validateDocument(input: unknown): ValidationResult {
  const errors: string[] = [];

  if (typeof input !== "object" || input === null) {
    return { valid: false, errors: ["document must be an object"] };
  }

  const doc = input as Partial<DocumentRecord>;

  if (typeof doc._id !== "string" || doc._id.trim() === "") {
    errors.push("_id must be a non-empty string");
  }

  if (!isNonEmptyString(doc.title, LIMITS.title.min, LIMITS.title.max)) {
    errors.push(`title must be ${LIMITS.title.min}-${LIMITS.title.max} characters`);
  }

  if (
    !isNonEmptyString(doc.description, LIMITS.description.min, LIMITS.description.max)
  ) {
    errors.push(
      `description must be ${LIMITS.description.min}-${LIMITS.description.max} characters`
    );
  }

  if (!isNonEmptyString(doc.content, LIMITS.content.min, LIMITS.content.max)) {
    errors.push(`content must be ${LIMITS.content.min}-${LIMITS.content.max} characters`);
  }

  if (
    typeof doc.category !== "string" ||
    !DOCUMENT_CATEGORIES.includes(doc.category as DocumentCategory)
  ) {
    errors.push(`category must be one of: ${DOCUMENT_CATEGORIES.join(", ")}`);
  }

  if (!Array.isArray(doc.tags)) {
    errors.push("tags must be an array");
  } else {
    if (doc.tags.length < LIMITS.tags.min || doc.tags.length > LIMITS.tags.max) {
      errors.push(`tags must contain ${LIMITS.tags.min}-${LIMITS.tags.max} items`);
    }
    const invalidTag = doc.tags.find(
      (tag) => !isNonEmptyString(tag, LIMITS.tag.min, LIMITS.tag.max)
    );
    if (invalidTag !== undefined) {
      errors.push(`each tag must be ${LIMITS.tag.min}-${LIMITS.tag.max} characters`);
    }
    if (new Set(doc.tags).size !== doc.tags.length) {
      errors.push("tags must not contain duplicates");
    }
  }

  if (!isNonEmptyString(doc.author, LIMITS.author.min, LIMITS.author.max)) {
    errors.push(`author must be ${LIMITS.author.min}-${LIMITS.author.max} characters`);
  }

  if (!(doc.createdAt instanceof Date) || Number.isNaN(doc.createdAt.getTime())) {
    errors.push("createdAt must be a valid Date");
  }

  if (!(doc.updatedAt instanceof Date) || Number.isNaN(doc.updatedAt.getTime())) {
    errors.push("updatedAt must be a valid Date");
  }

  if (
    doc.createdAt instanceof Date &&
    doc.updatedAt instanceof Date &&
    !Number.isNaN(doc.createdAt.getTime()) &&
    !Number.isNaN(doc.updatedAt.getTime()) &&
    doc.updatedAt.getTime() < doc.createdAt.getTime()
  ) {
    errors.push("updatedAt must not be earlier than createdAt");
  }

  return { valid: errors.length === 0, errors };
}