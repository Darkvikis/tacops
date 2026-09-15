import { useState } from "react";
import { CoverageDetailModal } from "./CoverageDetailModal";
import { getCharacterDetailRows, type CoverageFilters } from "../coverage/coverage-view-model";
import type { CharacterCatalogEntry } from "../coverage/coverage-solver";

const cellClass = "border-b border-black/10 px-3 py-2 align-top dark:border-white/15";

type SortKey = "name" | "usable" | "required";
type SortDirection = "asc" | "desc";

interface SortState {
  key: SortKey;
  direction: SortDirection;
}

const DEFAULT_DIRECTION: Record<SortKey, SortDirection> = { name: "asc", usable: "desc", required: "desc" };
const COLUMN_LABEL: Record<SortKey, string> = { name: "Character", usable: "Usable Boards", required: "Required Boards" };

interface CharacterCoverageTableProps {
  catalog: CharacterCatalogEntry[];
  counts: number[]; // "usable" counts, index-aligned with catalog
  requiredCounts: number[]; // "uniquely required" counts, index-aligned with catalog
  filters: CoverageFilters;
  minCoverFlat: Uint8Array;
  characterCount: number;
}

export function CharacterCoverageTable({
  catalog,
  counts,
  requiredCounts,
  filters,
  minCoverFlat,
  characterCount,
}: CharacterCoverageTableProps) {
  const [selectedIndex, setSelectedIndex] = useState<number | null>(null);
  const [sort, setSort] = useState<SortState>({ key: "usable", direction: "desc" });

  function toggleSort(key: SortKey) {
    setSort((current) =>
      current.key === key
        ? { key, direction: current.direction === "asc" ? "desc" : "asc" }
        : { key, direction: DEFAULT_DIRECTION[key] },
    );
  }

  const rows = catalog
    .map((entry, index) => ({ ...entry, index, usable: counts[index] ?? 0, required: requiredCounts[index] ?? 0 }))
    .sort((a, b) => {
      const dir = sort.direction === "asc" ? 1 : -1;
      const primary =
        sort.key === "name"
          ? a.name.localeCompare(b.name)
          : sort.key === "usable"
            ? a.usable - b.usable
            : a.required - b.required;
      if (primary !== 0) return primary * dir;
      return a.name.localeCompare(b.name);
    });

  const selected = selectedIndex === null ? undefined : rows.find((row) => row.index === selectedIndex);

  function sortIndicator(key: SortKey) {
    if (sort.key !== key) return null;
    return <span className="ml-1">{sort.direction === "asc" ? "▲" : "▼"}</span>;
  }

  function sortableHeader(key: SortKey) {
    return (
      <th className={cellClass}>
        <button type="button" className="font-semibold hover:underline" onClick={() => toggleSort(key)}>
          {COLUMN_LABEL[key]}
          {sortIndicator(key)}
        </button>
      </th>
    );
  }

  return (
    <>
      <table className="mt-4 w-full table-auto border-collapse text-left">
        <thead>
          <tr>
            {sortableHeader("name")}
            {sortableHeader("usable")}
            {sortableHeader("required")}
            <th className={cellClass}></th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr key={row.id}>
              <td className={cellClass}>{row.name}</td>
              <td className={cellClass}>{row.usable.toLocaleString()}</td>
              <td className={cellClass}>{row.required.toLocaleString()}</td>
              <td className={cellClass}>
                <button
                  type="button"
                  className="text-blue-600 underline hover:text-blue-800 dark:text-blue-400 dark:hover:text-blue-300"
                  onClick={() => setSelectedIndex(row.index)}
                >
                  Details
                </button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      {selected && (
        <CoverageDetailModal
          characterName={selected.name}
          rows={getCharacterDetailRows(selected.index, filters, minCoverFlat, characterCount)}
          onClose={() => setSelectedIndex(null)}
        />
      )}
    </>
  );
}
