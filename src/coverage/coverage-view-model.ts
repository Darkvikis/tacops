import {
  UNREACHABLE,
  comboCountForOp,
  enumerateCombos,
  getGlobalMaxLevel,
  getOperations,
  type OperationRecord,
} from "./coverage-solver";
import { RarityMapper } from "../rarity/rarity.mapper";
import type { BonusObjective } from "../api/types";

export interface CoverageFilters {
  level: number | null;
  rarity: string | null;
  alliance: string | null;
}

function opPassesFilter(op: OperationRecord, filters: CoverageFilters): boolean {
  if (filters.rarity !== null && op.rarity !== filters.rarity) return false;
  if (filters.alliance !== null && op.alliance !== filters.alliance) return false;
  return true;
}

// Number of distinct board levels this op contributes under the current level filter - either its
// full bracket (levels dropdown = "None") or just the one selected level, if it falls in range.
function levelCountForOp(op: OperationRecord, filters: CoverageFilters): number {
  const maxLevel = op.conditionBoardMaxLevel ?? getGlobalMaxLevel();
  const minLevel = op.conditionBoardMinLevel;
  if (filters.level !== null) {
    return filters.level >= minLevel && filters.level <= maxLevel ? 1 : 0;
  }
  return Math.max(0, maxLevel - minLevel + 1);
}

function levelsForOp(op: OperationRecord, filters: CoverageFilters): number[] {
  const maxLevel = op.conditionBoardMaxLevel ?? getGlobalMaxLevel();
  const minLevel = op.conditionBoardMinLevel;
  if (filters.level !== null) {
    return filters.level >= minLevel && filters.level <= maxLevel ? [filters.level] : [];
  }
  return Array.from({ length: Math.max(0, maxLevel - minLevel + 1) }, (_, i) => minLevel + i);
}

export interface CoverageResult {
  totalInstances: number;
  characterCounts: number[]; // "usable" count, index-aligned with the character catalog
  requiredCounts: number[]; // "uniquely required" count, index-aligned with the character catalog
}

// Above-the-table total: pure filter arithmetic (level/rarity/alliance only), independent of
// whether any combo is actually solvable by the roster.
export function computeCoverageResult(
  filters: CoverageFilters,
  minCoverFlat: Uint8Array,
  requiredThresholdFlat: Uint8Array,
  dpFullByCombo: Uint8Array,
  characterCount: number,
): CoverageResult {
  const operations = getOperations();
  const opById = new Map(operations.map((op) => [op.id, op]));

  let totalInstances = 0;
  for (const op of operations) {
    if (!opPassesFilter(op, filters)) continue;
    const levels = levelCountForOp(op, filters);
    if (levels === 0) continue;
    const participants = op.participantsMax - op.participantsMin + 1;
    totalInstances += levels * participants * comboCountForOp(op);
  }

  const characterCounts = new Array<number>(characterCount).fill(0);
  const requiredCounts = new Array<number>(characterCount).fill(0);
  const combos = enumerateCombos(operations);
  combos.forEach((combo, comboIndex) => {
    const op = opById.get(combo.opId);
    if (!op || !opPassesFilter(op, filters)) return;
    const levels = levelCountForOp(op, filters);
    if (levels === 0) return;

    const rowOffset = comboIndex * characterCount;
    const dpFull = dpFullByCombo[comboIndex];
    for (let charIndex = 0; charIndex < characterCount; charIndex++) {
      const minCover = minCoverFlat[rowOffset + charIndex];
      if (minCover === UNREACHABLE) continue; // never a candidate for this combo at all

      if (minCover <= op.participantsMax) {
        const bFloor = Math.max(minCover, op.participantsMin);
        const contributionCount = op.participantsMax - bFloor + 1;
        if (contributionCount > 0) {
          characterCounts[charIndex] += levels * contributionCount;
        }
      }

      // Required for squad size b iff the combo is solvable at all (dpFull <= b) and excluding
      // this character specifically pushes the minimum needed above b (requiredThreshold > b).
      // requiredThreshold's UNREACHABLE sentinel (255) behaves like +Infinity in this min/max
      // arithmetic without needing a special case, since real participant counts are tiny.
      const requiredThreshold = requiredThresholdFlat[rowOffset + charIndex];
      const requiredLo = Math.max(dpFull, op.participantsMin);
      const requiredHi = Math.min(op.participantsMax, requiredThreshold - 1);
      const requiredCount = requiredHi - requiredLo + 1;
      if (requiredCount > 0) {
        requiredCounts[charIndex] += levels * requiredCount;
      }
    }
  });

  return { totalInstances, characterCounts, requiredCounts };
}

export interface DetailRow {
  level: number;
  rarity: string;
  opType: string;
  name: string;
  alliance?: string;
  participants: number;
  objectives: BonusObjective[];
}

function compareObjective(a: BonusObjective, b: BonusObjective): number {
  if (a.objectiveType !== b.objectiveType) return a.objectiveType < b.objectiveType ? -1 : 1;
  const aTarget = a.objectiveTarget ?? "";
  const bTarget = b.objectiveTarget ?? "";
  if (aTarget !== bTarget) return aTarget < bTarget ? -1 : 1;
  return 0;
}

function compareObjectiveLists(a: BonusObjective[], b: BonusObjective[]): number {
  const len = Math.min(a.length, b.length);
  for (let i = 0; i < len; i++) {
    const cmp = compareObjective(a[i], b[i]);
    if (cmp !== 0) return cmp;
  }
  return a.length - b.length;
}

function rarityRank(rarity: string): number {
  return RarityMapper.stringToRarity(rarity) ?? -1;
}

// Sort: level desc, then rarity desc, then name asc, then participant count asc, then bonus
// objectives compared lexicographically (each row's own objective list sorted by type/target first
// so the comparison is order-independent of how the combo happened to be enumerated).
function sortDetailRows(rows: DetailRow[]): DetailRow[] {
  return rows
    .map((row) => ({ row, sortedObjectives: [...row.objectives].sort(compareObjective) }))
    .sort((a, b) => {
      if (a.row.level !== b.row.level) return b.row.level - a.row.level;
      const rarityDiff = rarityRank(b.row.rarity) - rarityRank(a.row.rarity);
      if (rarityDiff !== 0) return rarityDiff;
      if (a.row.name !== b.row.name) return a.row.name < b.row.name ? -1 : 1;
      if (a.row.participants !== b.row.participants) return a.row.participants - b.row.participants;
      return compareObjectiveLists(a.sortedObjectives, b.sortedObjectives);
    })
    .map((x) => x.row);
}

// Expands one character's usable combos into literal instance rows (no deduplication - the user
// wants every distinct level/participant-count/combo tuple shown separately, even when several
// look identical). Bounded by that character's own usable-instance count, not the full dataset, so
// this runs synchronously on click rather than needing the worker.
export function getCharacterDetailRows(
  characterIndex: number,
  filters: CoverageFilters,
  minCoverFlat: Uint8Array,
  characterCount: number,
): DetailRow[] {
  const operations = getOperations();
  const opById = new Map(operations.map((op) => [op.id, op]));
  const combos = enumerateCombos(operations);
  const rows: DetailRow[] = [];

  combos.forEach((combo, comboIndex) => {
    const op = opById.get(combo.opId);
    if (!op || !opPassesFilter(op, filters)) return;
    const minCover = minCoverFlat[comboIndex * characterCount + characterIndex];
    if (minCover === UNREACHABLE || minCover > op.participantsMax) return;

    const levels = levelsForOp(op, filters);
    const bFloor = Math.max(minCover, op.participantsMin);
    for (const level of levels) {
      for (let participants = bFloor; participants <= op.participantsMax; participants++) {
        rows.push({
          level,
          rarity: op.rarity,
          opType: op.type,
          name: op.name,
          alliance: op.alliance,
          participants,
          objectives: combo.objectives,
        });
      }
    }
  });

  return sortDetailRows(rows);
}
