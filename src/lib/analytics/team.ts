/**
 * Team analytics derived entirely from a real league table.
 *
 * Every metric below is a documented arithmetic transform of columns that
 * appear in the published standings (played, won, drawn, goals for/against,
 * points, recent form). Nothing is estimated or modelled — which means each
 * one can be explained to a user in a single sentence, and each explanation
 * ships with the metric itself.
 */

import type { RatedMetric, StandingRow, TeamAnalytics } from "@/lib/types";
import {
  invertedPercentileRank,
  percentileRank,
  recentPointsPerGame,
  round,
  safeDivide,
} from "./stats";

interface MetricSpec {
  key: string;
  label: string;
  explanation: string;
  /** Extract the raw value for a row; null when it cannot be computed. */
  compute: (row: StandingRow) => number | null;
  /** Lower raw values are better (e.g. goals conceded). */
  lowerIsBetter?: boolean;
  format: (value: number) => string;
}

const METRICS: MetricSpec[] = [
  {
    key: "points-per-game",
    label: "Points / game",
    explanation:
      "League points divided by matches played. The single best summary of a season so far.",
    compute: (row) => safeDivide(row.points, row.played),
    format: (v) => v.toFixed(2),
  },
  {
    key: "goals-for-per-game",
    label: "Goals scored / game",
    explanation: "Goals scored divided by matches played — raw attacking output.",
    compute: (row) => safeDivide(row.goalsFor, row.played),
    format: (v) => v.toFixed(2),
  },
  {
    key: "goals-against-per-game",
    label: "Goals conceded / game",
    explanation:
      "Goals conceded divided by matches played. Ranked so that conceding fewer is better.",
    compute: (row) => safeDivide(row.goalsAgainst, row.played),
    lowerIsBetter: true,
    format: (v) => v.toFixed(2),
  },
  {
    key: "goal-difference-per-game",
    label: "Goal difference / game",
    explanation:
      "Goal difference divided by matches played — attacking and defensive balance in one number.",
    compute: (row) => safeDivide(row.goalDifference, row.played),
    format: (v) => (v >= 0 ? `+${v.toFixed(2)}` : v.toFixed(2)),
  },
  {
    key: "win-rate",
    label: "Win rate",
    explanation: "Share of matches played that ended in a win.",
    compute: (row) => {
      const rate = safeDivide(row.won, row.played);
      return rate === null ? null : rate * 100;
    },
    format: (v) => `${v.toFixed(0)}%`,
  },
  {
    key: "recent-form",
    label: "Form (last 5)",
    explanation:
      "Points per game across the last five matches, so a team's current run is separated from its season average.",
    compute: (row) => recentPointsPerGame(row.form, 5),
    format: (v) => v.toFixed(2),
  },
];

/**
 * Build percentile-rated metrics for one team against the rest of its league.
 *
 * The comparison population is the other teams in the same table, which is why
 * `sampleSize` is reported: a percentile drawn from a 20-team league means
 * something different from one drawn from three rows of partial data.
 */
export function analyseTeam(
  target: StandingRow,
  table: StandingRow[],
): TeamAnalytics {
  const metrics: RatedMetric[] = [];

  for (const spec of METRICS) {
    const value = spec.compute(target);
    if (value === null) continue;

    const population = table
      .map(spec.compute)
      .filter((v): v is number => v !== null);

    const percentile = spec.lowerIsBetter
      ? invertedPercentileRank(value, population)
      : percentileRank(value, population);

    metrics.push({
      key: spec.key,
      label: spec.label,
      value: round(value, 3),
      display: spec.format(value),
      percentile,
      explanation: spec.explanation,
    });
  }

  return {
    team: target.team,
    rank: target.rank,
    points: target.points,
    played: target.played,
    metrics,
    sampleSize: table.length,
  };
}

/** Analyse every team in a table, preserving table order. */
export function analyseTable(table: StandingRow[]): TeamAnalytics[] {
  return table.map((row) => analyseTeam(row, table));
}

/**
 * League-wide summary figures, computed from the table rather than hardcoded.
 * Returns null for a table that is empty or has no completed matches.
 */
export function leagueSummary(table: StandingRow[]): {
  matchesPlayed: number;
  goalsScored: number;
  goalsPerMatch: number;
  teams: number;
} | null {
  if (table.length === 0) return null;

  // Each fixture appears in two rows, so the sum of "played" double-counts it.
  const totalTeamMatches = table.reduce((sum, r) => sum + r.played, 0);
  const matchesPlayed = Math.round(totalTeamMatches / 2);
  const goalsScored = table.reduce((sum, r) => sum + r.goalsFor, 0);

  if (matchesPlayed === 0) return null;

  return {
    matchesPlayed,
    goalsScored,
    goalsPerMatch: round(goalsScored / matchesPlayed, 2),
    teams: table.length,
  };
}
