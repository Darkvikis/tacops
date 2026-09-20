import { FactionBadge, LeaderboardBreakdownCell } from "./crusade-cells";
import { computeConquestProgress, isPlanetRanked } from "../crusade/crusade-domination-view-model";
import type { CrusadePlanet, PlanetLeaderboard } from "../api/types";

const labelClass = "text-xs font-medium opacity-70";

export function CrusadeDominationCard({ planet, leaderboard }: { planet: CrusadePlanet; leaderboard?: PlanetLeaderboard }) {
  const progress = computeConquestProgress(planet);
  const ranked = isPlanetRanked(leaderboard);

  return (
    <div
      className={`flex flex-col gap-2 rounded-lg border bg-white/60 p-3 text-left dark:bg-white/5 ${
        ranked ? "border-2 border-blue-500 dark:border-blue-400" : "border-black/10 dark:border-white/15"
      }`}
    >
      <div className="flex items-center justify-between gap-2">
        <span className="font-medium">{planet.name}</span>
        {planet.ownedByFaction && <FactionBadge factionId={planet.ownedByFaction} />}
      </div>
      {progress && (
        <div className="flex flex-col gap-0.5 text-sm">
          <span>
            Imperial: {progress.imperialCurrent.toLocaleString()} / {progress.imperialThreshold.toLocaleString()} ({progress.imperialPercent}%)
          </span>
          <span>
            Devastation: {progress.devastationCurrent.toLocaleString()} / {progress.devastationThreshold.toLocaleString()} ({progress.devastationPercent}%)
          </span>
        </div>
      )}
      <div className="grid grid-cols-2 gap-2">
        <div className="flex flex-col gap-1">
          <span className={labelClass}>Side Leaderboard</span>
          <LeaderboardBreakdownCell result={leaderboard?.side ?? null} />
        </div>
        <div className="flex flex-col gap-1">
          <span className={labelClass}>Faction Leaderboard</span>
          <LeaderboardBreakdownCell result={leaderboard?.faction ?? null} />
        </div>
      </div>
    </div>
  );
}
