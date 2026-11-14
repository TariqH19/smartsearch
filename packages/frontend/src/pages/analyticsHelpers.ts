import type { AnalyticsOverview } from "../api/types.js";

const DAY_MS = 24 * 60 * 60 * 1000;

export function calculateZeroResultRate(
  totalRequests: number,
  zeroResultRequests: number
): number | null {
  return totalRequests > 0
    ? (zeroResultRequests / totalRequests) * 100
    : null;
}

export function calculateRequestShare(
  requestCount: number,
  totalRequests: number
): number | null {
  return calculateZeroResultRate(totalRequests, requestCount);
}

export function formatCount(value: number): string {
  return new Intl.NumberFormat("en-US").format(value);
}

export function formatLatency(value: number | undefined): string {
  return value === undefined
    ? "Not available"
    : `${new Intl.NumberFormat("en-US", {
        maximumFractionDigits: 1,
      }).format(value)} ms`;
}

export function formatPercentage(value: number | null): string {
  return value === null ? "—" : `${value.toFixed(1)}%`;
}

export function calculateAverageLatency(
  latencyByEngine: AnalyticsOverview["latencyByEngine"]
): number | undefined {
  const measured = latencyByEngine.filter((entry) => entry.requestCount > 0);
  const requestCount = measured.reduce(
    (total, entry) => total + entry.requestCount,
    0
  );

  if (requestCount === 0) {
    return undefined;
  }

  const totalLatency = measured.reduce(
    (total, entry) => total + entry.averageTookMs * entry.requestCount,
    0
  );
  return totalLatency / requestCount;
}

export function getEngineUsageCount(
  usage: AnalyticsOverview["engineUsage"],
  engine: "baseline" | "atlas"
): number {
  return usage.find((entry) => entry.engine === engine)?.requestCount ?? 0;
}

export function isEmptyAnalyticsOverview(
  overview: AnalyticsOverview
): boolean {
  return overview.summary.totalSearchRequests === 0;
}

export function formatAnalyticsRange(
  range: AnalyticsOverview["range"]
): string {
  const formatter = new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
    timeZone: range.timezone,
  });

  return `${formatter.format(new Date(range.from))} – ${formatter.format(
    new Date(range.to)
  )} ${range.timezone}`;
}

export function formatDailyDate(date: string): string {
  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    timeZone: "UTC",
  }).format(new Date(`${date}T00:00:00.000Z`));
}

export function buildDailySeries(
  overview: AnalyticsOverview
): Array<{ date: string; requestCount: number }> {
  const from = new Date(overview.range.from);
  const to = new Date(overview.range.to);
  const lastIncluded = to.getTime() - 1;

  if (!Number.isFinite(from.getTime()) || lastIncluded < from.getTime()) {
    return [];
  }

  const counts = new Map(
    overview.dailyVolume.map(({ date, requestCount }) => [date, requestCount])
  );
  const firstDay = Date.UTC(
    from.getUTCFullYear(),
    from.getUTCMonth(),
    from.getUTCDate()
  );
  const lastDay = Date.UTC(
    new Date(lastIncluded).getUTCFullYear(),
    new Date(lastIncluded).getUTCMonth(),
    new Date(lastIncluded).getUTCDate()
  );
  const series: Array<{ date: string; requestCount: number }> = [];

  for (let day = firstDay; day <= lastDay; day += DAY_MS) {
    const date = new Date(day).toISOString().slice(0, 10);
    series.push({ date, requestCount: counts.get(date) ?? 0 });
  }

  return series;
}

export function formatPercentileAvailability(
  status: AnalyticsOverview["latencyPercentiles"]
): string {
  return `p50 and p95 are not provided. ${status.reason}`;
}
