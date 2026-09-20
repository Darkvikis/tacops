import { isTauri } from "@tauri-apps/api/core";

// Whether the "taken down" gate should show at all. Tauri builds never show it - there's no
// Cloudflare env to check, and the risk it guards against (public web visitors) doesn't apply to
// someone who already built their own desktop binary. On the web, defaults to true (gate shown)
// if the config check fails for any reason - fail safe, matches today's default-locked behavior.
export async function fetchTakedownScreenEnabled(): Promise<boolean> {
  if (isTauri()) return false;
  try {
    const res = await fetch("/api/config");
    const data = (await res.json()) as { showTakedownScreen?: boolean };
    return data.showTakedownScreen === true;
  } catch {
    return true;
  }
}
