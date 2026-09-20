import { Modal } from "./Modal";
import type { SectorMapColor, SectorMapData } from "../crusade/crusade-sector-map-view-model";

// Imperial/Devastation match the codebase's established side-color intent from the map's own
// legend; the highlight ring reuses this codebase's existing "complete/target" green
// (OpsCardFrame.tsx/OperationsTable.tsx use green-700/green-500 the same way).
const NODE_COLOR: Record<SectorMapColor, string> = {
  imperial: "#2563eb",
  devastation: "#dc2626",
  neutral: "#9ca3af",
};
const HIGHLIGHT_COLOR = "#15803d";

// A small inset so planets sitting right at a sector's edge (normalized 0 or 1) don't get their
// circles clipped by the viewBox.
const MARGIN = 10;
const SPAN = 100 - MARGIN * 2;
function toSvg(normalized: number): number {
  return MARGIN + normalized * SPAN;
}

interface PlanetSectorMapModalProps {
  sectorMapData: SectorMapData;
  highlightPlanetId: string;
  onClose: () => void;
}

export function PlanetSectorMapModal({ sectorMapData, highlightPlanetId, onClose }: PlanetSectorMapModalProps) {
  return (
    <Modal onClose={onClose}>
      <h2 className="text-lg font-semibold">Sector {sectorMapData.zone + 1}</h2>
      <svg viewBox="0 0 100 100" className="mt-2 h-auto w-full">
        <defs>
          {sectorMapData.edges.map((edge, i) => (
            <linearGradient
              key={i}
              id={`sector-map-edge-${i}`}
              x1={toSvg(edge.from.x)}
              y1={toSvg(edge.from.y)}
              x2={toSvg(edge.to.x)}
              y2={toSvg(edge.to.y)}
              gradientUnits="userSpaceOnUse"
            >
              <stop offset="0%" stopColor={NODE_COLOR[edge.from.color]} />
              <stop offset="100%" stopColor={NODE_COLOR[edge.to.color]} />
            </linearGradient>
          ))}
        </defs>
        {sectorMapData.edges.map((edge, i) => (
          <line
            key={i}
            x1={toSvg(edge.from.x)}
            y1={toSvg(edge.from.y)}
            x2={toSvg(edge.to.x)}
            y2={toSvg(edge.to.y)}
            stroke={`url(#sector-map-edge-${i})`}
            strokeWidth={0.5}
          />
        ))}
        {sectorMapData.nodes.map((node) => (
          <g key={node.planetId}>
            {node.planetId === highlightPlanetId && (
              <circle cx={toSvg(node.x)} cy={toSvg(node.y)} r={4} fill="none" stroke={HIGHLIGHT_COLOR} strokeWidth={0.7} />
            )}
            <circle cx={toSvg(node.x)} cy={toSvg(node.y)} r={2} fill={NODE_COLOR[node.color]}>
              <title>{node.name}</title>
            </circle>
          </g>
        ))}
      </svg>
    </Modal>
  );
}
