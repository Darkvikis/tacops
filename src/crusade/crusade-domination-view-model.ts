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

export interface CaptureRace {
  leadingSide: "Imperial" | "Devastation";
  pointsRemaining: number;
}

// Whichever side is closer to hitting its own conquest threshold - a low pointsRemaining means the
// planet is about to flip, which is exactly the kind of planet worth piling points onto.
export function computeCaptureRace(planet: CrusadePlanet): CaptureRace | null {
  const progress = computeConquestProgress(planet);
  if (!progress) return null;
  const imperialRemaining = progress.imperialThreshold - progress.imperialCurrent;
  const devastationRemaining = progress.devastationThreshold - progress.devastationCurrent;
  return imperialRemaining <= devastationRemaining
    ? { leadingSide: "Imperial", pointsRemaining: imperialRemaining }
    : { leadingSide: "Devastation", pointsRemaining: devastationRemaining };
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
// "how am I already doing here"); the rest follow, ordered by how close the nearer side is to
// actually capturing the planet (fewest points remaining first - the most urgent/actionable
// opportunities), tie-broken by how few faction participants they're competing against.
export function sortDominationPlanets(planets: CrusadePlanet[], leaderboardByPlanet: Map<string, PlanetLeaderboard>): CrusadePlanet[] {
  const ranked: CrusadePlanet[] = [];
  const unranked: CrusadePlanet[] = [];
  for (const planet of planets) {
    const leaderboard = leaderboardByPlanet.get(planet.planetId);
    (leaderboard?.faction?.myRank != null ? ranked : unranked).push(planet);
  }

  ranked.sort((a, b) => factionPercentile(leaderboardByPlanet.get(a.planetId)) - factionPercentile(leaderboardByPlanet.get(b.planetId)));

  unranked.sort((a, b) => {
    // Both sides missing struggleData means Infinity - Infinity (NaN), not a tie of 0 - guard
    // explicitly rather than relying on subtraction, then fall through to the participant tiebreak.
    const remainingA = computeCaptureRace(a)?.pointsRemaining ?? Infinity;
    const remainingB = computeCaptureRace(b)?.pointsRemaining ?? Infinity;
    if (remainingA !== remainingB) return remainingA - remainingB;
    return factionParticipants(leaderboardByPlanet.get(a.planetId)) - factionParticipants(leaderboardByPlanet.get(b.planetId));
  });

  return [...ranked, ...unranked];
}
