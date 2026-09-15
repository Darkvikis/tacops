import { useEffect, useMemo, useRef, useState } from "react";
import { Spinner } from "./Spinner";
import { CharacterCoverageTable } from "./CharacterCoverageTable";
import { getCharacterCatalog, getGlobalMaxLevel } from "../coverage/coverage-solver";
import { computeCoverageResult, type CoverageFilters } from "../coverage/coverage-view-model";
import { RarityString } from "../rarity/rarity.enum";
import type { CoverageSolveRequest, CoverageSolveResponse } from "../coverage/coverage-solver.worker";

const ALLIANCES = ["Imperial", "Chaos", "Xenos"] as const;
const RARITIES = Object.values(RarityString);
const selectClass = "rounded border border-black/20 bg-white px-1 py-0.5 text-sm dark:border-white/20 dark:bg-neutral-900";

interface CoverageData {
  minCoverFlat: Uint8Array;
  requiredThresholdFlat: Uint8Array;
  dpFullByCombo: Uint8Array;
  characterCount: number;
}

export function BoardCoverageTab() {
  const [level, setLevel] = useState<number | null>(null);
  const [rarity, setRarity] = useState<string | null>(null);
  const [alliance, setAlliance] = useState<string | null>(null);
  const [data, setData] = useState<CoverageData | null>(null);
  const [error, setError] = useState<string | null>(null);
  const requestIdRef = useRef(0);

  // Mirrors board-solver's worker lifecycle: kick off the heavy computation once, off the main
  // thread, and terminate it on unmount. Unlike the board solver this has no live inputs to react
  // to (it's derived entirely from static game-data JSON), so it only ever runs once per mount.
  useEffect(() => {
    requestIdRef.current += 1;
    const requestId = requestIdRef.current;
    const worker = new Worker(new URL("../coverage/coverage-solver.worker.ts", import.meta.url), { type: "module" });

    worker.onmessage = (event: MessageEvent<CoverageSolveResponse>) => {
      if (event.data.requestId !== requestIdRef.current) return; // stale, ignore
      if (event.data.status === "success") {
        setData({
          minCoverFlat: event.data.minCoverFlat,
          requiredThresholdFlat: event.data.requiredThresholdFlat,
          dpFullByCombo: event.data.dpFullByCombo,
          characterCount: event.data.characterCount,
        });
        setError(null);
      } else {
        setError(event.data.error);
      }
    };

    const request: CoverageSolveRequest = { requestId };
    worker.postMessage(request);

    return () => worker.terminate();
  }, []);

  const catalog = useMemo(() => getCharacterCatalog(), []);
  const globalMaxLevel = useMemo(() => getGlobalMaxLevel(), []);
  const filters: CoverageFilters = useMemo(() => ({ level, rarity, alliance }), [level, rarity, alliance]);

  const result = useMemo(() => {
    if (!data) return null;
    return computeCoverageResult(filters, data.minCoverFlat, data.requiredThresholdFlat, data.dpFullByCombo, data.characterCount);
  }, [data, filters]);

  return (
    <div className="text-left">
      <div className="mt-4 flex flex-wrap items-center gap-4">
        <label className="flex items-center gap-1.5">
          <span className="text-sm">Board level:</span>
          <select
            className={selectClass}
            value={level ?? ""}
            onChange={(e) => setLevel(e.target.value === "" ? null : Number(e.target.value))}
          >
            <option value="">None</option>
            {Array.from({ length: globalMaxLevel }, (_, i) => i + 1).map((lvl) => (
              <option key={lvl} value={lvl}>
                {lvl}
              </option>
            ))}
          </select>
        </label>
        <label className="flex items-center gap-1.5">
          <span className="text-sm">Rarity:</span>
          <select className={selectClass} value={rarity ?? ""} onChange={(e) => setRarity(e.target.value || null)}>
            <option value="">None</option>
            {RARITIES.map((r) => (
              <option key={r} value={r}>
                {r}
              </option>
            ))}
          </select>
        </label>
        <label className="flex items-center gap-1.5">
          <span className="text-sm">Alliance:</span>
          <select className={selectClass} value={alliance ?? ""} onChange={(e) => setAlliance(e.target.value || null)}>
            <option value="">None</option>
            {ALLIANCES.map((a) => (
              <option key={a} value={a}>
                {a}
              </option>
            ))}
          </select>
        </label>
      </div>

      {error && <p className="mt-2 text-red-600 dark:text-red-400">Couldn't compute board coverage: {error}</p>}

      {!data && !error && (
        <div className="mt-4 inline-flex items-center gap-2">
          <Spinner /> Computing board coverage...
        </div>
      )}

      {result && (
        <>
          <p className="mt-4 font-medium">{result.totalInstances.toLocaleString()} op instances match these filters.</p>
          <CharacterCoverageTable
            catalog={catalog}
            counts={result.characterCounts}
            requiredCounts={result.requiredCounts}
            filters={filters}
            minCoverFlat={data!.minCoverFlat}
            characterCount={data!.characterCount}
          />
        </>
      )}
    </div>
  );
}
