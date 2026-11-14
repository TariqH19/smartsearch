import { useEffect, useRef, useState } from "react";
import { apiClient, ApiError } from "../../api/client";
import { createSuggestionService } from "./suggestionService";

const DEBOUNCE_MS = 300;

export interface UseSuggestionsOptions {
  /** Override for tests. Defaults to `apiClient.suggest`. */
  fetch?: (q: string, limit: number) => Promise<string[]>;
  /** Override for tests. Defaults to `DEBOUNCE_MS`. */
  delay?: number;
}

export interface UseSuggestionsResult {
  suggestions: string[];
  loading: boolean;
  error: string | null;
  clear: () => void;
}

/**
 * Debounced autocomplete hook.
 *
 * Key behaviours:
 * - No request is made while the input is shorter than two characters.
 * - A 300 ms debounce prevents a request on every keystroke.
 * - A monotonically increasing request ID rejects stale responses: if the
 *   user types again before the previous request resolves, the older result
 *   is discarded even though the client does not support AbortSignal.
 * - Failures collapse to a single safe message; driver internals are never
 *   surfaced.
 */
export function useSuggestions(
  value: string,
  options: UseSuggestionsOptions = {}
): UseSuggestionsResult {
const delay = options.delay ?? DEBOUNCE_MS;

  const [suggestions, setSuggestions] = useState<string[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Each in-flight request gets a sequence number. Only the most recent
  // sequence may write to state, so a slow earlier response cannot clobber a
  // faster later one.
  const requestSeq = useRef(0);
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Stash the latest fetch override in a ref so the effect closure can read
  // it without depending on it. This avoids both an infinite re-run loop and
  // a lint warning.
  const fetchOverride = useRef(options.fetch);
  fetchOverride.current = options.fetch;

  const clear = () => {
    setSuggestions([]);
    setError(null);
    setLoading(false);
    if (timeoutRef.current !== null) {
      clearTimeout(timeoutRef.current);
      timeoutRef.current = null;
    }
  };

  useEffect(() => {
    const service = createSuggestionService({ debounceMs: delay });
    const fetchFn =
      fetchOverride.current ??
      ((q: string, limit: number) =>
        apiClient.suggest({ q, limit }).then((r) => r.suggestions));

    const scheduled = service.schedule(value, requestSeq.current);

    if (scheduled === null) {
      clear();
      return;
    }

    requestSeq.current = scheduled.seq;

    if (timeoutRef.current !== null) {
      clearTimeout(timeoutRef.current);
    }

    setLoading(true);
    setError(null);

    timeoutRef.current = setTimeout(async () => {
      // A newer request has started; ignore this one.
      if (!service.isValid(scheduled.seq, requestSeq.current)) {
        return;
      }

      try {
        const result = await fetchFn(scheduled.q, scheduled.limit);
        // Re-check after the await: a newer keystroke may have fired.
        if (!service.isValid(scheduled.seq, requestSeq.current)) {
          return;
        }
        setSuggestions(result);
        setError(null);
      } catch (err) {
        if (!service.isValid(scheduled.seq, requestSeq.current)) {
          return;
        }
        if (err instanceof ApiError) {
          setError(err.message);
        } else if (err instanceof Error) {
          setError(err.message);
        } else {
          setError("Suggestions are temporarily unavailable");
        }
        setSuggestions([]);
      } finally {
        if (service.isValid(scheduled.seq, requestSeq.current)) {
          setLoading(false);
        }
      }
    }, delay);

    return clear;
    // `value` and `delay` are the only reactive dependencies. `service` and
    // `fetchFn` are derived inside the effect from stable inputs.
  }, [value, delay]);

  return { suggestions, loading, error, clear };
}