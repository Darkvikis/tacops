import { Icon } from "./Icon";
import { rewardIconUrl } from "../board/reward-icon";
import { type PriorityKey } from "../board/reward-amount";
import { rarityIconUrl } from "../rarity/rarity-icon";
import { Rarity } from "../rarity/rarity.enum";

const PRIORITY_KEYS: PriorityKey[] = ["rarity", "crusadeBomb", "intel", "crusadeNpc"];

const PRIORITY_LABEL: Record<PriorityKey, string> = {
  rarity: "Rarity",
  crusadeBomb: "Ordnance",
  intel: "Intel",
  crusadeNpc: "Forces",
};

function priorityIconUrl(key: PriorityKey): string {
  if (key === "rarity") return rarityIconUrl(Rarity.Mythic);
  return rewardIconUrl(key) ?? "";
}

const TIER_LABELS = ["High", "Mid", "Low", "Lowest"] as const;

interface RewardPriorityPickerProps {
  value: [PriorityKey, PriorityKey, PriorityKey, PriorityKey];
  onChange: (value: [PriorityKey, PriorityKey, PriorityKey, PriorityKey]) => void;
}

export function RewardPriorityPicker({ value, onChange }: RewardPriorityPickerProps) {
  function setTier(tierIndex: number, key: PriorityKey) {
    const next = [...value] as [PriorityKey, PriorityKey, PriorityKey, PriorityKey];
    const displacedIndex = next.indexOf(key);
    next[displacedIndex] = next[tierIndex];
    next[tierIndex] = key;
    onChange(next);
  }

  return (
    <div className="mt-4 flex flex-wrap items-center gap-4 text-left">
      <span className="text-sm font-medium">Reward priority:</span>
      {TIER_LABELS.map((label, tierIndex) => (
        <label key={label} className="flex items-center gap-1.5">
          <span className="text-sm">{label}</span>
          <Icon src={priorityIconUrl(value[tierIndex])} title={PRIORITY_LABEL[value[tierIndex]]} />
          <select
            className="rounded border border-black/20 bg-white px-1 py-0.5 text-sm dark:border-white/20 dark:bg-neutral-900"
            value={value[tierIndex]}
            onChange={(e) => setTier(tierIndex, e.target.value as PriorityKey)}
          >
            {PRIORITY_KEYS.map((key) => (
              <option key={key} value={key}>
                {PRIORITY_LABEL[key]}
              </option>
            ))}
          </select>
        </label>
      ))}
    </div>
  );
}
