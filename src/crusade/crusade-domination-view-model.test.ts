import { describe, expect, it } from "vitest";
import { computeCaptureRace, computeConquestProgress, isPlanetRanked, sortDominationPlanets } from "./crusade-domination-view-model";
import type { CrusadePlanet, PlanetLeaderboard } from "../api/types";

function planet(overrides: Partial<CrusadePlanet> = {}): CrusadePlanet {
  return { planetId: "planet_001", name: "Test Planet", ...overrides };
}

function leaderboard(overrides: Partial<PlanetLeaderboard> = {}): PlanetLeaderboard {
  return { planetId: "planet_001", topFactionsFor: [], topFactionsAgainst: [], side: null, faction: null, ...overrides };
}

describe("computeConquestProgress", () => {
  it("returns null when the planet has no struggleData (not currently contestable)", () => {
    expect(computeConquestProgress(planet())).toBeNull();
  });

  it("measures the Imperial-owned planet's own points against the Defender threshold, the other side against Attacker", () => {
    const p = planet({
      sideOwner: "For",
      pointsFor: 50,
      pointsAgainst: 25,
      struggleData: { conquestThresholdPointsAttacker: 100, conquestThresholdPointsDefender: 200 },
    });
    expect(computeConquestProgress(p)).toEqual({
      imperialCurrent: 50,
      imperialThreshold: 200,
      imperialPercent: 25,
      devastationCurrent: 25,
      devastationThreshold: 100,
      devastationPercent: 25,
    });
  });

  it("measures the Devastation-owned planet's own points against the Defender threshold, Imperial against Attacker", () => {
    const p = planet({
      sideOwner: "Against",
      pointsFor: 30,
      pointsAgainst: 150,
      struggleData: { conquestThresholdPointsAttacker: 60, conquestThresholdPointsDefender: 300 },
    });
    expect(computeConquestProgress(p)).toEqual({
      imperialCurrent: 30,
      imperialThreshold: 60,
      imperialPercent: 50,
      devastationCurrent: 150,
      devastationThreshold: 300,
      devastationPercent: 50,
    });
  });

  it("treats absent pointsFor/pointsAgainst as 0 (no battles fought there yet)", () => {
    const p = planet({ sideOwner: "For", struggleData: { conquestThresholdPointsAttacker: 100, conquestThresholdPointsDefender: 100 } });
    const result = computeConquestProgress(p)!;
    expect(result.imperialCurrent).toBe(0);
    expect(result.devastationCurrent).toBe(0);
    expect(result.imperialPercent).toBe(0);
  });
});

describe("computeCaptureRace", () => {
  it("returns null when the planet has no struggleData", () => {
    expect(computeCaptureRace(planet())).toBeNull();
  });

  it("picks Imperial as the leading side when they need fewer points to capture", () => {
    const p = planet({
      sideOwner: "Against",
      pointsFor: 90,
      pointsAgainst: 10,
      struggleData: { conquestThresholdPointsAttacker: 100, conquestThresholdPointsDefender: 100 },
    });
    // Imperial (attacker here) needs 100-90=10 more; Devastation (defender) needs 100-10=90 more.
    expect(computeCaptureRace(p)).toEqual({ leadingSide: "Imperial", pointsRemaining: 10 });
  });

  it("picks Devastation as the leading side when they need fewer points to capture", () => {
    const p = planet({
      sideOwner: "For",
      pointsFor: 10,
      pointsAgainst: 90,
      struggleData: { conquestThresholdPointsAttacker: 100, conquestThresholdPointsDefender: 100 },
    });
    // Devastation (attacker here) needs 100-90=10 more; Imperial (defender) needs 100-10=90 more.
    expect(computeCaptureRace(p)).toEqual({ leadingSide: "Devastation", pointsRemaining: 10 });
  });
});

describe("isPlanetRanked", () => {
  it("is true when the player has a side rank", () => {
    expect(isPlanetRanked(leaderboard({ side: { numParticipants: 10, myRank: 3, myPoints: 100, benchmarks: [], referenceScore: null } }))).toBe(true);
  });

  it("is true when the player has a faction rank", () => {
    expect(isPlanetRanked(leaderboard({ faction: { numParticipants: 10, myRank: 3, myPoints: 100, benchmarks: [], referenceScore: null } }))).toBe(true);
  });

  it("is false when neither side nor faction has a rank", () => {
    expect(isPlanetRanked(leaderboard())).toBe(false);
  });

  it("is false when there's no leaderboard data at all yet", () => {
    expect(isPlanetRanked(undefined)).toBe(false);
  });
});

describe("sortDominationPlanets", () => {
  it("puts faction-ranked planets first, best percentile first", () => {
    const planets = [planet({ planetId: "worse" }), planet({ planetId: "better" })];
    const byPlanet = new Map<string, PlanetLeaderboard>([
      ["worse", leaderboard({ planetId: "worse", faction: { numParticipants: 100, myRank: 50, myPoints: 1, benchmarks: [], referenceScore: null } })],
      ["better", leaderboard({ planetId: "better", faction: { numParticipants: 100, myRank: 5, myPoints: 1, benchmarks: [], referenceScore: null } })],
    ]);
    expect(sortDominationPlanets(planets, byPlanet).map((p) => p.planetId)).toEqual(["better", "worse"]);
  });

  it("sorts unranked planets after ranked ones, ascending by points remaining for the closest side to capture", () => {
    const planets = [
      planet({ planetId: "ranked" }),
      planet({ planetId: "hard", sideOwner: "For", pointsFor: 100, pointsAgainst: 100, struggleData: { conquestThresholdPointsAttacker: 10000, conquestThresholdPointsDefender: 10000 } }),
      planet({ planetId: "easy", sideOwner: "For", pointsFor: 100, pointsAgainst: 9900, struggleData: { conquestThresholdPointsAttacker: 10000, conquestThresholdPointsDefender: 10000 } }),
    ];
    const byPlanet = new Map<string, PlanetLeaderboard>([
      ["ranked", leaderboard({ planetId: "ranked", faction: { numParticipants: 100, myRank: 5, myPoints: 1, benchmarks: [], referenceScore: null } })],
    ]);
    expect(sortDominationPlanets(planets, byPlanet).map((p) => p.planetId)).toEqual(["ranked", "easy", "hard"]);
  });

  it("tie-breaks equal points-remaining (or both missing struggleData) by ascending faction participant count", () => {
    const planets = [planet({ planetId: "crowded" }), planet({ planetId: "sparse" })];
    const byPlanet = new Map<string, PlanetLeaderboard>([
      ["crowded", leaderboard({ planetId: "crowded", faction: { numParticipants: 500, myRank: null, myPoints: null, benchmarks: [], referenceScore: null } })],
      ["sparse", leaderboard({ planetId: "sparse", faction: { numParticipants: 20, myRank: null, myPoints: null, benchmarks: [], referenceScore: null } })],
    ]);
    expect(sortDominationPlanets(planets, byPlanet).map((p) => p.planetId)).toEqual(["sparse", "crowded"]);
  });

  it("handles planets with no leaderboard data at all (sorts them into the unranked group, last)", () => {
    const planets = [planet({ planetId: "no-data" }), planet({ planetId: "has-data" })];
    const byPlanet = new Map<string, PlanetLeaderboard>([
      ["has-data", leaderboard({ planetId: "has-data", faction: { numParticipants: 100, myRank: null, myPoints: null, benchmarks: [{ rank: 10, points: 500 }], referenceScore: null } })],
    ]);
    expect(sortDominationPlanets(planets, byPlanet).map((p) => p.planetId)).toEqual(["has-data", "no-data"]);
  });
});
