import { useEffect, useRef, useState, type ReactNode } from "react";
import { apiClient, ApiError } from "../api/client.js";
import type { AnalyticsDays, AnalyticsOverview } from "../api/types.js";
import { AppHeader } from "../components/layout/AppHeader.js";
import { AppShell } from "../components/layout/AppShell.js";
import { ErrorState } from "../components/ui/ErrorState.js";
import { Skeleton } from "../components/ui/Skeleton.js";
import {
  buildDailySeries,
  calculateAverageLatency,
  calculateRequestShare,
  calculateZeroResultRate,
  formatAnalyticsRange,
  formatCount,
  formatDailyDate,
  formatLatency,
  formatPercentage,
  formatPercentileAvailability,
  getEngineUsageCount,
  isEmptyAnalyticsOverview,
} from "./analyticsHelpers.js";

const PERIODS: AnalyticsDays[] = [7, 30];

export interface AnalyticsPageProps {
  header?: ReactNode;
}

export function AnalyticsPage({ header }: AnalyticsPageProps = {}) {
  const [days, setDays] = useState<AnalyticsDays>(7);
  const [refreshVersion, setRefreshVersion] = useState(0);
  const [overview, setOverview] = useState<AnalyticsOverview | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const requestSequence = useRef(0);

  useEffect(() => {
    const requestId = ++requestSequence.current;
    let active = true;

    setOverview(null);
    setError(null);
    setLoading(true);

    apiClient
      .analyticsOverview(days)
      .then((response) => {
        if (active && requestId === requestSequence.current) {
          setOverview(response);
        }
      })
      .catch((requestError: unknown) => {
        if (active && requestId === requestSequence.current) {
          setError(
            requestError instanceof ApiError
              ? requestError.message
              : requestError instanceof Error
                ? requestError.message
                : "Analytics could not be loaded. Please try again."
          );
        }
      })
      .finally(() => {
        if (active && requestId === requestSequence.current) {
          setLoading(false);
        }
      });

    return () => {
      active = false;
      if (requestId === requestSequence.current) {
        requestSequence.current += 1;
      }
    };
  }, [days, refreshVersion]);

  const retry = () => setRefreshVersion((version) => version + 1);
  const empty = overview ? isEmptyAnalyticsOverview(overview) : false;
  const averageLatency = overview
    ? calculateAverageLatency(overview.latencyByEngine)
    : undefined;
  const baselineCount = overview
    ? getEngineUsageCount(overview.engineUsage, "baseline")
    : 0;
  const atlasCount = overview
    ? getEngineUsageCount(overview.engineUsage, "atlas")
    : 0;
  const totalRequests = overview?.summary.totalSearchRequests ?? 0;

  return (
    <AppShell
      header={header ?? <AppHeader />}
      main={
        <div className="space-y-6">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
            <div>
              <p className="text-sm font-semibold uppercase tracking-wide text-brand-700">
                Search insights
              </p>
              <h1 className="mt-1 text-2xl font-bold tracking-tight text-slate-900 sm:text-3xl">
                Analytics overview
              </h1>
              <p className="mt-2 max-w-2xl text-sm text-slate-500">
                Search activity and performance from completed search requests.
              </p>
              {overview && (
                <p className="mt-2 text-xs text-slate-500" aria-live="polite">
                  {formatAnalyticsRange(overview.range)}
                </p>
              )}
            </div>

            <div
              className="inline-flex self-start rounded-xl border border-slate-200 bg-white p-1 shadow-xs sm:self-auto"
              role="group"
              aria-label="Analytics date range"
            >
              {PERIODS.map((period) => (
                <button
                  key={period}
                  type="button"
                  aria-pressed={days === period}
                  onClick={() => setDays(period)}
                  className={`rounded-lg px-3 py-2 text-sm font-medium transition-colors ${
                    days === period
                      ? "bg-brand-600 text-white shadow-sm"
                      : "text-slate-600 hover:bg-slate-100 hover:text-slate-900"
                  }`}
                >
                  {period} days
                </button>
              ))}
            </div>
          </div>

          {loading ? (
            <DashboardLoading />
          ) : error ? (
            <ErrorState
              title="Analytics unavailable"
              message={error}
              onRetry={retry}
              retryLabel="Retry"
            />
          ) : overview ? (
            <>
              {empty && (
                <div className="rounded-xl border border-brand-100 bg-brand-50 px-4 py-3 text-sm text-brand-900">
                  No completed searches have been recorded in this period yet.
                  Metrics will appear here as searches are used.
                </div>
              )}

              <section aria-label="Search request metrics">
                <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
                  <MetricCard
                    label="Total search requests"
                    value={formatCount(totalRequests)}
                    detail="Successful submitted searches"
                  />
                  <MetricCard
                    label="Zero-result requests"
                    value={formatCount(overview.summary.zeroResultRequests)}
                    detail={`${formatPercentage(
                      calculateZeroResultRate(
                        totalRequests,
                        overview.summary.zeroResultRequests
                      )
                    )} of requests`}
                  />
                  <MetricCard
                    label="Average latency"
                    value={formatLatency(averageLatency)}
                    detail="Request-count-weighted across engines"
                  />
                  <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
                    <p className="text-sm font-medium text-slate-500">
                      Engine usage
                    </p>
                    <div className="mt-4 space-y-3">
                      <UsageSummary
                        label="Baseline"
                        count={baselineCount}
                        share={calculateRequestShare(baselineCount, totalRequests)}
                        tone="slate"
                      />
                      <UsageSummary
                        label="Atlas"
                        count={atlasCount}
                        share={calculateRequestShare(atlasCount, totalRequests)}
                        tone="brand"
                      />
                    </div>
                  </div>
                </div>
              </section>

              <section
                className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm sm:p-6"
                aria-labelledby="activity-heading"
                aria-busy={loading}
              >
                <SectionHeading
                  id="activity-heading"
                  title="Search activity"
                  description="Completed search requests by UTC calendar day."
                />
                <DailyVolumeChart overview={overview} />
              </section>

              <section
                className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm sm:p-6"
                aria-labelledby="performance-heading"
              >
                <SectionHeading
                  id="performance-heading"
                  title="Engine performance"
                  description="Average duration reported by each search engine."
                />
                <div className="grid gap-4 md:grid-cols-2">
                  <EngineLatencyCard overview={overview} engine="baseline" />
                  <EngineLatencyCard overview={overview} engine="atlas" />
                </div>
                <p className="mt-4 rounded-lg bg-slate-50 px-3 py-2 text-xs leading-5 text-slate-600">
                  Timing workloads can differ: Atlas requests may include facet
                  work while Baseline requests do not. Compare these averages
                  as observed request timings, not as identical workloads.
                </p>
                <p className="mt-3 text-xs text-slate-500">
                  {formatPercentileAvailability(overview.latencyPercentiles)}
                </p>
              </section>

              <div className="grid gap-6 xl:grid-cols-2">
                <section
                  className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm sm:p-6"
                  aria-labelledby="queries-heading"
                >
                  <SectionHeading
                    id="queries-heading"
                    title="Popular queries"
                    description="Most frequent normalized search terms."
                  />
                  <QueryList queries={overview.topQueries} />
                </section>

                <section
                  className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm sm:p-6"
                  aria-labelledby="filters-heading"
                >
                  <SectionHeading
                    id="filters-heading"
                    title="Filter usage"
                    description="Requests using filters and their selected values."
                  />
                  <div className="mb-5 grid grid-cols-2 gap-3">
                    <FilterRequestCount
                      label="Category-filtered requests"
                      count={overview.filterUsage.categoryFilterRequests}
                    />
                    <FilterRequestCount
                      label="Tag-filtered requests"
                      count={overview.filterUsage.tagFilterRequests}
                    />
                  </div>
                  <div className="grid gap-5 md:grid-cols-2">
                    <FilterValueList
                      title="Categories"
                      values={overview.filterUsage.categories}
                    />
                    <FilterValueList
                      title="Tags"
                      values={overview.filterUsage.tags}
                    />
                  </div>
                </section>
              </div>
            </>
          ) : null}
        </div>
      }
    />
  );
}

function MetricCard({
  label,
  value,
  detail,
}: {
  label: string;
  value: string;
  detail: string;
}) {
  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
      <p className="text-sm font-medium text-slate-500">{label}</p>
      <p className="mt-3 text-3xl font-semibold tracking-tight text-slate-900">
        {value}
      </p>
      <p className="mt-2 text-xs text-slate-500">{detail}</p>
    </div>
  );
}

function UsageSummary({
  label,
  count,
  share,
  tone,
}: {
  label: string;
  count: number;
  share: number | null;
  tone: "slate" | "brand";
}) {
  return (
    <div className="flex items-center justify-between gap-3">
      <span className="flex items-center gap-2 text-sm text-slate-700">
        <span
          aria-hidden="true"
          className={`h-2.5 w-2.5 rounded-full ${
            tone === "brand" ? "bg-brand-500" : "bg-slate-400"
          }`}
        />
        {label}
      </span>
      <span className="text-right text-sm font-semibold text-slate-900">
        {formatCount(count)}
        <span className="ml-1.5 text-xs font-normal text-slate-500">
          ({formatPercentage(share)})
        </span>
      </span>
    </div>
  );
}

function SectionHeading({
  id,
  title,
  description,
}: {
  id: string;
  title: string;
  description: string;
}) {
  return (
    <div className="mb-5">
      <h2 id={id} className="text-lg font-semibold text-slate-900">
        {title}
      </h2>
      <p className="mt-1 text-sm text-slate-500">{description}</p>
    </div>
  );
}

function DailyVolumeChart({ overview }: { overview: AnalyticsOverview }) {
  const series = buildDailySeries(overview);
  const maxCount = Math.max(1, ...series.map((entry) => entry.requestCount));

  if (series.every((entry) => entry.requestCount === 0)) {
    return (
      <p className="rounded-lg bg-slate-50 px-4 py-8 text-center text-sm text-slate-500">
        No daily search activity for this period.
      </p>
    );
  }

  return (
    <div
      className="overflow-x-auto"
      role="img"
      aria-label={`Daily search volume from ${series[0]?.date ?? ""} to ${
        series[series.length - 1]?.date ?? ""
      }`}
    >
      <div className="flex min-w-[620px] items-end gap-2 border-b border-slate-200 px-1 pt-3 sm:gap-3">
        {series.map((entry) => {
          const height = entry.requestCount === 0
            ? 2
            : Math.max(8, (entry.requestCount / maxCount) * 150);
          return (
            <div
              key={entry.date}
              className="flex min-w-0 flex-1 flex-col items-center justify-end gap-2"
              title={`${entry.date}: ${formatCount(entry.requestCount)} searches`}
            >
              <span className="text-xs font-medium text-slate-600">
                {entry.requestCount > 0 ? formatCount(entry.requestCount) : ""}
              </span>
              <div
                className={`w-full max-w-12 rounded-t-md ${
                  entry.requestCount > 0 ? "bg-brand-500" : "bg-slate-200"
                }`}
                style={{ height: `${height}px` }}
                aria-hidden="true"
              />
              <span className="pb-2 text-[11px] text-slate-500">
                {formatDailyDate(entry.date)}
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function EngineLatencyCard({
  overview,
  engine,
}: {
  overview: AnalyticsOverview;
  engine: "baseline" | "atlas";
}) {
  const latency = overview.latencyByEngine.find(
    (entry) => entry.engine === engine
  );
  const label = engine === "baseline" ? "Baseline" : "Atlas";

  return (
    <div className="rounded-xl border border-slate-200 bg-slate-50/70 p-4">
      <div className="flex items-center justify-between gap-3">
        <h3 className="font-medium text-slate-800">{label}</h3>
        <span className="text-xs text-slate-500">
          {formatCount(latency?.requestCount ?? 0)} requests
        </span>
      </div>
      <p className="mt-3 text-2xl font-semibold text-slate-900">
        {formatLatency(latency?.averageTookMs)}
      </p>
      <p className="mt-1 text-xs text-slate-500">Average request latency</p>
    </div>
  );
}

function QueryList({
  queries,
}: {
  queries: AnalyticsOverview["topQueries"];
}) {
  if (queries.length === 0) {
    return <EmptyMessage>No query terms recorded for this period.</EmptyMessage>;
  }

  const privacyHidden = queries.every((entry) => entry.query === "[private query]");

  return (
    <div className="space-y-3">
      {privacyHidden && (
        <p className="rounded-lg bg-slate-50 px-3 py-2 text-xs text-slate-600">
          Query terms are hidden in this public demo to protect visitor privacy.
        </p>
      )}
      <ol className="divide-y divide-slate-100">
        {queries.map((entry, index) => (
          <li
            key={`${entry.query}:${index}`}
            className="flex items-center justify-between gap-4 py-3 first:pt-0 last:pb-0"
          >
            <span className="flex min-w-0 items-center gap-3">
              <span className="w-6 shrink-0 text-xs font-medium text-slate-400">
                {String(index + 1).padStart(2, "0")}
              </span>
              <span className="truncate text-sm font-medium text-slate-800">
                {privacyHidden ? "Private query" : entry.query}
              </span>
            </span>
            <span className="shrink-0 rounded-full bg-slate-100 px-2.5 py-1 text-xs font-medium text-slate-600">
              {formatCount(entry.requestCount)}
            </span>
          </li>
        ))}
      </ol>
    </div>
  );
}

function FilterRequestCount({
  label,
  count,
}: {
  label: string;
  count: number;
}) {
  return (
    <div className="rounded-xl bg-slate-50 p-3">
      <p className="text-xs leading-5 text-slate-500">{label}</p>
      <p className="mt-1 text-xl font-semibold text-slate-900">
        {formatCount(count)}
      </p>
    </div>
  );
}

function FilterValueList({
  title,
  values,
}: {
  title: string;
  values: AnalyticsOverview["filterUsage"]["categories"];
}) {
  const maxCount = Math.max(1, ...values.map((entry) => entry.requestCount));

  return (
    <div>
      <h3 className="mb-3 text-sm font-medium text-slate-700">{title}</h3>
      {values.length === 0 ? (
        <EmptyMessage>No {title.toLowerCase()} recorded.</EmptyMessage>
      ) : (
        <ul className="space-y-3">
          {values.map((entry) => (
            <li key={entry.value}>
              <div className="mb-1 flex items-center justify-between gap-3 text-xs">
                <span className="truncate text-slate-600">{entry.value}</span>
                <span className="shrink-0 font-medium text-slate-800">
                  {formatCount(entry.requestCount)}
                </span>
              </div>
              <div
                className="h-1.5 overflow-hidden rounded-full bg-slate-100"
                aria-hidden="true"
              >
                <div
                  className="h-full rounded-full bg-brand-500"
                  style={{
                    width: `${(entry.requestCount / maxCount) * 100}%`,
                  }}
                />
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function EmptyMessage({ children }: { children: ReactNode }) {
  return (
    <p className="rounded-lg bg-slate-50 px-3 py-4 text-center text-xs text-slate-500">
      {children}
    </p>
  );
}

function DashboardLoading() {
  return (
    <div className="space-y-6" aria-label="Loading analytics" aria-busy="true">
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {PERIODS.map((period) => (
          <Skeleton key={`metric-${period}`} className="h-36 rounded-2xl" />
        ))}
        <Skeleton className="h-36 rounded-2xl" />
        <Skeleton className="h-36 rounded-2xl" />
      </div>
      <Skeleton className="h-72 rounded-2xl" />
      <Skeleton className="h-64 rounded-2xl" />
      <div className="grid gap-6 xl:grid-cols-2">
        <Skeleton className="h-72 rounded-2xl" />
        <Skeleton className="h-72 rounded-2xl" />
      </div>
    </div>
  );
}
