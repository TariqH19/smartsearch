import { DOCUMENT_CATEGORIES, type DocumentCategory } from "../models/document.js";

export const SEARCH_SORTS = ["relevance", "created", "updated"] as const;
export type SearchSort = (typeof SEARCH_SORTS)[number];

export const DEFAULT_PAGE_SIZE = 20;
export const MAX_PAGE_SIZE = 100;
export const MAX_QUERY_LENGTH = 200;
export const MAX_TAGS = 10;
/**
 * Hard cap on how deep a client may page.
 *
 * `skip` is O(offset) for MongoDB, so an unbounded `page` allows a caller to
 * force an arbitrarily expensive scan. At the maximum page size this bounds
 * the offset to 100,000 documents.
 */
export const MAX_PAGE = 1000;

const TAG_PATTERN = /^[a-z0-9][a-z0-9-]{0,39}$/;

export interface SearchQuery {
  q: string;
  category?: DocumentCategory;
  tags: string[];
  page: number;
  pageSize: number;
  sort: SearchSort;
}

export type SearchParamsInput = Record<string, unknown>;

export type ParseResult =
  | { ok: true; query: SearchQuery }
  | { ok: false; errors: string[] };

function firstValue(value: unknown): string | undefined {
  if (typeof value === "string") {
    return value;
  }
  if (Array.isArray(value) && typeof value[0] === "string") {
    return value[0];
  }
  return undefined;
}

export { firstValue };

/**
 * Removes control characters and collapses whitespace.
 *
 * Uses a character-code filter rather than a control-character regex so the
 * source stays lint-clean and the intent is explicit.
 */
export function sanitizeText(value: string): string {
  let cleaned = "";
  for (const character of value) {
    const code = character.codePointAt(0) ?? 0;
    cleaned += code < 0x20 || code === 0x7f ? " " : character;
  }
  return cleaned.replace(/\s+/g, " ").trim();
}

export function parseTags(value: unknown): { tags: string[]; errors: string[] } {
  const raw = firstValue(value);
  if (raw === undefined || raw.trim() === "") {
    return { tags: [], errors: [] };
  }

  const errors: string[] = [];
  const tags: string[] = [];

  for (const part of raw.split(",")) {
    const tag = part.trim().toLowerCase();
    if (tag === "") {
      continue;
    }
    if (!TAG_PATTERN.test(tag)) {
      errors.push(
        `tag "${tag}" is invalid: use lowercase letters, numbers and hyphens (max 40 characters)`
      );
      continue;
    }
    if (!tags.includes(tag)) {
      tags.push(tag);
    }
  }

  if (tags.length > MAX_TAGS) {
    errors.push(`at most ${MAX_TAGS} tags may be supplied`);
  }

  return { tags, errors };
}

export function parseInteger(
  value: unknown,
  name: string,
  fallback: number,
  min: number,
  max: number
): { value: number; errors: string[] } {
  const raw = firstValue(value);
  if (raw === undefined || raw.trim() === "") {
    return { value: fallback, errors: [] };
  }

  const parsed = Number(raw);
  if (!Number.isInteger(parsed)) {
    return { value: fallback, errors: [`${name} must be an integer`] };
  }
  if (parsed < min || parsed > max) {
    return { value: fallback, errors: [`${name} must be between ${min} and ${max}`] };
  }

  return { value: parsed, errors: [] };
}

/**
 * Validates and normalises raw query-string parameters.
 *
 * Returns a result object instead of throwing so the route can translate
 * failures into a single 400 response listing every problem.
 *
 * Untrusted values are never turned into MongoDB operators here: the query
 * text is only ever passed as a `$text` search string, and filters are built
 * from allow-listed values.
 */
export function parseSearchParams(input: SearchParamsInput): ParseResult {
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

  const page = parseInteger(input.page, "page", 1, 1, MAX_PAGE);
  errors.push(...page.errors);

  const pageSize = parseInteger(
    input.pageSize,
    "pageSize",
    DEFAULT_PAGE_SIZE,
    1,
    MAX_PAGE_SIZE
  );
  errors.push(...pageSize.errors);

  const rawSort = firstValue(input.sort)?.toLowerCase();
  let sort: SearchSort = q === "" ? "created" : "relevance";
  if (rawSort !== undefined && rawSort !== "") {
    if (!(SEARCH_SORTS as readonly string[]).includes(rawSort)) {
      errors.push(`sort must be one of: ${SEARCH_SORTS.join(", ")}`);
    } else {
      sort = rawSort as SearchSort;
      if (sort === "relevance" && q === "") {
        errors.push("sort=relevance requires a non-empty q parameter");
      }
    }
  }

  if (errors.length > 0) {
    return { ok: false, errors };
  }

  return {
    ok: true,
    query: {
      q,
      ...(category !== undefined ? { category } : {}),
      tags,
      page: page.value,
      pageSize: pageSize.value,
      sort,
    },
  };
}