import { Spinner } from "./Spinner";
import { CrusadePlanetsTable } from "./CrusadePlanetsTable";
import { CrusadePlanetsCards } from "./CrusadePlanetsCards";
import type { ViewMode } from "./ViewModeToggle";
import type { CrusadeData, PlanetLeaderboard } from "../api/types";

interface CrusadeTabProps {
  crusadeData: CrusadeData | null;
  planetLeaderboards: PlanetLeaderboard[];
  error: string | null;
  loadingProgress: { done: number; total: number; phase: "side" | "faction" } | null;
  viewMode: ViewMode;
}

export function CrusadeTab({ crusadeData, planetLeaderboards, error, loadingProgress, viewMode }: CrusadeTabProps) {
  if (!crusadeData) {
    return error ? (
      <pre className="mt-4 w-full overflow-x-auto whitespace-pre-wrap rounded border border-red-400 bg-red-50 p-3 text-left text-sm text-red-700 dark:border-red-600 dark:bg-red-950/40 dark:text-red-400">
        {error}
      </pre>
    ) : (
      <p>No crusade data loaded.</p>
    );
  }
  if (crusadeData.activeZone === null) {
    return <p>No crusade zone is currently active (between phases).</p>;
  }

  const leaderboardByPlanet = new Map(planetLeaderboards.map((l) => [l.planetId, l]));
  // Ascending by Faction Leaderboard reference score - a rough "how competitive is this planet"
  // signal (see fetch-crusade-data.ts's pickReferenceScore). Planets with no score yet (still
  // loading, or genuinely no faction leaderboard data) sort last rather than being dropped.
  const activePlanets = crusadeData.planets
    .filter((p) => leaderboardByPlanet.has(p.planetId))
    .sort((a, b) => {
      const scoreA = leaderboardByPlanet.get(a.planetId)?.faction?.referenceScore?.points ?? Infinity;
      const scoreB = leaderboardByPlanet.get(b.planetId)?.faction?.referenceScore?.points ?? Infinity;
      return scoreA - scoreB;
    });

  if (activePlanets.length === 0) {
    return loadingProgress ? (
      <p className="inline-flex items-center gap-2">
        <Spinner />
        {loadingProgress.phase === "side" ? "Loading crusade data..." : "Loading faction rankings..."}{" "}
        {loadingProgress.done}/{loadingProgress.total} planets
      </p>
    ) : (
      <p>No active-zone planet data loaded yet.</p>
    );
  }

  return viewMode === "table" ? (
    <CrusadePlanetsTable planets={activePlanets} leaderboardByPlanet={leaderboardByPlanet} />
  ) : (
    <CrusadePlanetsCards planets={activePlanets} leaderboardByPlanet={leaderboardByPlanet} />
  );
}
