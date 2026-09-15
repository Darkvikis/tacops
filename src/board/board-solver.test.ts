import { describe, expect, it } from "vitest";
import {
  findMinimalRequiredSubset,
  solveBoardAssignment,
  solveGreedyFallback,
  type GroupRequirement,
  type RosterCharacter,
} from "./board-solver";
import { Rank } from "../rank/rank.enum";
import { Rarity } from "../rarity/rarity.enum";
import type { CharacterProfile } from "../characters/character-profile";
import type { ExpeditionBoardEntry, RawUnit } from "../api/types";

describe("findMinimalRequiredSubset", () => {
  it("excludes a character whose only objective is already covered by someone else", () => {
    // Reported scenario: trait:parry, faction:black templars (x2), damage:bolter, damage:flame.
    // Helbrecht alone can satisfy parry; Helbrecht+Vindicta are the only two black templars among
    // the assigned set (count 2, so both are needed); either Helbrecht or Isabella can cover
    // bolter, but Helbrecht already does via the other groups, so Isabella shouldn't be required;
    // only Godswyl can cover flame. Mephiston is eligible for nothing and should stay optional.
    const assignedIds = ["helbrecht", "godswyl", "isabella", "vindicta", "mephiston"];
    const groupRequirements: GroupRequirement[] = [
      { key: "Trait::Parry", count: 1, eligibleAssignedIds: ["helbrecht"] },
      { key: "Faction::BlackTemplars", count: 2, eligibleAssignedIds: ["helbrecht", "godswyl"] },
      { key: "DamageType::Bolter", count: 1, eligibleAssignedIds: ["helbrecht", "isabella"] },
      { key: "DamageType::Flame", count: 1, eligibleAssignedIds: ["vindicta"] },
    ];

    const required = findMinimalRequiredSubset(assignedIds, groupRequirements);

    expect(required).toEqual(new Set(["helbrecht", "vindicta", "godswyl"]));
  });

  it("requires everyone when there's no overlap between groups", () => {
    const assignedIds = ["a", "b", "c"];
    const groupRequirements: GroupRequirement[] = [
      { key: "g1", count: 1, eligibleAssignedIds: ["a"] },
      { key: "g2", count: 1, eligibleAssignedIds: ["b"] },
      { key: "g3", count: 1, eligibleAssignedIds: ["c"] },
    ];

    const required = findMinimalRequiredSubset(assignedIds, groupRequirements);

    expect(required).toEqual(new Set(["a", "b", "c"]));
  });

  it("requires no one when there are no objective groups", () => {
    const assignedIds = ["a", "b", "c"];

    const required = findMinimalRequiredSubset(assignedIds, []);

    expect(required).toEqual(new Set());
  });
});

function profile(overrides: Partial<CharacterProfile> = {}): CharacterProfile {
  return {
    name: "Test",
    damageProfiles: [],
    traits: [],
    alliance: "Imperial",
    faction: "Ultramarines",
    hasRangedAttack: false,
    ...overrides,
  };
}

function character(id: string, overrides: Partial<RosterCharacter> = {}): RosterCharacter {
  return {
    id,
    rank: Rank.Gold1,
    rarity: Rarity.Epic,
    xpLevel: 0,
    power: null,
    profile: profile(),
    ...overrides,
  };
}

function board(overrides: Partial<ExpeditionBoardEntry> = {}): ExpeditionBoardEntry {
  return {
    expeditionId: overrides.expeditionId ?? "exp",
    id: "op",
    category: "all_vanguard",
    rarity: "Common",
    participants: 1,
    duration: 3600,
    bonusObjectives: [],
    baseRewards: [],
    bonusRewards: [],
    status: "Available",
    ...overrides,
  };
}

describe("solveGreedyFallback", () => {
  it("gives higher-rarity boards first pick of a contested character", () => {
    // Only "flyer" satisfies Trait:Flying and is rank/rarity-eligible for both boards; "filler" is
    // only eligible for the Common board. Boards are processed mythic-first, so the Mythic board
    // should claim "flyer" for its bonus, leaving the Common board to fall back to a plain fill.
    const flyer = character("flyer", {
      rank: Rank.Adamantine2,
      rarity: Rarity.Mythic,
      profile: profile({ traits: ["Flying"] }),
    });
    const filler = character("filler", { rank: Rank.Iron1, rarity: Rarity.Common });
    const objectives = [{ objectiveType: "Trait", objectiveTarget: "Flying" }];
    const mythicBoard = board({ expeditionId: "mythic", rarity: "Mythic", bonusObjectives: objectives });
    const commonBoard = board({ expeditionId: "common", rarity: "Common", bonusObjectives: objectives });

    const result = solveGreedyFallback([commonBoard, mythicBoard], [flyer, filler]);

    const mythicSolution = result.get("mythic")!;
    expect(mythicSolution.bonusCompleted).toBe(true);
    expect(mythicSolution.requiredCharacterIds).toEqual(["flyer"]);

    const commonSolution = result.get("common")!;
    expect(commonSolution.bonusCompleted).toBe(false);
    expect(commonSolution.optionalCharacterIds).toEqual(["filler"]);
    expect([...commonSolution.requiredCharacterIds, ...commonSolution.optionalCharacterIds]).not.toContain("flyer");
  });

  it("credits one character for covering two different objectives in a single pick", () => {
    const duo = character("duo", { profile: profile({ traits: ["Flying"], damageProfiles: ["Bolter"] }) });
    const singleBoard = board({
      bonusObjectives: [
        { objectiveType: "Trait", objectiveTarget: "Flying" },
        { objectiveType: "DamageType", objectiveTarget: "Bolter" },
      ],
    });

    const result = solveGreedyFallback([singleBoard], [duo]);

    const solution = result.get("exp")!;
    expect(solution.bonusCompleted).toBe(true);
    expect(solution.requiredCharacterIds).toEqual(["duo"]);
    expect(solution.optionalCharacterIds).toEqual([]);
  });

  it("falls back to a rank fill that prefers an uncapped character over a higher-rank capped one", () => {
    const cappedHigh = character("cappedHigh", { rank: Rank.Adamantine2, rarity: Rarity.Mythic, xpLevel: 60 }); // xpLevelCap[Mythic] = 60
    const uncappedLow = character("uncappedLow", { rank: Rank.Iron1, rarity: Rarity.Common, xpLevel: 0 });
    const unsolvableBoard = board({ bonusObjectives: [{ objectiveType: "Faction", objectiveTarget: "Necrons" }] });

    const result = solveGreedyFallback([unsolvableBoard], [cappedHigh, uncappedLow]);

    const solution = result.get("exp")!;
    expect(solution.bonusCompleted).toBe(false);
    expect(solution.run).toBe(true);
    expect(solution.optionalCharacterIds).toEqual(["uncappedLow"]);
  });

  it("still uses a capped character when there aren't enough uncapped bodies to fill the slots", () => {
    const cappedHigh = character("cappedHigh", { rank: Rank.Adamantine2, rarity: Rarity.Mythic, xpLevel: 60 });
    const uncappedLow = character("uncappedLow", { rank: Rank.Iron1, rarity: Rarity.Common, xpLevel: 0 });
    const unsolvableBoard = board({
      participants: 2,
      bonusObjectives: [{ objectiveType: "Faction", objectiveTarget: "Necrons" }],
    });

    const result = solveGreedyFallback([unsolvableBoard], [cappedHigh, uncappedLow]);

    const solution = result.get("exp")!;
    expect(solution.run).toBe(true);
    expect(new Set(solution.optionalCharacterIds)).toEqual(new Set(["cappedHigh", "uncappedLow"]));
  });

  it("marks a board unable to run when too few eligible characters remain for its slots", () => {
    const eligible = character("eligible", { rank: Rank.Adamantine2, rarity: Rarity.Mythic });
    const tooWeak1 = character("tooWeak1", { rank: Rank.Iron1, rarity: Rarity.Common });
    const tooWeak2 = character("tooWeak2", { rank: Rank.Iron1, rarity: Rarity.Common });
    const mythicBoard = board({ rarity: "Mythic", participants: 3 });

    const result = solveGreedyFallback([mythicBoard], [eligible, tooWeak1, tooWeak2]);

    expect(result.get("exp")!.run).toBe(false);
  });

  it("leaves a redundant padding character optional rather than required", () => {
    const solver = character("solver", { profile: profile({ traits: ["Flying"] }) });
    const filler = character("filler");
    const twoSlotBoard = board({ participants: 2, bonusObjectives: [{ objectiveType: "Trait", objectiveTarget: "Flying" }] });

    const result = solveGreedyFallback([twoSlotBoard], [solver, filler]);

    const solution = result.get("exp")!;
    expect(solution.requiredCharacterIds).toEqual(["solver"]);
    expect(solution.optionalCharacterIds).toEqual(["filler"]);
  });

  it("fills with the higher-power character over a higher-rank one, once both are uncapped", () => {
    const highRankLowPower = character("highRankLowPower", { rank: Rank.Adamantine2, power: 100 });
    const lowRankHighPower = character("lowRankHighPower", { rank: Rank.Iron1, power: 9999 });
    const unsolvableBoard = board({ bonusObjectives: [{ objectiveType: "Faction", objectiveTarget: "Necrons" }] });

    const result = solveGreedyFallback([unsolvableBoard], [highRankLowPower, lowRankHighPower]);

    expect(result.get("exp")!.optionalCharacterIds).toEqual(["lowRankHighPower"]);
  });

  it("displays optionalCharacterIds sorted by power descending, even when fill preference picked them in the opposite order", () => {
    // fillComparator would place uncappedLow before cappedHigh (uncapped-first tiebreak), but the
    // DISPLAYED order should be a plain power sort, independent of why each character got picked.
    const cappedHigh = character("cappedHigh", { rarity: Rarity.Mythic, xpLevel: 60, power: 9999 });
    const uncappedLow = character("uncappedLow", { rarity: Rarity.Common, xpLevel: 0, power: 1 });
    const twoSlotBoard = board({ participants: 2 });

    const result = solveGreedyFallback([twoSlotBoard], [cappedHigh, uncappedLow]);

    expect(result.get("exp")!.optionalCharacterIds).toEqual(["cappedHigh", "uncappedLow"]);
  });
});

describe("solveBoardAssignment", () => {
  it("prefers assigning the higher-power character when the LP has no other signal to break the tie", () => {
    // A single Common-rarity slot with no bonus objectives and no bonus rewards: every priority
    // tier, xpGain, and runCount all tie between the two candidates, leaving the final powerUsed
    // pass as the only thing that can decide which one gets the slot.
    const weakHero: RawUnit = { id: "ultraTigurius", power: 100 };
    const strongHero: RawUnit = { id: "ultraEliminatorSgt", power: 9999 };
    const openBoard = board({ rarity: "Common", category: "all_vanguard" });

    const { assignment, status } = solveBoardAssignment(
      [openBoard],
      [weakHero, strongHero],
      ["rarity", "intel", "crusadeBomb", "crusadeNpc"],
    );

    expect(status).toBe("ok");
    const solution = assignment.get("exp")!;
    expect(solution.run).toBe(true);
    expect(solution.optionalCharacterIds).toEqual(["ultraEliminatorSgt"]);
  });

  it("orders a board's optionalCharacterIds by power descending", () => {
    const low: RawUnit = { id: "ultraTigurius", power: 50 };
    const mid: RawUnit = { id: "ultraEliminatorSgt", power: 500 };
    const high: RawUnit = { id: "ultraInceptorSgt", power: 5000 };
    const openBoard = board({ rarity: "Common", category: "all_vanguard", participants: 2 });

    const { assignment } = solveBoardAssignment(
      [openBoard],
      [low, mid, high],
      ["rarity", "intel", "crusadeBomb", "crusadeNpc"],
    );

    expect(assignment.get("exp")!.optionalCharacterIds).toEqual(["ultraInceptorSgt", "ultraEliminatorSgt"]);
  });
});
