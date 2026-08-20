import { describe, expect, it } from "vitest";
import type { ScorerRecord } from "@/lib/types";
import {
  analysePlayer,
  findScorerByName,
  goalInvolvements,
  nonPenaltyGoals,
} from "./player";

function scorer(
  name: string,
  goals: number,
  appearances: number,
  assists: number | null = 0,
  penalties: number | null = 0,
): ScorerRecord {
  return {
    player: {
      id: name.toLowerCase().replace(/\s+/g, "-"),
      name,
      team: "Test FC",
      position: "Forward",
      nationality: null,
      dateOfBirth: null,
      photo: null,
    },
    team: { id: "test-fc", name: "Test FC", shortName: null, crest: null },
    goals,
    assists,
    penalties,
    appearances,
  };
}

const population: ScorerRecord[] = [
  scorer("Top Scorer", 20, 20, 5, 4),
  scorer("Mid Scorer", 10, 20, 3, 0),
  scorer("Low Scorer", 4, 20, 1, 0),
  scorer("Super Sub", 6, 6, 2, 0),
];

describe("nonPenaltyGoals", () => {
  it("subtracts penalties from the goal total", () => {
    expect(nonPenaltyGoals(scorer("A", 20, 20, 0, 4))).toBe(16);
  });

  it("returns null when penalty data is unavailable, rather than assuming zero", () => {
    expect(nonPenaltyGoals(scorer("A", 20, 20, 0, null))).toBeNull();
  });

  it("never returns a negative goal count", () => {
    expect(nonPenaltyGoals(scorer("A", 2, 20, 0, 5))).toBe(0);
  });
});

describe("goalInvolvements", () => {
  it("sums goals and assists", () => {
    expect(goalInvolvements(scorer("A", 10, 20, 5))).toBe(15);
  });

  it("returns null when assists are unavailable", () => {
    expect(goalInvolvements(scorer("A", 10, 20, null))).toBeNull();
  });
});

describe("analysePlayer", () => {
  it("computes per-appearance rates from real totals", () => {
    const result = analysePlayer(population[0], population);
    const rate = result.metrics.find((m) => m.key === "goals-per-appearance");
    expect(rate?.value).toBe(1);
    expect(rate?.display).toBe("1.00");
  });

  it("credits an efficient low-minutes player on rate, not volume", () => {
    const sub = analysePlayer(population[3], population); // 6 goals in 6 apps
    const mid = analysePlayer(population[1], population); // 10 goals in 20 apps

    const subRate = sub.metrics.find((m) => m.key === "goals-per-appearance")!;
    const midRate = mid.metrics.find((m) => m.key === "goals-per-appearance")!;
    const subTotal = sub.metrics.find((m) => m.key === "goals")!;
    const midTotal = mid.metrics.find((m) => m.key === "goals")!;

    expect(subRate.percentile).toBeGreaterThan(midRate.percentile);
    expect(subTotal.percentile).toBeLessThan(midTotal.percentile);
  });

  it("labels rates as per appearance, never claiming per 90", () => {
    const result = analysePlayer(population[0], population);

    for (const metric of result.metrics) {
      // No label may advertise a per-90 rate, since minutes are not available.
      expect(metric.label).not.toMatch(/90/);

      // An explanation may *mention* per 90 only to disclaim it
      // ("...rather than per 90"), never to assert it.
      const mentionsPer90 = /per 90/.test(metric.explanation);
      const disclaimsIt = /rather than per 90/.test(metric.explanation);
      expect(mentionsPer90 && !disclaimsIt).toBe(false);
    }
  });

  it("omits non-penalty goals when penalty data is missing", () => {
    const unknownPens = scorer("Unknown", 10, 20, 2, null);
    const result = analysePlayer(unknownPens, [unknownPens, ...population]);
    expect(result.metrics.find((m) => m.key === "non-penalty-goals")).toBeUndefined();
  });

  it("reports the sample size the percentiles came from", () => {
    expect(analysePlayer(population[0], population).sampleSize).toBe(4);
  });

  it("is deterministic", () => {
    expect(analysePlayer(population[2], population)).toEqual(
      analysePlayer(population[2], population),
    );
  });
});

describe("findScorerByName", () => {
  const withAccents = [
    scorer("Kylian Mbappé", 20, 20),
    scorer("Rodrigo De Paul", 3, 18),
    scorer("Bernardo Silva", 5, 25),
  ];

  it("finds an exact match", () => {
    expect(findScorerByName(withAccents, "Bernardo Silva")?.goals).toBe(5);
  });

  it("matches across accents - the bug that previously caused fake fallbacks", () => {
    const found = findScorerByName(withAccents, "Kylian Mbappe");
    expect(found).not.toBeNull();
    expect(found?.goals).toBe(20);
  });

  it("matches a surname", () => {
    expect(findScorerByName(withAccents, "mbappe")?.goals).toBe(20);
  });

  it("is case and whitespace insensitive", () => {
    expect(findScorerByName(withAccents, "  BERNARDO SILVA ")?.goals).toBe(5);
  });

  it("returns null for an unknown player instead of a default", () => {
    expect(findScorerByName(withAccents, "Nobody At All")).toBeNull();
  });

  it("returns null for an empty query", () => {
    expect(findScorerByName(withAccents, "   ")).toBeNull();
  });

  it("prioritizes players with higher goals when name length difference ties", () => {
    const candidates = [
      scorer("Jane Smith", 5, 20),
      scorer("John Smith", 18, 20),
      scorer("Jack Smith", 10, 20),
    ];
    // "Smith" query diff is identical for all three (10 - 5 = 5 chars diff)
    const result = findScorerByName(candidates, "Smith");
    expect(result).not.toBeNull();
    expect(result?.player.name).toBe("John Smith");
    expect(result?.goals).toBe(18);
  });
});
