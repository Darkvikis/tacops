import { CrusadeDominationCard } from "./CrusadeDominationCard";
import type { CrusadePlanet, PlanetLeaderboard } from "../api/types";

interface CrusadeDominationCardsProps {
  planets: CrusadePlanet[];
  leaderboardByPlanet: Map<string, PlanetLeaderboard>;
}

export function CrusadeDominationCards({ planets, leaderboardByPlanet }: CrusadeDominationCardsProps) {
  return (
    <div className="mt-4 grid w-full grid-cols-[repeat(auto-fill,minmax(280px,1fr))] gap-3">
      {planets.map((planet) => (
        <CrusadeDominationCard key={planet.planetId} planet={planet} leaderboard={leaderboardByPlanet.get(planet.planetId)} />
      ))}
    </div>
  );
}
