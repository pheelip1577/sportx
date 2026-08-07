import { describe, expect, it } from "vitest";
import type { StandingRow } from "@/lib/types";
import { analyseTable, analyseTeam, leagueSummary } from "./team";
import { parseForm } from "./stats";

function row(
  overrides: Partial<StandingRow> & { name: string; rank: number },
): StandingRow {
  const {
    name,
    rank,
    played = 10,
    won = 5,
    drawn = 2,
    lost = 3,
    goalsFor = 15,
    goalsAgainst = 10,
    form = parseForm("WWDLW"),
    ...rest
  } = overrides;

  return {
    rank,
    team: { id: name.toLowerCase(), name, shortName: null, crest: null },
    played,
    won,
    drawn,
    lost,
    goalsFor,
    goalsAgainst,
    goalDifference: goalsFor - goalsAgainst,
    points: won * 3 + drawn,
    form,
    ...rest,
  };
}

const table: StandingRow[] = [
  row({ name: "Alpha", rank: 1, won: 9, drawn: 1, lost: 0, goalsFor: 30, goalsAgainst: 5 }),
  row({ name: "Bravo", rank: 2, won: 6, drawn: 2, lost: 2, goalsFor: 20, goalsAgainst: 12 }),
  row({ name: "Charlie", rank: 3, won: 4, drawn: 3, lost: 3, goalsFor: 14, goalsAgainst: 14 }),
  row({ name: "Delta", rank: 4, won: 1, drawn: 2, lost: 7, goalsFor: 6, goalsAgainst: 25 }),
];

describe("analyseTeam", () => {
  it("computes real values from the table, not estimates", () => {
    const result = analyseTeam(table[0], table);
    const ppg = result.metrics.find((m) => m.key === "points-per-game");
    // 9 wins + 1 draw = 28 points over 10 games.
    expect(ppg?.value).toBe(2.8);
    expect(ppg?.display).toBe("2.80");
  });

  it("ranks the best attack highest", () => {
    const best = analyseTeam(table[0], table);
    const worst = analyseTeam(table[3], table);
    const bestAttack = best.metrics.find((m) => m.key === "goals-for-per-game");
    const worstAttack = worst.metrics.find((m) => m.key === "goals-for-per-game");
    expect(bestAttack!.percentile).toBeGreaterThan(worstAttack!.percentile);
  });

  it("ranks the meanest defence highest despite a lower raw value", () => {
    const tightest = analyseTeam(table[0], table); // 5 conceded
    const leakiest = analyseTeam(table[3], table); // 25 conceded
    const tightMetric = tightest.metrics.find(
      (m) => m.key === "goals-against-per-game",
    );
    const leakyMetric = leakiest.metrics.find(
      (m) => m.key === "goals-against-per-game",
    );

    expect(tightMetric!.value).toBeLessThan(leakyMetric!.value);
    expect(tightMetric!.percentile).toBeGreaterThan(leakyMetric!.percentile);
  });

  it("reports the population size behind the percentiles", () => {
    expect(analyseTeam(table[0], table).sampleSize).toBe(4);
  });

  it("gives every metric a human-readable explanation", () => {
    for (const metric of analyseTeam(table[0], table).metrics) {
      expect(metric.explanation.length).toBeGreaterThan(10);
    }
  });

  it("omits metrics that cannot be computed rather than defaulting them", () => {
    const unplayed = row({
      name: "Echo",
      rank: 5,
      played: 0,
      won: 0,
      drawn: 0,
      lost: 0,
      goalsFor: 0,
      goalsAgainst: 0,
      form: [],
    });
    const result = analyseTeam(unplayed, [unplayed]);
    // Nothing is divisible by zero games, and there is no form to average.
    expect(result.metrics.find((m) => m.key === "points-per-game")).toBeUndefined();
    expect(result.metrics.find((m) => m.key === "recent-form")).toBeUndefined();
  });

  it("is deterministic - the same input always yields the same output", () => {
    const a = analyseTeam(table[1], table);
    const b = analyseTeam(table[1], table);
    expect(a).toEqual(b);
  });
});

describe("analyseTable", () => {
  it("preserves table order", () => {
    const analysed = analyseTable(table);
    expect(analysed.map((t) => t.team.name)).toEqual([
      "Alpha",
      "Bravo",
      "Charlie",
      "Delta",
    ]);
  });
});

describe("leagueSummary", () => {
  it("halves total appearances because each fixture appears in two rows", () => {
    const summary = leagueSummary(table);
    // 4 teams x 10 played = 40 team-matches = 20 actual fixtures.
    expect(summary?.matchesPlayed).toBe(20);
    expect(summary?.teams).toBe(4);
  });

  it("computes goals per match from real totals", () => {
    const summary = leagueSummary(table);
    // 30 + 20 + 14 + 6 = 70 goals over 20 matches.
    expect(summary?.goalsScored).toBe(70);
    expect(summary?.goalsPerMatch).toBe(3.5);
  });

  it("returns null for an empty table", () => {
    expect(leagueSummary([])).toBeNull();
  });

  it("returns null before a ball is kicked, rather than dividing by zero", () => {
    const preSeason = [
      row({ name: "A", rank: 1, played: 0, won: 0, drawn: 0, lost: 0, goalsFor: 0, goalsAgainst: 0 }),
    ];
    expect(leagueSummary(preSeason)).toBeNull();
  });
});
