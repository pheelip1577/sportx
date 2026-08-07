import type { Metadata } from "next";
import { getScorerBoard } from "@/lib/data";
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
import type { PlayerAnalytics } from "@/lib/types";

export const revalidate = 900;

export const metadata: Metadata = {
  title: "Top scorers & player analytics",
  description:
    "Goalscoring records with percentile ranks computed against the league's scorer population.",
};

export default async function ScorersPage({
  searchParams,
}: {
  searchParams: Promise<{ league?: string }>;
}) {
  const params = await searchParams;
  const league = getLeague(params.league);
  const board = await getScorerBoard(league);

  return (
    <div className="mx-auto max-w-6xl px-4 py-10 sm:px-6">
      <header className="mb-6">
        <p className="font-mono text-[11px] uppercase tracking-[0.2em] text-flood">
          {league.name}
        </p>
        <h1 className="mt-2 text-3xl tracking-[-0.03em] text-chalk">
          Top scorers
        </h1>
        <p className="mt-2 max-w-2xl text-[14px] leading-relaxed text-chalk-dim">
          Rates here are <strong className="text-chalk">per appearance</strong>,
          not per 90 minutes — the source publishes appearances but not minutes
          played, and inventing the difference would misstate every substitute.
        </p>
        <div className="mt-4">
          <LeagueSwitcher active={league.id} basePath="/scorers" />
        </div>
      </header>

      <Resolved result={board}>
        {(data, attribution) => (
          <div className="space-y-5">
            {data.isPreviousSeason ? (
              <Card>
                <Notice>
                  The new season has not produced any scorers yet, so these are
                  the final {data.season} figures.
                </Notice>
              </Card>
            ) : null}

            {data.players.length === 0 ? (
              <Card>
                <EmptyState>No scorers recorded for this competition.</EmptyState>
                <SourceLine attribution={attribution} />
              </Card>
            ) : (
              <>
                <Card>
                  <CardHeader
                    eyebrow={`Season ${data.season}`}
                    title="Scoring charts"
                  />
                  <div className="overflow-x-auto">
                    <ScorerTable players={data.players.slice(0, 20)} />
                  </div>
                  <SourceLine attribution={attribution} />
                </Card>

                <section>
                  <h2 className="mb-1 text-xl tracking-[-0.02em] text-chalk">
                    Percentile breakdown
                  </h2>
                  <p className="mb-4 max-w-2xl text-[13px] leading-relaxed text-chalk-dim">
                    Ranked against the {data.players.length} players on this
                    competition&rsquo;s scoring list — not against every player in
                    the league. That is a real selection effect: everyone in this
                    population has already scored.
                  </p>
                  <div className="grid gap-4 md:grid-cols-2">
                    {data.players.slice(0, 6).map((player) => (
                      <PlayerCard key={player.player.id} player={player} />
                    ))}
                  </div>
                </section>
              </>
            )}
          </div>
        )}
      </Resolved>
    </div>
  );
}

function ScorerTable({ players }: { players: PlayerAnalytics[] }) {
  return (
    <table className="w-full min-w-[34rem]">
      <caption className="sr-only">Top scorers</caption>
      <thead>
        <tr className="border-b border-pitch-line font-mono text-[10px] uppercase tracking-wider text-chalk-faint">
          <th scope="col" className="px-5 py-2.5 text-left font-normal">#</th>
          <th scope="col" className="py-2.5 text-left font-normal">Player</th>
          <th scope="col" className="py-2.5 text-left font-normal">Club</th>
          <th scope="col" className="py-2.5 text-right font-normal">Apps</th>
          <th scope="col" className="py-2.5 text-right font-normal">Ast</th>
          <th scope="col" className="px-5 py-2.5 text-right font-normal">Goals</th>
        </tr>
      </thead>
      <tbody>
        {players.map((entry, index) => (
          <tr
            key={entry.player.id}
            className="border-b border-pitch-line/60 transition-colors duration-150 last:border-b-0 hover:bg-pitch-float/50"
          >
            <td data-numeric className="px-5 py-3 text-[13px] text-chalk-faint">
              {index + 1}
            </td>
            <td className="py-3">
              <p className="truncate text-[13px] font-medium text-chalk">
                {entry.player.name}
              </p>
              {entry.player.position ? (
                <p className="font-mono text-[10px] text-chalk-faint">
                  {entry.player.position}
                </p>
              ) : null}
            </td>
            <td className="py-3">
              <span className="flex items-center gap-2">
                <Crest name={entry.team.name} src={entry.team.crest} size={18} />
                <span className="truncate text-[12px] text-chalk-dim">
                  {entry.team.shortName ?? entry.team.name}
                </span>
              </span>
            </td>
            <td data-numeric className="py-3 text-right text-[13px] text-chalk-dim">
              {entry.appearances}
            </td>
            <td data-numeric className="py-3 text-right text-[13px] text-chalk-dim">
              {entry.assists ?? "—"}
            </td>
            <td
              data-numeric
              className="px-5 py-3 text-right text-[13px] font-semibold text-flood"
            >
              {entry.goals}
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

function PlayerCard({ player }: { player: PlayerAnalytics }) {
  return (
    <Card>
      <div className="border-b border-pitch-line px-5 py-3.5">
        <div className="flex items-center gap-3">
          <Crest name={player.team.name} src={player.team.crest} size={26} />
          <div className="min-w-0 flex-1">
            <p className="truncate text-[14px] font-semibold text-chalk">
              {player.player.name}
            </p>
            <p className="truncate font-mono text-[10px] text-chalk-faint">
              {[player.team.name, player.player.nationality]
                .filter(Boolean)
                .join(" · ")}
            </p>
          </div>
        </div>
      </div>
      <div className="divide-y divide-pitch-line/50 px-5 py-1">
        {player.metrics.map((metric) => (
          <PercentileMeter
            key={metric.key}
            label={metric.label}
            display={metric.display}
            percentile={metric.percentile}
            explanation={metric.explanation}
            sampleSize={player.sampleSize}
          />
        ))}
      </div>
    </Card>
  );
}
