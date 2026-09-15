// Military time (no AM/PM, always 4 digits) plus date, since several of these timestamps land
// far enough out that they routinely fall on a different calendar day.
export function formatDateTime(epochMs: number): string {
  const d = new Date(epochMs);
  const date = `${d.getFullYear()}/${d.getMonth() + 1}/${d.getDate()}`;
  const time = `${String(d.getHours()).padStart(2, "0")}${String(d.getMinutes()).padStart(2, "0")}`;
  return `${date} ${time}`;
}

const DEFAULT_CLASS = "text-neutral-500 dark:text-neutral-400";

// Urgency tiers for a deadline-style timestamp (a cap being reached, a raid token about to burn):
// default color if it's more than an hour out, amber within an hour, orange within five minutes,
// red once it's arrived or passed.
export function urgencyColorClass(atMs: number, now: number = Date.now()): string {
  const remainingMs = atMs - now;
  if (remainingMs <= 0) return "text-red-600 dark:text-red-400";
  if (remainingMs <= 5 * 60 * 1000) return "text-orange-600 dark:text-orange-400";
  if (remainingMs <= 60 * 60 * 1000) return "text-amber-600 dark:text-amber-400";
  return DEFAULT_CLASS;
}

export { DEFAULT_CLASS as DEFAULT_SUBTEXT_CLASS };
