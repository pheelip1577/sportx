import type { Metadata } from "next";
import { getLiveMatches } from "@/lib/data";
import {
  Card,
  CardHeader,
  EmptyState,
  LiveDot,
  Resolved,
  SourceLine,
} from "@/components/ui";
import { MatchList } from "@/components/match-row";
import { AutoRefresh } from "@/components/auto-refresh";

/** Live data: revalidate on the same cadence as the upstream cache window. */
export const revalidate = 30;

export const metadata: Metadata = {
  title: "Live scores",
  description: "Every football match currently in play, worldwide.",
};

export default async function LivePage() {
  const live = await getLiveMatches();

  // Group by competition so a 40-match list stays navigable.
  const grouped = live.ok
    ? Object.entries(
        live.data.reduce<Record<string, typeof live.data>>((acc, match) => {
          (acc[match.league] ??= []).push(match);
          return acc;
        }, {}),
      ).sort(([, a], [, b]) => b.length - a.length)
    : [];

  return (
    <div className="mx-auto max-w-4xl px-4 py-10 sm:px-6">
      <AutoRefresh seconds={45} />

      <header className="mb-6">
        <div className="flex items-center gap-3">
          <h1 className="text-3xl tracking-[-0.03em] text-chalk">Live scores</h1>
          {live.ok && live.data.length > 0 ? (
            <LiveDot label={`${live.data.length} in play`} />
          ) : null}
        </div>
        <p className="mt-2 max-w-2xl text-[14px] leading-relaxed text-chalk-dim">
          Every match currently in progress across world football. This page
          refreshes itself while it is open.
        </p>
      </header>

      <Resolved result={live}>
        {(matches, attribution) => (
          <>
            {matches.length === 0 ? (
              <Card>
                <EmptyState>
                  Nothing is in play right now. Matches appear here automatically
                  as they kick off.
                </EmptyState>
                <SourceLine attribution={attribution} />
              </Card>
            ) : (
              <div className="space-y-4">
                {grouped.map(([competition, group]) => (
                  <Card key={competition}>
                    <CardHeader
                      title={competition}
                      eyebrow={`${group.length} match${group.length === 1 ? "" : "es"}`}
                    />
                    <MatchList matches={group} />
                  </Card>
                ))}
                <Card>
                  <SourceLine attribution={attribution} />
                </Card>
              </div>
            )}
          </>
        )}
      </Resolved>
    </div>
  );
}
