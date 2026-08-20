import type { Metadata } from "next";
import { getFixtures } from "@/lib/data";
import { getLeague } from "@/lib/config";
import {
  Card,
  CardHeader,
  EmptyState,
  Notice,
  Resolved,
  SourceLine,
} from "@/components/ui";
import { LeagueSwitcher } from "@/components/league-switcher";
import { MatchList } from "@/components/match-row";

export const revalidate = 300;

export const metadata: Metadata = {
  title: "Fixtures & Results",
  description:
    "Upcoming match schedule and recent results for major European football leagues.",
};

export default async function FixturesPage({
  searchParams,
}: {
  searchParams: Promise<{ league?: string }>;
}) {
  const params = await searchParams;
  const league = getLeague(params.league);
  const feed = await getFixtures(league);

  return (
    <div className="mx-auto max-w-6xl px-4 py-10 sm:px-6">
      <header className="mb-6">
        <p className="font-mono text-[11px] uppercase tracking-[0.2em] text-flood">
          {league.country}
        </p>
        <h1 className="mt-2 text-3xl tracking-[-0.03em] text-chalk">
          {league.name} Fixtures & Results
        </h1>
        <p className="mt-2 max-w-2xl text-[14px] leading-relaxed text-chalk-dim">
          Official match schedule, upcoming kickoff times, and recent final
          scores direct from published competition feeds.
        </p>
        <div className="mt-4">
          <LeagueSwitcher active={league.id} basePath="/fixtures" />
        </div>
      </header>

      <Resolved result={feed}>
        {(data, attribution) => {
          const upcoming = data.upcoming ?? [];
          const recent = data.recent ?? [];

          return (
            <div className="space-y-6">
              {data.truncated ? (
                <Notice>
                  Showing sample fixtures from the keyless feed tier. Add a
                  football-data.org API key to your environment to access the
                  complete multi-week schedule.
                </Notice>
              ) : null}

              <div className="grid gap-6 lg:grid-cols-2">
                {/* Upcoming Fixtures */}
                <Card>
                  <CardHeader
                    eyebrow={league.name}
                    title="Upcoming Fixtures"
                    action={
                      upcoming.length > 0 ? (
                        <span className="font-mono text-[11px] text-flood">
                          {upcoming.length} scheduled
                        </span>
                      ) : null
                    }
                  />
                  {upcoming.length === 0 ? (
                    <EmptyState>
                      No upcoming fixtures scheduled in the next few weeks.
                    </EmptyState>
                  ) : (
                    <MatchList matches={upcoming} />
                  )}
                </Card>

                {/* Recent Results */}
                <Card>
                  <CardHeader
                    eyebrow={league.name}
                    title="Recent Results"
                    action={
                      recent.length > 0 ? (
                        <span className="font-mono text-[11px] text-chalk-dim">
                          {recent.length} matches
                        </span>
                      ) : null
                    }
                  />
                  {recent.length === 0 ? (
                    <EmptyState>
                      No recent match results available in this window.
                    </EmptyState>
                  ) : (
                    <MatchList matches={recent} />
                  )}
                </Card>
              </div>

              <Card>
                <SourceLine attribution={attribution} />
              </Card>
            </div>
          );
        }}
      </Resolved>
    </div>
  );
}
