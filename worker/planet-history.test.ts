import { describe, expect, it } from "vitest";
import {
  appendToHistoryCache,
  buildHistoryRow,
  collapseIdenticalRuns,
  compressHistorySamples,
  enforceHardCap,
  isEraReset,
  rawPlanetToCrusadePlanet,
  thinOlderSamples,
  truncateAtLastReopen,
  type PlanetHistoryRow,
  type PlanetHistorySample,
} from "./planet-history";

describe("rawPlanetToCrusadePlanet", () => {
  it("maps the fields pointsRemaining/isDominationSunk actually read, with placeholder name/zone", () => {
    const result = rawPlanetToCrusadePlanet({
      planetId: "planet_042",
      sideOwner: "For",
      ownedByFaction: "Custodes",
      pointsFor: 100,
      pointsAgainst: 50,
      struggleData: { conquestThresholdPointsAttacker: 1000, conquestThresholdPointsDefender: 1000 },
    });
    expect(result).toEqual({
      planetId: "planet_042",
      name: "planet_042",
      zone: null,
      sideOwner: "For",
      ownedByFaction: "Custodes",
      pointsFor: 100,
      pointsAgainst: 50,
      struggleData: { conquestThresholdPointsAttacker: 1000, conquestThresholdPointsDefender: 1000 },
    });
  });
});

describe("buildHistoryRow", () => {
  it("computes remaining points and sunk for a live contested planet", () => {
    const planet = rawPlanetToCrusadePlanet({
      planetId: "planet_001",
      sideOwner: "For",
      pointsFor: 100,
      pointsAgainst: 50,
      struggleData: { conquestThresholdPointsAttacker: 1000, conquestThresholdPointsDefender: 1000 },
    });
    expect(buildHistoryRow(planet, 5000)).toEqual({
      planetId: "planet_001",
      atMs: 5000,
      imperialRemaining: 900,
      devastationRemaining: 950,
      sunk: false,
    });
  });

  it("marks sunk true once a side has reached its own threshold", () => {
    const planet = rawPlanetToCrusadePlanet({
      planetId: "planet_001",
      sideOwner: "For",
      pointsFor: 1000,
      pointsAgainst: 50,
      struggleData: { conquestThresholdPointsAttacker: 1000, conquestThresholdPointsDefender: 1000 },
    });
    expect(buildHistoryRow(planet, 5000).sunk).toBe(true);
  });

  it("marks sunk true for the idle (0/0) cooldown state too", () => {
    const planet = rawPlanetToCrusadePlanet({
      planetId: "planet_001",
      struggleData: { conquestThresholdPointsAttacker: 1000, conquestThresholdPointsDefender: 1000 },
    });
    expect(buildHistoryRow(planet, 5000).sunk).toBe(true);
  });
});

describe("isEraReset", () => {
  it("is true only when a planet flips from sunk to trackable", () => {
    expect(isEraReset(true, false)).toBe(true);
  });

  it("is false when staying sunk", () => {
    expect(isEraReset(true, true)).toBe(false);
  });

  it("is false when staying trackable", () => {
    expect(isEraReset(false, false)).toBe(false);
  });

  it("is false when newly becoming sunk", () => {
    expect(isEraReset(false, true)).toBe(false);
  });

  it("is false when there's no prior history yet (null)", () => {
    expect(isEraReset(null, false)).toBe(false);
    expect(isEraReset(null, true)).toBe(false);
  });
});

describe("appendToHistoryCache", () => {
  function row(overrides: Partial<PlanetHistoryRow> = {}): PlanetHistoryRow {
    return { planetId: "planet_001", atMs: 1000, imperialRemaining: 900, devastationRemaining: 800, sunk: false, ...overrides };
  }

  it("starts a fresh single-sample array when there's no existing entry yet", () => {
    expect(appendToHistoryCache(null, row())).toEqual({
      samples: [{ atMs: 1000, imperialRemaining: 900, devastationRemaining: 800 }],
      lastSunk: false,
    });
  });

  it("appends to the existing samples when the planet is still in the same era", () => {
    const existing = { samples: [{ atMs: 500, imperialRemaining: 950, devastationRemaining: 900 }], lastSunk: false };
    expect(appendToHistoryCache(existing, row())).toEqual({
      samples: [
        { atMs: 500, imperialRemaining: 950, devastationRemaining: 900 },
        { atMs: 1000, imperialRemaining: 900, devastationRemaining: 800 },
      ],
      lastSunk: false,
    });
  });

  it("starts a fresh single-sample array on an era reset (sunk -> trackable), discarding the old era's samples", () => {
    const existing = { samples: [{ atMs: 500, imperialRemaining: 0, devastationRemaining: 900 }], lastSunk: true };
    expect(appendToHistoryCache(existing, row({ sunk: false }))).toEqual({
      samples: [{ atMs: 1000, imperialRemaining: 900, devastationRemaining: 800 }],
      lastSunk: false,
    });
  });

  it("keeps accumulating while staying sunk (e.g. still in cooldown)", () => {
    // Remaining stays <= 0 on both samples (a realistic "still mid-cooldown" pair, unlike a sunk
    // flag paired with a since-recovered positive remaining - see truncateAtLastReopen, which
    // would (correctly) treat THAT combination as a reopen regardless of what the sunk flag says).
    const existing = { samples: [{ atMs: 500, imperialRemaining: 0, devastationRemaining: 900 }], lastSunk: true };
    expect(appendToHistoryCache(existing, row({ sunk: true, imperialRemaining: -10, devastationRemaining: 800 })).samples).toHaveLength(2);
  });

  it("compresses the merged samples on every append (not just when a cap is hit)", () => {
    // Three identical-value samples followed by the new (also identical) row should collapse to
    // just the run's first and last - confirms appendToHistoryCache actually calls
    // compressHistorySamples rather than just concatenating.
    const existing = {
      samples: [
        { atMs: 100, imperialRemaining: 900, devastationRemaining: 800 },
        { atMs: 200, imperialRemaining: 900, devastationRemaining: 800 },
        { atMs: 300, imperialRemaining: 900, devastationRemaining: 800 },
      ],
      lastSunk: false,
    };
    expect(appendToHistoryCache(existing, row({ atMs: 1000, imperialRemaining: 900, devastationRemaining: 800 })).samples).toEqual([
      { atMs: 100, imperialRemaining: 900, devastationRemaining: 800 },
      { atMs: 1000, imperialRemaining: 900, devastationRemaining: 800 },
    ]);
  });
});

function sample(atMs: number, imperialRemaining: number, devastationRemaining: number): PlanetHistorySample {
  return { atMs, imperialRemaining, devastationRemaining };
}

describe("truncateAtLastReopen", () => {
  it("leaves samples unchanged when remaining never crosses back above 0", () => {
    const samples = [sample(1, 900, 800), sample(2, 500, 400), sample(3, 100, 50)];
    expect(truncateAtLastReopen(samples)).toEqual(samples);
  });

  it("drops everything before a reopen (either side crossing <= 0 back to positive)", () => {
    const samples = [
      sample(1, 900, 800),
      sample(2, 0, 400), // imperial captured
      sample(3, -50, 200), // still captured, cooldown
      sample(4, 300, 100), // reopened - imperial back above 0
      sample(5, 250, 50),
    ];
    expect(truncateAtLastReopen(samples)).toEqual([sample(4, 300, 100), sample(5, 250, 50)]);
  });

  it("finds the LAST reopen when there's more than one capture/reopen cycle", () => {
    const samples = [
      sample(1, 900, 800),
      sample(2, 0, 800), // capture 1
      sample(3, 300, 800), // reopen 1
      sample(4, 300, 0), // capture 2 (devastation side this time)
      sample(5, 300, 150), // reopen 2 - this is the one that should win
      sample(6, 300, 100),
    ];
    expect(truncateAtLastReopen(samples)).toEqual([sample(5, 300, 150), sample(6, 300, 100)]);
  });

  it("triggers on either side independently", () => {
    const samples = [sample(1, 900, 0), sample(2, 900, 300)]; // only devastation reopens
    expect(truncateAtLastReopen(samples)).toEqual([sample(2, 900, 300)]);
  });
});

describe("collapseIdenticalRuns", () => {
  it("leaves samples unchanged when no two consecutive ones match", () => {
    const samples = [sample(1, 900, 800), sample(2, 850, 790), sample(3, 800, 780)];
    expect(collapseIdenticalRuns(samples)).toEqual(samples);
  });

  it("collapses a run of 3+ identical samples to just its first and last", () => {
    const samples = [sample(1, 900, 800), sample(2, 900, 800), sample(3, 900, 800), sample(4, 900, 800)];
    expect(collapseIdenticalRuns(samples)).toEqual([sample(1, 900, 800), sample(4, 900, 800)]);
  });

  it("leaves a run of exactly 2 identical samples alone (nothing redundant to drop)", () => {
    const samples = [sample(1, 900, 800), sample(2, 900, 800)];
    expect(collapseIdenticalRuns(samples)).toEqual(samples);
  });

  it("handles multiple separate runs and singletons mixed together", () => {
    const samples = [
      sample(1, 900, 800), // singleton
      sample(2, 500, 500),
      sample(3, 500, 500),
      sample(4, 500, 500), // run of 3 -> collapses to [2, 4]
      sample(5, 100, 100), // singleton
    ];
    expect(collapseIdenticalRuns(samples)).toEqual([sample(1, 900, 800), sample(2, 500, 500), sample(4, 500, 500), sample(5, 100, 100)]);
  });

  it("collapses a run at the very start or end of the array", () => {
    const samples = [sample(1, 900, 800), sample(2, 900, 800), sample(3, 900, 800), sample(4, 100, 100)];
    expect(collapseIdenticalRuns(samples)).toEqual([sample(1, 900, 800), sample(3, 900, 800), sample(4, 100, 100)]);
  });

  it("handles an empty array and a single-sample array", () => {
    expect(collapseIdenticalRuns([])).toEqual([]);
    expect(collapseIdenticalRuns([sample(1, 900, 800)])).toEqual([sample(1, 900, 800)]);
  });
});

const FIVE_MIN_MS = 5 * 60 * 1000;

describe("thinOlderSamples", () => {
  it("leaves everything alone at or under the 10-sample recent-window size", () => {
    const samples = Array.from({ length: 10 }, (_, i) => sample(i * 1000, 900 - i, 800 - i));
    expect(thinOlderSamples(samples)).toEqual(samples);
  });

  it("thins the older portion to a 5-minute floor while leaving the most recent 10 untouched regardless of spacing", () => {
    // 5 older samples 1 minute apart (should thin down to ~2: first, then the first one >=5min later),
    // followed by 10 recent samples 1 second apart (always kept, no thinning).
    const older = [sample(0, 10, 10), sample(60_000, 9, 9), sample(120_000, 8, 8), sample(180_000, 7, 7), sample(300_000, 6, 6)];
    const recentStart = 600_000;
    const recent = Array.from({ length: 10 }, (_, i) => sample(recentStart + i * 1000, 5 - i, 5 - i));
    const result = thinOlderSamples([...older, ...recent]);

    // Older: keep index 0 (t=0), then skip until >=5min later - t=300_000 (5min exactly) qualifies.
    expect(result.slice(0, 2)).toEqual([sample(0, 10, 10), sample(300_000, 6, 6)]);
    // Recent 10 are preserved exactly, 1s apart, untouched by the 5-minute rule.
    expect(result.slice(2)).toEqual(recent);
  });

  it("always keeps the very first sample even with 11 total (1 older + 10 recent)", () => {
    const samples = [sample(0, 10, 10), ...Array.from({ length: 10 }, (_, i) => sample((i + 1) * 1000, 5 - i, 5 - i))];
    const result = thinOlderSamples(samples);
    expect(result[0]).toEqual(sample(0, 10, 10));
    expect(result).toHaveLength(11);
  });
});

describe("enforceHardCap", () => {
  it("leaves the array unchanged at or under the 999-sample cap", () => {
    const samples = Array.from({ length: 999 }, (_, i) => sample(i, 1000 - i, 1000 - i));
    expect(enforceHardCap(samples)).toEqual(samples);
  });

  it("roughly halves a non-extreme middle while always keeping the first sample and the most recent 10", () => {
    // 1010 samples, strictly decreasing (no extremes - stays positive throughout), no two equal.
    const samples = Array.from({ length: 1010 }, (_, i) => sample(i, 2000 - i, 2000 - i));
    const result = enforceHardCap(samples);

    expect(result[0]).toEqual(samples[0]);
    expect(result.slice(-10)).toEqual(samples.slice(-10));
    // 1000 "older" samples (1010 - 10 recent): first is always kept, the remaining 999 alternate ->
    // 1 (first) + ceil(999/2) = 1 + 500 = 501 older samples, plus 10 recent = 511.
    expect(result).toHaveLength(511);
  });

  it("never drops an extreme (a sign change in either side's remaining) even mid-run", () => {
    // Long non-extreme runs on either side of one capture moment (devastation crosses to 0) -
    // imperial stays constant and positive throughout so this is the only sign-change transition
    // anywhere in the array.
    const before = Array.from({ length: 500 }, (_, i) => sample(i, 500, 500 - i)); // devastation 500 -> 1, never 0
    const captureMoment = sample(500, 500, 0); // devastation hits exactly 0 here - the extreme
    const after = Array.from({ length: 509 }, (_, i) => sample(501 + i, 500, 0)); // stays captured
    const samples = [...before, captureMoment, ...after];
    expect(samples.length).toBeGreaterThan(999);

    const result = enforceHardCap(samples);
    expect(result).toContainEqual(captureMoment);
  });
});

describe("compressHistorySamples", () => {
  it("chains lossless then lossy: a long flat run collapses first, so it never reaches the lossy/hard-cap stages", () => {
    const samples = Array.from({ length: 50 }, (_, i) => sample(i * FIVE_MIN_MS, 900, 800));
    expect(compressHistorySamples(samples)).toEqual([sample(0, 900, 800), sample(49 * FIVE_MIN_MS, 900, 800)]);
  });

  it("falls through to the hard cap when a long, never-repeating, never-5-minutes-apart series survives both earlier stages", () => {
    // 1200 strictly-decreasing-by-1 samples, 1ms apart (well under the 5-minute floor, so lossy
    // thinning does nothing here) - still over 999 after lossless+lossy, so the hard cap must kick in.
    const samples = Array.from({ length: 1200 }, (_, i) => sample(i, 2000 - i, 2000 - i));
    const result = compressHistorySamples(samples);
    expect(result.length).toBeLessThan(1200);
    expect(result.length).toBeLessThanOrEqual(999);
  });

  it("runs truncation first, so old-era samples before a reopen are dropped outright, not just compressed", () => {
    const oldEra = Array.from({ length: 30 }, (_, i) => sample(i * FIVE_MIN_MS, 0, 100 - i));
    const reopen = sample(30 * FIVE_MIN_MS, 900, 800);
    const current = sample(31 * FIVE_MIN_MS, 850, 780);
    expect(compressHistorySamples([...oldEra, reopen, current])).toEqual([reopen, current]);
  });
});
