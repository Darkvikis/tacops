import { FactionBadge, LeaderboardBreakdownCell, SidePercentCell } from "./crusade-cells";
import type { CrusadePlanet, PlanetLeaderboard } from "../api/types";

const cellClass = "border-b border-black/10 px-3 py-2 align-top dark:border-white/15";

interface CrusadePlanetsTableProps {
  planets: CrusadePlanet[];
  leaderboardByPlanet: Map<string, PlanetLeaderboard>;
}

export function CrusadePlanetsTable({ planets, leaderboardByPlanet }: CrusadePlanetsTableProps) {
  return (
    <table className="mt-4 w-full table-auto border-collapse text-left">
      <thead>
        <tr>
          <th className={cellClass}>Planet</th>
          <th className={cellClass}>Imperium % / Devastation %</th>
          <th className={cellClass}>Leading Factions (Imperium)</th>
          <th className={cellClass}>Leading Factions (Devastation)</th>
          <th className={cellClass}>Side Leaderboard</th>
          <th className={cellClass}>Faction Leaderboard</th>
        </tr>
      </thead>
      <tbody>
        {planets.map((planet) => {
          const lb = leaderboardByPlanet.get(planet.planetId)!;
          return (
            <tr key={planet.planetId}>
              <td className={cellClass}>{planet.name}</td>
              <td className={cellClass}>
                <SidePercentCell pointsFor={planet.pointsFor} pointsAgainst={planet.pointsAgainst} />
              </td>
              <td className={cellClass}>
                {lb.topFactionsFor.slice(0, 3).map((f) => (
                  <div key={f.factionId} className="flex items-center gap-1">
                    <FactionBadge factionId={f.factionId} />
                    <span>{f.points.toLocaleString()}</span>
                  </div>
                ))}
              </td>
              <td className={cellClass}>
                {lb.topFactionsAgainst.slice(0, 3).map((f) => (
                  <div key={f.factionId} className="flex items-center gap-1">
                    <FactionBadge factionId={f.factionId} />
                    <span>{f.points.toLocaleString()}</span>
                  </div>
                ))}
              </td>
              <td className={cellClass}>
                <LeaderboardBreakdownCell result={lb.side} />
              </td>
              <td className={cellClass}>
                <LeaderboardBreakdownCell result={lb.faction} />
              </td>
            </tr>
          );
        })}
      </tbody>
    </table>
  );
}
