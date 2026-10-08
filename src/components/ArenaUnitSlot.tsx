import { ArenaEquipmentSlot } from "./ArenaEquipmentSlot";
import { rarityHaloFilter } from "../rarity/rarity-halo";
import type { PvpUnitSlot } from "../pvp/pvp-view-model";

// Stars above the portrait, rank overlapping the bottom edge (characters only - a Machine of War
// has no rank), ability levels below the rank (active left/passive right), equipment below that
// (characters only - a MoW has no equipment slots). Same relative-wrapper + absolute-overlay
// technique as ReplayPlaylistCharacterSlotBadge.tsx, just rearranged per the user's spec.
export function ArenaUnitSlot({ unit }: { unit: PvpUnitSlot }) {
  return (
    <div className="flex w-16 flex-col items-center gap-0.5">
      {unit.starIconUrls.length > 0 && (
        <div className="flex gap-px">
          {unit.starIconUrls.map((url, i) => (
            <img key={i} src={url} className="h-3 w-3" />
          ))}
        </div>
      )}
      {/* isolation: isolate - same fix as Icon.tsx's halo: without its own stacking context, the
          drop-shadow's paint region can get clipped at a CSS Grid row's stretched (align-items:
          stretch) last row, since the 3 opponent cards sit in a grid (ArenaTab.tsx). */}
      <div className="relative h-16 w-16" style={{ isolation: "isolate" }}>
        <img
          src={unit.portraitUrl}
          title={unit.name}
          className="h-16 w-16 rounded-full object-cover"
          style={{ filter: rarityHaloFilter(unit.rarity) }}
        />
        {unit.kind === "character" && (
          <img
            src={unit.rankIconUrl}
            title="Rank"
            className="absolute -bottom-2 left-1/2 h-6 w-6 -translate-x-1/2 rounded-full"
          />
        )}
      </div>
      {/* -mt-3.5 (-14px) instead of the "natural" +6px gap - net -20px, per feedback that the
          ability levels/equipment (which follows directly below in flow, so it moves with this)
          sat too far below the portrait. */}
      <div className="-mt-3.5 flex w-full justify-between text-xs text-neutral-300">
        <span title="Active ability level">{unit.activeLevel ?? "-"}</span>
        <span title="Passive ability level">{unit.passiveLevel ?? "-"}</span>
      </div>
      {unit.kind === "character" && (
        <div className="flex gap-0.5">
          {unit.equipment.map((equipment, i) => (
            <ArenaEquipmentSlot key={i} equipment={equipment} />
          ))}
        </div>
      )}
    </div>
  );
}
