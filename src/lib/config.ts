/**
 * Central configuration: environment access and the league registry.
 *
 * Every value that could differ between environments is read here, once, so
 * that provider code never touches `process.env` directly.
 */

export const env = {
  /** Google Gemini key. Absent => the assistant is disabled, not faked. */
  geminiApiKey: process.env.GEMINI_API_KEY?.trim() || "",
  /**
   * football-data.org key. Absent => player analytics are unavailable and the
   * UI says so explicitly. It never falls back to invented numbers.
   */
  footballDataApiKey: process.env.FOOTBALL_DATA_API_KEY?.trim() || "",
  /** TheSportsDB key. "3" is their public free-tier key and needs no signup. */
  sportsDbKey: process.env.SPORTSDB_API_KEY?.trim() || "3",
} as const;

export const features = {
  get assistant() {
    return env.geminiApiKey.length > 0;
  },
  get playerAnalytics() {
    return env.footballDataApiKey.length > 0;
  },
} as const;

export interface League {
  /** Internal slug used in URLs. */
  id: string;
  name: string;
  shortName: string;
  country: string;
  /** TheSportsDB league id (keyless provider). */
  sportsDbId: string;
  /** football-data.org competition code (keyed provider). */
  footballDataCode: string;
  accent: string;
}

export const LEAGUES: readonly League[] = [
  {
    id: "premier-league",
    name: "Premier League",
    shortName: "PL",
    country: "England",
    sportsDbId: "4328",
    footballDataCode: "PL",
    accent: "#00ff87",
  },
  {
    id: "la-liga",
    name: "La Liga",
    shortName: "LaLiga",
    country: "Spain",
    sportsDbId: "4335",
    footballDataCode: "PD",
    accent: "#ff5a36",
  },
  {
    id: "serie-a",
    name: "Serie A",
    shortName: "Serie A",
    country: "Italy",
    sportsDbId: "4332",
    footballDataCode: "SA",
    accent: "#4fa8ff",
  },
  {
    id: "bundesliga",
    name: "Bundesliga",
    shortName: "BL",
    country: "Germany",
    sportsDbId: "4331",
    footballDataCode: "BL1",
    accent: "#ff2e63",
  },
  {
    id: "ligue-1",
    name: "Ligue 1",
    shortName: "L1",
    country: "France",
    sportsDbId: "4334",
    footballDataCode: "FL1",
    accent: "#ffd23f",
  },
] as const;

export const DEFAULT_LEAGUE_ID = "premier-league";

export function getLeague(id: string | null | undefined): League {
  if (!id) return LEAGUES[0];
  return LEAGUES.find((l) => l.id === id) ?? LEAGUES[0];
}

export function isKnownLeague(id: string | null | undefined): boolean {
  return !!id && LEAGUES.some((l) => l.id === id);
}

/**
 * European domestic seasons span two calendar years and typically begin in
 * July/August. Anything from July onward belongs to the season starting that
 * year; earlier months belong to the season that started the previous year.
 *
 * Returns the starting year, e.g. 2026 for the 2026/27 season.
 */
export function currentSeasonStartYear(now: Date = new Date()): number {
  const year = now.getUTCFullYear();
  const month = now.getUTCMonth(); // 0-indexed; 6 === July
  return month >= 6 ? year : year - 1;
}

/** TheSportsDB season format, e.g. "2026-2027". */
export function sportsDbSeason(now: Date = new Date()): string {
  const start = currentSeasonStartYear(now);
  return `${start}-${start + 1}`;
}

/** Human-facing season label, e.g. "2026/27". */
export function seasonLabel(now: Date = new Date()): string {
  const start = currentSeasonStartYear(now);
  return `${start}/${String(start + 1).slice(2)}`;
}
