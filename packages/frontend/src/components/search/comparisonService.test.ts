import { describe, expect, it } from "vitest";
import {
  runComparison,
  formatDuration,
  fasterEngineLabel,
  ENGINE_LABELS,
  type ComparisonEngine,
  type ComparisonRequest,
} from "./comparisonService.js";

function okResult(total: number, tookMs: number) {
  return { hits: [], total, tookMs, error: null, ok: true };
}

function failingEngine(message: string): ComparisonEngine {
  return {
    run: async () => {
      throw new Error(message);
    },
  };
}

const REQUEST: ComparisonRequest = {
  q: "security",
  category: undefined,
  tags: [],
  fuzzy: true,
};

describe("comparisonService", () => {
  it("runs both engines against the same request", async () => {
    let baselineCalledWith: ComparisonRequest | null = null;
    let atlasCalledWith: ComparisonRequest | null = null;

    const baseline: ComparisonEngine = {
      run: async (r) => {
        baselineCalledWith = r;
        return okResult(33, 144);
      },
    };
    const atlas: ComparisonEngine = {
      run: async (r) => {
        atlasCalledWith = r;
        return okResult(33, 397);
      },
    };

    const outcome = await runComparison(baseline, atlas, REQUEST);

    expect(baselineCalledWith).toEqual(REQUEST);
    expect(atlasCalledWith).toEqual(REQUEST);
    expect(outcome.baseline.ok).toBe(true);
    expect(outcome.atlas.ok).toBe(true);
    expect(outcome.bothSucceeded).toBe(true);
  });

it("passes Atlas fuzzy matching through to the engine", async () => {
    const captured: { value?: ComparisonRequest } = {};
    const atlas: ComparisonEngine = {
      run: async (r) => {
        captured.value = r;
        return okResult(10, 50);
      },
    };
    const baseline: ComparisonEngine = {
      run: async () => okResult(10, 50),
    };

    await runComparison(baseline, atlas, {
      q: "secur",
      category: "security",
      tags: ["bug"],
      fuzzy: false,
    });

    expect(captured.value?.fuzzy).toBe(false);
    expect(captured.value?.category).toBe("security");
    expect(captured.value?.tags).toEqual(["bug"]);
  });

  it("isolates one engine failing from the other", async () => {
    const baseline: ComparisonEngine = {
      run: async () => okResult(33, 144),
    };
    const atlas = failingEngine("Atlas Search is unavailable");

    const outcome = await runComparison(baseline, atlas, REQUEST);

    expect(outcome.baseline.ok).toBe(true);
    expect(outcome.baseline.total).toBe(33);
    expect(outcome.atlas.ok).toBe(false);
    expect(outcome.atlas.error).toBe("Atlas Search is unavailable");
    expect(outcome.bothSucceeded).toBe(false);
    expect(outcome.atLeastOneSucceeded).toBe(true);
    // A failed engine contributes nothing to the summary.
    expect(outcome.countDelta).toBe(0);
    expect(outcome.fasterEngine).toBeNull();
  });

  it("isolates baseline failing from atlas", async () => {
    const baseline = failingEngine("Search is temporarily unavailable");
    const atlas: ComparisonEngine = {
      run: async () => okResult(33, 397),
    };

    const outcome = await runComparison(baseline, atlas, REQUEST);

    expect(outcome.baseline.ok).toBe(false);
    expect(outcome.baseline.error).toBe("Search is temporarily unavailable");
    expect(outcome.atlas.ok).toBe(true);
    expect(outcome.atlas.total).toBe(33);
    expect(outcome.bothSucceeded).toBe(false);
  });

  it("computes count and duration deltas only when both succeed", async () => {
    const baseline: ComparisonEngine = {
      run: async () => okResult(30, 200),
    };
    const atlas: ComparisonEngine = {
      run: async () => okResult(35, 150),
    };

    const outcome = await runComparison(baseline, atlas, REQUEST);

    expect(outcome.countDelta).toBe(5);
    expect(outcome.durationDeltaMs).toBe(-50);
    expect(outcome.fasterEngine).toBe("atlas");
  });

  it("reports a tie when durations are equal", async () => {
    const baseline: ComparisonEngine = {
      run: async () => okResult(30, 200),
    };
    const atlas: ComparisonEngine = {
      run: async () => okResult(30, 200),
    };

    const outcome = await runComparison(baseline, atlas, REQUEST);

    expect(outcome.countDelta).toBe(0);
    expect(outcome.fasterEngine).toBe("tie");
  });

  it("formats durations for display", () => {
    expect(formatDuration(0)).toBe("0 ms");
    expect(formatDuration(42)).toBe("42 ms");
    expect(formatDuration(999)).toBe("999 ms");
    expect(formatDuration(1500)).toBe("1.50 s");
    expect(formatDuration(-1)).toBe("—");
    expect(formatDuration(Number.NaN)).toBe("—");
  });

  it("labels the faster engine carefully", () => {
    expect(fasterEngineLabel("baseline")).toBe(
      "Baseline Search reported the lower duration"
    );
    expect(fasterEngineLabel("atlas")).toBe(
      "Atlas Search reported the lower duration"
    );
    expect(fasterEngineLabel("tie")).toBe(
      "Both engines reported the same duration"
    );
    expect(fasterEngineLabel(null)).toBeNull();
  });

  it("exposes engine labels for the UI", () => {
    expect(ENGINE_LABELS.baseline).toBe("Baseline Search");
    expect(ENGINE_LABELS.atlas).toBe("Atlas Search");
  });
});
