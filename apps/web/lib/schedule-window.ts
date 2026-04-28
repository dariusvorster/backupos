/**
 * Pure helper for schedule-window enforcement.
 *
 * Hours are 0-23. A null start or end means "no window configured" → always allowed.
 * start=0, end=23 is treated as "always" (full day).
 * Wrap-around windows (start > end, e.g. 22-06) allow overnight ranges correctly.
 */
export function isWithinWindow(
  currentHour: number,
  start: number | null,
  end: number | null,
): boolean {
  if (start === null || end === null) return true
  if (start === 0 && end === 23) return true
  if (start === end) return true

  if (start < end) {
    return currentHour >= start && currentHour < end
  }
  // Wrap-around: e.g. 22 to 06 — allow 22,23,00,01…05
  return currentHour >= start || currentHour < end
}
