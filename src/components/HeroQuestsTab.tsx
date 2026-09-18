import { Icon } from "./Icon";
import { rarityIconUrl } from "../rarity/rarity-icon";
import type { HeroQuestJar } from "../hero-quests/hero-quest-view-model";

const cellClass = "border-b border-black/10 px-3 py-2 align-top dark:border-white/15";

export function HeroQuestsTab({ jars }: { jars: HeroQuestJar[] }) {
  if (jars.length === 0) {
    return <p>No Hero Quest data found.</p>;
  }

  return (
    <table className="mt-4 w-full table-auto border-collapse text-left">
      <thead>
        <tr>
          <th className={cellClass}>Rarity</th>
          <th className={cellClass}>Battle</th>
          <th className={cellClass}>Rewards Received</th>
          <th className={cellClass}>Rewards Missed</th>
          <th className={cellClass}>Rewards Remaining</th>
          <th className={cellClass}>Battles Remaining</th>
        </tr>
      </thead>
      <tbody>
        {jars.map((jar) => (
          <tr key={jar.battleNumber}>
            <td className={cellClass}>
              <Icon src={rarityIconUrl(jar.rarity)} />
            </td>
            <td className={cellClass}>{jar.battleNumber}</td>
            <td className={cellClass}>{jar.rewardsReceived}</td>
            <td className={cellClass}>{jar.rewardsMissed}</td>
            <td className={cellClass}>{jar.rewardsRemaining}</td>
            <td className={cellClass}>{jar.battlesRemaining}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}
