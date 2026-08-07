/**
 * football-data.org provider (requires a free API key).
 *
 * Role in this app: the primary source for full league tables, complete
 * fixture lists, and the scorer data that player analytics are built on.
 *
 * Free tier limits: 10 requests/minute, 12 competitions. Auth is a plain
 * `X-Auth-Token` header. All requests go through the shared cache, so a busy
 * page costs one upstream call per dataset rather than one per visitor.
 *
 * When no key is configured, every function here throws MissingCredentials and
 * the caller renders an explicit "connect a key to enable this" state. It never
 * degrades into estimated numbers.
 */

import { env, type League } from "@/lib/config";
import { fetchJson, UpstreamError } from "@/lib/http";
import type {
  Match,
  MatchState,
  ScorerRecord,
  StandingRow,
  TeamRef,
} from "@/lib/types";
import { parseForm } from "@/lib/analytics/stats";

const BASE = "https://api.football-data.org/v4";

export class MissingCredentials extends Error {
  constructor() {
    super("football-data.org API key is not configured");
    this.name = "MissingCredentials";
  }
}

function requireKey(): string {
  if (!env.footballDataApiKey) throw new MissingCredentials();
  return env.footballDataApiKey;
}

/**
 * Self-throttling against the provider's published quota.
 *
 * football-data.org returns its remaining budget on every response:
 *   X-Requests-Available-Minute: 9
 *   X-RequestCounter-Reset: 60
 *
 * Their onboarding mail explicitly asks clients to read these rather than
 * discovering the limit by being throttled. So we track the budget and refuse
 * to spend the last request, failing fast as `rate-limited`. The cache layer
 * then serves the previous value and flags it as stale, which is a much better
 * outcome than a ban that takes every league down at once.
 */
const quota = {
  remaining: null as number | null,
  resetAt: 0,
};

/** Keep one request in reserve so a burst cannot hit a hard 429. */
const RESERVE = 1;

function readQuota(headers: Headers): void {
  const available = Number.parseInt(
    headers.get("x-requests-available-minute") ?? "",
    10,
  );
  const resetSeconds = Number.parseInt(
    headers.get("x-requestcounter-reset") ?? "",
    10,
  );

  if (Number.isFinite(available)) quota.remaining = available;
  if (Number.isFinite(resetSeconds)) {
    quota.resetAt = Date.now() + resetSeconds * 1000;
  }
}

function assertBudget(label: string): void {
  // The counter window has elapsed, so the budget has refilled.
  if (Date.now() >= quota.resetAt) {
    quota.remaining = null;
    return;
  }
  if (quota.remaining !== null && quota.remaining <= RESERVE) {
    const waitSeconds = Math.max(1, Math.ceil((quota.resetAt - Date.now()) / 1000));
    throw new UpstreamError(
      `football-data ${label}: request budget exhausted, resets in ${waitSeconds}s`,
      429,
      true,
    );
  }
}

async function get<T>(path: string, label: string): Promise<T> {
  assertBudget(label);

  return fetchJson<T>(`${BASE}${path}`, {
    headers: { "X-Auth-Token": requireKey() },
    label: `football-data ${label}`,
    // The free tier's 10/min budget is easy to exhaust; do not pile on retries.
    retries: 1,
    onHeaders: readQuota,
  });
}

/** Exposed for the health endpoint so the budget is observable in production. */
export function quotaStatus(): { remaining: number | null; resetsInMs: number } {
  return {
    remaining: quota.remaining,
    resetsInMs: Math.max(0, quota.resetAt - Date.now()),
  };
}

function num(value: unknown): number {
  return typeof value === "number" && Number.isFinite(value) ? value : 0;
}

function numOrNull(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

interface RawTeam {
  id?: number;
  name?: string;
  shortName?: string;
  tla?: string;
  crest?: string;
}

function mapTeam(raw: RawTeam | undefined): TeamRef {
  return {
    id: raw?.id ? String(raw.id) : "unknown",
    name: raw?.name ?? "Unknown",
    shortName: raw?.shortName ?? raw?.tla ?? null,
    crest: raw?.crest ?? null,
  };
}

interface RawStandingEntry {
  position?: number;
  team?: RawTeam;
  playedGames?: number;
  form?: string | null;
  won?: number;
  draw?: number;
  lost?: number;
  points?: number;
  goalsFor?: number;
  goalsAgainst?: number;
  goalDifference?: number;
}

export interface FootballDataTable {
  rows: StandingRow[];
  /** Season start year as reported by upstream, e.g. 2026. */
  seasonStartYear: number | null;
  /**
   * Whether the season upstream considers "current" has actually begun.
   *
   * This matters more than it looks. During the summer gap the API reports the
   * *upcoming* season in `season.startDate` while still serving the *previous*
   * season's completed table. Trusting the row data alone ("some team has
   * played games, so the season is underway") mislabels last season's final
   * standings as this season's live table.
   */
  seasonHasStarted: boolean;
  competition: string;
}

/**
 * @param seasonStartYear Explicit season, e.g. 2025 for 2025/26. Omit for the
 *   competition's current season. Needed during the summer gap, when the new
 *   season exists but has no matches played yet.
 */
export async function getStandings(
  league: League,
  seasonStartYear?: number,
): Promise<FootballDataTable> {
  const qs = seasonStartYear ? `?season=${seasonStartYear}` : "";
  const data = await get<{
    standings?: { type?: string; table?: RawStandingEntry[] }[];
    season?: { startDate?: string };
    competition?: { name?: string };
  }>(
    `/competitions/${league.footballDataCode}/standings${qs}`,
    `standings ${league.id}`,
  );

  // A competition can expose TOTAL / HOME / AWAY tables; we want the overall one.
  const total =
    data.standings?.find((s) => s.type === "TOTAL") ?? data.standings?.[0];

  const rows: StandingRow[] = (total?.table ?? []).map((entry) => ({
    rank: num(entry.position),
    team: mapTeam(entry.team),
    played: num(entry.playedGames),
    won: num(entry.won),
    drawn: num(entry.draw),
    lost: num(entry.lost),
    goalsFor: num(entry.goalsFor),
    goalsAgainst: num(entry.goalsAgainst),
    goalDifference: num(entry.goalDifference),
    points: num(entry.points),
    form: parseForm(entry.form),
  }));

  const startDate = data.season?.startDate ?? null;
  const startYear = startDate ? Number.parseInt(startDate.slice(0, 4), 10) : null;

  // A start date in the future means these rows belong to the season before it.
  const seasonHasStarted = startDate
    ? new Date(startDate).getTime() <= Date.now()
    : rows.some((r) => r.played > 0);

  return {
    rows,
    seasonStartYear: startYear !== null && !Number.isNaN(startYear) ? startYear : null,
    seasonHasStarted,
    competition: data.competition?.name ?? league.name,
  };
}

interface RawScorer {
  player?: {
    id?: number;
    name?: string;
    position?: string;
    nationality?: string;
    dateOfBirth?: string;
  };
  team?: RawTeam;
  playedMatches?: number;
  goals?: number;
  assists?: number | null;
  penalties?: number | null;
}

/**
 * Top scorers for a competition.
 *
 * `assists` and `penalties` are genuinely null for some competitions on the
 * free tier. They are preserved as null rather than coerced to 0, because
 * "we don't know" and "zero assists" are different facts and the analytics
 * layer treats them differently.
 */
export async function getScorers(
  league: League,
  limit = 50,
  seasonStartYear?: number,
): Promise<ScorerRecord[]> {
  const season = seasonStartYear ? `&season=${seasonStartYear}` : "";
  const data = await get<{ scorers?: RawScorer[] }>(
    `/competitions/${league.footballDataCode}/scorers?limit=${limit}${season}`,
    `scorers ${league.id}`,
  );

  return (data.scorers ?? []).map((raw) => ({
    player: {
      id: raw.player?.id ? String(raw.player.id) : (raw.player?.name ?? "unknown"),
      name: raw.player?.name ?? "Unknown player",
      team: raw.team?.name ?? null,
      position: raw.player?.position ?? null,
      nationality: raw.player?.nationality ?? null,
      dateOfBirth: raw.player?.dateOfBirth ?? null,
      photo: null, // Upstream provides no player imagery on the free tier.
    },
    team: mapTeam(raw.team),
    goals: num(raw.goals),
    assists: numOrNull(raw.assists),
    penalties: numOrNull(raw.penalties),
    appearances: num(raw.playedMatches),
  }));
}

interface RawMatch {
  id?: number;
  utcDate?: string;
  status?: string;
  matchday?: number;
  venue?: string | null;
  homeTeam?: RawTeam;
  awayTeam?: RawTeam;
  score?: {
    fullTime?: { home?: number | null; away?: number | null };
  };
}

function mapStatus(status: string | undefined): MatchState {
  switch (status) {
    case "IN_PLAY":
    case "PAUSED":
      return "live";
    case "FINISHED":
    case "AWARDED":
      return "finished";
    case "POSTPONED":
    case "SUSPENDED":
    case "CANCELLED":
      return "postponed";
    default:
      return "scheduled";
  }
}

function mapMatch(raw: RawMatch, competition: string): Match {
  return {
    id: raw.id ? String(raw.id) : crypto.randomUUID(),
    league: competition,
    state: mapStatus(raw.status),
    kickoff: raw.utcDate ?? null,
    progress: null,
    home: mapTeam(raw.homeTeam),
    away: mapTeam(raw.awayTeam),
    homeScore: numOrNull(raw.score?.fullTime?.home),
    awayScore: numOrNull(raw.score?.fullTime?.away),
    venue: raw.venue ?? null,
    round: raw.matchday ? String(raw.matchday) : null,
  };
}

export interface MatchQuery {
  /** ISO date (YYYY-MM-DD) lower bound, inclusive. */
  dateFrom?: string;
  /** ISO date (YYYY-MM-DD) upper bound, inclusive. */
  dateTo?: string;
  status?: "SCHEDULED" | "LIVE" | "IN_PLAY" | "FINISHED";
}

export async function getMatches(
  league: League,
  query: MatchQuery = {},
): Promise<Match[]> {
  const params = new URLSearchParams();
  if (query.dateFrom) params.set("dateFrom", query.dateFrom);
  if (query.dateTo) params.set("dateTo", query.dateTo);
  if (query.status) params.set("status", query.status);

  const qs = params.toString();
  const data = await get<{ matches?: RawMatch[]; competition?: { name?: string } }>(
    `/competitions/${league.footballDataCode}/matches${qs ? `?${qs}` : ""}`,
    `matches ${league.id}`,
  );

  const competition = data.competition?.name ?? league.name;
  return (data.matches ?? []).map((m) => mapMatch(m, competition));
}

/** ISO date string (YYYY-MM-DD) offset from today by `days`. */
export function isoDate(offsetDays = 0, from: Date = new Date()): string {
  const d = new Date(from);
  d.setUTCDate(d.getUTCDate() + offsetDays);
  return d.toISOString().slice(0, 10);
}
