import { intToRank } from "../rank/rank.mapper";
import { rankIconUrl } from "../rank/rank-icon";
import { rarityIconUrl } from "../rarity/rarity-icon";
import { starIconUrls } from "../rarity/rarity-stars-icon";
import { ProgressionIndexMapper } from "../progression/progression-index";
import { characterPortraitUrl } from "./character-portraits";
import { getCharacterProfile } from "./character-profile";
import { damageProfileIconUrl } from "./damage-profile-icon";
import { traitIconUrl } from "./trait-icon";
import { factionIconUrl } from "../factions/faction-icon";
import type { RawUnit } from "../api/types";

export interface CharacterRow {
  id: string;
  name: string;
  power?: number;
  portraitUrl: string;
  faction: string;
  factionIconUrl?: string;
  rarityIconUrl: string;
  starIconUrls: string[];
  rankIconUrl: string;
  damageProfileIconUrls: string[];
  traitIconUrls: string[];
}

export function getCharacterRow(hero: RawUnit): CharacterRow {
  const rank = intToRank(hero.rank);
  const rarity = ProgressionIndexMapper.toRarity(hero.progressionIndex);
  const stars = ProgressionIndexMapper.toStars(hero.progressionIndex);
  const profile = getCharacterProfile(hero.id);

  return {
    id: hero.id,
    name: profile.name,
    power: hero.power,
    portraitUrl: characterPortraitUrl(hero.id),
    faction: profile.faction,
    factionIconUrl: factionIconUrl(profile.faction),
    rarityIconUrl: rarityIconUrl(rarity),
    starIconUrls: starIconUrls(stars),
    rankIconUrl: rankIconUrl(rank),
    damageProfileIconUrls: profile.damageProfiles.map((profileId) => damageProfileIconUrl(profileId)),
    traitIconUrls: profile.traits
      .filter((trait) => trait !== "Hero")
      .map((trait) => traitIconUrl(trait))
      .filter((url): url is string => url !== undefined),
  };
}
