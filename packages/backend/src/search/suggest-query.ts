import {
  MAX_SUGGEST_LENGTH,
  MAX_SUGGEST_LIMIT,
  MIN_SUGGEST_LENGTH,
  DEFAULT_SUGGEST_LIMIT,
} from "./suggest-repository.js";
import { firstValue, parseInteger, sanitizeText } from "./query.js";

export { MIN_SUGGEST_LENGTH };

export interface SuggestParams {
  q: string;
  limit: number;
}

export type SuggestParseResult =
  | { ok: true; params: SuggestParams }
  | { ok: false; errors: string[] };

/**
 * Validates parameters for `GET /api/search/suggest`.
 *
 * An empty or too-short query is not an error: it simply returns no
 * suggestions, which keeps type-ahead clients from firing on a single keystroke.
 */
export function parseSuggestParams(
  input: Record<string, unknown>
): SuggestParseResult {
  const errors: string[] = [];

  const rawQuery = firstValue(input.q) ?? "";
  const q = sanitizeText(rawQuery).slice(0, MAX_SUGGEST_LENGTH);

  if (q.length > 0 && q.length < MIN_SUGGEST_LENGTH) {
    return { ok: true, params: { q, limit: DEFAULT_SUGGEST_LIMIT } };
  }

  const limit = parseInteger(
    input.limit,
    "limit",
    DEFAULT_SUGGEST_LIMIT,
    1,
    MAX_SUGGEST_LIMIT
  );
  errors.push(...limit.errors);

  if (errors.length > 0) {
    return { ok: false, errors };
  }

  return { ok: true, params: { q, limit: limit.value } };
}