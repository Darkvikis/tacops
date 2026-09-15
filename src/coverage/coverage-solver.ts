import characterData from "../assets/character-data.json";
import operationsData from "../assets/operations-data.json";
import { groupObjectives } from "../board/board-solver";
import { characterSatisfiesObjective } from "../board/objective-eligibility";
import { getCharacterProfile, type CharacterProfile } from "../characters/character-profile";
import type { BonusObjective } from "../api/types";

// Sentinel for "unreachable" / "not usable" in the Uint8Array outputs below. Real values are
// always small (bounded by a combo's objective count, which maxes out at 7 in this dataset), so a
// single byte is plenty and 255 can never collide with a real answer.
export const UNREACHABLE = 255;

export interface OperationRecord {
  id: string;
  name: string;
  type: string;
  rarity: string;
  alliance?: string;
  conditionBoardMinLevel: number;
  conditionBoardMaxLevel?: number;
  participantsMin: number;
  participantsMax: number;
  objectivesMin: number;
  objectivesMax: number;
  objectives: BonusObjective[];
  icon: string;
}

const operations = operationsData as OperationRecord[];

export interface CharacterCatalogEntry {
  id: string;
  name: string;
}

const characterCatalog: CharacterCatalogEntry[] = (characterData as { id: string; name: string }[]).map((c) => ({
  id: c.id,
  name: c.name,
}));

export function getOperations(): OperationRecord[] {
  return operations;
}

export function getCharacterCatalog(): CharacterCatalogEntry[] {
  return characterCatalog;
}

// 312 of 553 operations have no conditionBoardMaxLevel (an open-ended top bracket). The cap must
// be at least as large as the highest conditionBoardMinLevel seen (11), or those brackets would
// resolve to an empty/invalid range - see the plan's "Global level cap" note.
export function getGlobalMaxLevel(): number {
  return operations.reduce((max, op) => Math.max(max, op.conditionBoardMaxLevel ?? 0, op.conditionBoardMinLevel), 0);
}

function binomial(n: number, k: number): number {
  if (k < 0 || k > n) return 0;
  let result = 1;
  for (let i = 0; i < k; i++) {
    result = (result * (n - i)) / (i + 1);
  }
  return Math.round(result);
}

export function comboCountForOp(op: OperationRecord): number {
  const n = op.objectives.length;
  let total = 0;
  for (let k = op.objectivesMin; k <= op.objectivesMax; k++) {
    total += binomial(n, k);
  }
  return total;
}

// Standard iterative index-combination generator: yields every k-sized selection of `items`, in
// lexicographic index order.
function* combinations<T>(items: T[], k: number): Generator<T[]> {
  const n = items.length;
  if (k < 0 || k > n) return;
  const indices = Array.from({ length: k }, (_, i) => i);
  while (true) {
    yield indices.map((i) => items[i]);
    let i = k - 1;
    while (i >= 0 && indices[i] === n - k + i) i--;
    if (i < 0) return;
    indices[i]++;
    for (let j = i + 1; j < k; j++) indices[j] = indices[j - 1] + 1;
  }
}

export interface ComboMeta {
  opId: string;
  objectives: BonusObjective[];
}

// Pure and deterministic over the static operations-data.json import, so both the worker (which
// needs combo indices to line up with minCoverFlat rows) and the main thread (which needs combo
// metadata to filter/display) can call this independently and get identical results without
// having to ship the combo list itself across postMessage.
export function enumerateCombos(ops: OperationRecord[] = operations): ComboMeta[] {
  const combos: ComboMeta[] = [];
  for (const op of ops) {
    for (let k = op.objectivesMin; k <= op.objectivesMax; k++) {
      for (const objectives of combinations(op.objectives, k)) {
        combos.push({ opId: op.id, objectives });
      }
    }
  }
  return combos;
}

interface ComboGroups {
  fullMask: number;
  groupBitmasks: number[];
  groupCondition: BonusObjective[];
}

// Expands each duplicate-objective group into its own run of `count` consecutive bit positions -
// slots within a group are interchangeable (any of them can be "the one" a given character
// claims), so which specific bit represents which pool entry doesn't matter.
function buildComboGroups(objectives: BonusObjective[]): ComboGroups {
  const groups = groupObjectives(objectives);
  const groupBitmasks: number[] = [];
  const groupCondition: BonusObjective[] = [];
  let bitCursor = 0;
  for (const group of groups) {
    let mask = 0;
    for (let i = 0; i < group.count; i++) {
      mask |= 1 << bitCursor;
      bitCursor++;
    }
    groupBitmasks.push(mask);
    groupCondition.push(group.objective);
  }
  const fullMask = bitCursor === 0 ? 0 : (1 << bitCursor) - 1;
  return { fullMask, groupBitmasks, groupCondition };
}

// A character can simultaneously claim one slot from every DIFFERENT group it's eligible for
// (covering several distinct objectives at once is free), but at most one slot within any single
// group (duplicate copies of the same objective still need distinct characters). Grabbing every
// available group in one step is always at least as good as holding back, so this greedy
// "maximal claim" is the correct per-step DP transition, not just an approximation.
function contribution(mask: number, eligibleGroupsMask: number, groupBitmasks: number[]): number {
  let add = 0;
  for (let g = 0; g < groupBitmasks.length; g++) {
    if ((eligibleGroupsMask & (1 << g)) === 0) continue;
    const uncovered = groupBitmasks[g] & ~mask;
    if (uncovered !== 0) {
      add |= uncovered & -uncovered; // lowest still-uncovered slot in this group
    }
  }
  return add;
}

// dp[mask] = minimum number of characters (drawn from `masks`, one distinct eligibility pattern
// per candidate) needed to go from `startMask` to `mask`. Ascending numeric mask order is a valid
// topological order here because contribution() only ever sets bits (mask | add >= mask), so every
// predecessor of a mask is numerically smaller and therefore already finalized by the time that
// mask's turn comes up.
function computeDpFrom(masks: number[], groupBitmasks: number[], fullMask: number, startMask: number): Uint8Array {
  const size = fullMask + 1;
  const dp = new Uint8Array(size).fill(UNREACHABLE);
  dp[startMask] = 0;
  for (let mask = startMask; mask < size; mask++) {
    if (dp[mask] === UNREACHABLE) continue;
    for (const eligibleGroupsMask of masks) {
      const add = contribution(mask, eligibleGroupsMask, groupBitmasks);
      if (add === 0) continue;
      const next = mask | add;
      if (dp[mask] + 1 < dp[next]) {
        dp[next] = dp[mask] + 1;
      }
    }
  }
  return dp;
}

interface RelevantCharacter {
  index: number;
  eligibleGroupsMask: number;
}

export interface ComboSolveResult {
  minCoverByCharacterIndex: Uint8Array;
  // Minimum active-contributor count achievable using every OTHER relevant character - i.e. what
  // the combo's cover cost becomes if this one specific character is taken off the table entirely.
  // UNREACHABLE if nobody else can replace it.
  requiredThresholdByCharacterIndex: Uint8Array;
  // The combo's true unconstrained minimum cover size (0 if it has no objectives, UNREACHABLE if
  // nobody in the roster can help at all).
  dpFull: number;
}

// For every character with a nonzero eligibility mask against this combo, computes the minimum
// number of ACTIVELY CONTRIBUTING characters (including that character) needed to cover every
// objective slot. Characters that touch none of this combo's conditions are left at UNREACHABLE -
// they're never counted, matching "they have to cover at least one objective to be in the output".
export function solveCombo(
  objectives: BonusObjective[],
  profiles: CharacterProfile[],
  requiredAlliance?: string,
): ComboSolveResult {
  const { fullMask, groupBitmasks, groupCondition } = buildComboGroups(objectives);
  const minCoverByCharacterIndex = new Uint8Array(profiles.length).fill(UNREACHABLE);
  const requiredThresholdByCharacterIndex = new Uint8Array(profiles.length).fill(UNREACHABLE);
  if (fullMask === 0) {
    return { minCoverByCharacterIndex, requiredThresholdByCharacterIndex, dpFull: 0 }; // no objectives (shouldn't occur in real data)
  }

  const relevant: RelevantCharacter[] = [];
  profiles.forEach((profile, index) => {
    // Matches board-solver.ts's isEligibleForBoard: a character can only be deployed to an
    // alliance-restricted op if its own alliance matches, regardless of which objectives it
    // could otherwise satisfy.
    if (requiredAlliance !== undefined && profile.alliance !== requiredAlliance) return;
    let eligibleGroupsMask = 0;
    for (let g = 0; g < groupCondition.length; g++) {
      if (characterSatisfiesObjective(profile, groupCondition[g])) {
        eligibleGroupsMask |= 1 << g;
      }
    }
    if (eligibleGroupsMask !== 0) {
      relevant.push({ index, eligibleGroupsMask });
    }
  });
  if (relevant.length === 0) {
    return { minCoverByCharacterIndex, requiredThresholdByCharacterIndex, dpFull: UNREACHABLE }; // nobody satisfies anything here
  }

  const distinctMasks = [...new Set(relevant.map((c) => c.eligibleGroupsMask))];

  let dpFull = UNREACHABLE;
  for (const candidate of relevant) {
    const initialMask = contribution(0, candidate.eligibleGroupsMask, groupBitmasks);
    const dpFromCandidate = computeDpFrom(distinctMasks, groupBitmasks, fullMask, initialMask);
    const remaining = dpFromCandidate[fullMask];
    if (remaining === UNREACHABLE) continue;
    const total = 1 + remaining;
    if (total < minCoverByCharacterIndex[candidate.index]) {
      minCoverByCharacterIndex[candidate.index] = total;
    }
    if (total < dpFull) {
      dpFull = total;
    }
  }

  // The DP that finds the global optimum already tells us who's usable; a character is REQUIRED
  // (not just usable) only if the combo becomes unreachable, or needs strictly more characters,
  // once that specific individual is excluded from the candidate pool.
  for (const candidate of relevant) {
    const masksExcludingCandidate = [
      ...new Set(relevant.filter((c) => c.index !== candidate.index).map((c) => c.eligibleGroupsMask)),
    ];
    const dpWithoutCandidate = computeDpFrom(masksExcludingCandidate, groupBitmasks, fullMask, 0);
    requiredThresholdByCharacterIndex[candidate.index] = dpWithoutCandidate[fullMask];
  }

  return { minCoverByCharacterIndex, requiredThresholdByCharacterIndex, dpFull };
}

export interface CoverageSolution {
  minCoverFlat: Uint8Array; // row-major: comboIndex * characterCount + charIndex
  requiredThresholdFlat: Uint8Array; // same layout as minCoverFlat
  dpFullByCombo: Uint8Array; // one entry per combo
  characterCount: number;
}

export function solveCoverage(): CoverageSolution {
  const catalog = getCharacterCatalog();
  const profiles = catalog.map((c) => getCharacterProfile(c.id));
  const combos = enumerateCombos();
  const opById = new Map(operations.map((op) => [op.id, op]));

  const minCoverFlat = new Uint8Array(combos.length * catalog.length).fill(UNREACHABLE);
  const requiredThresholdFlat = new Uint8Array(combos.length * catalog.length).fill(UNREACHABLE);
  const dpFullByCombo = new Uint8Array(combos.length).fill(UNREACHABLE);
  combos.forEach((combo, comboIndex) => {
    const op = opById.get(combo.opId);
    const { minCoverByCharacterIndex, requiredThresholdByCharacterIndex, dpFull } = solveCombo(
      combo.objectives,
      profiles,
      op?.alliance,
    );
    const offset = comboIndex * catalog.length;
    minCoverFlat.set(minCoverByCharacterIndex, offset);
    requiredThresholdFlat.set(requiredThresholdByCharacterIndex, offset);
    dpFullByCombo[comboIndex] = dpFull;
  });

  return { minCoverFlat, requiredThresholdFlat, dpFullByCombo, characterCount: catalog.length };
}
