import { describe, expect, it } from "vitest";
import {
  isoDate,
  mapMatch,
  mapStatus,
  mapTeam,
  MissingCredentials,
  type RawMatch,
  type RawTeam,
} from "./football-data";

describe("isoDate", () => {
  it("formats the reference date as YYYY-MM-DD by default", () => {
    const base = new Date(Date.UTC(2026, 7, 20, 12, 0, 0));
    expect(isoDate(0, base)).toBe("2026-08-20");
  });

  it("calculates positive day offsets correctly", () => {
    const base = new Date(Date.UTC(2026, 7, 20, 12, 0, 0));
    expect(isoDate(7, base)).toBe("2026-08-27");
    expect(isoDate(21, base)).toBe("2026-09-10");
  });

  it("calculates negative day offsets correctly", () => {
    const base = new Date(Date.UTC(2026, 7, 20, 12, 0, 0));
    expect(isoDate(-1, base)).toBe("2026-08-19");
    expect(isoDate(-21, base)).toBe("2026-07-30");
  });

  it("handles month boundary transitions", () => {
    const endOfJan = new Date(Date.UTC(2026, 0, 31, 10, 0, 0));
    expect(isoDate(1, endOfJan)).toBe("2026-02-01");

    const startOfMarch = new Date(Date.UTC(2026, 2, 1, 10, 0, 0));
    expect(isoDate(-1, startOfMarch)).toBe("2026-02-28");
  });

  it("handles leap year leap days", () => {
    const feb28Leap = new Date(Date.UTC(2024, 1, 28, 10, 0, 0));
    expect(isoDate(1, feb28Leap)).toBe("2024-02-29");

    const feb28NonLeap = new Date(Date.UTC(2025, 1, 28, 10, 0, 0));
    expect(isoDate(1, feb28NonLeap)).toBe("2025-03-01");
  });

  it("handles year boundary transitions", () => {
    const newYearsEve = new Date(Date.UTC(2026, 11, 31, 23, 59, 59));
    expect(isoDate(1, newYearsEve)).toBe("2027-01-01");

    const newYearsDay = new Date(Date.UTC(2027, 0, 1, 0, 0, 0));
    expect(isoDate(-1, newYearsDay)).toBe("2026-12-31");
  });

  it("defaults to current date when from is omitted", () => {
    const result = isoDate(0);
    expect(result).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });
});

describe("mapStatus", () => {
  it("maps live match statuses", () => {
    expect(mapStatus("IN_PLAY")).toBe("live");
    expect(mapStatus("PAUSED")).toBe("live");
  });

  it("maps finished match statuses", () => {
    expect(mapStatus("FINISHED")).toBe("finished");
    expect(mapStatus("AWARDED")).toBe("finished");
  });

  it("maps postponed and cancelled statuses", () => {
    expect(mapStatus("POSTPONED")).toBe("postponed");
    expect(mapStatus("SUSPENDED")).toBe("postponed");
    expect(mapStatus("CANCELLED")).toBe("postponed");
  });

  it("maps scheduled or unknown statuses to scheduled", () => {
    expect(mapStatus("SCHEDULED")).toBe("scheduled");
    expect(mapStatus("TIMED")).toBe("scheduled");
    expect(mapStatus(undefined)).toBe("scheduled");
    expect(mapStatus("UNKNOWN_STATUS")).toBe("scheduled");
  });
});

describe("mapTeam", () => {
  it("maps a full raw team object", () => {
    const raw: RawTeam = {
      id: 64,
      name: "Liverpool FC",
      shortName: "Liverpool",
      tla: "LIV",
      crest: "https://crests.football-data.org/64.png",
    };

    expect(mapTeam(raw)).toEqual({
      id: "64",
      name: "Liverpool FC",
      shortName: "Liverpool",
      crest: "https://crests.football-data.org/64.png",
    });
  });

  it("falls back to tla when shortName is missing", () => {
    const raw: RawTeam = {
      id: 65,
      name: "Manchester City FC",
      tla: "MCI",
    };

    expect(mapTeam(raw)).toEqual({
      id: "65",
      name: "Manchester City FC",
      shortName: "MCI",
      crest: null,
    });
  });

  it("handles undefined raw team gracefully", () => {
    expect(mapTeam(undefined)).toEqual({
      id: "unknown",
      name: "Unknown",
      shortName: null,
      crest: null,
    });
  });
});

describe("mapMatch", () => {
  it("maps a completed match with scores and details", () => {
    const raw: RawMatch = {
      id: 1001,
      utcDate: "2026-08-15T16:30:00Z",
      status: "FINISHED",
      matchday: 1,
      venue: "Emirates Stadium",
      homeTeam: { id: 57, name: "Arsenal FC", shortName: "Arsenal" },
      awayTeam: { id: 61, name: "Chelsea FC", shortName: "Chelsea" },
      score: {
        fullTime: { home: 2, away: 1 },
      },
    };

    const match = mapMatch(raw, "Premier League");

    expect(match).toEqual({
      id: "1001",
      league: "Premier League",
      state: "finished",
      kickoff: "2026-08-15T16:30:00Z",
      progress: null,
      home: {
        id: "57",
        name: "Arsenal FC",
        shortName: "Arsenal",
        crest: null,
      },
      away: {
        id: "61",
        name: "Chelsea FC",
        shortName: "Chelsea",
        crest: null,
      },
      homeScore: 2,
      awayScore: 1,
      venue: "Emirates Stadium",
      round: "1",
    });
  });

  it("preserves 0-0 score for a goalless draw", () => {
    const raw: RawMatch = {
      id: 1002,
      status: "FINISHED",
      score: { fullTime: { home: 0, away: 0 } },
    };

    const match = mapMatch(raw, "La Liga");
    expect(match.homeScore).toBe(0);
    expect(match.awayScore).toBe(0);
  });

  it("keeps scores as null for scheduled matches with no score data", () => {
    const raw: RawMatch = {
      id: 1003,
      utcDate: "2026-08-25T19:00:00Z",
      status: "SCHEDULED",
      score: { fullTime: { home: null, away: null } },
    };

    const match = mapMatch(raw, "Serie A");
    expect(match.state).toBe("scheduled");
    expect(match.homeScore).toBeNull();
    expect(match.awayScore).toBeNull();
  });

  it("generates a valid fallback ID when id is missing", () => {
    const raw: RawMatch = {
      status: "SCHEDULED",
    };

    const match = mapMatch(raw, "Bundesliga");
    expect(match.id).toBeDefined();
    expect(typeof match.id).toBe("string");
    expect(match.id.length).toBeGreaterThan(0);
  });
});

describe("MissingCredentials", () => {
  it("creates an instance with standard message and name", () => {
    const err = new MissingCredentials();
    expect(err.name).toBe("MissingCredentials");
    expect(err.message).toContain("football-data.org API key is not configured");
  });
});
