import Link from "next/link";
import { LEAGUES } from "@/lib/config";

/**
 * League selector rendered as links rather than a client-side control, so the
 * choice is a real URL that can be shared, bookmarked and server-rendered.
 */
export function LeagueSwitcher({
  active,
  basePath,
}: {
  active: string;
  basePath: string;
}) {
  return (
    <nav aria-label="League" className="flex flex-wrap gap-1.5">
      {LEAGUES.map((league) => {
        const isActive = league.id === active;
        return (
          <Link
            key={league.id}
            href={`${basePath}?league=${league.id}`}
            aria-current={isActive ? "page" : undefined}
            className={
              isActive
                ? "rounded-md border border-flood/40 bg-flood/10 px-2.5 py-1 text-[12px] font-medium text-flood"
                : "rounded-md border border-pitch-line px-2.5 py-1 text-[12px] text-chalk-dim transition-colors duration-150 hover:border-pitch-line-bright hover:text-chalk"
            }
          >
            {league.shortName}
          </Link>
        );
      })}
    </nav>
  );
}
