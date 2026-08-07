/**
 * Data orchestration.
 *
 * This is the only module the API routes talk to. It decides which provider
 * can answer a question, caches the answer, and returns a `DataResult` that
 * distinguishes "no data exists" from "we could not reach the source".
 *
 * The two states must stay distinct all the way to the UI. Collapsing them is
 * how a dashboard ends up quietly showing zeros during an outage.
 */

import {
  currentSeasonStartYear,
  features,
  seasonLabel,
  sportsDbSeason,
  type League,
} from "@/lib/config";
import { TTL, cacheKey, cached } from "@/lib/cache";
import { UpstreamError } from "@/lib/http";
import * as fd from "@/lib/providers/football-data";
import * as tsdb from "@/lib/providers/thesportsdb";
import { getNews as fetchNews } from "@/lib/providers/news";
import { analyseScorers, analyseTable, leagueSummary } from "@/lib/analytics";
import type {
  Attribution,
  DataResult,
  Match,
  NewsArticle,
  PlayerAnalytics,
  StandingRow,
  TeamAnalytics,
} from "@/lib/types";

const SOURCES = {
  footballData: {
    source: "football-data" as const,
    label: "football-data.org",
    url: "https://www.football-data.org",
  },
  sportsDb: {
    source: "thesportsdb" as const,
    label: "TheSportsDB",
    url: "https://www.thesportsdb.com",
  },
  rss: {
    source: "rss" as const,
    label: "BBC Sport, Sky Sports, The Guardian",
    url: "https://www.bbc.co.uk/sport/football",
  },
};

function attribution(
  spec: (typeof SOURCES)[keyof typeof SOURCES],
  fetchedAt: Date,
  stale: boolean,
): Attribution {
  return { ...spec, fetchedAt: fetchedAt.toISOString(), stale };
}

/** Translate a thrown provider error into a typed, user-safe failure. */
function toFailure(error: unknown): Extract<DataResult<never>, { ok: false }> {
  if (error instanceof fd.MissingCredentials) {
    return {
      ok: false,
      reason: "missing-credentials",
      message:
        "This view needs a football-data.org API key. Add FOOTBALL_DATA_API_KEY to your environment to enable it.",
    };
  }
  if (error instanceof UpstreamError && error.rateLimited) {
    return {
      ok: false,
      reason: "rate-limited",
      message:
        "The data provider is rate limiting us right now. This resolves on its own in a minute or two.",
    };
  }
  const message = error instanceof Error ? error.message : String(error);
  return {
    ok: false,
    reason: "upstream-error",
    message: `Could not reach the data provider. (${message})`,
  };
}

export interface LeagueTable {
  rows: StandingRow[];
  analytics: TeamAnalytics[];
  summary: ReturnType<typeof leagueSummary>;
  /** Human label for the season these rows describe, e.g. "2025/26". */
  season: string;
  /**
   * The season we would normally be showing, e.g. "2026/27". Differs from
   * `season` only when that season has not started yet. Kept separate so the
   * UI can name both without conflating them.
   */
  currentSeason: string;
  /**
   * True when the current season has not started, so we are showing the last
   * completed season instead. The UI must say this out loud.
   */
  isPreviousSeason: boolean;
  /** True when the free tier truncated the table (TheSportsDB fallback). */
  truncated: boolean;
  provider: string;
}

/**
 * Full league table plus derived analytics.
 *
 * Season handling: European seasons start in August, so between late May and
 * mid-August the "current" season exists upstream but has zero matches played.
 * Rather than render an all-zeros table (or hardcode a season the way the
 * previous version did), we detect that and fall back to the last completed
 * season, flagged so the UI can label it.
 */
export async function getLeagueTable(
  league: League,
): Promise<DataResult<LeagueTable>> {
  const key = cacheKey("table", league.id, features.playerAnalytics ? "fd" : "tsdb");

  try {
    const result = await cached(key, TTL.standings, async () => {
      if (features.playerAnalytics) {
        const current = await fd.getStandings(league);

        // Trust the competition's own season start date over the row data.
        // Mid-summer the API serves last season's completed table under the
        // upcoming season's metadata, so "has anyone played?" is the wrong
        // question - the rows are populated either way.
        if (current.seasonHasStarted) {
          return { table: current, isPrevious: false, truncated: false } as const;
        }

        // Already holding the previous season's final table; no second call.
        return { table: current, isPrevious: true, truncated: false } as const;
      }

      // Keyless path: capped at 5 rows, and reported as such.
      const current = await tsdb.getStandings(league, sportsDbSeason());
      if (tsdb.tableHasStarted(current.rows)) {
        return {
          table: { rows: current.rows, competition: league.name },
          isPrevious: false,
          truncated: current.truncated,
        } as const;
      }

      const start = currentSeasonStartYear() - 1;
      const previous = await tsdb.getStandings(league, `${start}-${start + 1}`);
      return {
        table: { rows: previous.rows, competition: league.name },
        isPrevious: true,
        truncated: previous.truncated,
      } as const;
    });

    const { table, isPrevious, truncated } = result.value;
    const rows = table.rows;

    return {
      ok: true,
      data: {
        rows,
        analytics: analyseTable(rows),
        summary: leagueSummary(rows),
        season: isPrevious
          ? seasonLabel(new Date(Date.UTC(currentSeasonStartYear() - 1, 8, 1)))
          : seasonLabel(),
        currentSeason: seasonLabel(),
        isPreviousSeason: isPrevious,
        truncated,
        provider: features.playerAnalytics ? "football-data.org" : "TheSportsDB",
      },
      attribution: attribution(
        features.playerAnalytics ? SOURCES.footballData : SOURCES.sportsDb,
        result.fetchedAt,
        result.stale,
      ),
    };
  } catch (error) {
    return toFailure(error);
  }
}

/**
 * Matches currently in play, worldwide.
 * Keyless and uncapped, which makes this the app's most genuinely "live" view.
 */
export async function getLiveMatches(): Promise<DataResult<Match[]>> {
  try {
    const result = await cached(cacheKey("live"), TTL.live, () =>
      tsdb.getLiveMatches(),
    );
    return {
      ok: true,
      data: result.value,
      attribution: attribution(SOURCES.sportsDb, result.fetchedAt, result.stale),
    };
  } catch (error) {
    return toFailure(error);
  }
}

export interface FixtureFeed {
  upcoming: Match[];
  recent: Match[];
  truncated: boolean;
}

/** Upcoming fixtures and recent results for one competition. */
export async function getFixtures(
  league: League,
): Promise<DataResult<FixtureFeed>> {
  const key = cacheKey("fixtures", league.id, features.playerAnalytics ? "fd" : "tsdb");

  try {
    const result = await cached(key, TTL.fixtures, async () => {
      if (features.playerAnalytics) {
        const [upcoming, recent] = await Promise.all([
          fd.getMatches(league, {
            dateFrom: fd.isoDate(0),
            dateTo: fd.isoDate(21),
          }),
          fd.getMatches(league, {
            dateFrom: fd.isoDate(-21),
            dateTo: fd.isoDate(-1),
            status: "FINISHED",
          }),
        ]);
        return {
          upcoming: upcoming.slice(0, 20),
          recent: recent.reverse().slice(0, 20),
          truncated: false,
        };
      }

      const [upcoming, recent] = await Promise.all([
        tsdb.getUpcomingMatches(league),
        tsdb.getRecentResults(league),
      ]);
      return { upcoming, recent, truncated: true };
    });

    return {
      ok: true,
      data: result.value,
      attribution: attribution(
        features.playerAnalytics ? SOURCES.footballData : SOURCES.sportsDb,
        result.fetchedAt,
        result.stale,
      ),
    };
  } catch (error) {
    return toFailure(error);
  }
}

export interface ScorerBoard {
  players: PlayerAnalytics[];
  season: string;
  isPreviousSeason: boolean;
}

/**
 * Top scorers with percentile analytics.
 * Requires a football-data.org key; without one this returns a
 * `missing-credentials` failure and the UI explains how to enable it.
 */
export async function getScorerBoard(
  league: League,
): Promise<DataResult<ScorerBoard>> {
  try {
    const result = await cached(
      cacheKey("scorers", league.id),
      TTL.scorers,
      async () => {
        const current = await fd.getScorers(league, 50);
        if (current.length > 0 && current.some((s) => s.appearances > 0)) {
          return { records: current, isPrevious: false };
        }
        const previous = await fd.getScorers(
          league,
          50,
          currentSeasonStartYear() - 1,
        );
        return { records: previous, isPrevious: true };
      },
    );

    const { records, isPrevious } = result.value;

    return {
      ok: true,
      data: {
        players: analyseScorers(records),
        season: isPrevious
          ? seasonLabel(new Date(Date.UTC(currentSeasonStartYear() - 1, 8, 1)))
          : seasonLabel(),
        isPreviousSeason: isPrevious,
      },
      attribution: attribution(SOURCES.footballData, result.fetchedAt, result.stale),
    };
  } catch (error) {
    return toFailure(error);
  }
}

export async function getNews(limit = 12): Promise<DataResult<NewsArticle[]>> {
  try {
    const result = await cached(cacheKey("news", limit), TTL.news, () =>
      fetchNews(limit),
    );
    return {
      ok: true,
      data: result.value,
      attribution: attribution(SOURCES.rss, result.fetchedAt, result.stale),
    };
  } catch (error) {
    return toFailure(error);
  }
}
