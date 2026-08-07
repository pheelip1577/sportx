import Link from "next/link";
import { getLeagueTable, getLiveMatches, getNews } from "@/lib/data";
import { DEFAULT_LEAGUE_ID, features, getLeague } from "@/lib/config";
import {
  Card,
  CardHeader,
  Crest,
  EmptyState,
  LiveDot,
  Notice,
  Resolved,
  SourceLine,
} from "@/components/ui";
import { MatchList } from "@/components/match-row";
import type { StandingRow } from "@/lib/types";

/** Revalidate at the cadence of the fastest-moving panel on the page. */
export const revalidate = 30;

export default async function OverviewPage() {
  const league = getLeague(DEFAULT_LEAGUE_ID);

  // Fetched concurrently; each panel degrades independently.
  const [live, table, news] = await Promise.all([
    getLiveMatches(),
    getLeagueTable(league),
    getNews(6),
  ]);

  const liveCount = live.ok ? live.data.length : 0;

  return (
    <div className="mx-auto max-w-6xl px-4 py-10 sm:px-6">
      <Hero liveCount={liveCount} />

      <div className="mt-10 grid gap-5 lg:grid-cols-12">
        <div className="lg:col-span-7">
          <Card className="reveal">
            <CardHeader
              eyebrow="Worldwide"
              title="In play right now"
              action={liveCount > 0 ? <LiveDot label={`${liveCount}`} /> : null}
            />
            <Resolved result={live}>
              {(matches, attribution) => (
                <>
                  {matches.length === 0 ? (
                    <EmptyState>
                      No matches are in play at the moment. This panel fills up
                      automatically when they kick off.
                    </EmptyState>
                  ) : (
                    <MatchList matches={matches.slice(0, 8)} />
                  )}
                  <SourceLine attribution={attribution} />
                </>
              )}
            </Resolved>
            {liveCount > 8 ? (
              <div className="border-t border-pitch-line px-5 py-3">
                <Link
                  href="/live"
                  className="text-[13px] text-flood transition-opacity hover:opacity-80"
                >
                  See all {liveCount} live matches →
                </Link>
              </div>
            ) : null}
          </Card>
        </div>

        <div className="space-y-5 lg:col-span-5">
          <Card className="reveal" >
            <CardHeader eyebrow={league.name} title="League table" />
            <Resolved result={table}>
              {(data, attribution) => (
                <>
                  {data.isPreviousSeason ? (
                    <Notice>
                      The {data.currentSeason} season has not kicked off yet.
                      Showing the final {data.season} table.
                    </Notice>
                  ) : null}
                  {data.rows.length === 0 ? (
                    <EmptyState>No table published yet.</EmptyState>
                  ) : (
                    <MiniTable rows={data.rows.slice(0, 6)} />
                  )}
                  {data.truncated ? (
                    <p className="px-5 pb-1 pt-2 text-[11px] text-chalk-faint">
                      Showing the top {data.rows.length} — the keyless data tier
                      caps tables at five rows. Add a football-data.org key for
                      the full table.
                    </p>
                  ) : null}
                  <div className="border-t border-pitch-line px-5 py-3">
                    <Link
                      href="/table"
                      className="text-[13px] text-flood transition-opacity hover:opacity-80"
                    >
                      Full table &amp; team analytics →
                    </Link>
                  </div>
                  <SourceLine attribution={attribution} />
                </>
              )}
            </Resolved>
          </Card>

          <Card className="reveal">
            <CardHeader eyebrow="Headlines" title="Football news" />
            <Resolved result={news}>
              {(articles, attribution) => (
                <>
                  {articles.length === 0 ? (
                    <EmptyState>No articles returned.</EmptyState>
                  ) : (
                    <ul className="divide-y divide-pitch-line">
                      {articles.slice(0, 5).map((article) => (
                        <li key={article.id}>
                          <a
                            href={article.url}
                            target="_blank"
                            rel="noreferrer noopener"
                            className="block px-5 py-3 transition-colors duration-150 hover:bg-pitch-float/50"
                          >
                            <p className="text-[13px] leading-snug text-chalk">
                              {article.title}
                            </p>
                            <p className="mt-1 font-mono text-[10px] uppercase tracking-wider text-chalk-faint">
                              {article.source}
                            </p>
                          </a>
                        </li>
                      ))}
                    </ul>
                  )}
                  <SourceLine attribution={attribution} />
                </>
              )}
            </Resolved>
          </Card>
        </div>
      </div>

      {!features.playerAnalytics ? <ConfigHint /> : null}
    </div>
  );
}

function Hero({ liveCount }: { liveCount: number }) {
  return (
    <section className="chalk-grid grain relative overflow-hidden rounded-2xl border border-pitch-line px-6 py-12 sm:px-10 sm:py-16">
      <div className="relative z-10 max-w-2xl">
        <p className="font-mono text-[11px] uppercase tracking-[0.2em] text-flood">
          {liveCount > 0
            ? `${liveCount} matches in play`
            : "Live coverage, worldwide"}
        </p>
        <h1 className="mt-3 text-balance text-4xl leading-[1.05] tracking-[-0.03em] text-chalk sm:text-5xl">
          Football numbers you can{" "}
          <span className="font-display italic text-flood">actually trace</span>
        </h1>
        <p className="mt-4 max-w-xl text-balance text-[15px] leading-relaxed text-chalk-dim">
          Live scores, league tables and percentile analytics computed from
          published data. Every metric states its formula, its source and the
          population it was ranked against.
        </p>
        <div className="mt-6 flex flex-wrap gap-2.5">
          <Link
            href="/table"
            className="rounded-md bg-flood px-4 py-2 text-[13px] font-semibold text-pitch-base transition-transform duration-200 hover:-translate-y-0.5 active:translate-y-0"
          >
            Explore team analytics
          </Link>
          <Link
            href="/live"
            className="rounded-md border border-pitch-line-bright px-4 py-2 text-[13px] font-medium text-chalk transition-colors duration-150 hover:border-flood/40 hover:text-flood"
          >
            Live scores
          </Link>
        </div>
      </div>
    </section>
  );
}

function MiniTable({ rows }: { rows: StandingRow[] }) {
  return (
    <table className="w-full">
      <thead>
        <tr className="border-b border-pitch-line font-mono text-[10px] uppercase tracking-wider text-chalk-faint">
          <th scope="col" className="px-5 py-2 text-left font-normal">
            #
          </th>
          <th scope="col" className="py-2 text-left font-normal">
            Team
          </th>
          <th scope="col" className="py-2 text-right font-normal">
            Pl
          </th>
          <th scope="col" className="px-5 py-2 text-right font-normal">
            Pts
          </th>
        </tr>
      </thead>
      <tbody>
        {rows.map((row) => (
          <tr
            key={row.team.id}
            className="border-b border-pitch-line/60 transition-colors duration-150 last:border-b-0 hover:bg-pitch-float/50"
          >
            <td data-numeric className="px-5 py-2.5 text-[13px] text-chalk-faint">
              {row.rank}
            </td>
            <td className="py-2.5">
              <span className="flex items-center gap-2.5">
                <Crest name={row.team.name} src={row.team.crest} size={18} />
                <span className="truncate text-[13px] text-chalk">
                  {row.team.name}
                </span>
              </span>
            </td>
            <td data-numeric className="py-2.5 text-right text-[13px] text-chalk-dim">
              {row.played}
            </td>
            <td
              data-numeric
              className="px-5 py-2.5 text-right text-[13px] font-semibold text-chalk"
            >
              {row.points}
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

function ConfigHint() {
  return (
    <Card className="mt-5 border-flood/20 bg-flood/5">
      <div className="px-5 py-4">
        <p className="font-mono text-[10px] uppercase tracking-[0.16em] text-flood">
          Optional setup
        </p>
        <p className="mt-2 max-w-2xl text-[13px] leading-relaxed text-chalk-dim">
          Player analytics and full league tables need a free{" "}
          <a
            href="https://www.football-data.org/client/register"
            target="_blank"
            rel="noreferrer noopener"
            className="text-flood underline underline-offset-2"
          >
            football-data.org
          </a>{" "}
          key. Add it as <code className="font-mono">FOOTBALL_DATA_API_KEY</code>{" "}
          and those views switch on. Until then the app runs on the keyless tier,
          which is real but capped at five rows per table.
        </p>
      </div>
    </Card>
  );
}
