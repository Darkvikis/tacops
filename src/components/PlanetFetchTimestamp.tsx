import { formatDateTimeWithSeconds } from "../format-date-time";
import type { PlanetRefreshEntry } from "../api/types";

// Shared by the Crusades tab's cards and table. Shows a single timestamp when the last attempt
// succeeded (or nothing's been attempted yet); when the last attempt failed, shows up to two -
// the last known-good fetch (green check) and the failing attempt itself (red x) - so the user
// can tell "stale but fine" apart from "actively failing" instead of one ambiguous timestamp.
export function PlanetFetchTimestamp({ entry }: { entry: PlanetRefreshEntry }) {
  const textClass = "text-xs text-neutral-500 dark:text-neutral-400";

  if (!entry.lastAttemptFailed) {
    return <span className={textClass}>{entry.lastSuccessAt !== null ? formatDateTimeWithSeconds(entry.lastSuccessAt) : "Not yet loaded"}</span>;
  }

  return (
    <div className={`flex flex-col gap-0.5 ${textClass}`}>
      {entry.lastSuccessAt !== null && (
        <span className="inline-flex items-center gap-1">
          <span className="text-green-600 dark:text-green-400" aria-hidden="true">
            ✓
          </span>
          {formatDateTimeWithSeconds(entry.lastSuccessAt)}
        </span>
      )}
      <span className="inline-flex items-center gap-1">
        <span className="text-red-600 dark:text-red-400" aria-hidden="true">
          ✕
        </span>
        {formatDateTimeWithSeconds(entry.lastAttemptAt!)}
      </span>
    </div>
  );
}
