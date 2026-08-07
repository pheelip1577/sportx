/**
 * Player analytics derived from football-data.org's scorers endpoint.
 *
 * IMPORTANT LABELLING NOTE
 * ------------------------
 * Upstream gives goals, assists, penalties and *appearances* - but not minutes
 * played. Every rate here is therefore "per appearance", and is labelled that
 * way throughout. It is deliberately not called "per 90", because we cannot
 * compute per-90 without minutes, and pretending otherwise would misstate the
 * data by exactly the amount a substitute plays.
 *
 * The comparison population is the league's scorer list, not every player in
 * the league. That is a real selection effect - these percentiles rank a player
 * among goal contributors, not among all professionals - and the UI says so.
 */

import type { PlayerAnalytics, RatedMetric, ScorerRecord } from "@/lib/types";
import { percentileRank, round, safeDivide } from "./stats";

interface PlayerMetricSpec {
  key: string;
  label: string;
  explanation: string;
  compute: (record: ScorerRecord) => number | null;
  format: (value: number) => string;
}

/** Goals excluding penalties, when penalty data is available. */
export function nonPenaltyGoals(record: ScorerRecord): number | null {
  if (record.penalties === null) return null;
  return Math.max(0, record.goals - record.penalties);
}

/** Goals + assists, when assist data is available. */
export function goalInvolvements(record: ScorerRecord): number | null {
  if (record.assists === null) return null;
  return record.goals + record.assists;
}

const METRICS: PlayerMetricSpec[] = [
  {
    key: "goals",
    label: "Goals",
    explanation: "Total league goals scored this season.",
    compute: (r) => r.goals,
    format: (v) => String(Math.round(v)),
  },
  {
    key: "goals-per-appearance",
    label: "Goals / appearance",
    explanation:
      "Goals divided by appearances. Upstream does not publish minutes played, so this is per appearance rather than per 90.",
    compute: (r) => safeDivide(r.goals, r.appearances),
    format: (v) => v.toFixed(2),
  },
  {
    key: "assists",
    label: "Assists",
    explanation: "Total league assists this season.",
    compute: (r) => r.assists,
    format: (v) => String(Math.round(v)),
  },
  {
    key: "involvements-per-appearance",
    label: "Goal involvements / appearance",
    explanation:
      "Goals plus assists, divided by appearances - total attacking contribution per match played.",
    compute: (r) => {
      const involvements = goalInvolvements(r);
      return involvements === null ? null : safeDivide(involvements, r.appearances);
    },
    format: (v) => v.toFixed(2),
  },
  {
    key: "non-penalty-goals",
    label: "Non-penalty goals",
    explanation:
      "Goals with penalties removed, so open-play scoring is not inflated by spot-kick duty.",
    compute: (r) => nonPenaltyGoals(r),
    format: (v) => String(Math.round(v)),
  },
  {
    key: "appearances",
    label: "Appearances",
    explanation:
      "Matches played in this competition - an availability and durability indicator.",
    compute: (r) => r.appearances,
    format: (v) => String(Math.round(v)),
  },
];

export function analysePlayer(
  target: ScorerRecord,
  population: ScorerRecord[],
): PlayerAnalytics {
  const metrics: RatedMetric[] = [];

  for (const spec of METRICS) {
    const value = spec.compute(target);
    if (value === null) continue;

    const values = population
      .map(spec.compute)
      .filter((v): v is number => v !== null);

    metrics.push({
      key: spec.key,
      label: spec.label,
      value: round(value, 3),
      display: spec.format(value),
      percentile: percentileRank(value, values),
      explanation: spec.explanation,
    });
  }

  return {
    player: target.player,
    team: target.team,
    goals: target.goals,
    assists: target.assists,
    appearances: target.appearances,
    metrics,
    sampleSize: population.length,
  };
}

export function analyseScorers(records: ScorerRecord[]): PlayerAnalytics[] {
  return records.map((r) => analysePlayer(r, records));
}

/**
 * Unicode combining diacritical marks (U+0300-U+036F).
 * Built from escape sequences rather than written literally so the source file
 * stays pure ASCII and cannot be corrupted by an editor re-encoding it.
 */
const COMBINING_MARKS = new RegExp("[\\u0300-\\u036f]", "g");

/** Strip accents so that a query for "Mbappe" matches an accented "Mbappe". */
function normaliseName(value: string): string {
  return value.normalize("NFD").replace(COMBINING_MARKS, "").toLowerCase().trim();
}

/**
 * Find a scorer by (fuzzy) name.
 *
 * Matching is accent-insensitive because upstream sources disagree on
 * diacritics. An exact-key lookup silently missing on an accented name is
 * precisely the bug that made the previous version of this project fall back
 * to invented statistics.
 */
export function findScorerByName(
  records: ScorerRecord[],
  query: string,
): ScorerRecord | null {
  const q = normaliseName(query);
  if (!q) return null;

  const exact = records.find((r) => normaliseName(r.player.name) === q);
  if (exact) return exact;

  const partial = records.filter((r) => {
    const name = normaliseName(r.player.name);
    return name.includes(q) || q.includes(name);
  });

  if (partial.length === 0) return null;

  // Prefer the closest name length so a short query does not match a long name
  // ahead of the surname it actually refers to.
  partial.sort(
    (a, b) =>
      Math.abs(normaliseName(a.player.name).length - q.length) -
      Math.abs(normaliseName(b.player.name).length - q.length),
  );
  return partial[0];
}
