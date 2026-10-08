import type { PvpEquipmentSlot } from "../pvp/pvp-view-model";

// One frame per tier (mythic then relic, layered, for a relic - see itemFrameTiers in
// pvp-equipment.ts), the icon centered inside at a fixed inner-box percentage with
// object-fit: contain (frames are a uniform 111x128px, but icon sprites vary freely in both size
// and aspect ratio - confirmed by direct inspection, so a naive native-size overlay would make
// icons visually inconsistent against each other), and the level badge pinned to the corner.
// 22px - 30% smaller than the original 32px (h-8/w-8) slot, per feedback that the equipment row
// was too large relative to the rest of the card.
export function ArenaEquipmentSlot({ equipment }: { equipment: PvpEquipmentSlot | null }) {
  if (!equipment) {
    return <div className="h-[22px] w-[22px]" />;
  }
  return (
    <div className="relative h-[22px] w-[22px]" title={`${equipment.name} +${equipment.level}`}>
      {equipment.frameUrls.map((url, i) => (
        <img key={i} src={url} className="absolute inset-0 h-full w-full" />
      ))}
      {equipment.iconUrl && (
        <img
          src={equipment.iconUrl}
          className="absolute left-1/2 top-1/2 h-[70%] w-[70%] -translate-x-1/2 -translate-y-1/2 object-contain"
        />
      )}
      <span className="absolute -bottom-0.5 -right-0.5 rounded bg-black/70 px-0.5 text-[7px] leading-tight text-white">
        {equipment.level}
      </span>
    </div>
  );
}
