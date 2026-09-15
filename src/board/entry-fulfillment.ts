import { groupObjectives, type BoardAssignmentResult } from "./board-solver";
import { characterSatisfiesObjective } from "./objective-eligibility";
import { entryIsUnavailable } from "./board-view-model";
import { getCharacterProfile } from "../characters/character-profile";
import { isCharacterId } from "../api/fetch-player-data";
import type { ExpeditionBoardEntry } from "../api/types";

// Dispatched/completed boards never went through the solver (solveBoardAssignment filters them
// out via entryIsUnavailable before building the LP), so there's no BoardSolution to look up for
// them - fulfillment has to be recomputed directly from the units that actually got sent, the
// same per-group counting the solver itself uses for bonusCompleted.
function dispatchedUnitsFulfillObjectives(entry: ExpeditionBoardEntry): boolean {
  const groups = groupObjectives(entry.bonusObjectives);
  if (groups.length === 0) return true;

  const profiles = (entry.units ?? []).filter(isCharacterId).map(getCharacterProfile);
  return groups.every(
    (group) => profiles.filter((profile) => characterSatisfiesObjective(profile, group.objective)).length >= group.count,
  );
}

// "unrunnable" only applies to boards that haven't been dispatched yet - a dispatched/completed
// board is by definition already running, so it can only ever be "partial" or "complete".
export type EntryFulfillment = "unrunnable" | "partial" | "complete";

export function getEntryFulfillment(entry: ExpeditionBoardEntry, assignment: BoardAssignmentResult): EntryFulfillment {
  if (entryIsUnavailable(entry)) {
    return dispatchedUnitsFulfillObjectives(entry) ? "complete" : "partial";
  }
  const solution = assignment.get(entry.expeditionId);
  if (!solution?.run) return "unrunnable";
  return solution.bonusCompleted ? "complete" : "partial";
}
