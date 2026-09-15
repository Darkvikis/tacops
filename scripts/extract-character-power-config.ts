// Trims a full GameConfig.json down to just the pieces src/characters/character-power.ts needs,
// so the app bundles a few small JSON files instead of an ~18MB dump. Run this whenever a new
// GameConfig ships (see README.md's "Updating character-power data" section for the full
// instructions, including which snapshot is safe to use).
//
// Usage: node scripts/extract-character-power-config.ts <path-to-GameConfig>

import fs from "node:fs";
import path from "node:path";

interface JsonObject {
  [key: string]: unknown;
}

function isObject(value: unknown): value is JsonObject {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function requireObject(value: unknown, field: string): JsonObject {
  if (!isObject(value)) {
    throw new Error(`${field} must be an object`);
  }
  return value;
}

function pick(source: JsonObject, keys: string[], field: string): JsonObject {
  const result: JsonObject = {};
  for (const key of keys) {
    if (!(key in source)) {
      throw new Error(`${field}.${key} is missing - GameConfig's shape may have changed`);
    }
    result[key] = source[key];
  }
  return result;
}

function writeAsset(fileName: string, data: unknown): void {
  const outPath = path.join(import.meta.dirname, "..", "src", "assets", fileName);
  const json = JSON.stringify(data, null, 2);
  fs.writeFileSync(outPath, `${json}\n`);
  const sizeKb = (Buffer.byteLength(json) / 1024).toFixed(1);
  console.log(`Wrote ${fileName} (${sizeKb} KB)`);
}

function main() {
  const sourcePath = process.argv[2];
  if (!sourcePath) {
    console.error("Usage: node scripts/extract-character-power-config.ts <path-to-GameConfig>");
    process.exit(1);
  }

  console.log(`Reading ${sourcePath}...`);
  const raw = fs.readFileSync(sourcePath, "utf8");
  const parsed: unknown = JSON.parse(raw);
  const root = requireObject(parsed, "GameConfig");
  // Tolerates either the full document (with a clientGameConfig wrapper) or an
  // already-unwrapped clientGameConfig value directly - mirrors character-power.ts's own
  // unwrapGameConfig(), which the live app applies to its bundled copy of these files too.
  const gameConfig = isObject(root.clientGameConfig) ? root.clientGameConfig : root;

  const units = requireObject(gameConfig.units, "GameConfig.units");
  const trimmedUnits = pick(
    units,
    [
      "lineup",
      "heroProgressionSteps",
      "heroProgressionStepsPerUnit",
      "damageProfileModifiers",
      "abilityPowerCurve",
      "abilityPowerModifiers",
      "traitPowerModifiers",
    ],
    "GameConfig.units",
  );

  const items = requireObject(gameConfig.items, "GameConfig.items");
  const upgrades = requireObject(gameConfig.upgrades, "GameConfig.upgrades");

  writeAsset("character-power-units.json", trimmedUnits);
  writeAsset("character-power-items.json", items);
  writeAsset("character-power-upgrades.json", upgrades);
}

main();
