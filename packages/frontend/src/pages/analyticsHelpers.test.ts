import { describe, expect, it } from "vitest";
import type { AnalyticsOverview } from "../api/types.js";
import {
  buildDailySeries,
  calculateAverageLatency,
  calculateZeroResultRate,
  formatCount,
  formatLatency,
  formatPercentileAvailability,
  isEmptyAnalyticsOverview,
} from "./analyticsHelpers.js";

function overview(
  overrides: Partial<AnalyticsOverview> = {}
): AnalyticsOverview {
  return {
    range: {
      days: 7,
      from: "2026-11-07T12:00:00.000Z",
      to: "2026-11-14T12:00:00.000Z",
      timezone: "UTC",
    },
    summary: { totalSearchRequests: 0, zeroResultRequests: 0 },
    engineUsage: [],
    latencyByEngine: [],
    latencyPercentiles: {
      status: "deferred",
      reason: "Server compatibility has not been verified.",
    },
    topQueries: [],
    dailyVolume: [],
    filterUsage: {
      categoryFilterRequests: 0,
      tagFilterRequests: 0,
      categories: [],
      tags: [],
    },
    ...overrides,
  };
}

describe("analytics metric helpers", () => {
  it("calculates zero-result percentages and handles zero requests", () => {
    expect(calculateZeroResultRate(20, 5)).toBe(25);
    expect(calculateZeroResultRate(0, 0)).toBeNull();
  });

  it("formats counts and marks unavailable latency clearly", () => {
    expect(formatCount(1200)).toBe("1,200");
    expect(formatLatency(undefined)).toBe("Not available");
    expect(formatLatency(12.34)).toBe("12.3 ms");
  });

  it("computes a request-count-weighted average across engines", () => {
    expect(
      calculateAverageLatency([
        { engine: "baseline", requestCount: 1, averageTookMs: 100 },
        { engine: "atlas", requestCount: 3, averageTookMs: 200 },
      ])
    ).toBe(175);
    expect(calculateAverageLatency([])).toBeUndefined();
  });

  it("recognizes an empty analytics response", () => {
    expect(isEmptyAnalyticsOverview(overview())).toBe(true);
    expect(
      isEmptyAnalyticsOverview(
        overview({ summary: { totalSearchRequests: 1, zeroResultRequests: 0 } })
      )
    ).toBe(false);
  });

  it("fills days with zero activity and respects the returned UTC range", () => {
    const data = overview({
      dailyVolume: [
        { date: "2026-11-07", requestCount: 2 },
        { date: "2026-11-09", requestCount: 4 },
      ],
    });

    expect(buildDailySeries(data)).toEqual([
      { date: "2026-11-07", requestCount: 2 },
      { date: "2026-11-08", requestCount: 0 },
      { date: "2026-11-09", requestCount: 4 },
      { date: "2026-11-10", requestCount: 0 },
      { date: "2026-11-11", requestCount: 0 },
      { date: "2026-11-12", requestCount: 0 },
      { date: "2026-11-13", requestCount: 0 },
      { date: "2026-11-14", requestCount: 0 },
    ]);
  });

  it("explains that percentile latency values are deferred, not zero", () => {
    expect(
      formatPercentileAvailability(overview().latencyPercentiles)
    ).toContain("p50 and p95 are not provided");
    expect(
      formatPercentileAvailability(overview().latencyPercentiles)
    ).toContain("Server compatibility has not been verified.");
  });
});
