export const DEFAULT_ANALYTICS_DAYS = 7;
export const MAX_ANALYTICS_DAYS = 30;

export type AnalyticsDaysParseResult =
  | { ok: true; days: number }
  | { ok: false; errors: string[] };

function firstString(value: unknown): string | undefined {
  if (typeof value === "string") {
    return value;
  }
  if (Array.isArray(value) && typeof value[0] === "string") {
    return value[0];
  }
  return undefined;
}

export function parseAnalyticsDays(
  input: Record<string, unknown>
): AnalyticsDaysParseResult {
  if (input.days === undefined) {
    return { ok: true, days: DEFAULT_ANALYTICS_DAYS };
  }

  const raw = firstString(input.days)?.trim();
  if (raw === undefined || raw === "") {
    return { ok: false, errors: ["days must be an integer from 1 through 30"] };
  }

  const days = Number(raw);
  if (!Number.isInteger(days) || days < 1 || days > MAX_ANALYTICS_DAYS) {
    return { ok: false, errors: ["days must be an integer from 1 through 30"] };
  }

  return { ok: true, days };
}
