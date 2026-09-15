import { OperationCard } from "./OperationCard";
import { sortByRarityDescending } from "../board/board-view-model";
import type { Environment, ExpeditionBoardEntry, RawUnit } from "../api/types";
import type { BoardAssignmentResult } from "../board/board-solver";

export function OperationsCards({
  board,
  environment,
  assignment,
  solverReady,
  selectedExpeditionId,
  onSelect,
  heroes,
}: {
  board: ExpeditionBoardEntry[];
  environment: Environment;
  assignment: BoardAssignmentResult;
  solverReady: boolean;
  selectedExpeditionId: string | null;
  onSelect: (expeditionId: string) => void;
  heroes: RawUnit[];
}) {
  if (board.length === 0) {
    return <p>No expeditions on the board right now.</p>;
  }

  const sorted = sortByRarityDescending(board);

  return (
    <div className="mt-4 grid w-full grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
      {sorted.map((entry) => (
        <OperationCard
          key={entry.expeditionId}
          entry={entry}
          environment={environment}
          assignment={assignment}
          solverReady={solverReady}
          selectedExpeditionId={selectedExpeditionId}
          onSelect={onSelect}
          heroes={heroes}
        />
      ))}
    </div>
  );
}
