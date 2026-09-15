import { describe, expect, it } from "vitest";
import { solveCombo, UNREACHABLE } from "./coverage-solver";
import type { CharacterProfile } from "../characters/character-profile";
import type { BonusObjective } from "../api/types";

function profile(overrides: Partial<CharacterProfile>): CharacterProfile {
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

describe("solveCombo", () => {
  it("lets one character cover two different objectives at once, but not two copies of the same one", () => {
    // objectives: [Flying, Flying, DamageType:Bolter]
    const objectives: BonusObjective[] = [
      { objectiveType: "Trait", objectiveTarget: "Flying" },
      { objectiveType: "Trait", objectiveTarget: "Flying" },
      { objectiveType: "DamageType", objectiveTarget: "Bolter" },
    ];
    // index 0 = Dante (Flying only), index 1 = Bellator (Flying + Bolter)
    const profiles: CharacterProfile[] = [
      profile({ name: "Dante", traits: ["Flying"] }),
      profile({ name: "Bellator", traits: ["Flying"], damageProfiles: ["Bolter"] }),
    ];

    const { minCoverByCharacterIndex } = solveCombo(objectives, profiles);

    // Dante alone can't cover both Flying slots, but combined with Bellator (who simultaneously
    // covers the other Flying slot AND Bolter) only 2 distinct characters are needed.
    expect(minCoverByCharacterIndex[0]).toBe(2); // Dante usable, minimum total including him is 2
    expect(minCoverByCharacterIndex[1]).toBe(2); // Bellator usable, minimum total including him is 2
  });

  it("marks a character unreachable if it satisfies none of the combo's objectives", () => {
    const objectives: BonusObjective[] = [{ objectiveType: "Trait", objectiveTarget: "Flying" }];
    const profiles: CharacterProfile[] = [profile({ traits: ["Psyker"] })];

    const { minCoverByCharacterIndex } = solveCombo(objectives, profiles);

    expect(minCoverByCharacterIndex[0]).toBe(UNREACHABLE);
  });

  it("marks every character unreachable when nobody in the roster satisfies a condition", () => {
    const objectives: BonusObjective[] = [
      { objectiveType: "Trait", objectiveTarget: "Flying" },
      { objectiveType: "Faction", objectiveTarget: "Necrons" },
    ];
    // Nobody has the Necrons faction, so the combo is unsolvable regardless of who covers Flying.
    const profiles: CharacterProfile[] = [profile({ traits: ["Flying"], faction: "Ultramarines" })];

    const { minCoverByCharacterIndex } = solveCombo(objectives, profiles);

    expect(minCoverByCharacterIndex[0]).toBe(UNREACHABLE);
  });

  it("excludes a character whose alliance doesn't match the op's alliance requirement, even if it satisfies the objective", () => {
    const objectives: BonusObjective[] = [{ objectiveType: "Trait", objectiveTarget: "Flying" }];
    const profiles: CharacterProfile[] = [profile({ traits: ["Flying"], alliance: "Chaos" })];

    expect(solveCombo(objectives, profiles, "Imperial").minCoverByCharacterIndex[0]).toBe(UNREACHABLE);
    expect(solveCombo(objectives, profiles, undefined).minCoverByCharacterIndex[0]).toBe(1);
    expect(solveCombo(objectives, profiles, "Chaos").minCoverByCharacterIndex[0]).toBe(1);
  });

  it("requires two distinct characters for two duplicate objectives even if a third condition is unused", () => {
    const objectives: BonusObjective[] = [
      { objectiveType: "Trait", objectiveTarget: "Flying" },
      { objectiveType: "Trait", objectiveTarget: "Flying" },
    ];
    const profiles: CharacterProfile[] = [
      profile({ name: "A", traits: ["Flying"] }),
      profile({ name: "B", traits: ["Flying"] }),
    ];

    const { minCoverByCharacterIndex } = solveCombo(objectives, profiles);

    expect(minCoverByCharacterIndex[0]).toBe(2);
    expect(minCoverByCharacterIndex[1]).toBe(2);
  });

  it("marks redundant Flying-coverage as replaceable but the sole Bolter-coverer as required", () => {
    // [Flying, Flying, DamageType:Bolter] with a THIRD Flying-only character added to the
    // Dante/Bellator example. Dante and ThirdFlyer are interchangeable for the two Flying slots
    // (either can be swapped for the other), so neither is individually required. But Bellator is
    // the ONLY character who can cover Bolter - without him, Dante+ThirdFlyer can only ever cover
    // the two Flying slots, leaving Bolter permanently uncovered.
    const objectives: BonusObjective[] = [
      { objectiveType: "Trait", objectiveTarget: "Flying" },
      { objectiveType: "Trait", objectiveTarget: "Flying" },
      { objectiveType: "DamageType", objectiveTarget: "Bolter" },
    ];
    const profiles: CharacterProfile[] = [
      profile({ name: "Dante", traits: ["Flying"] }),
      profile({ name: "Bellator", traits: ["Flying"], damageProfiles: ["Bolter"] }),
      profile({ name: "ThirdFlyer", traits: ["Flying"] }),
    ];

    const { dpFull, requiredThresholdByCharacterIndex } = solveCombo(objectives, profiles);

    expect(dpFull).toBe(2); // still solvable with 2 characters
    expect(requiredThresholdByCharacterIndex[0]).not.toBe(UNREACHABLE); // Dante is replaceable by ThirdFlyer
    expect(requiredThresholdByCharacterIndex[1]).toBe(UNREACHABLE); // Bellator is the sole Bolter-coverer
    expect(requiredThresholdByCharacterIndex[2]).not.toBe(UNREACHABLE); // ThirdFlyer is replaceable by Dante
  });

  it("marks the sole solver as required when there's no redundancy", () => {
    const objectives: BonusObjective[] = [{ objectiveType: "Trait", objectiveTarget: "Flying" }];
    const profiles: CharacterProfile[] = [profile({ name: "OnlyFlyer", traits: ["Flying"] })];

    const { dpFull, requiredThresholdByCharacterIndex } = solveCombo(objectives, profiles);

    expect(dpFull).toBe(1);
    expect(requiredThresholdByCharacterIndex[0]).toBe(UNREACHABLE); // nobody else can replace them
  });

  it("marks neither of two mask-twins as required, since either can cover the shared slot", () => {
    const objectives: BonusObjective[] = [{ objectiveType: "Trait", objectiveTarget: "Flying" }];
    const profiles: CharacterProfile[] = [
      profile({ name: "A", traits: ["Flying"] }),
      profile({ name: "B", traits: ["Flying"] }),
    ];

    const { dpFull, requiredThresholdByCharacterIndex } = solveCombo(objectives, profiles);

    expect(dpFull).toBe(1);
    expect(requiredThresholdByCharacterIndex[0]).toBe(1); // still solvable (by B) with A excluded
    expect(requiredThresholdByCharacterIndex[1]).toBe(1); // still solvable (by A) with B excluded
  });
});
