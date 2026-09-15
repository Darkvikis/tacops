import { Modal } from "./Modal";
import { Icon } from "./Icon";
import { IconBadge } from "./IconBadge";
import { IconRow } from "./IconRow";
import { getObjectiveDisplay } from "../board/board-view-model";
import { allianceIconUrl } from "../board/alliance-icon";
import { operationTypeIconUrl } from "../board/operation-type-icon";
import { rarityIconUrl } from "../rarity/rarity-icon";
import { RarityMapper } from "../rarity/rarity.mapper";
import type { DetailRow } from "../coverage/coverage-view-model";

const cellClass = "border-b border-black/10 px-3 py-2 align-top dark:border-white/15";

// A character with broad, generic eligibility (e.g. any ranged attacker) can be usable in well
// over 100,000 unfiltered instances - computing and sorting that many rows is fast (well under a
// second), but rendering that many <tr> elements is not, and freezes the tab. Narrowing the three
// filters is the intended way to see more; this cap just keeps the modal itself responsive.
const MAX_DISPLAYED_ROWS = 1000;

function rowRarityIconUrl(rarity: string): string {
  const parsed = RarityMapper.stringToRarity(rarity);
  if (parsed === undefined) {
    throw new Error(`Unknown rarity: ${rarity}`);
  }
  return rarityIconUrl(parsed);
}

interface CoverageDetailModalProps {
  characterName: string;
  rows: DetailRow[];
  onClose: () => void;
}

export function CoverageDetailModal({ characterName, rows, onClose }: CoverageDetailModalProps) {
  const displayedRows = rows.slice(0, MAX_DISPLAYED_ROWS);
  const truncated = rows.length > displayedRows.length;

  return (
    <Modal onClose={onClose}>
      <h2 className="text-lg font-semibold">
        {characterName} — {rows.length.toLocaleString()} op instance{rows.length === 1 ? "" : "s"}
      </h2>
      {truncated && (
        <p className="mt-1 text-sm text-neutral-600 dark:text-neutral-400">
          Showing the first {displayedRows.length.toLocaleString()} — narrow the level/rarity/alliance filters to see
          the rest.
        </p>
      )}
      <table className="mt-4 w-full table-auto border-collapse text-left">
        <thead>
          <tr>
            <th className={cellClass}>Level</th>
            <th className={cellClass}>Op</th>
            <th className={cellClass}>Name</th>
            <th className={cellClass}>Rarity</th>
            <th className={cellClass}>Alliance</th>
            <th className={cellClass}># Chars</th>
            <th className={cellClass}>Bonus Objectives</th>
          </tr>
        </thead>
        <tbody>
          {displayedRows.map((row, i) => (
            <tr key={i}>
              <td className={cellClass}>{row.level}</td>
              <td className={cellClass}>
                <Icon src={operationTypeIconUrl(row.opType)} />
              </td>
              <td className={cellClass}>{row.name}</td>
              <td className={cellClass}>
                <Icon src={rowRarityIconUrl(row.rarity)} />
              </td>
              <td className={cellClass}>
                <Icon src={allianceIconUrl(row.alliance)} />
              </td>
              <td className={cellClass}>{row.participants}</td>
              <td className={cellClass}>
                <IconRow>
                  {row.objectives.map((o, oi) => {
                    const display = getObjectiveDisplay(o);
                    if (display.badge === "no-ranged-attack" && display.iconUrl) {
                      return <IconBadge key={oi} src={display.iconUrl} title={display.label} />;
                    }
                    return display.iconUrl ? (
                      <Icon key={oi} src={display.iconUrl} title={display.label} />
                    ) : (
                      <span key={oi}>{display.label}</span>
                    );
                  })}
                </IconRow>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </Modal>
  );
}
