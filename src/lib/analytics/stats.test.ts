import { describe, expect, it } from "vitest";
import {
  clamp,
  formPoints,
  invertedPercentileRank,
  mean,
  parseForm,
  percentileRank,
  recentPointsPerGame,
  round,
  safeDivide,
} from "./stats";

describe("safeDivide", () => {
  it("divides normally", () => {
    expect(safeDivide(10, 4)).toBe(2.5);
  });

  it("returns null on a zero denominator instead of Infinity", () => {
    expect(safeDivide(5, 0)).toBeNull();
  });

  it("returns null for non-finite inputs", () => {
    expect(safeDivide(Number.NaN, 2)).toBeNull();
    expect(safeDivide(2, Number.POSITIVE_INFINITY)).toBeNull();
  });
});

describe("percentileRank", () => {
  const population = [1, 2, 3, 4, 5];

  it("ranks the maximum near the top", () => {
    expect(percentileRank(5, population)).toBe(90);
  });

  it("ranks the minimum near the bottom", () => {
    expect(percentileRank(1, population)).toBe(10);
  });

  it("ranks the median at the middle", () => {
    expect(percentileRank(3, population)).toBe(50);
  });

  it("uses mid-rank for ties so equal values get equal percentiles", () => {
    const tied = [2, 2, 2, 2];
    expect(percentileRank(2, tied)).toBe(50);
  });

  it("returns 50 for a population too small to rank against", () => {
    expect(percentileRank(7, [])).toBe(50);
    expect(percentileRank(7, [7])).toBe(50);
  });

  it("ignores non-finite population members", () => {
    expect(percentileRank(3, [1, 2, 3, 4, 5, Number.NaN])).toBe(50);
  });

  it("always stays within 0-100", () => {
    expect(percentileRank(1000, population)).toBeLessThanOrEqual(100);
    expect(percentileRank(-1000, population)).toBeGreaterThanOrEqual(0);
  });
});

describe("invertedPercentileRank", () => {
  it("ranks the lowest value highest, for metrics where less is better", () => {
    const goalsConceded = [10, 20, 30, 40, 50];
    // Conceding the fewest goals should be the best score.
    expect(invertedPercentileRank(10, goalsConceded)).toBe(90);
    expect(invertedPercentileRank(50, goalsConceded)).toBe(10);
  });

  it("is symmetric with percentileRank around the median", () => {
    const pop = [1, 2, 3, 4, 5];
    expect(invertedPercentileRank(3, pop)).toBe(percentileRank(3, pop));
  });
});

describe("parseForm", () => {
  it("parses a standard form string", () => {
    expect(parseForm("WWDLW")).toEqual(["W", "W", "D", "L", "W"]);
  });

  it("is case insensitive", () => {
    expect(parseForm("wdl")).toEqual(["W", "D", "L"]);
  });

  it("discards separators and unexpected characters rather than guessing", () => {
    expect(parseForm("W-D-L")).toEqual(["W", "D", "L"]);
    expect(parseForm("W?X!D")).toEqual(["W", "D"]);
  });

  it("returns an empty array for missing data", () => {
    expect(parseForm(null)).toEqual([]);
    expect(parseForm(undefined)).toEqual([]);
    expect(parseForm("")).toEqual([]);
  });
});

describe("formPoints", () => {
  it("applies the standard 3/1/0 scoring", () => {
    expect(formPoints(["W", "W", "D", "L"])).toBe(7);
  });

  it("is zero for an empty run", () => {
    expect(formPoints([])).toBe(0);
  });
});

describe("recentPointsPerGame", () => {
  it("averages over the most recent matches only", () => {
    // Last five of these are W,W,W,W,W => 3.0
    const form = parseForm("LLLLLWWWWW");
    expect(recentPointsPerGame(form, 5)).toBe(3);
  });

  it("handles a run shorter than the window", () => {
    expect(recentPointsPerGame(parseForm("WD"), 5)).toBe(2);
  });

  it("returns null rather than a misleading zero when form is unknown", () => {
    expect(recentPointsPerGame([], 5)).toBeNull();
  });
});

describe("round / mean / clamp", () => {
  it("rounds to the requested precision", () => {
    expect(round(1.23456, 2)).toBe(1.23);
    expect(round(1.23556, 2)).toBe(1.24);
  });

  it("averages values", () => {
    expect(mean([1, 2, 3])).toBe(2);
  });

  it("returns null for the mean of nothing", () => {
    expect(mean([])).toBeNull();
  });

  it("clamps to bounds", () => {
    expect(clamp(150, 0, 100)).toBe(100);
    expect(clamp(-5, 0, 100)).toBe(0);
  });
});
