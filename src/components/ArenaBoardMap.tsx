import { useEffect, useState } from "react";
import { boardImageUrl } from "../pvp/board-image";
import { fetchSpawnPointManifest, resolveCharacterSpawnPositions, type SpawnPointManifest } from "../pvp/board-layout";
import { characterPortraitUrl } from "../characters/character-portraits";

interface ArenaBoardMapProps {
  boardId: string;
  spawnPointsSet: number;
  lineup: string[];
}

// The board background plus the opponent's fielded character portraits (bare - no rank/stars/
// etc., per the user's request) at their real spawn points. spawn-points.json's (x, y) are native
// pixel coordinates against the delivered board PNG (confirmed by datamine_tacticus drawing its
// own output back onto that same PNG) - positioned here as a percentage of the image's natural
// size (read via onLoad) rather than raw px, so this still lines up however large the image
// actually renders at.
export function ArenaBoardMap({ boardId, spawnPointsSet, lineup }: ArenaBoardMapProps) {
  const [manifest, setManifest] = useState<SpawnPointManifest | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [naturalSize, setNaturalSize] = useState<{ width: number; height: number } | null>(null);

  useEffect(() => {
    let cancelled = false;
    fetchSpawnPointManifest()
      .then((loaded) => {
        if (!cancelled) setManifest(loaded);
      })
      .catch((loadError) => {
        if (!cancelled) setError(`Failed to load spawn point data: ${loadError}`);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const positions =
    manifest && naturalSize ? resolveCharacterSpawnPositions(manifest, boardId, spawnPointsSet, lineup) : [];

  return (
    <div className="relative inline-block max-w-full">
      <img
        src={boardImageUrl(boardId)}
        alt={boardId}
        title={boardId}
        className="block max-w-full rounded"
        onLoad={(e) => setNaturalSize({ width: e.currentTarget.naturalWidth, height: e.currentTarget.naturalHeight })}
        onError={() => setError(`Failed to load map art for ${boardId}`)}
      />
      {naturalSize &&
        positions.map((position) => (
          <img
            key={position.characterId}
            src={characterPortraitUrl(position.characterId)}
            title={position.characterId}
            className="absolute h-5 w-5 -translate-x-1/2 -translate-y-1/2 rounded-full border border-white/80 object-cover shadow"
            style={{
              left: `${(position.x / naturalSize.width) * 100}%`,
              top: `${(position.y / naturalSize.height) * 100}%`,
            }}
          />
        ))}
      {error && <p className="text-xs text-red-500 dark:text-red-400">{error}</p>}
    </div>
  );
}
