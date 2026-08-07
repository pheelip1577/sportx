# SportX

Football analytics built on real, attributed data. Live scores from around the
world, league tables, and percentile analytics computed from published results.

The organising principle: **every number in the interface can be traced to a
source, and anything that cannot be sourced is shown as unavailable rather than
estimated.** There is no code path anywhere in this project that invents a
statistic.

---

## What it does

| View | What you get | Source |
|---|---|---|
| **Overview** (`/`) | Live matches, table snapshot, headlines | all three |
| **Live** (`/live`) | Every match in play worldwide, grouped by competition, self-refreshing | TheSportsDB |
| **Table** (`/table`) | Full standings + six percentile metrics per team | football-data.org |
| **Scorers** (`/scorers`) | Scoring charts + per-appearance percentile ranks | football-data.org |
| **News** (`/news`) | De-duplicated headlines, linked to publisher | BBC / Sky / Guardian RSS |
| **Ask** (`/ask`) | Natural-language questions answered from the same data | Gemini + the above |

---

## The analytics

Team metrics are arithmetic transforms of columns that appear in the published
table — points, played, goals for/against, recent form. Each is shown with its
real value, its percentile rank, and a one-line explanation of the formula.

```
Points / game            points ÷ played
Goals scored / game      goalsFor ÷ played
Goals conceded / game    goalsAgainst ÷ played      (ranked inverted)
Goal difference / game   goalDifference ÷ played
Win rate                 won ÷ played
Form (last 5)            points from last 5 ÷ 5
```

**Percentiles are ranks, not ratings.** A value at the 90th percentile is ahead
of 90% of the comparison population, and the population size is printed next to
every bar. Ties use the mid-rank convention.

### Two deliberate limitations, stated up front

1. **Player rates are per *appearance*, not per 90 minutes.** football-data.org
   publishes appearances but not minutes played. Calling these "per 90" would
   misstate every substitute's output, so the labels, the type names and the
   assistant's system prompt all say "per appearance".

2. **Player percentiles rank against a league's *scorer list*, not all players.**
   Everyone in that population has already scored, which is a real selection
   effect. The UI says so on the page.

---

## Architecture

```
src/
├── app/                    Next.js App Router
│   ├── page.tsx            server components fetch through lib/data directly
│   ├── live|table|scorers|news|ask/
│   └── api/chat|health/    route handlers (server-only secrets)
├── components/             UI, incl. DataState (the honest-failure surface)
└── lib/
    ├── http.ts             timeouts, backoff+jitter, 429 as a hard stop
    ├── cache.ts            TTL + request coalescing + stale-on-error
    ├── data.ts             orchestration -> DataResult<T>
    ├── rate-limit.ts       fixed-window limiter for the assistant
    ├── analytics/          pure functions, 63 unit tests
    └── providers/          thesportsdb | football-data | news (RSS)
```

Pages are server components that call `lib/data` directly — no internal HTTP
hop. `/api/*` exists for the browser-facing assistant and health check only.

### Why the caching layer is not optional

The free data tiers rate-limit hard. TheSportsDB returns a Cloudflare `1015`
ban after roughly a dozen rapid requests, which I hit while exploring the API.
So `lib/cache.ts` does three things:

- **TTL per data type** — 30s for live scores, 5min for tables, 1h for crests.
- **Request coalescing** — ten concurrent visitors asking for the same table
  produce *one* upstream call, not ten.
- **Stale-on-error** — if upstream fails and a recent value is cached, serve it
  and flag it in the UI as `cached — upstream unavailable`. Never silently.

### Two upstream quirks worth knowing

Both cost real debugging time and are handled explicitly in code:

**Google retires models and withdraws free-tier quota independently.**
`gemini-2.0-flash` still resolves but its free tier is now `limit: 0`;
`gemini-2.5-flash` returns `NOT_FOUND` for new users. So the assistant tries a
list of models in order, falling through on availability and quota errors, and
remembers whichever worked.

**Gemini 3.x requires `thoughtSignature` on the tool round trip.** Rebuilding
the model's turn from `response.functionCalls` drops that field and the
follow-up request fails with `INVALID_ARGUMENT`. The model's own `content`
object has to be echoed back untouched.

### `DataResult<T>`

Every data call returns a discriminated result:

```ts
type DataResult<T> =
  | { ok: true;  data: T; attribution: Attribution }
  | { ok: false; reason: "missing-credentials" | "upstream-error"
                       | "rate-limited" | "not-found" | "no-data-for-period"
      message: string }
```

"The season hasn't started", "the API key isn't set" and "the provider is down"
are different facts that a user acts on differently, so they render as three
visibly different states. Collapsing them into an empty list is how a dashboard
quietly shows zeros during an outage.

---

## Running it

```bash
npm install
cp .env.example .env.local   # optional — see below
npm run dev
```

Open <http://localhost:3000>.

**It runs with no API keys at all.** With none set, it uses TheSportsDB's
keyless tier: live scores are complete, tables are capped at five rows (the
free-tier limit, which the UI states on the page), and the player-analytics and
assistant views explain what they need instead of faking output.

| Variable | Unlocks | Get one |
|---|---|---|
| `FOOTBALL_DATA_API_KEY` | Full tables, fixtures, all player analytics | [football-data.org](https://www.football-data.org/client/register) (free) |
| `GEMINI_API_KEY` | The `/ask` assistant | [aistudio.google.com](https://aistudio.google.com/apikey) (free) |
| `SPORTSDB_API_KEY` | Higher row limits — defaults to the public key `3` | [thesportsdb.com](https://www.thesportsdb.com) |

### Commands

```bash
npm run verify      # typecheck + lint + test
npm test            # 63 unit tests
npm run build       # production build
```

---

## Deploying

One deployable unit — push to Vercel, set the environment variables, done.

```bash
vercel
```

There is no separate backend to host and no proxy to configure. Secrets are read
server-side only; no key is ever exposed to the browser.

---

## Testing

63 unit tests over the analytics and feed-parsing layers. They cover the cases
that produce quietly wrong numbers rather than crashes:

- division by zero before a ball is kicked → `null`, not `Infinity` or `0`
- tied values → equal percentiles (mid-rank)
- "fewest goals conceded" → ranked *best*, not worst
- accented names (`Mbappé` vs `Mbappe`) → matched, not missed
- missing penalty data → metric omitted, not assumed zero
- league totals → fixtures counted once, not twice
- feed de-duplication → same story under two headlines, one URL with two
  tracking params, one item repeated within a feed

```bash
npm test
```

---

## Data sources

- [TheSportsDB](https://www.thesportsdb.com) — live scores, crests, fallback tables
- [football-data.org](https://www.football-data.org) — tables, fixtures, scorers
- BBC Sport, Sky Sports, The Guardian — headline RSS (linked, never reproduced)

Attribution and fetch time are printed on every panel in the UI, not just here.

---

## Licence

MIT
