export type Environment = "prod" | "qa";

export interface Credentials {
  userId: string;
  clientSecret: string;
  snowId: string;
}

export interface BonusObjective {
  objectiveType: string;
  objectiveTarget?: string;
}

export interface ExpeditionBoardEntry {
  expeditionId: string;
  id: string;
  category: string;
  rarity: string;
  participants: number;
  duration: number;
  bonusObjectives: BonusObjective[];
  baseRewards: string[];
  bonusRewards: string[];
  status: string;
  startedOn?: number;
  units?: string[];
}

export type RawUnit = {
  id: string;
  rank?: number;
  progressionIndex?: number;
  xpLevel?: number;
  power?: number;
} & Record<string, unknown>;

export interface CrusadePhase {
  phase: string; // "CRUSADE" | "DOWNTIME" | "STRUGGLE"
  zone?: string; // e.g. "zone3" - only present on CRUSADE phases
  startsOn: number;
  endsOn: number;
}

export interface CrusadePlanet {
  planetId: string;
  name: string;
  sideOwner?: string;
  ownedByFaction?: string;
  pointsFor?: number;
  pointsAgainst?: number;
}

export interface CrusadeData {
  crusadeId: string;
  seasonNumber: number;
  chosenSide: string;
  forFactionId: string;
  againstFactionId: string;
  playerTargetPlanetId: string | null;
  guildTargetPlanetId: string | null;
  // 0-based, derived from crusadePhases - null if no phase brackets the current time (e.g. mid
  // DOWNTIME/STRUGGLE, when no zone is actively contested).
  activeZone: number | null;
  planets: CrusadePlanet[];
}

export interface CrusadeFactionStanding {
  factionId: string;
  points: number;
}

export interface LeaderboardBenchmark {
  rank: number; // 1, 5, 10, or 25
  points: number;
}

export interface SideLeaderboardResult {
  numParticipants: number;
  // null means the player has no rank on either side of this planet - benchmarks still show
  // (falling back to the player's crusade-wide chosenSide) so they can judge whether it'd be
  // worth moving here, just without a rank/percentile/"You" line.
  myRank: number | null;
  myPoints: number | null;
  benchmarks: LeaderboardBenchmark[];
  // Same top-10%/#25 figure as FactionLeaderboardResult, shown for context - planet sort order
  // is still driven by the Faction Leaderboard's referenceScore, not this one.
  referenceScore: LeaderboardBenchmark | null;
}

export interface FactionLeaderboardResult {
  numParticipants: number;
  // null means the player has no personal rank on this planet's faction leaderboard - benchmarks
  // still show (thousands of participants per faction, same scale as the side leaderboard) so
  // they're just as useful without a personal rank as with one.
  myRank: number | null;
  myPoints: number | null;
  benchmarks: LeaderboardBenchmark[];
  // The top-10% rank/score if it's within the visible top-25 window, else the #25 rank/score - a
  // representative "how competitive is this planet" figure used to sort the planet list (and
  // displayed alongside benchmarks when its rank isn't already one of them). Null only when
  // there's no leaderboard entry at all to compute it from.
  referenceScore: LeaderboardBenchmark | null;
}

export interface PlanetLeaderboard {
  planetId: string;
  // Both sides' faction breakdown - general competitive context, not "my" position, so both are
  // always kept (unlike side/faction below, which collapse to whichever side is actually mine).
  topFactionsFor: CrusadeFactionStanding[];
  topFactionsAgainst: CrusadeFactionStanding[];
  // A player can "hop" planets and end up on a different side per-planet than their season-level
  // chosenSide, so "which side is mine" can only be determined per-planet, from whichever _for/
  // _against query actually comes back with a myRank - null if neither does.
  side: SideLeaderboardResult | null;
  faction: FactionLeaderboardResult | null;
}

export interface PlayerResources {
  stamina: number;
  staminaNextTokenAt: number | null;
  staminaCapAt: number | null;
  treasureBeach: number;
  treasureBeachNextTokenAt: number | null;
  treasureBeachCapAt: number | null;
  waves: number;
  wavesNextTokenAt: number | null;
  wavesCapAt: number | null;
  pvp: number;
  pvpPosition: number | null;
  pvpGroupSize: number | null;
  pvpNextTokenAt: number | null;
  pvpCapAt: number | null;
  pvpPausesAt: number | null;
  pvpStopped: boolean;
  guildBoss: number; // "raid tokens" - has special burn-at-cap logic, see guildBossBurnAt
  guildBossNextTokenAt: number | null;
  guildBossCapAt: number | null;
  guildBossBurnAt: number | null;
  guildBossBomb: number;
  guildBossBombNextTokenAt: number | null;
  guildBossBombCapAt: number | null;
  mowAmmo: number;
}
