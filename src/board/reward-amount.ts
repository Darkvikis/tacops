export type ResourceKey = "crusadeBomb" | "intel" | "crusadeNpc";

export const CRUSADE_RESOURCE_KEYS: ResourceKey[] = ["crusadeBomb", "intel", "crusadeNpc"];

// Board rarity isn't a bonusRewards entry (see entryRarity in board-view-model.ts), so it can't
// flow through rewardAmount - it's a distinct priority option layered on top of ResourceKey.
export type PriorityKey = ResourceKey | "rarity";

export function rewardAmount(rewards: string[], key: ResourceKey): number {
  const match = rewards.find((reward) => reward.split(":")[0] === key);
  if (!match) {
    return 0;
  }
  const amount = Number(match.split(":")[1]);
  return Number.isNaN(amount) ? 0 : amount;
}
