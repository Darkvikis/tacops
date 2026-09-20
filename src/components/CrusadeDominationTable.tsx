import { FactionBadge, LeaderboardBreakdownCell } from "./crusade-cells";
import { computeCaptureRace, computeConquestProgress, isPlanetRanked } from "../crusade/crusade-domination-view-model";
import type { CrusadePlanet, PlanetLeaderboard } from "../api/types";

const cellClass = "border-b border-black/10 px-3 py-2 align-top dark:border-white/15";

interface CrusadeDominationTableProps {
  planets: CrusadePlanet[];
  leaderboardByPlanet: Map<string, PlanetLeaderboard>;
  onSelectPlanet: (planetId: string) => void;
}

export function CrusadeDominationTable({ planets, leaderboardByPlanet, onSelectPlanet }: CrusadeDominationTableProps) {
  return (
    <table className="mt-4 w-full table-auto border-collapse text-left">
      <thead>
        <tr>
          <th className={cellClass}>Planet</th>
          <th className={cellClass}>Sector</th>
          <th className={cellClass}>Owner</th>
          <th className={cellClass}>Imperial</th>
          <th className={cellClass}>Devastation</th>
          <th className={cellClass}>Side Leaderboard</th>
          <th className={cellClass}>Faction Leaderboard</th>
        </tr>
      </thead>
      <tbody>
        {planets.map((planet) => {
          const leaderboard = leaderboardByPlanet.get(planet.planetId);
          const progress = computeConquestProgress(planet);
          const captureRace = computeCaptureRace(planet);
          const ranked = isPlanetRanked(leaderboard);
          return (
            <tr
              key={planet.planetId}
              onClick={() => onSelectPlanet(planet.planetId)}
              className={`cursor-pointer ${ranked ? "bg-blue-50 dark:bg-blue-950/30" : ""}`}
            >
              <td className={cellClass}>{planet.name}</td>
              <td className={cellClass}>{(planet.zone ?? 0) + 1}</td>
              <td className={cellClass}>{planet.ownedByFaction && <FactionBadge factionId={planet.ownedByFaction} />}</td>
              <td className={cellClass}>
                {progress && (
                  <div className="flex flex-col gap-0.5">
                    <span>
                      {progress.imperialCurrent.toLocaleString()} / {progress.imperialThreshold.toLocaleString()} ({progress.imperialPercent}%)
                    </span>
                    {captureRace?.leadingSide === "Imperial" && (
                      <span className="font-bold italic">{captureRace.pointsRemaining.toLocaleString()} from capture</span>
                    )}
                  </div>
                )}
              </td>
              <td className={cellClass}>
                {progress && (
                  <div className="flex flex-col gap-0.5">
                    <span>
                      {progress.devastationCurrent.toLocaleString()} / {progress.devastationThreshold.toLocaleString()} ({progress.devastationPercent}%)
                    </span>
                    {captureRace?.leadingSide === "Devastation" && (
                      <span className="font-bold italic">{captureRace.pointsRemaining.toLocaleString()} from capture</span>
                    )}
                  </div>
                )}
              </td>
              <td className={cellClass}>
                <LeaderboardBreakdownCell result={leaderboard?.side ?? null} />
              </td>
              <td className={cellClass}>
                <LeaderboardBreakdownCell result={leaderboard?.faction ?? null} />
              </td>
            </tr>
          );
        })}
      </tbody>
    </table>
  );
}
