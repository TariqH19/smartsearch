/**
 * Pure suggestion-fetching logic, extracted from `useSuggestions` so the
 * debounce and race-condition behaviour can be unit-tested without a React
 * test renderer or `@testing-library/react`.
 *
 * The function is side-effect free: it takes a fetcher, the current input,
 * the previous request's sequence number, and a clock, and returns either a
 * scheduled work item or a signal that no request should be made.
 */

export interface SuggestRequest {
  q: string;
  limit: number;
}

export interface SuggestResult {
  query: string;
  suggestions: string[];
  tookMs: number;
}

export type SuggestFetcher = (request: SuggestRequest) => Promise<SuggestResult>;

export interface SuggestionServiceOptions {
  /** Minimum input length before autocomplete is attempted. */
  minLength?: number;
  /** Suggestion limit passed to the backend. */
  limit?: number;
  /** Delay in milliseconds between the last keystroke and the request. */
  debounceMs?: number;
  /** Injectable clock, for deterministic tests. */
  now?: () => number;
}

export interface ScheduledWork {
  q: string;
  limit: number;
  seq: number;
  dueAt: number;
}

export interface SuggestionService {
  /**
   * Decide what to do for the latest input.
   *
   * Returns `null` when no request should be made (input too short), otherwise
   * a `ScheduledWork` describing the request that should be fired after
   * `dueAt`.
   */
  schedule: (input: string, currentSeq: number) => ScheduledWork | null;
  /**
   * Returns true when a scheduled response is still valid for the given
   * sequence number. Older responses are rejected this way.
   */
  isValid: (seq: number, latestSeq: number) => boolean;
  /** Build a `SuggestRequest` for a scheduled item. */
  toRequest: (work: ScheduledWork) => SuggestRequest;
  /** Parse a fetcher result into suggestion strings. */
  toSuggestions: (result: SuggestResult) => string[];
}

const DEFAULT_MIN_LENGTH = 2;
const DEFAULT_LIMIT = 5;
const DEFAULT_DEBOUNCE_MS = 300;

export function createSuggestionService(
  options: SuggestionServiceOptions = {}
): SuggestionService {
  const minLength = options.minLength ?? DEFAULT_MIN_LENGTH;
  const limit = options.limit ?? DEFAULT_LIMIT;
  const debounceMs = options.debounceMs ?? DEFAULT_DEBOUNCE_MS;
  const now = options.now ?? (() => Date.now());

  return {
    schedule: (input: string, currentSeq: number) => {
      const q = input.trim();
      if (q.length < minLength) {
        return null;
      }
      return {
        q,
        limit,
        seq: currentSeq + 1,
        dueAt: now() + debounceMs,
      };
    },
    isValid: (seq: number, latestSeq: number) => seq === latestSeq,
    toRequest: (work: ScheduledWork) => ({ q: work.q, limit: work.limit }),
    toSuggestions: (result: SuggestResult) => result.suggestions,
  };
}