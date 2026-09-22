import { describe, expect, it } from "vitest";
import { computeSectorMap } from "./crusade-sector-map-view-model";
import type { CrusadePlanet, CrusadeSectorMap } from "../api/types";

function crusadePlanet(overrides: Partial<CrusadePlanet> = {}): CrusadePlanet {
  return { planetId: "planet_001", name: "Test Planet", zone: 0, ...overrides };
}

describe("computeSectorMap", () => {
  it("normalizes positions to [0,1] within the sector's own bounding box", () => {
    const sectorMap: CrusadeSectorMap = {
      planets: [
        { planetId: "planet_001", zone: 0, type: "Fortress", positionX: 0, positionY: 0 },
        { planetId: "planet_002", zone: 0, type: "Civilized", positionX: 100, positionY: 50 },
      ],
      connections: [],
    };
    const result = computeSectorMap(0, sectorMap, [crusadePlanet({ planetId: "planet_001" }), crusadePlanet({ planetId: "planet_002" })]);

    const n1 = result.nodes.find((n) => n.planetId === "planet_001")!;
    const n2 = result.nodes.find((n) => n.planetId === "planet_002")!;
    // y is inverted relative to x (game positionY increases upward, SVG y increases downward) -
    // planet_001 has the lowest positionY but lands at the top of the rendered map (y: 0).
    expect(n1).toMatchObject({ x: 0, y: 1 });
    expect(n2).toMatchObject({ x: 1, y: 0 });
  });

  it("centers a single-planet axis at 0.5 instead of dividing by zero", () => {
    const sectorMap: CrusadeSectorMap = {
      planets: [{ planetId: "planet_001", zone: 0, type: "Fortress", positionX: 500, positionY: -200 }],
      connections: [],
    };
    const result = computeSectorMap(0, sectorMap, [crusadePlanet()]);
    expect(result.nodes[0]).toMatchObject({ x: 0.5, y: 0.5 });
  });

  it("colors planets by sideOwner: For -> imperial, Against -> devastation, no owner -> neutral", () => {
    const sectorMap: CrusadeSectorMap = {
      planets: [
        { planetId: "for-planet", zone: 0, type: "Fortress", positionX: 0, positionY: 0 },
        { planetId: "against-planet", zone: 0, type: "Fortress", positionX: 1, positionY: 1 },
        { planetId: "unowned-planet", zone: 0, type: "NotPlayable", positionX: 2, positionY: 2 },
      ],
      connections: [],
    };
    const result = computeSectorMap(0, sectorMap, [
      crusadePlanet({ planetId: "for-planet", sideOwner: "For" }),
      crusadePlanet({ planetId: "against-planet", sideOwner: "Against" }),
    ]);

    expect(result.nodes.find((n) => n.planetId === "for-planet")?.color).toBe("imperial");
    expect(result.nodes.find((n) => n.planetId === "against-planet")?.color).toBe("devastation");
    expect(result.nodes.find((n) => n.planetId === "unowned-planet")?.color).toBe("neutral");
  });

  it("only includes planets from the requested zone", () => {
    const sectorMap: CrusadeSectorMap = {
      planets: [
        { planetId: "planet_001", zone: 0, type: "Fortress", positionX: 0, positionY: 0 },
        { planetId: "planet_099", zone: 3, type: "Fortress", positionX: 0, positionY: 0 },
      ],
      connections: [],
    };
    const result = computeSectorMap(0, sectorMap, [crusadePlanet()]);
    expect(result.nodes.map((n) => n.planetId)).toEqual(["planet_001"]);
  });

  it("keeps a same-zone connection but drops one that crosses sector boundaries", () => {
    const sectorMap: CrusadeSectorMap = {
      planets: [
        { planetId: "planet_001", zone: 0, type: "Fortress", positionX: 0, positionY: 0 },
        { planetId: "planet_002", zone: 0, type: "Fortress", positionX: 1, positionY: 1 },
        { planetId: "planet_099", zone: 3, type: "Fortress", positionX: 0, positionY: 0 },
      ],
      connections: [
        { planet1: "planet_001", planet2: "planet_002" }, // same zone - kept
        { planet1: "planet_001", planet2: "planet_099" }, // crosses zones - dropped
      ],
    };
    const result = computeSectorMap(0, sectorMap, [crusadePlanet({ planetId: "planet_001" }), crusadePlanet({ planetId: "planet_002" })]);

    expect(result.edges).toHaveLength(1);
    expect(result.edges[0].from.planetId).toBe("planet_001");
    expect(result.edges[0].to.planetId).toBe("planet_002");
  });
});
