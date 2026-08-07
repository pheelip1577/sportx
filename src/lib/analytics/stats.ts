/**
 * Statistical primitives.
 *
 * Everything here is a pure function of real inputs. There is no randomness
 * anywhere in this module, by design — the previous version of this project
 * generated "expected goals" with a random number generator, and this file
 * exists so that every number shown to a user can be traced back to a match
 * that actually happened.
 */

/** Division that yields null rather than Infinity/NaN for a zero denominator. */
export function safeDivide(numerator: number, denominator: number): number | null {
  if (!Number.isFinite(numerator) || !Number.isFinite(denominator)) return null;
  if (denominator === 0) return null;
  return numerator / denominator;
}

export function round(value: number, decimals = 2): number {
  const factor = 10 ** decimals;
  return Math.round(value * factor) / factor;
}

export function mean(values: number[]): number | null {
  if (values.length === 0) return null;
  return values.reduce((sum, v) => sum + v, 0) / values.length;
}

/**
 * Percentile rank of `value` within `population`, using the mid-rank
 * convention: everything strictly below counts fully, ties count half. This
 * is the standard definition and it keeps tied values from being ranked
 * arbitrarily above or below one another.
 *
 * Returns 0-100. A population smaller than two has no meaningful spread, so
 * it returns 50 and callers surface `sampleSize` alongside it.
 */
export function percentileRank(value: number, population: number[]): number {
  const valid = population.filter((v) => Number.isFinite(v));
  if (valid.length < 2) return 50;

  let below = 0;
  let equal = 0;
  for (const v of valid) {
    if (v < value) below++;
    else if (v === value) equal++;
  }

  const rank = ((below + equal / 2) / valid.length) * 100;
  return clamp(round(rank, 1), 0, 100);
}

/**
 * As `percentileRank`, but for metrics where a lower raw value is better
 * (goals conceded, for instance). A team with the fewest goals against should
 * rank at the top, not the bottom.
 */
export function invertedPercentileRank(value: number, population: number[]): number {
  const valid = population.filter((v) => Number.isFinite(v));
  if (valid.length < 2) return 50;
  return clamp(round(100 - percentileRank(value, valid), 1), 0, 100);
}

export function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

export type FormResult = "W" | "D" | "L";

/**
 * Parse a form string as supplied by TheSportsDB (e.g. "WWDLW").
 *
 * Upstream is inconsistent about ordering and occasionally includes separators
 * or unexpected characters, so anything that is not W/D/L is discarded rather
 * than guessed at.
 */
export function parseForm(raw: string | null | undefined): FormResult[] {
  if (!raw) return [];
  const cleaned = raw.toUpperCase().replace(/[^WDL]/g, "");
  return cleaned.split("") as FormResult[];
}

/** Points from a run of results, using the standard 3/1/0. */
export function formPoints(form: FormResult[]): number {
  return form.reduce((total, r) => total + (r === "W" ? 3 : r === "D" ? 1 : 0), 0);
}

/**
 * Points per game across the most recent `window` matches.
 * Returns null when there is no form data, so the UI can say "no recent form"
 * rather than showing a misleading zero.
 */
export function recentPointsPerGame(
  form: FormResult[],
  window = 5,
): number | null {
  if (form.length === 0) return null;
  const recent = form.slice(-window);
  return safeDivide(formPoints(recent), recent.length);
}
