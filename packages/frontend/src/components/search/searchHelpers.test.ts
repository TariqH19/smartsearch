import { describe, expect, it } from "vitest";
import {
  buildPagination,
  resultRange,
  resetPage,
  isSortSupported,
  sortOptionsForEngine,
  SORT_OPTIONS,
  SORT_LABELS,
} from "./searchHelpers.js";

describe("buildPagination", () => {
  it("derives totalPages from total and pageSize when the backend omits it", () => {
    const state = buildPagination(2, 20, 63);
    expect(state.page).toBe(2);
    expect(state.pageSize).toBe(20);
    expect(state.total).toBe(63);
    expect(state.totalPages).toBe(4);
    expect(state.hasNextPage).toBe(true);
    expect(state.hasPreviousPage).toBe(true);
  });

  it("trusts the backend's own hasNextPage/hasPreviousPage flags", () => {
    const state = buildPagination(4, 20, 80, {
      totalPages: 4,
      hasNextPage: false,
      hasPreviousPage: true,
    });
    expect(state.hasNextPage).toBe(false);
    expect(state.hasPreviousPage).toBe(true);
  });

  it("clamps an out-of-range page to 1", () => {
    const state = buildPagination(0, 20, 63);
    expect(state.page).toBe(1);
  });

  it("handles zero results without division-by-zero issues", () => {
    const state = buildPagination(1, 20, 0);
    expect(state.total).toBe(0);
    expect(state.totalPages).toBe(1);
    expect(state.hasNextPage).toBe(false);
    expect(state.hasPreviousPage).toBe(false);
  });

  it("falls back to the default page size when the backend sends zero", () => {
    const state = buildPagination(1, 0, 100);
    expect(state.pageSize).toBe(20);
  });

  it("uses the page size and boundaries returned by the API", () => {
    const state = buildPagination(3, 10, 25, {
      totalPages: 3,
      hasNextPage: false,
      hasPreviousPage: true,
    });

    expect(state.page).toBe(3);
    expect(state.pageSize).toBe(10);
    expect(resultRange(state).label).toBe("Showing 21-25 of 25");
    expect(state.hasNextPage).toBe(false);
    expect(state.hasPreviousPage).toBe(true);
  });
});

describe("resultRange", () => {
  it("formats the visible range for a middle page", () => {
    const state = buildPagination(2, 20, 63);
    const range = resultRange(state);
    expect(range.start).toBe(21);
    expect(range.end).toBe(40);
    expect(range.label).toBe("Showing 21-40 of 63");
  });

  it("clamps the end on the last page", () => {
    const state = buildPagination(4, 20, 63, { totalPages: 4 });
    const range = resultRange(state);
    expect(range.start).toBe(61);
    expect(range.end).toBe(63);
    expect(range.label).toBe("Showing 61-63 of 63");
  });

  it("returns a no-results label when total is zero", () => {
    const state = buildPagination(1, 20, 0);
    expect(resultRange(state).label).toBe("No results");
  });

  it("handles a single-page result set", () => {
    const state = buildPagination(1, 20, 5, { totalPages: 1 });
    const range = resultRange(state);
    expect(range.start).toBe(1);
    expect(range.end).toBe(5);
    expect(range.label).toBe("Showing 1-5 of 5");
  });
});

describe("resetPage", () => {
  it("always resets to page 1", () => {
    expect(resetPage()).toBe(1);
  });
});

describe("sort negotiation", () => {
  it("exposes engine-specific options", () => {
    expect(sortOptionsForEngine("baseline")).toEqual([
      "relevance",
      "created",
      "updated",
    ]);
    expect(sortOptionsForEngine("atlas")).toEqual(["relevance"]);
  });

  it("accepts supported sorts and rejects unknown ones", () => {
    expect(isSortSupported("baseline", "relevance")).toBe(true);
    expect(isSortSupported("baseline", "created")).toBe(true);
    expect(isSortSupported("baseline", "updated")).toBe(true);
    expect(isSortSupported("baseline", "score")).toBe(false);
    expect(isSortSupported("atlas", "relevance")).toBe(true);
    expect(isSortSupported("atlas", "created")).toBe(false);
    expect(isSortSupported("atlas", "updated")).toBe(false);
    expect(isSortSupported("atlas", "vector")).toBe(false);
  });

  it("exposes display labels for every option", () => {
    expect(SORT_OPTIONS).toHaveLength(3);
    expect(SORT_LABELS.relevance).toBe("Relevance");
    expect(SORT_LABELS.created).toBe("Newest first");
    expect(SORT_LABELS.updated).toBe("Recently updated");
  });
});