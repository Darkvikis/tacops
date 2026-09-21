import type { PlanetRefreshEntry } from "../api/types";

// Fallback for a planet id that isn't (yet) in planetRefreshState - shouldn't normally happen
// since App.tsx seeds every active planet's entry immediately in go(), before any card renders.
export const EMPTY_REFRESH_ENTRY: PlanetRefreshEntry = {
  leaderboard: null,
  lastSuccessAt: null,
  lastAttemptAt: null,
  lastAttemptFailed: false,
  isLoading: false,
};
