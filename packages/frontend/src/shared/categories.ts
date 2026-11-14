/**
 * Canonical document categories.
 *
 * Kept in a shared module so the frontend and any future client share the
 * exact same allow-list as the backend (`packages/backend/src/models/document.ts`).
 * If the backend list changes, update this file and the backend together.
 */

export const DOCUMENT_CATEGORIES = [
  "engineering",
  "data",
  "devops",
  "security",
  "design",
  "product",
] as const;

export type DocumentCategory = (typeof DOCUMENT_CATEGORIES)[number];

/** Human-friendly labels for UI display. */
export const CATEGORY_LABELS: Record<DocumentCategory, string> = {
  engineering: "Engineering",
  data: "Data",
  devops: "DevOps",
  security: "Security",
  design: "Design",
  product: "Product",
};

export function isDocumentCategory(
  value: string
): value is DocumentCategory {
  return (DOCUMENT_CATEGORIES as readonly string[]).includes(value);
}