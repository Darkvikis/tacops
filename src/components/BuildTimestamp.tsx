import { formatDateTime } from "../format-date-time";

export function BuildTimestamp() {
  return <span className="fixed left-1 top-1 text-xs text-neutral-400 dark:text-neutral-500">Build: {formatDateTime(__BUILD_TIME__)}</span>;
}
