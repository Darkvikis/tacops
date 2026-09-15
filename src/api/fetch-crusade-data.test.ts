import { describe, expect, it } from "vitest";
import { buildFactionLeaderboard, findOwnFactionId, mergeSideLeaderboard, pickReferenceScore } from "./fetch-crusade-data";

// Points taken from a real captured GET_LEADERBOARD_2 response (planet_041, crusadePlayer
// "_against" leaderboard) - the player (myRank 53) doesn't place in the top 25 shown here,
// which is the interesting edge case: their score should still sort correctly below all four
// benchmarks, not just get appended at the end.
const realAgainstEntry = {
  numParticipants: 1858,
  myRank: 53,
  myPoints: 9319,
  topEntries: [
    { position: 0, points: 18227 },
    { position: 4, points: 13946 },
    { position: 9, points: 13194 },
    { position: 24, points: 11487 },
    { position: 12, points: 12475 }, // an in-between entry that isn't a benchmark rank
  ],
  localEntries: [
    { position: 51, points: 9446, participantId: "d1b3b23e-659f-4788-ba14-b39db596fe3f", factionId: "WorldEaters" },
    { position: 52, points: 9382, participantId: "909534ea-3995-401a-b44a-f5453ac20e89", factionId: "ThousandSons" },
    { position: 53, points: 9319, participantId: "a4f01b7c-bfd5-431b-aa9c-9e22eb00e6fa", factionId: "WorldEaters" },
    { position: 54, points: 9290, participantId: "897633a4-28b6-44a1-8fe9-bee0756c7749", factionId: "Necrons" },
  ],
};

const noEntry = null;

describe("mergeSideLeaderboard", () => {
  it("picks whichever side actually has a myRank, and extracts #1/#5/#10/#25 benchmarks", () => {
    const result = mergeSideLeaderboard(noEntry, realAgainstEntry, "Against");
    expect(result).toEqual({
      numParticipants: 1858,
      myRank: 53,
      myPoints: 9319,
      benchmarks: [
        { rank: 1, points: 18227 },
        { rank: 5, points: 13946 },
        { rank: 10, points: 13194 },
        { rank: 25, points: 11487 },
      ],
      referenceScore: { rank: 25, points: 11487 }, // 1858 participants: top-10% rank (186) isn't visible, falls back to #25
    });
  });

  it("prefers the for side when both sides are present with a myRank", () => {
    const forEntry = { ...realAgainstEntry, myRank: 7, myPoints: 20000 };
    const result = mergeSideLeaderboard(forEntry, realAgainstEntry, "Against");
    expect(result?.myRank).toBe(7);
  });

  it("only includes benchmarks that actually exist in topEntries (fewer than 25 participants)", () => {
    const small = {
      numParticipants: 8,
      myRank: 3,
      myPoints: 500,
      topEntries: [
        { position: 0, points: 900 },
        { position: 4, points: 400 },
      ],
      localEntries: [],
    };
    const result = mergeSideLeaderboard(small, noEntry, "For");
    expect(result?.benchmarks).toEqual([
      { rank: 1, points: 900 },
      { rank: 5, points: 400 },
    ]);
  });

  describe("when the player has no personal rank on either side", () => {
    const noRank = { numParticipants: 100, myRank: null, myPoints: null, topEntries: [], localEntries: [] };

    it("falls back to the chosenSide's breakpoints (myRank null, benchmarks still present)", () => {
      const forSide = { ...noRank, numParticipants: 200, topEntries: [{ position: 0, points: 5000 }] };
      const result = mergeSideLeaderboard(forSide, noRank, "For");
      expect(result).toEqual({
        numParticipants: 200,
        myRank: null,
        myPoints: null,
        benchmarks: [{ rank: 1, points: 5000 }],
        referenceScore: null, // top-10% rank (20) isn't in topEntries in this fixture
      });
    });

    it("matches chosenSide case-insensitively", () => {
      const againstSide = { ...noRank, numParticipants: 300, topEntries: [{ position: 0, points: 9000 }] };
      const result = mergeSideLeaderboard(noRank, againstSide, "against");
      expect(result?.numParticipants).toBe(300);
    });

    it("returns null when even the chosenSide has no leaderboard entry at all", () => {
      expect(mergeSideLeaderboard(noRank, noEntry, "Against")).toBeNull();
    });
  });
});

describe("findOwnFactionId", () => {
  it("finds the player's own factionId in localEntries when they don't place in topEntries", () => {
    const factionId = findOwnFactionId(realAgainstEntry, "a4f01b7c-bfd5-431b-aa9c-9e22eb00e6fa");
    expect(factionId).toBe("WorldEaters");
  });

  it("returns null when the player's id doesn't appear anywhere in the entry", () => {
    expect(findOwnFactionId(realAgainstEntry, "not-a-real-user-id")).toBeNull();
  });

  it("returns null for a null entry", () => {
    expect(findOwnFactionId(noEntry, "a4f01b7c-bfd5-431b-aa9c-9e22eb00e6fa")).toBeNull();
  });
});

describe("buildFactionLeaderboard", () => {
  it("returns rank/participants and benchmarks directly, with no for/against merge", () => {
    const result = buildFactionLeaderboard(realAgainstEntry);
    expect(result).toEqual({
      numParticipants: 1858,
      myRank: 53,
      myPoints: 9319,
      benchmarks: [
        { rank: 1, points: 18227 },
        { rank: 5, points: 13946 },
        { rank: 10, points: 13194 },
        { rank: 25, points: 11487 },
      ],
      referenceScore: { rank: 25, points: 11487 }, // 1858 participants: top-10% rank (186) isn't visible, falls back to #25
    });
  });

  it("still returns benchmarks when there's no personal rank on this planet's faction leaderboard", () => {
    const noRank = {
      numParticipants: 4197,
      myRank: null,
      myPoints: null,
      topEntries: [{ position: 0, points: 58946 }],
      localEntries: [],
    };
    expect(buildFactionLeaderboard(noRank)).toEqual({
      numParticipants: 4197,
      myRank: null,
      myPoints: null,
      benchmarks: [{ rank: 1, points: 58946 }],
      referenceScore: null, // #25 isn't in topEntries in this fixture
    });
  });

  it("returns null for a null entry", () => {
    expect(buildFactionLeaderboard(noEntry)).toBeNull();
  });
});

describe("pickReferenceScore", () => {
  it("uses the top-10% rank's score when it's within the visible top-25 window", () => {
    // 130 participants -> ceil(130 * 0.1) = rank 13 -> topEntries position 12 (0-indexed).
    const entry = { ...realAgainstEntry, numParticipants: 130 };
    expect(pickReferenceScore(entry)).toEqual({ rank: 13, points: 12475 });
  });

  it("falls back to the #25 score when the top-10% rank isn't visible (>250 participants)", () => {
    // 1858 participants -> ceil(1858 * 0.1) = rank 186, far past the top-25 window, so #25
    // (topEntries position 24) is used instead.
    expect(pickReferenceScore(realAgainstEntry)).toEqual({ rank: 25, points: 11487 });
  });

  it("returns null when the target rank isn't present in topEntries", () => {
    const sparse = { numParticipants: 4197, myRank: null, myPoints: null, topEntries: [{ position: 0, points: 58946 }], localEntries: [] };
    expect(pickReferenceScore(sparse)).toBeNull();
  });
});
