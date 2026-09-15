import { isTauri } from "@tauri-apps/api/core";
import { invokeWithTimeout } from "./invoke-with-timeout";
import { fetchWithTimeout } from "./fetch-with-timeout";
import planetData from "../assets/planet-data.json";
import type {
  Credentials,
  CrusadeData,
  CrusadeFactionStanding,
  Environment,
  FactionLeaderboardResult,
  LeaderboardBenchmark,
  PlanetLeaderboard,
  SideLeaderboardResult,
} from "./types";

const planetNameById = new Map((planetData as { planetId: string; name: string }[]).map((p) => [p.planetId, p.name]));

// Both transports replay APP_START -> CONNECT -> GET_CRUSADE server-side, each individually
// bounded at 20s - same reasoning as fetchPlayerData's timeout.
export async function fetchCrusadeData(
  environment: Environment,
  webCredentials?: { userId: string; clientSecret: string },
): Promise<CrusadeData> {
  const response = isTauri()
    ? await (async () => {
        const credentials = await invokeWithTimeout<Credentials>("find_credentials", { environment }, 20_000);
        return invokeWithTimeout<any>("fetch_crusade_data", { environment, ...credentials }, 60_000);
      })()
    : await fetchWithTimeout<any>("/api/fetch-crusade-data", { environment, ...webCredentials, snowId: "" }, 60_000);

  const data = response?.eventResults?.[0]?.eventResponseData;
  const activeZone = findActiveZone(data?.crusadePhases ?? []);

  return {
    crusadeId: data?.crusadeId ?? "",
    seasonNumber: data?.seasonNumber ?? 0,
    chosenSide: data?.chosenSide ?? "",
    forFactionId: data?.forFactionId ?? "",
    againstFactionId: data?.againstFactionId ?? "",
    playerTargetPlanetId: data?.playerTargetPlanetId ?? null,
    guildTargetPlanetId: data?.guildTargetPlanetId ?? null,
    activeZone,
    planets: (data?.planetsData ?? []).map((p: any) => ({
      planetId: p.planetId,
      name: planetNameById.get(p.planetId) ?? p.planetId,
      sideOwner: p.sideOwner,
      ownedByFaction: p.ownedByFaction,
      pointsFor: p.pointsFor,
      pointsAgainst: p.pointsAgainst,
    })),
  };
}

// crusadePhases labels its zones "zone1".."zone6" (1-based) - planet-data.json's zone field is
// 0-based, matching the underlying game data it was extracted from - so this converts between
// the two. Only one phase should ever bracket "now" (the schedule is contiguous, non-overlapping)
// - during DOWNTIME/STRUGGLE, no CRUSADE-phase entry brackets it and there's no active zone.
function findActiveZone(phases: { phase: string; zone?: string; startsOn: number; endsOn: number }[]): number | null {
  const now = Date.now();
  const active = phases.find((p) => p.phase === "CRUSADE" && p.zone && now >= p.startsOn && now < p.endsOn);
  if (!active?.zone) return null;
  const oneBased = parseInt(active.zone.replace("zone", ""), 10);
  return Number.isNaN(oneBased) ? null : oneBased - 1;
}

// Only planet-data.json's static zone assignment tells us which planets are contested *this*
// week - GET_CRUSADE's own planetsData carries cumulative totals from every past phase too, so
// "has points" is not a usable signal for "active this week" (see conversation notes).
export function activePlanetIds(activeZone: number | null): string[] {
  if (activeZone === null) return [];
  return (planetData as { planetId: string; zone: number }[]).filter((p) => p.zone === activeZone).map((p) => p.planetId);
}

function leaderboardIdsForPlanet(crusadeId: string, seasonNumber: number, planetId: string) {
  const base = `${crusadeId}_${seasonNumber}_${planetId}`;
  return {
    factionFor: `crusadeFaction:crusade_leaderboard_planet_side_factions_${base}_for`,
    factionAgainst: `crusadeFaction:crusade_leaderboard_planet_side_factions_${base}_against`,
    playerFor: `crusadePlayer:crusade_leaderboard_planet_side_players_${base}_for`,
    playerAgainst: `crusadePlayer:crusade_leaderboard_planet_side_players_${base}_against`,
  };
}

interface LeaderboardRow {
  position: number;
  points: number;
  participantId?: string;
  factionId?: string;
}

interface RawLeaderboardEntry {
  numParticipants: number;
  myRank: number | null;
  myPoints: number | null;
  topEntries: LeaderboardRow[];
  // Entries surrounding the player's own rank - present when myRank doesn't place in the top 25
  // shown by topEntries. This is the only place we've confirmed the player's own factionId
  // appears (see findOwnFactionId).
  localEntries: LeaderboardRow[];
}

function parseRows(rows: any): LeaderboardRow[] {
  return (rows ?? []).map((e: any) => ({ position: e.position, points: e.points, participantId: e.participantId, factionId: e.factionId }));
}

// A missing/wrong leaderboardId type prefix doesn't error - the server echoes the id back with
// no numParticipants/topEntries, indistinguishable at a glance from a genuinely empty
// leaderboard. Requiring numParticipants here is what actually distinguishes "no entry" (a typo)
// from "entry exists, player just isn't on it" (a real absence).
function readLeaderboard(leaderboards: any, leaderboardId: string): RawLeaderboardEntry | null {
  const entry = leaderboards?.[leaderboardId];
  if (!entry || typeof entry.numParticipants !== "number") return null;
  return {
    numParticipants: entry.numParticipants,
    myRank: entry.myRank ?? null,
    myPoints: entry.myPoints ?? null,
    topEntries: parseRows(entry.topEntries),
    localEntries: parseRows(entry.localEntries),
  };
}

// The player's own factionId isn't exposed anywhere else already-fetched - it only shows up on
// the player's own row within a "side" (_players) leaderboard's topEntries/localEntries. Faction
// membership is an account-level identity, not per-planet, so the caller only needs to find this
// once across all planets, not per-planet.
export function findOwnFactionId(entry: RawLeaderboardEntry | null, myUserId: string): string | null {
  const row = [...(entry?.topEntries ?? []), ...(entry?.localEntries ?? [])].find((r) => r.participantId === myUserId);
  return row?.factionId ?? null;
}

function topFactionStandings(entry: RawLeaderboardEntry | null): CrusadeFactionStanding[] {
  return (entry?.topEntries ?? []).filter((e) => e.factionId).map((e) => ({ factionId: e.factionId!, points: e.points }));
}

// Ranks 1/5/10/25 are topEntries indices 0/4/9/24 (0-indexed position field).
const BENCHMARK_RANKS = [1, 5, 10, 25];

// A player can "hop" planets and end up on a different side per-planet than their season-level
// chosenSide, so which of the two queried sides is "mine" can only be determined by which one
// actually has a myRank - there should only ever be at most one (confirmed by a real capture
// where only the _against side had myRank set while _for didn't, for the same planet).
function pickMine(forEntry: RawLeaderboardEntry | null, againstEntry: RawLeaderboardEntry | null): (RawLeaderboardEntry & { myRank: number }) | null {
  if (forEntry && forEntry.myRank !== null) return forEntry as RawLeaderboardEntry & { myRank: number };
  if (againstEntry && againstEntry.myRank !== null) return againstEntry as RawLeaderboardEntry & { myRank: number };
  return null;
}

function buildBenchmarks(entry: RawLeaderboardEntry): LeaderboardBenchmark[] {
  return BENCHMARK_RANKS.filter((rank) => entry.topEntries.some((e) => e.position === rank - 1)).map((rank) => ({
    rank,
    points: entry.topEntries.find((e) => e.position === rank - 1)!.points,
  }));
}

// chosenSide is only consulted as a fallback - when the player has no personal rank on either
// side (pickMine finds nothing), the breakpoints are still useful to judge whether it'd be worth
// moving here, so this falls back to showing whichever side matches the player's crusade-wide
// chosenSide (not both - per discussion, simpler to reason about one list than two).
export function mergeSideLeaderboard(
  forEntry: RawLeaderboardEntry | null,
  againstEntry: RawLeaderboardEntry | null,
  chosenSide: string,
): SideLeaderboardResult | null {
  const mine = pickMine(forEntry, againstEntry);
  if (mine) {
    return {
      numParticipants: mine.numParticipants,
      myRank: mine.myRank,
      myPoints: mine.myPoints,
      benchmarks: buildBenchmarks(mine),
      referenceScore: pickReferenceScore(mine),
    };
  }
  const fallback = chosenSide.toLowerCase() === "for" ? forEntry : againstEntry;
  if (!fallback) return null;
  return {
    numParticipants: fallback.numParticipants,
    myRank: null,
    myPoints: null,
    benchmarks: buildBenchmarks(fallback),
    referenceScore: pickReferenceScore(fallback),
  };
}

// A representative "how competitive is this planet" figure, used to sort the planet list: the
// score at the top-10% rank if it's visible in topEntries (only the top 25 rows are ever
// returned), else the deepest visible rank (#25) as a fallback. E.g. 130 participants -> rank 13
// (ceil(130 * 0.1)), which is within the top-25 window, so that rank's score is used directly;
// with, say, 1000 participants the top-10% rank (100) isn't visible at all, so #25 substitutes.
export function pickReferenceScore(entry: RawLeaderboardEntry): LeaderboardBenchmark | null {
  const top10Rank = Math.ceil(entry.numParticipants * 0.1);
  const targetRank = Math.min(top10Rank, 25);
  const points = entry.topEntries.find((e) => e.position === targetRank - 1)?.points;
  return points === undefined ? null : { rank: targetRank, points };
}

// Unlike the side (_players) leaderboard, the per-faction leaderboard
// (crusade_leaderboard_planet_faction_players_..._{factionId}) was never split by side to begin
// with - one leaderboard per named faction, no _for/_against variants - so there's nothing to
// merge here, just a direct read. Benchmarks show regardless of whether the player has a
// personal rank on this specific planet's faction leaderboard - these leaderboards have
// thousands of participants (same scale as the side leaderboard), so #1/#5/#10/#25 are just as
// useful for judging a planet the player hasn't touched yet as one they have.
export function buildFactionLeaderboard(entry: RawLeaderboardEntry | null): FactionLeaderboardResult | null {
  if (!entry) return null;
  return {
    numParticipants: entry.numParticipants,
    myRank: entry.myRank,
    myPoints: entry.myPoints,
    benchmarks: buildBenchmarks(entry),
    referenceScore: pickReferenceScore(entry),
  };
}

async function mapWithConcurrency<T, R>(items: T[], limit: number, fn: (item: T) => Promise<R>): Promise<R[]> {
  const results: R[] = new Array(items.length);
  let next = 0;
  async function worker() {
    while (next < items.length) {
      const i = next++;
      results[i] = await fn(items[i]);
    }
  }
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, worker));
  return results;
}

async function fetchLeaderboards(
  environment: Environment,
  credentials: { userId: string; clientSecret: string; snowId: string },
  leaderboardIds: string[],
): Promise<any> {
  const response = isTauri()
    ? await invokeWithTimeout<any>("fetch_leaderboard_data", { environment, ...credentials, leaderboardIds }, 60_000)
    : await fetchWithTimeout<any>("/api/fetch-leaderboard-data", { environment, ...credentials, leaderboardIds }, 60_000);
  return response?.eventResult?.eventResponseData?.leaderboards;
}

export async function fetchLeaderboardData(
  environment: Environment,
  crusadeId: string,
  seasonNumber: number,
  chosenSide: string,
  planetIds: string[],
  webCredentials?: { userId: string; clientSecret: string },
  onProgress?: (done: number, total: number, phase: "side" | "faction") => void,
): Promise<PlanetLeaderboard[]> {
  const credentials = isTauri()
    ? await invokeWithTimeout<Credentials>("find_credentials", { environment }, 20_000)
    : { userId: webCredentials?.userId ?? "", clientSecret: webCredentials?.clientSecret ?? "", snowId: "" };

  // Phase A: side + aggregate-faction data for every active planet, same as before. Also
  // collects whichever planet's side leaderboard reveals the player's own factionId - needed to
  // build phase B's query, and only derivable from this data (see findOwnFactionId).
  let doneA = 0;
  let myFactionId: string | null = null;
  const partials = await mapWithConcurrency(planetIds, 5, async (planetId) => {
    const ids = leaderboardIdsForPlanet(crusadeId, seasonNumber, planetId);
    const leaderboardIds = [ids.factionFor, ids.factionAgainst, ids.playerFor, ids.playerAgainst];
    const leaderboards = await fetchLeaderboards(environment, credentials, leaderboardIds);

    const factionFor = readLeaderboard(leaderboards, ids.factionFor);
    const factionAgainst = readLeaderboard(leaderboards, ids.factionAgainst);
    const playerFor = readLeaderboard(leaderboards, ids.playerFor);
    const playerAgainst = readLeaderboard(leaderboards, ids.playerAgainst);

    if (myFactionId === null) {
      myFactionId = findOwnFactionId(playerFor, credentials.userId) ?? findOwnFactionId(playerAgainst, credentials.userId);
    }

    doneA++;
    onProgress?.(doneA, planetIds.length, "side");
    return {
      planetId,
      topFactionsFor: topFactionStandings(factionFor),
      topFactionsAgainst: topFactionStandings(factionAgainst),
      side: mergeSideLeaderboard(playerFor, playerAgainst, chosenSide),
    };
  });

  // Phase B: now that we (maybe) know the player's own faction, one follow-up query per planet
  // against that faction's own leaderboard - skipped entirely if the player has no side-leaderboard
  // position on any active-zone planet this refresh (myFactionId stays null).
  let doneB = 0;
  const factionResults = myFactionId
    ? await mapWithConcurrency(planetIds, 5, async (planetId) => {
        const base = `${crusadeId}_${seasonNumber}_${planetId}`;
        const leaderboardId = `crusadePlayer:crusade_leaderboard_planet_faction_players_${base}_${myFactionId}`;
        const leaderboards = await fetchLeaderboards(environment, credentials, [leaderboardId]);
        const result = buildFactionLeaderboard(readLeaderboard(leaderboards, leaderboardId));
        doneB++;
        onProgress?.(doneB, planetIds.length, "faction");
        return result;
      })
    : planetIds.map(() => null);

  return partials.map((partial, i) => ({ ...partial, faction: factionResults[i] }));
}
