// board-assets/ is deliberately NOT bundled into the app build (see the implementation plan's
// "Board image hosting") - wrangler.toml's [assets] directory and tauri.conf.json's frontendDist
// both point at the same dist/ folder, so anything bundled there ships in both the web deploy AND
// the desktop installer. These boards are large enough (14MB for all 69) that bundling them into
// the installer wasn't worth it, so they're deployed as plain static files alongside dist/ instead
// and fetched over the network at runtime by both transports - the same network dependency this
// feature already has for GET_PVP_STATE itself.
export const BOARD_ASSET_ORIGIN = "https://tacops.cpunerd.workers.dev";

export function boardImageUrl(boardId: string): string {
  return `${BOARD_ASSET_ORIGIN}/boards/${boardId}_Visual.png`;
}
