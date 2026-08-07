/**
 * Domain types.
 *
 * Design rule for this file: every field here must be traceable to a real
 * upstream response or to a documented calculation over one. If a value cannot
 * be sourced, its type is nullable and the UI renders "not available" — we do
 * not invent a placeholder number.
 */

/** Where a piece of data came from, surfaced in the UI for attribution. */
export type SourceId = "thesportsdb" | "football-data" | "rss" | "computed";

export interface Attribution {
  source: SourceId;
  label: string;
  url: string;
  /** ISO timestamp of when this snapshot was fetched from upstream. */
  fetchedAt: string;
  /** True when served from cache after an upstream failure. */
  stale?: boolean;
}

/**
 * Discriminated result used across the data layer so callers can tell apart
 * "upstream said there is nothing" from "we could not reach upstream".
 * These render as different UI states and must never collapse into each other.
 */
export type DataResult<T> =
  | { ok: true; data: T; attribution: Attribution }
  | { ok: false; reason: DataUnavailableReason; message: string };

export type DataUnavailableReason =
  | "missing-credentials"
  | "upstream-error"
  | "rate-limited"
  | "not-found"
  | "no-data-for-period";

export interface TeamRef {
  id: string;
  name: string;
  shortName: string | null;
  crest: string | null;
}

export interface StandingRow {
  rank: number;
  team: TeamRef;
  played: number;
  won: number;
  drawn: number;
  lost: number;
  goalsFor: number;
  goalsAgainst: number;
  goalDifference: number;
  points: number;
  /** Recent results, most recent last, e.g. ["W","D","L"]. Empty if unknown. */
  form: FormResult[];
}

export type FormResult = "W" | "D" | "L";

export type MatchState = "scheduled" | "live" | "finished" | "postponed";

export interface Match {
  id: string;
  league: string;
  state: MatchState;
  /** ISO kickoff timestamp, or null when upstream omits it. */
  kickoff: string | null;
  /** Live clock text exactly as upstream reports it, e.g. "67'" or "HT". */
  progress: string | null;
  home: TeamRef;
  away: TeamRef;
  homeScore: number | null;
  awayScore: number | null;
  venue: string | null;
  round: string | null;
}

export interface PlayerProfile {
  id: string;
  name: string;
  team: string | null;
  position: string | null;
  nationality: string | null;
  dateOfBirth: string | null;
  photo: string | null;
}

/**
 * A scoring record from football-data.org.
 *
 * Note: upstream provides appearances but NOT minutes played, so all rates
 * derived from this are strictly *per appearance*, never "per 90". The
 * distinction is preserved in the field names on purpose.
 */
export interface ScorerRecord {
  player: PlayerProfile;
  team: TeamRef;
  goals: number;
  assists: number | null;
  penalties: number | null;
  appearances: number;
}

export interface NewsArticle {
  id: string;
  title: string;
  summary: string;
  url: string;
  source: string;
  publishedAt: string | null;
  image: string | null;
}

/** A metric with its league-relative percentile, used by the radar charts. */
export interface RatedMetric {
  key: string;
  label: string;
  /** The real measured value. */
  value: number;
  /** Formatted for display, including units. */
  display: string;
  /** 0-100 rank within the comparison population. */
  percentile: number;
  /** Plain-English definition shown on hover — every metric must explain itself. */
  explanation: string;
}

export interface TeamAnalytics {
  team: TeamRef;
  rank: number;
  points: number;
  played: number;
  metrics: RatedMetric[];
  /** Size of the population the percentiles were computed against. */
  sampleSize: number;
}

export interface PlayerAnalytics {
  player: PlayerProfile;
  team: TeamRef;
  goals: number;
  assists: number | null;
  appearances: number;
  metrics: RatedMetric[];
  sampleSize: number;
}
