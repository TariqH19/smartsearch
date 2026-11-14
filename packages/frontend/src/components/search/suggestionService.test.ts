import { describe, expect, it } from "vitest";
import { createSuggestionService } from "./suggestionService.js";

describe("suggestionService", () => {
  it("returns null when the input is shorter than two characters", () => {
    const service = createSuggestionService();
    expect(service.schedule("a", 0)).toBeNull();
    expect(service.schedule(" ", 0)).toBeNull();
    expect(service.schedule("", 0)).toBeNull();
  });

  it("schedules a request for two or more characters", () => {
    const service = createSuggestionService();
    const work = service.schedule("se", 0);
    expect(work).not.toBeNull();
    expect(work!.q).toBe("se");
    expect(work!.seq).toBe(1);
    expect(work!.limit).toBe(5);
  });

  it("increments the sequence number so older requests can be rejected", () => {
    const service = createSuggestionService();
    const first = service.schedule("se", 0)!;
    const second = service.schedule("sea", first.seq)!;
    expect(second.seq).toBe(first.seq + 1);
    expect(service.isValid(first.seq, second.seq)).toBe(false);
    expect(service.isValid(second.seq, second.seq)).toBe(true);
  });

  it("builds a request from a scheduled work item", () => {
    const service = createSuggestionService();
    const work = service.schedule("se", 0)!;
    expect(service.toRequest(work)).toEqual({ q: "se", limit: 5 });
  });

  it("extracts suggestion strings from a fetcher result", () => {
    const service = createSuggestionService();
    const result = service.toSuggestions({
      query: "se",
      suggestions: ["security", "search"],
      tookMs: 12,
    });
    expect(result).toEqual(["security", "search"]);
  });

  it("uses the configured debounce and limit", () => {
    const clock = () => 1000;
    const service = createSuggestionService({
      minLength: 3,
      limit: 8,
      debounceMs: 500,
      now: clock,
    });
    expect(service.schedule("ab", 0)).toBeNull();
    const work = service.schedule("abc", 0)!;
    expect(work!.dueAt).toBe(1500);
    expect(service.toRequest(work!)).toEqual({ q: "abc", limit: 8 });
  });
});