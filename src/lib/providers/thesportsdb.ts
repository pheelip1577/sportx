/**
 * TheSportsDB provider (keyless).
 *
 * Role in this app: live scores and visual assets (crests, badges).
 *
 * Measured constraints of the free tier, verified against the live API rather
 * than assumed from docs:
 *   - List endpoints (standings, fixtures) are capped at 5 rows.
 *   - livescore.php is NOT capped and returned 46 concurrent matches.
 *   - Cloudflare issues a 1015 ban after roughly a dozen rapid requests.
 *
 * Because of the 5-row cap, this provider is a fallback for tables, never the
 * primary. Anything it truncates is reported as truncated, not passed off as a
 * complete league table.
 */

import { env, sportsDbSeason, type League } from "@/lib/config";
import { fetchJson } from "@/lib/http";
import type { Match, MatchState, StandingRow, TeamRef } from "@/lib/types";
import { parseForm } from "@/lib/analytics/stats";

const BASE = "https://www.thesportsdb.com/api/v1/json";

/** Free-tier row cap, measured empirically. */
export const FREE_TIER_ROW_CAP = 5;

function url(path: string, params: Record<string, string> = {}): string {
  const query = new URLSearchParams(params).toString();
  return `${BASE}/${env.sportsDbKey}/${path}${query ? `?${query}` : ""}`;
}

/** Upstream returns every numeric field as a string, and sometimes as null. */
function toInt(value: unknown): number {
  if (typeof value === "number") return Number.isFinite(value) ? value : 0;
  if (typeof value === "string") {
    const parsed = Number.parseInt(value, 10);
    return Number.isNaN(parsed) ? 0 : parsed;
  }
  return 0;
}

function toIntOrNull(value: unknown): number | null {
  if (value === null || value === undefined || value === "") return null;
  const parsed = toInt(value);
  return Number.isNaN(parsed) ? null : parsed;
}

function str(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

/**
 * Badge URLs come back with a "/tiny" suffix that yields a low-resolution
 * image. Strip it for a full-size crest.
 */
function normaliseBadge(value: unknown): string | null {
  const raw = str(value);
  if (!raw) return null;
  return raw.replace(/\/(tiny|small|medium)$/, "");
}

interface RawStanding {
  intRank?: string;
  idTeam?: string;
  strTeam?: string;
  strBadge?: string;
  strForm?: string;
  intPlayed?: string;
  intWin?: string;
  intLoss?: string;
  intDraw?: string;
  intGoalsFor?: string;
  intGoalsAgainst?: string;
  intGoalDifference?: string;
  intPoints?: string;
}

function mapStanding(raw: RawStanding): StandingRow {
  const goalsFor = toInt(raw.intGoalsFor);
  const goalsAgainst = toInt(raw.intGoalsAgainst);

  return {
    rank: toInt(raw.intRank),
    team: {
      id: str(raw.idTeam) ?? str(raw.strTeam) ?? "unknown",
      name: str(raw.strTeam) ?? "Unknown",
      shortName: null,
      crest: normaliseBadge(raw.strBadge),
    },
    played: toInt(raw.intPlayed),
    won: toInt(raw.intWin),
    drawn: toInt(raw.intDraw),
    lost: toInt(raw.intLoss),
    goalsFor,
    goalsAgainst,
    goalDifference: raw.intGoalDifference
      ? toInt(raw.intGoalDifference)
      : goalsFor - goalsAgainst,
    points: toInt(raw.intPoints),
    form: parseForm(raw.strForm),
  };
}

export interface SportsDbTable {
  rows: StandingRow[];
  season: string;
  /** True when the free-tier cap means this is not the whole league. */
  truncated: boolean;
}

export async function getStandings(
  league: League,
  season: string = sportsDbSeason(),
): Promise<SportsDbTable> {
  const data = await fetchJson<{ table?: RawStanding[] }>(
    url("lookuptable.php", { l: league.sportsDbId, s: season }),
    { label: `thesportsdb standings ${league.id}` },
  );

  const rows = (data.table ?? []).map(mapStanding);
  return {
    rows,
    season,
    truncated: rows.length >= FREE_TIER_ROW_CAP,
  };
}

/** Total matches played across a table - used to detect an unstarted season. */
export function tableHasStarted(rows: StandingRow[]): boolean {
  return rows.some((r) => r.played > 0);
}

interface RawLiveScore {
  idEvent?: string;
  idLeague?: string;
  strLeague?: string;
  strHomeTeam?: string;
  strAwayTeam?: string;
  idHomeTeam?: string;
  idAwayTeam?: string;
  strHomeTeamBadge?: string;
  strAwayTeamBadge?: string;
  intHomeScore?: string;
  intAwayScore?: string;
  strStatus?: string;
  strProgress?: string;
  strTimestamp?: string;
}

/**
 * Map upstream status codes to our match state.
 * Upstream uses "1H"/"2H"/"HT"/"ET" while in play, and "FT"/"AET"/"PEN" when done.
 */
function mapLiveState(status: string | null): MatchState {
  if (!status) return "live";
  const s = status.toUpperCase();
  if (["FT", "AET", "PEN", "AP", "FINISHED"].includes(s)) return "finished";
  if (["POSTP", "PST", "CANC", "ABD", "SUSP"].includes(s)) return "postponed";
  if (["NS", "TBD", "SCHEDULED"].includes(s)) return "scheduled";
  return "live";
}

/**
 * Format the live clock. Upstream splits it: strStatus carries the period
 * ("1H", "HT") and strProgress carries the minute as a bare number.
 */
function formatProgress(status: string | null, progress: string | null): string | null {
  const s = status?.toUpperCase() ?? null;
  if (s === "HT") return "HT";
  if (s && ["FT", "AET", "PEN"].includes(s)) return s;
  if (progress && /^\d+$/.test(progress)) return `${progress}'`;
  return s ?? progress;
}

function mapLiveScore(raw: RawLiveScore): Match {
  const status = str(raw.strStatus);
  return {
    id: str(raw.idEvent) ?? crypto.randomUUID(),
    league: str(raw.strLeague) ?? "Unknown competition",
    state: mapLiveState(status),
    kickoff: str(raw.strTimestamp),
    progress: formatProgress(status, str(raw.strProgress)),
    home: {
      id: str(raw.idHomeTeam) ?? "home",
      name: str(raw.strHomeTeam) ?? "Home",
      shortName: null,
      crest: normaliseBadge(raw.strHomeTeamBadge),
    },
    away: {
      id: str(raw.idAwayTeam) ?? "away",
      name: str(raw.strAwayTeam) ?? "Away",
      shortName: null,
      crest: normaliseBadge(raw.strAwayTeamBadge),
    },
    homeScore: toIntOrNull(raw.intHomeScore),
    awayScore: toIntOrNull(raw.intAwayScore),
    venue: null,
    round: null,
  };
}

/**
 * All soccer matches currently in progress, worldwide.
 *
 * This is the one endpoint the free tier does not cap, and it is genuinely
 * live - so it is the app's headline feature rather than a static scoreboard.
 */
export async function getLiveMatches(): Promise<Match[]> {
  const data = await fetchJson<{ livescore?: RawLiveScore[] }>(
    url("livescore.php", { s: "Soccer" }),
    { label: "thesportsdb livescore" },
  );

  return (data.livescore ?? [])
    .map(mapLiveScore)
    .filter((m) => m.state === "live");
}

interface RawEvent {
  idEvent?: string;
  strEvent?: string;
  strLeague?: string;
  strSeason?: string;
  strTimestamp?: string;
  dateEvent?: string;
  strHomeTeam?: string;
  strAwayTeam?: string;
  idHomeTeam?: string;
  idAwayTeam?: string;
  strHomeTeamBadge?: string;
  strAwayTeamBadge?: string;
  intHomeScore?: string | null;
  intAwayScore?: string | null;
  intRound?: string;
  strVenue?: string;
  strStatus?: string;
  strPostponed?: string;
}

function mapEvent(raw: RawEvent): Match {
  const homeScore = toIntOrNull(raw.intHomeScore);
  const awayScore = toIntOrNull(raw.intAwayScore);
  const postponed = str(raw.strPostponed)?.toLowerCase() === "yes";

  let state: MatchState = "scheduled";
  if (postponed) state = "postponed";
  else if (homeScore !== null && awayScore !== null) state = "finished";

  return {
    id: str(raw.idEvent) ?? crypto.randomUUID(),
    league: str(raw.strLeague) ?? "Unknown competition",
    state,
    kickoff: str(raw.strTimestamp) ?? str(raw.dateEvent),
    progress: null,
    home: {
      id: str(raw.idHomeTeam) ?? "home",
      name: str(raw.strHomeTeam) ?? "Home",
      shortName: null,
      crest: normaliseBadge(raw.strHomeTeamBadge),
    },
    away: {
      id: str(raw.idAwayTeam) ?? "away",
      name: str(raw.strAwayTeam) ?? "Away",
      shortName: null,
      crest: normaliseBadge(raw.strAwayTeamBadge),
    },
    homeScore,
    awayScore,
    venue: str(raw.strVenue),
    round: str(raw.intRound),
  };
}

/** Upcoming fixtures. Capped at 5 by the free tier. */
export async function getUpcomingMatches(league: League): Promise<Match[]> {
  const data = await fetchJson<{ events?: RawEvent[] }>(
    url("eventsnextleague.php", { id: league.sportsDbId }),
    { label: `thesportsdb fixtures ${league.id}` },
  );
  return (data.events ?? []).map(mapEvent);
}

/** Recent results. Capped at 5 by the free tier. */
export async function getRecentResults(league: League): Promise<Match[]> {
  const data = await fetchJson<{ events?: RawEvent[] }>(
    url("eventspastleague.php", { id: league.sportsDbId }),
    { label: `thesportsdb results ${league.id}` },
  );
  return (data.events ?? []).map(mapEvent);
}

/** Crest lookup for a team, used to enrich records from other providers. */
export async function getTeamCrest(teamName: string): Promise<TeamRef | null> {
  const data = await fetchJson<{
    teams?: { idTeam?: string; strTeam?: string; strBadge?: string }[];
  }>(url("searchteams.php", { t: teamName }), { label: "thesportsdb team" });

  const team = data.teams?.[0];
  if (!team) return null;

  return {
    id: str(team.idTeam) ?? teamName,
    name: str(team.strTeam) ?? teamName,
    shortName: null,
    crest: normaliseBadge(team.strBadge),
  };
}
