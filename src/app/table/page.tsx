import type { Metadata } from "next";
import { getLeagueTable } from "@/lib/data";
import { getLeague } from "@/lib/config";
import {
  Card,
  CardHeader,
  Crest,
  EmptyState,
  Notice,
  PercentileMeter,
  Resolved,
  SourceLine,
} from "@/components/ui";
import { LeagueSwitcher } from "@/components/league-switcher";
import type { FormResult, StandingRow, TeamAnalytics } from "@/lib/types";

export const revalidate = 300;

export const metadata: Metadata = {
  title: "League table & team analytics",
  description:
    "Full league standings with percentile analytics derived from published results.",
};

export default async function TablePage({
  searchParams,
}: {
  searchParams: Promise<{ league?: string }>;
}) {
  const params = await searchParams;
  const league = getLeague(params.league);
  const table = await getLeagueTable(league);

  return (
    <div className="mx-auto max-w-6xl px-4 py-10 sm:px-6">
      <header className="mb-6">
        <p className="font-mono text-[11px] uppercase tracking-[0.2em] text-flood">
          {league.country}
        </p>
        <h1 className="mt-2 text-3xl tracking-[-0.03em] text-chalk">
          {league.name}
        </h1>
        <p className="mt-2 max-w-2xl text-[14px] leading-relaxed text-chalk-dim">
          Standings straight from the source, plus six metrics computed from
          those same columns. Hover any metric to see exactly how it is
          calculated.
        </p>
        <div className="mt-4">
          <LeagueSwitcher active={league.id} basePath="/table" />
        </div>
      </header>

      <Resolved result={table}>
        {(data, attribution) => (
          <div className="space-y-5">
            <Card>
              <CardHeader
                eyebrow={`Season ${data.season}`}
                title="Standings"
                action={
                  <span className="font-mono text-[10px] text-chalk-faint">
                    {data.provider}
                  </span>
                }
              />
              {data.isPreviousSeason ? (
                <Notice>
                  The {data.currentSeason} season has not started yet, so there
                  is no live table to show. These are the final {data.season}{" "}
                  standings, and the analytics below are computed from them.
                </Notice>
              ) : null}

              {data.rows.length === 0 ? (
                <EmptyState>No standings published for this season.</EmptyState>
              ) : (
                <div className="overflow-x-auto">
                  <FullTable rows={data.rows} />
                </div>
              )}

              {data.truncated ? (
                <p className="px-5 py-3 text-[12px] leading-relaxed text-chalk-faint">
                  This is the top {data.rows.length} only. The keyless data tier
                  caps list responses at five rows; a free football-data.org key
                  returns the complete table.
                </p>
              ) : null}
              <SourceLine attribution={attribution} />
            </Card>

            {/*
              Only shown for a complete table. On the truncated keyless tier
              these totals would cover just the visible rows while reading as
              league-wide figures, which is exactly the kind of quietly wrong
              number this rebuild exists to remove.
            */}
            {data.summary && !data.truncated ? (
              <div className="grid gap-3 sm:grid-cols-3">
                <Stat label="Matches played" value={data.summary.matchesPlayed} />
                <Stat label="Goals scored" value={data.summary.goalsScored} />
                <Stat
                  label="Goals per match"
                  value={data.summary.goalsPerMatch.toFixed(2)}
                />
              </div>
            ) : null}

            {data.analytics.length > 0 ? (
              <section>
                <h2 className="mb-1 text-xl tracking-[-0.02em] text-chalk">
                  Team analytics
                </h2>
                <p className="mb-4 max-w-2xl text-[13px] leading-relaxed text-chalk-dim">
                  Each bar is a percentile rank against the {data.rows.length}{" "}
                  teams in this table — the share of teams this one is ahead of
                  on that metric. It is a rank, not a rating out of 100.
                </p>
                <div className="grid gap-4 md:grid-cols-2">
                  {data.analytics.slice(0, 6).map((team) => (
                    <TeamCard key={team.team.id} team={team} />
                  ))}
                </div>
              </section>
            ) : null}
          </div>
        )}
      </Resolved>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string | number }) {
  return (
    <Card className="px-5 py-4">
      <p className="font-mono text-[10px] uppercase tracking-[0.16em] text-chalk-faint">
        {label}
      </p>
      <p data-numeric className="mt-1.5 text-2xl font-semibold text-chalk">
        {value}
      </p>
    </Card>
  );
}

function FormPips({ form }: { form: FormResult[] }) {
  if (form.length === 0) {
    return <span className="font-mono text-[11px] text-chalk-faint">—</span>;
  }
  return (
    <span className="inline-flex gap-1" aria-label={`Recent form: ${form.join(", ")}`}>
      {form.slice(-5).map((result, index) => (
        <span
          key={`${result}-${index}`}
          aria-hidden
          title={result}
          className={
            result === "W"
              ? "h-1.5 w-4 rounded-full bg-flood"
              : result === "D"
                ? "h-1.5 w-4 rounded-full bg-chalk-faint"
                : "h-1.5 w-4 rounded-full bg-alert/60"
          }
        />
      ))}
    </span>
  );
}

function FullTable({ rows }: { rows: StandingRow[] }) {
  return (
    <table className="w-full min-w-[42rem]">
      <caption className="sr-only">League standings</caption>
      <thead>
        <tr className="border-b border-pitch-line font-mono text-[10px] uppercase tracking-wider text-chalk-faint">
          <th scope="col" className="px-5 py-2.5 text-left font-normal">
            #
          </th>
          <th scope="col" className="py-2.5 text-left font-normal">
            Team
          </th>
          <th scope="col" className="py-2.5 text-right font-normal">Pl</th>
          <th scope="col" className="py-2.5 text-right font-normal">W</th>
          <th scope="col" className="py-2.5 text-right font-normal">D</th>
          <th scope="col" className="py-2.5 text-right font-normal">L</th>
          <th scope="col" className="py-2.5 text-right font-normal">GF</th>
          <th scope="col" className="py-2.5 text-right font-normal">GA</th>
          <th scope="col" className="py-2.5 text-right font-normal">GD</th>
          <th scope="col" className="py-2.5 pl-4 text-left font-normal">Form</th>
          <th scope="col" className="px-5 py-2.5 text-right font-normal">Pts</th>
        </tr>
      </thead>
      <tbody>
        {rows.map((row) => (
          <tr
            key={row.team.id}
            className="border-b border-pitch-line/60 transition-colors duration-150 last:border-b-0 hover:bg-pitch-float/50"
          >
            <td data-numeric className="px-5 py-3 text-[13px] text-chalk-faint">
              {row.rank}
            </td>
            <td className="py-3">
              <span className="flex items-center gap-2.5">
                <Crest name={row.team.name} src={row.team.crest} size={20} />
                <span className="truncate text-[13px] font-medium text-chalk">
                  {row.team.name}
                </span>
              </span>
            </td>
            <Cell>{row.played}</Cell>
            <Cell>{row.won}</Cell>
            <Cell>{row.drawn}</Cell>
            <Cell>{row.lost}</Cell>
            <Cell>{row.goalsFor}</Cell>
            <Cell>{row.goalsAgainst}</Cell>
            <Cell>
              {row.goalDifference > 0 ? `+${row.goalDifference}` : row.goalDifference}
            </Cell>
            <td className="py-3 pl-4">
              <FormPips form={row.form} />
            </td>
            <td
              data-numeric
              className="px-5 py-3 text-right text-[13px] font-semibold text-chalk"
            >
              {row.points}
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

function Cell({ children }: { children: React.ReactNode }) {
  return (
    <td data-numeric className="py-3 text-right text-[13px] text-chalk-dim">
      {children}
    </td>
  );
}

function TeamCard({ team }: { team: TeamAnalytics }) {
  return (
    <Card>
      <div className="flex items-center gap-3 border-b border-pitch-line px-5 py-3.5">
        <span
          data-numeric
          className="text-2xl font-semibold leading-none text-pitch-line-bright"
        >
          {String(team.rank).padStart(2, "0")}
        </span>
        <Crest name={team.team.name} src={team.team.crest} size={26} />
        <div className="min-w-0 flex-1">
          <p className="truncate text-[14px] font-semibold text-chalk">
            {team.team.name}
          </p>
          <p className="font-mono text-[10px] text-chalk-faint">
            {team.points} pts from {team.played} played
          </p>
        </div>
      </div>
      <div className="divide-y divide-pitch-line/50 px-5 py-1">
        {team.metrics.map((metric) => (
          <PercentileMeter
            key={metric.key}
            label={metric.label}
            display={metric.display}
            percentile={metric.percentile}
            explanation={metric.explanation}
            sampleSize={team.sampleSize}
          />
        ))}
      </div>
    </Card>
  );
}
