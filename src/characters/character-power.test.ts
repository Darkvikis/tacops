import { describe, expect, it } from "vitest";
import { calculateCharacterPowers } from "./character-power";

function gameConfig(overrides: { unit?: Record<string, unknown> } = {}) {
  return {
    units: {
      lineup: {
        testUnit: {
          name: "Test Unit",
          traits: [],
          weapons: [{ hits: 1, DamageProfile: "Bolter" }],
          activeAbilities: ["activeA"],
          passiveAbilities: ["passiveA"],
          Movement: 16,
          stats: { Health: 100, Damage: 10 },
          upgrades: [],
          upgradesStatIncrease: [],
          ...overrides.unit,
        },
      },
      heroProgressionSteps: [{ unitStatMultiplierPct: 100, abilityPowerMultiplier: 100 }],
      heroProgressionStepsPerUnit: {},
      damageProfileModifiers: { Bolter: 100 },
      abilityPowerCurve: { active: [10, 20], passive: [5, 15] },
      abilityPowerModifiers: {},
      traitPowerModifiers: {},
    },
    items: {},
    upgrades: {},
  };
}

function response(progress: Record<string, unknown> = {}) {
  return {
    player: {
      hero: {
        units: {
          units: {
            testUnit: { progressionIndex: 0, rank: 0, active: 2, passive: 2, upgrades: [], ...progress },
          },
        },
        items: { items: {} },
      },
    },
  };
}

describe("calculateCharacterPowers", () => {
  it("matches the reference implementation's output for a hand-built fixture", () => {
    // Pins the ported algorithm against the original characterPower.mjs - this exact number was
    // captured by running the same fixture through both implementations.
    const result = calculateCharacterPowers(response(), gameConfig());

    expect(result).toEqual([{ unitId: "testUnit", name: "Test Unit", power: 3514 }]);
  });

  it("gives a higher-rank character more power than an otherwise-identical lower-rank one", () => {
    const lowRank = calculateCharacterPowers(response({ rank: 0 }), gameConfig())[0];
    const highRankConfig = gameConfig({
      unit: {
        upgrades: [["hpUpgrade"]],
        upgradesStatIncrease: [[50]],
      },
    });
    const highRank = calculateCharacterPowers(response({ rank: 1 }), {
      ...highRankConfig,
      upgrades: { hpUpgrade: { statType: "hp" } },
    })[0];

    expect(highRank.power).toBeGreaterThan(lowRank.power);
  });

  it("omits Machines of War", () => {
    const result = calculateCharacterPowers(
      response(),
      gameConfig({ unit: { traits: ["MachineOfWar"] } }),
    );

    expect(result).toEqual([]);
  });

  it("throws when the response references a unit missing from the bundled config", () => {
    const withUnknownUnit = response();
    (withUnknownUnit.player.hero.units.units as Record<string, unknown>).unknownUnit = {
      progressionIndex: 0,
      rank: 0,
      active: 1,
      passive: 1,
    };

    expect(() => calculateCharacterPowers(withUnknownUnit, gameConfig())).toThrow(/unknownUnit/);
  });
});
