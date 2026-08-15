export const TIME_LIMIT_MS = 7000;
export const MAX_POINTS = 1000;

/** Points earned per millisecond remaining: 1000 / 7000 ≈ 0.142857 */
export const POINTS_PER_MS = MAX_POINTS / TIME_LIMIT_MS;

/**
 * Millisecond-based scoring formula:
 *
 *   timeLeftMs = max(0, TIME_LIMIT_MS - elapsedMs)
 *   points     = round(timeLeftMs × POINTS_PER_MS)
 *
 * Examples (7000ms limit, 1000 max pts):
 *   7000ms left → 1000 pts
 *   5000ms left → 714 pts
 *   2000ms left → 286 pts
 *   0ms left    → 0 pts
 */
export function getTimeLeftMs(elapsedMs) {
  return Math.max(0, TIME_LIMIT_MS - elapsedMs);
}

export function calculatePoints(timeLeftMs) {
  return Math.round(timeLeftMs * POINTS_PER_MS);
}

export function scoreAnswer({ isCorrect, timeMs }) {
  if (!isCorrect) return 0;
  return calculatePoints(getTimeLeftMs(timeMs));
}
