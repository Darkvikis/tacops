import { ArenaEquipmentSlot } from "./ArenaEquipmentSlot";
import { rarityHaloFilter } from "../rarity/rarity-halo";
import type { PvpUnitSlot } from "../pvp/pvp-view-model";

// 83px portrait (64px * 1.3) - sized up ~30% so 3 fit per row within a card instead of 4, per
// feedback. Ability levels are an absolutely-positioned overlay INSIDE the same relative+isolate
// wrapper as the portrait/halo/rank badge - not a separate block below pulled up via negative
// margin (the earlier approach) - so they're guaranteed to paint on top of both, per feedback that
// they weren't reliably drawn above the halo/portrait that way.
export function ArenaUnitSlot({ unit }: { unit: PvpUnitSlot }) {
  return (
    <div className="flex w-[83px] flex-col items-center gap-1">
      {unit.starIconUrls.length > 0 && (
        <div className="flex gap-px">
          {unit.starIconUrls.map((url, i) => (
            <img key={i} src={url} className="h-4 w-4" />
          ))}
        </div>
      )}
      {/* isolation: isolate - same fix as Icon.tsx's halo: without its own stacking context, the
          drop-shadow's paint region can get clipped at a CSS Grid row's stretched (align-items:
          stretch) last row, since the 3 opponent cards sit in a grid (ArenaTab.tsx). */}
      <div className="relative h-[83px] w-[83px]" style={{ isolation: "isolate" }}>
        <img
          src={unit.portraitUrl}
          title={unit.name}
          className="h-[83px] w-[83px] rounded-full object-cover"
          style={{ filter: rarityHaloFilter(unit.rarity) }}
        />
        {unit.kind === "character" && (
          <img
            src={unit.rankIconUrl}
            title="Rank"
            className="absolute -bottom-[10px] left-1/2 h-[31px] w-[31px] -translate-x-1/2 rounded-full"
          />
        )}
        <div className="absolute inset-x-0 bottom-[18px] flex justify-between px-1 text-xs font-semibold text-white [text-shadow:0_1px_2px_rgba(0,0,0,0.9)]">
          <span title="Active ability level">{unit.activeLevel ?? "-"}</span>
          <span title="Passive ability level">{unit.passiveLevel ?? "-"}</span>
        </div>
      </div>
      {unit.kind === "character" && (
        <div className="mt-1 flex gap-1">
          {unit.equipment.map((equipment, i) => (
            <ArenaEquipmentSlot key={i} equipment={equipment} />
          ))}
        </div>
      )}
    </div>
  );
}
