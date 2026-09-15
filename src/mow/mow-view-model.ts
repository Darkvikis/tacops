import { rarityIconUrl } from "../rarity/rarity-icon";
import { starIconUrls } from "../rarity/rarity-stars-icon";
import { ProgressionIndexMapper } from "../progression/progression-index";
import { factionIconUrl } from "../factions/faction-icon";
import { getMowProfile, mowPortraitUrl } from "./mow-profile";
import type { RawUnit } from "../api/types";

export interface MowRow {
  id: string;
  name: string;
  portraitUrl: string;
  faction: string;
  factionIconUrl?: string;
  rarityIconUrl: string;
  starIconUrls: string[];
  activeLevel?: number;
  passiveLevel?: number;
  power?: number;
}

function asNumber(value: unknown): number | undefined {
  return typeof value === "number" ? value : undefined;
}

export function getMowRow(mow: RawUnit): MowRow {
  // Machines of war carry both `progressionIndex` and an identical `starLevel`;
  // either one maps to rarity and stars exactly like a character's does.
  const progressionIndex = mow.progressionIndex ?? asNumber(mow.starLevel);
  const profile = getMowProfile(mow.id);

  return {
    id: mow.id,
    name: profile.name,
    portraitUrl: mowPortraitUrl(profile.portraitFile),
    faction: profile.faction,
    factionIconUrl: factionIconUrl(profile.faction),
    rarityIconUrl: rarityIconUrl(ProgressionIndexMapper.toRarity(progressionIndex)),
    starIconUrls: starIconUrls(ProgressionIndexMapper.toStars(progressionIndex)),
    activeLevel: asNumber(mow.active),
    passiveLevel: asNumber(mow.passive),
    power: mow.power,
  };
}
