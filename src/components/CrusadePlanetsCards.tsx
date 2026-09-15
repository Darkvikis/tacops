import { CrusadePlanetCard } from "./CrusadePlanetCard";
import type { CrusadePlanet, PlanetLeaderboard } from "../api/types";

interface CrusadePlanetsCardsProps {
  planets: CrusadePlanet[];
  leaderboardByPlanet: Map<string, PlanetLeaderboard>;
}

export function CrusadePlanetsCards({ planets, leaderboardByPlanet }: CrusadePlanetsCardsProps) {
  return (
    <div className="mt-4 grid w-full grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
      {planets.map((planet) => (
        <CrusadePlanetCard key={planet.planetId} planet={planet} leaderboard={leaderboardByPlanet.get(planet.planetId)!} />
      ))}
    </div>
  );
}
