import type { ReactNode } from "react";
import { Icon } from "./Icon";
import { IconRow } from "./IconRow";
import { AllianceCategoryBadge } from "./AllianceCategoryBadge";
import { entryRarityIconUrl } from "../board/board-view-model";
import { operationName } from "../board/operation-name";
import { deployIconUrl } from "../board/deploy-icon";
import type { EntryFulfillment } from "../board/entry-fulfillment";
import type { Environment, ExpeditionBoardEntry } from "../api/types";

interface OpsCardFrameProps {
  entry: ExpeditionBoardEntry;
  environment: Environment;
  children: ReactNode;
  corner: ReactNode;
  dimmed: boolean;
  fulfillment: EntryFulfillment | null;
  onClick: () => void;
}

// null = fulfillment isn't known yet (solver hasn't produced a result for the current board) -
// stay neutral rather than guessing. "unrunnable" (can't be run at all) is red, "partial" (runs
// but misses a bonus objective) is amber, "complete" (runs and hits every bonus objective) is
// green.
function borderClass(fulfillment: EntryFulfillment | null): string {
  if (fulfillment === "complete") return "border-2 border-green-700/60 dark:border-green-500/60";
  if (fulfillment === "partial") return "border-2 border-amber-700/60 dark:border-amber-500/60";
  if (fulfillment === "unrunnable") return "border-2 border-red-700/60 dark:border-red-500/60";
  return "border border-black/10 dark:border-white/15";
}

export function OpsCardFrame({ entry, environment, children, corner, dimmed, fulfillment, onClick }: OpsCardFrameProps) {
  const name = operationName(entry.id);

  return (
    <div
      onClick={(e) => {
        e.stopPropagation();
        onClick();
      }}
      className={`flex cursor-pointer flex-col gap-2 rounded-lg ${borderClass(fulfillment)} bg-white p-3 text-left shadow-sm transition-opacity dark:bg-neutral-900/40 ${dimmed ? "opacity-20" : ""}`}
    >
      <div className="flex justify-center">
        <IconRow>
          <Icon src={entryRarityIconUrl(entry)} />
          <AllianceCategoryBadge entry={entry} />
          <span className="font-medium">
            {name ?? entry.id}
            {environment === "qa" && name && <span className="opacity-60"> ({entry.id})</span>}
          </span>
        </IconRow>
      </div>
      <div className="flex flex-col gap-2">{children}</div>
      <div className="mt-auto flex items-center justify-between gap-2 pt-1">
        <span className="inline-flex items-center gap-1">
          <Icon src={deployIconUrl()} title="Participants" />
          {entry.participants}
        </span>
        {corner}
      </div>
    </div>
  );
}
