import { NextResponse } from "next/server";
import { GoogleGenAI, Type, type FunctionDeclaration } from "@google/genai";
import { z } from "zod";
import { env, features, getLeague, isKnownLeague, LEAGUES } from "@/lib/config";
import { clientKey, rateLimit } from "@/lib/rate-limit";
import { getLeagueTable, getLiveMatches, getScorerBoard } from "@/lib/data";
import { findScorerByName } from "@/lib/analytics";

export const dynamic = "force-dynamic";

/** Input contract. Length is capped so a request cannot be used as a funnel. */
const RequestSchema = z.object({
  message: z.string().trim().min(1).max(500),
});

/**
 * Candidate models, best first.
 *
 * Pinning a single model is fragile: Google retires them and withdraws
 * free-tier quota from older ones independently. Both failure modes were
 * observed while building this - `gemini-2.0-flash` still exists but its free
 * tier is now `limit: 0`, and `gemini-2.5-flash` returns NOT_FOUND for new
 * users. So we try in order and fall through on availability/quota errors.
 */
const MODELS = [
  "gemini-3.6-flash",
  "gemini-3.5-flash",
  "gemini-3.1-flash-lite",
] as const;

/** Remembers the model that last worked, so we stop paying the fallback cost. */
let preferredModel: string = MODELS[0];

const RATE_LIMIT = { requests: 12, windowMs: 60_000 };

const LEAGUE_IDS = LEAGUES.map((l) => l.id);

/**
 * Tool declarations.
 *
 * Each maps to a real query against the data layer. Crucially, a tool that
 * cannot answer returns `{ available: false, reason }` rather than plausible
 * filler, and the system prompt requires the model to relay that verbatim.
 * This is the fix for the previous version, whose "fallback" silently answered
 * every question with invented statistics.
 */
const functionDeclarations: FunctionDeclaration[] = [
  {
    name: "get_league_table",
    description:
      "Current league standings and team analytics for one of the supported competitions.",
    parameters: {
      type: Type.OBJECT,
      properties: {
        league: {
          type: Type.STRING,
          enum: LEAGUE_IDS,
          description: "Which competition to look up.",
        },
      },
      required: ["league"],
    },
  },
  {
    name: "get_live_matches",
    description:
      "Every football match currently in play worldwide, with scores and clock.",
    parameters: { type: Type.OBJECT, properties: {} },
  },
  {
    name: "get_player_stats",
    description:
      "Season goalscoring record and percentile ranks for a named player. Only players on a competition's scoring list are available.",
    parameters: {
      type: Type.OBJECT,
      properties: {
        player: { type: Type.STRING, description: "Player name." },
        league: {
          type: Type.STRING,
          enum: LEAGUE_IDS,
          description: "Competition to search within.",
        },
      },
      required: ["player", "league"],
    },
  },
];

const tools = [{ functionDeclarations }];

const SYSTEM_INSTRUCTION = `You are SportX, a football data assistant.

Rules you must follow without exception:
- Answer only from the data returned by your tools. Never state a statistic that did not come from a tool result.
- If a tool returns available:false, tell the user plainly what is unavailable and why. Do not substitute an estimate, a typical value, or knowledge from training data.
- Goal and assist rates in this system are PER APPEARANCE, not per 90 minutes, because the source does not publish minutes played. Never describe them as per 90.
- Percentiles are ranks within a stated population, not ratings out of 100. Mention the population size when you quote one.
- If the requested season has not started, say so rather than reporting the previous season as if it were current.
- Be concise. Two or three sentences unless asked for more.`;

type ToolResult = Record<string, unknown>;

async function runTool(name: string, args: Record<string, unknown>): Promise<ToolResult> {
  switch (name) {
    case "get_league_table": {
      const leagueId = String(args.league ?? "");
      if (!isKnownLeague(leagueId)) {
        return { available: false, reason: `Unsupported competition: ${leagueId}` };
      }
      const league = getLeague(leagueId);
      const result = await getLeagueTable(league);
      if (!result.ok) return { available: false, reason: result.message };

      return {
        available: true,
        competition: league.name,
        // Two distinct seasons, named unambiguously. Passing a single `season`
        // field plus a boolean made the model report "the 2025/26 season has
        // not started" when 2025/26 is precisely the season the rows describe.
        seasonOfThisData: result.data.season,
        currentSeason: result.data.currentSeason,
        currentSeasonHasStarted: !result.data.isPreviousSeason,
        note: result.data.isPreviousSeason
          ? `The ${result.data.currentSeason} season has not started. These rows are the completed ${result.data.season} season.`
          : `These rows are the in-progress ${result.data.season} season.`,
        tableIsComplete: !result.data.truncated,
        standings: result.data.rows.slice(0, 20).map((r) => ({
          rank: r.rank,
          team: r.team.name,
          played: r.played,
          won: r.won,
          drawn: r.drawn,
          lost: r.lost,
          goalsFor: r.goalsFor,
          goalsAgainst: r.goalsAgainst,
          points: r.points,
        })),
        teamAnalytics: result.data.analytics.slice(0, 6).map((t) => ({
          team: t.team.name,
          sampleSize: t.sampleSize,
          metrics: t.metrics.map((m) => ({
            label: m.label,
            value: m.display,
            percentile: m.percentile,
          })),
        })),
      };
    }

    case "get_live_matches": {
      const result = await getLiveMatches();
      if (!result.ok) return { available: false, reason: result.message };
      return {
        available: true,
        count: result.data.length,
        matches: result.data.slice(0, 25).map((m) => ({
          competition: m.league,
          home: m.home.name,
          away: m.away.name,
          score: `${m.homeScore ?? 0}-${m.awayScore ?? 0}`,
          clock: m.progress,
        })),
      };
    }

    case "get_player_stats": {
      const leagueId = String(args.league ?? "");
      const playerName = String(args.player ?? "").trim();

      if (!features.playerAnalytics) {
        return {
          available: false,
          reason:
            "Player statistics require a football-data.org API key, which is not configured on this deployment.",
        };
      }
      if (!isKnownLeague(leagueId)) {
        return { available: false, reason: `Unsupported competition: ${leagueId}` };
      }

      const league = getLeague(leagueId);
      const board = await getScorerBoard(league);
      if (!board.ok) return { available: false, reason: board.message };

      const records = board.data.players.map((p) => ({
        player: p.player,
        team: p.team,
        goals: p.goals,
        assists: p.assists,
        penalties: null,
        appearances: p.appearances,
      }));

      const match = findScorerByName(records, playerName);
      if (!match) {
        return {
          available: false,
          reason: `${playerName} is not on the ${league.name} scoring list for ${board.data.season}. Only players who have scored appear in this dataset.`,
        };
      }

      const analytics = board.data.players.find(
        (p) => p.player.id === match.player.id,
      );

      return {
        available: true,
        player: match.player.name,
        team: match.team.name,
        competition: league.name,
        season: board.data.season,
        goals: match.goals,
        assists: match.assists,
        appearances: match.appearances,
        rateBasis: "per appearance (minutes played are not published upstream)",
        populationSize: analytics?.sampleSize ?? 0,
        metrics:
          analytics?.metrics.map((m) => ({
            label: m.label,
            value: m.display,
            percentile: m.percentile,
          })) ?? [],
      };
    }

    default:
      return { available: false, reason: `Unknown tool: ${name}` };
  }
}

export async function POST(request: Request) {
  if (!features.assistant) {
    return NextResponse.json(
      {
        error:
          "The assistant is not configured. Set GEMINI_API_KEY to enable it.",
      },
      { status: 503 },
    );
  }

  const limit = rateLimit(
    `chat:${clientKey(request)}`,
    RATE_LIMIT.requests,
    RATE_LIMIT.windowMs,
  );
  if (!limit.allowed) {
    return NextResponse.json(
      { error: "Too many requests. Please wait a moment." },
      { status: 429, headers: { "Retry-After": String(limit.retryAfter) } },
    );
  }

  let parsed: z.infer<typeof RequestSchema>;
  try {
    parsed = RequestSchema.parse(await request.json());
  } catch {
    return NextResponse.json(
      { error: "Send a JSON body with a `message` string of 1-500 characters." },
      { status: 400 },
    );
  }

  try {
    const ai = new GoogleGenAI({ apiKey: env.geminiApiKey });

    const contents: Parameters<typeof ai.models.generateContent>[0]["contents"] = [
      { role: "user", parts: [{ text: parsed.message }] },
    ];

    /**
     * Generate, falling through to the next model when one is unavailable or
     * out of quota. Any other error propagates immediately - a malformed
     * request would otherwise be retried pointlessly against every model.
     */
    const generate = async () => {
      const ordered = [
        preferredModel,
        ...MODELS.filter((m) => m !== preferredModel),
      ];
      let lastError: unknown;

      for (const model of ordered) {
        try {
          const result = await ai.models.generateContent({
            model,
            contents,
            config: { tools, systemInstruction: SYSTEM_INSTRUCTION },
          });
          preferredModel = model;
          return result;
        } catch (error) {
          const text = error instanceof Error ? error.message : String(error);
          const recoverable =
            text.includes("NOT_FOUND") ||
            text.includes("RESOURCE_EXHAUSTED") ||
            text.includes("404") ||
            text.includes("429");

          if (!recoverable) throw error;
          lastError = error;
        }
      }
      throw lastError;
    };

    let response = await generate();

    const toolsUsed: string[] = [];

    // Resolve tool calls. Bounded loop - the model does not get to spin.
    for (let turn = 0; turn < 3; turn++) {
      const calls = response.functionCalls;
      if (!calls || calls.length === 0) break;

      const responseParts = [];
      for (const call of calls) {
        const name = call.name ?? "";
        toolsUsed.push(name);
        const result = await runTool(name, (call.args ?? {}) as Record<string, unknown>);
        responseParts.push({
          functionResponse: { name, response: result as Record<string, unknown> },
        });
      }

      /*
       * Echo back the model's own content object rather than rebuilding it
       * from `response.functionCalls`.
       *
       * Gemini 3.x attaches a `thoughtSignature` to each functionCall part and
       * rejects the follow-up turn with INVALID_ARGUMENT if it is missing.
       * Reconstructing the turn silently drops that field, so the round trip
       * must carry the original parts through untouched.
       */
      const modelContent = response.candidates?.[0]?.content;
      contents.push(
        modelContent ?? {
          role: "model",
          parts: calls.map((c) => ({ functionCall: c })),
        },
      );
      contents.push({ role: "user", parts: responseParts });

      response = await generate();
    }

    const text = response.text?.trim();
    if (!text) {
      return NextResponse.json(
        {
          error:
            "The assistant could not produce an answer for that. Try rephrasing.",
        },
        { status: 502 },
      );
    }

    return NextResponse.json({ answer: text, toolsUsed, model: preferredModel });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error("[chat] failed:", message);

    // Distinguish upstream quota problems from genuine faults. "Out of quota"
    // is actionable by the operator; "temporarily unavailable" is not, and
    // collapsing the two sends people debugging the wrong thing.
    if (message.includes("RESOURCE_EXHAUSTED") || message.includes("429")) {
      return NextResponse.json(
        {
          error:
            "The assistant has no Gemini quota available. Check the API key's project quota and billing.",
        },
        { status: 429 },
      );
    }

    if (
      message.includes("API_KEY_INVALID") ||
      message.includes("PERMISSION_DENIED") ||
      message.includes("401") ||
      message.includes("403")
    ) {
      return NextResponse.json(
        { error: "The configured Gemini API key was rejected." },
        { status: 502 },
      );
    }

    return NextResponse.json(
      { error: "The assistant is temporarily unavailable." },
      { status: 502 },
    );
  }
}
