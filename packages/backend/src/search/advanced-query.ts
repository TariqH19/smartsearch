import {
  DOCUMENT_CATEGORIES,
  type DocumentCategory,
} from "../models/document.js";
import {
  DEFAULT_PAGE_SIZE,
  MAX_PAGE,
  MAX_PAGE_SIZE,
  MAX_QUERY_LENGTH,
  MAX_TAGS,
  firstValue,
  parseInteger,
  parseTags,
  sanitizeText,
} from "./query.js";

/** Maximum number of edits allowed when fuzzy matching. */
export const MAX_FUZZY_EDITS = 2;

export interface AdvancedSearchParams {
  q: string;
  category?: DocumentCategory;
  tags: string[];
  page: number;
  pageSize: number;
  fuzzy: boolean;
  fuzzyMaxEdits: number;
  fuzzyPrefixLength: number;
}

export type AdvancedParseResult =
  | { ok: true; params: AdvancedSearchParams }
  | { ok: false; errors: string[] };

function parseBoolean(
  value: unknown,
  name: string,
  fallback: boolean
): { value: boolean; errors: string[] } {
  const raw = firstValue(value);
  if (raw === undefined || raw.trim() === "") {
    return { value: fallback, errors: [] };
  }

  const normalised = raw.trim().toLowerCase();
  if (normalised === "true" || normalised === "1") {
    return { value: true, errors: [] };
  }
  if (normalised === "false" || normalised === "0") {
    return { value: false, errors: [] };
  }
  return { value: fallback, errors: [`${name} must be true or false`] };
}

function parseBoundedInteger(
  value: unknown,
  name: string,
  fallback: number,
  min: number,
  max: number
): { value: number; errors: string[] } {
  return parseInteger(value, name, fallback, min, max);
}

/**
 * Validates parameters for `GET /api/search/advanced`.
 *
 * Reuses the baseline validation helpers so limits stay consistent between
 * `/api/search` and `/api/search/advanced`.
 */
export function parseAdvancedSearchParams(
  input: Record<string, unknown>
): AdvancedParseResult {
  const errors: string[] = [];

  const rawQuery = firstValue(input.q) ?? "";
  const q = sanitizeText(rawQuery).slice(0, MAX_QUERY_LENGTH);
  if (rawQuery.length > MAX_QUERY_LENGTH) {
    errors.push(`q must be at most ${MAX_QUERY_LENGTH} characters`);
  }

  const rawCategory = firstValue(input.category);
  let category: DocumentCategory | undefined;
  if (rawCategory !== undefined && rawCategory.trim() !== "") {
    const candidate = rawCategory.trim().toLowerCase();
    if (!(DOCUMENT_CATEGORIES as readonly string[]).includes(candidate)) {
      errors.push(`category must be one of: ${DOCUMENT_CATEGORIES.join(", ")}`);
    } else {
      category = candidate as DocumentCategory;
    }
  }

  const { tags, errors: tagErrors } = parseTags(input.tags);
  errors.push(...tagErrors);
  if (tags.length > MAX_TAGS) {
    errors.push(`at most ${MAX_TAGS} tags may be supplied`);
  }

  const page = parseBoundedInteger(input.page, "page", 1, 1, MAX_PAGE);
  errors.push(...page.errors);

  const pageSize = parseBoundedInteger(
    input.pageSize,
    "pageSize",
    DEFAULT_PAGE_SIZE,
    1,
    MAX_PAGE_SIZE
  );
  errors.push(...pageSize.errors);

  const fuzzy = parseBoolean(input.fuzzy, "fuzzy", true);
  errors.push(...fuzzy.errors);

  const fuzzyMaxEdits = parseBoundedInteger(
    input.fuzzyMaxEdits,
    "fuzzyMaxEdits",
    1,
    1,
    MAX_FUZZY_EDITS
  );
  errors.push(...fuzzyMaxEdits.errors);

  const fuzzyPrefixLength = parseBoundedInteger(
    input.fuzzyPrefixLength,
    "fuzzyPrefixLength",
    0,
    0,
    3
  );
  errors.push(...fuzzyPrefixLength.errors);

  if (errors.length > 0) {
    return { ok: false, errors };
  }

  return {
    ok: true,
    params: {
      q,
      ...(category !== undefined ? { category } : {}),
      tags,
      page: page.value,
      pageSize: pageSize.value,
      fuzzy: fuzzy.value,
      fuzzyMaxEdits: fuzzyMaxEdits.value,
      fuzzyPrefixLength: fuzzyPrefixLength.value,
    },
  };
}