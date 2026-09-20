import { CrusadeDominationCard } from "./CrusadeDominationCard";
import type { CrusadePlanet, PlanetLeaderboard } from "../api/types";

interface CrusadeDominationCardsProps {
  planets: CrusadePlanet[];
  leaderboardByPlanet: Map<string, PlanetLeaderboard>;
}

export function CrusadeDominationCards({ planets, leaderboardByPlanet }: CrusadeDominationCardsProps) {
  return (
    <div className="mt-4 grid w-full grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
      {planets.map((planet) => (
        <CrusadeDominationCard key={planet.planetId} planet={planet} leaderboard={leaderboardByPlanet.get(planet.planetId)} />
      ))}
    </div>
  );
}
