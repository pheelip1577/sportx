import { Crest, LiveDot } from "@/components/ui";
import type { Match } from "@/lib/types";

function kickoffLabel(match: Match): string {
  if (!match.kickoff) return "TBC";
  const date = new Date(match.kickoff);
  if (Number.isNaN(date.getTime())) return "TBC";

  return date.toLocaleString("en-GB", {
    day: "numeric",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
    timeZone: "UTC",
  });
}

/**
 * One fixture row.
 *
 * Scores are shown only when they exist. A scheduled match renders its kickoff
 * time rather than "0 - 0", which is what the previous version did and which
 * reads as a goalless draw that has already been played.
 */
export function MatchRow({ match }: { match: Match }) {
  const hasScore = match.homeScore !== null && match.awayScore !== null;
  const isLive = match.state === "live";

  return (
    <li className="group flex items-center gap-3 border-b border-pitch-line px-5 py-3 transition-colors duration-150 last:border-b-0 hover:bg-pitch-float/50">
      <div className="min-w-0 flex-1 space-y-1.5">
        <TeamLine
          team={match.home}
          score={match.homeScore}
          hasScore={hasScore}
          winner={
            hasScore && match.homeScore! > match.awayScore! && match.state === "finished"
          }
        />
        <TeamLine
          team={match.away}
          score={match.awayScore}
          hasScore={hasScore}
          winner={
            hasScore && match.awayScore! > match.homeScore! && match.state === "finished"
          }
        />
      </div>

      <div className="shrink-0 text-right">
        {isLive ? (
          <>
            <LiveDot label={match.progress ?? "Live"} />
            <p className="mt-1 max-w-[9rem] truncate font-mono text-[10px] text-chalk-faint">
              {match.league}
            </p>
          </>
        ) : match.state === "postponed" ? (
          <p className="font-mono text-[11px] uppercase tracking-wider text-alert">
            Postponed
          </p>
        ) : (
          <>
            <p
              data-numeric
              className="text-[11px] text-chalk-dim"
              suppressHydrationWarning
            >
              {match.state === "finished" ? "Full time" : kickoffLabel(match)}
            </p>
            {match.round ? (
              <p className="mt-0.5 font-mono text-[10px] text-chalk-faint">
                Matchday {match.round}
              </p>
            ) : null}
          </>
        )}
      </div>
    </li>
  );
}

function TeamLine({
  team,
  score,
  hasScore,
  winner,
}: {
  team: Match["home"];
  score: number | null;
  hasScore: boolean;
  winner: boolean;
}) {
  return (
    <div className="flex items-center gap-2.5">
      <Crest name={team.name} src={team.crest} size={18} />
      <span
        className={
          winner
            ? "min-w-0 flex-1 truncate text-[13px] font-semibold text-chalk"
            : "min-w-0 flex-1 truncate text-[13px] text-chalk-dim"
        }
      >
        {team.name}
      </span>
      {hasScore ? (
        <span
          data-numeric
          className={
            winner
              ? "w-5 text-right text-sm font-semibold text-flood"
              : "w-5 text-right text-sm font-medium text-chalk-dim"
          }
        >
          {score}
        </span>
      ) : null}
    </div>
  );
}

export function MatchList({ matches }: { matches: Match[] }) {
  return (
    <ul className="divide-y divide-pitch-line">
      {matches.map((match) => (
        <MatchRow key={match.id} match={match} />
      ))}
    </ul>
  );
}
