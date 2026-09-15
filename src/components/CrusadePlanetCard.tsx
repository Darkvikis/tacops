import { FactionBadge, LeaderboardBreakdownCell, SidePercentCell } from "./crusade-cells";
import type { CrusadePlanet, PlanetLeaderboard } from "../api/types";

const labelClass = "text-xs font-medium opacity-70";

export function CrusadePlanetCard({ planet, leaderboard }: { planet: CrusadePlanet; leaderboard: PlanetLeaderboard }) {
  return (
    <div className="flex flex-col gap-2 rounded-lg border border-black/10 bg-white/60 p-3 text-left dark:border-white/15 dark:bg-white/5">
      <div className="flex items-center justify-between gap-2">
        <span className="font-medium">{planet.name}</span>
        <SidePercentCell pointsFor={planet.pointsFor} pointsAgainst={planet.pointsAgainst} />
      </div>
      <div className="grid grid-cols-2 gap-2">
        <div className="flex flex-col gap-1">
          <span className={labelClass}>Leading Factions (Imperium)</span>
          {leaderboard.topFactionsFor.slice(0, 3).map((f) => (
            <div key={f.factionId} className="flex items-center gap-1">
              <FactionBadge factionId={f.factionId} />
              <span>{f.points.toLocaleString()}</span>
            </div>
          ))}
        </div>
        <div className="flex flex-col gap-1">
          <span className={labelClass}>Leading Factions (Devastation)</span>
          {leaderboard.topFactionsAgainst.slice(0, 3).map((f) => (
            <div key={f.factionId} className="flex items-center gap-1">
              <FactionBadge factionId={f.factionId} />
              <span>{f.points.toLocaleString()}</span>
            </div>
          ))}
        </div>
      </div>
      <div className="grid grid-cols-2 gap-2">
        <div className="flex flex-col gap-1">
          <span className={labelClass}>Side Leaderboard</span>
          <LeaderboardBreakdownCell result={leaderboard.side} />
        </div>
        <div className="flex flex-col gap-1">
          <span className={labelClass}>Faction Leaderboard</span>
          <LeaderboardBreakdownCell result={leaderboard.faction} />
        </div>
      </div>
    </div>
  );
}
