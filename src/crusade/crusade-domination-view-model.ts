import type { CrusadePlanet, PlanetLeaderboard } from "../api/types";

export interface ConquestProgress {
  imperialCurrent: number;
  imperialThreshold: number;
  imperialPercent: number;
  devastationCurrent: number;
  devastationThreshold: number;
  devastationPercent: number;
}

function percentOf(current: number, threshold: number): number {
  return threshold > 0 ? Math.round((current / threshold) * 100) : 0;
}

// The planet's owner (sideOwner) is defending it - their points are measured against the
// Defender threshold, while the other side is attacking, measured against the Attacker threshold.
export function computeConquestProgress(planet: CrusadePlanet): ConquestProgress | null {
  if (!planet.struggleData) return null;
  const { conquestThresholdPointsAttacker, conquestThresholdPointsDefender } = planet.struggleData;
  const imperialOwns = planet.sideOwner?.toLowerCase() === "for";
  const imperialThreshold = imperialOwns ? conquestThresholdPointsDefender : conquestThresholdPointsAttacker;
  const devastationThreshold = imperialOwns ? conquestThresholdPointsAttacker : conquestThresholdPointsDefender;
  const imperialCurrent = planet.pointsFor ?? 0;
  const devastationCurrent = planet.pointsAgainst ?? 0;
  return {
    imperialCurrent,
    imperialThreshold,
    imperialPercent: percentOf(imperialCurrent, imperialThreshold),
    devastationCurrent,
    devastationThreshold,
    devastationPercent: percentOf(devastationCurrent, devastationThreshold),
  };
}

export function isPlanetRanked(leaderboard: PlanetLeaderboard | undefined): boolean {
  return leaderboard?.side?.myRank != null || leaderboard?.faction?.myRank != null;
}

function factionTenthBenchmarkPoints(leaderboard: PlanetLeaderboard | undefined): number {
  return leaderboard?.faction?.benchmarks.find((b) => b.rank === 10)?.points ?? Infinity;
}

function factionParticipants(leaderboard: PlanetLeaderboard | undefined): number {
  return leaderboard?.faction?.numParticipants ?? Infinity;
}

function factionPercentile(leaderboard: PlanetLeaderboard | undefined): number {
  const rank = leaderboard?.faction?.myRank;
  const numParticipants = leaderboard?.faction?.numParticipants;
  if (rank == null || !numParticipants) return Infinity;
  return rank / numParticipants;
}

// Two-group sort: planets where the player has a faction rank come first (best percentile first -
// "how am I already doing here"); the rest follow, ordered by how low the bar to crack the
// faction's #10 is (easiest opportunities first), tie-broken by how few faction participants
// they're competing against.
export function sortDominationPlanets(planets: CrusadePlanet[], leaderboardByPlanet: Map<string, PlanetLeaderboard>): CrusadePlanet[] {
  const ranked: CrusadePlanet[] = [];
  const unranked: CrusadePlanet[] = [];
  for (const planet of planets) {
    const leaderboard = leaderboardByPlanet.get(planet.planetId);
    (leaderboard?.faction?.myRank != null ? ranked : unranked).push(planet);
  }

  ranked.sort((a, b) => factionPercentile(leaderboardByPlanet.get(a.planetId)) - factionPercentile(leaderboardByPlanet.get(b.planetId)));

  unranked.sort((a, b) => {
    const lbA = leaderboardByPlanet.get(a.planetId);
    const lbB = leaderboardByPlanet.get(b.planetId);
    // Both sides missing a #10 benchmark means Infinity - Infinity (NaN), not a tie of 0 - guard
    // explicitly rather than relying on subtraction, then fall through to the participant tiebreak.
    const tenthA = factionTenthBenchmarkPoints(lbA);
    const tenthB = factionTenthBenchmarkPoints(lbB);
    if (tenthA !== tenthB) return tenthA - tenthB;
    return factionParticipants(lbA) - factionParticipants(lbB);
  });

  return [...ranked, ...unranked];
}
