// Experience levels, per topic and overall.
//
// The ladder: reaching level N+1 from level N costs N x STEP experience. The
// gap widens as you climb, so early levels come quickly and later ones take
// many matches, but a match never pays less for being played at a high level.
// A great game is always a great game.
//
// Experience comes from 1v1 matches only. Solo practice earns nothing.

function num(name, fallback, low, high) {
  const raw = process.env[name];
  if (raw === undefined || raw === '') return fallback;

  const value = Number(raw);
  if (!Number.isFinite(value)) {
    console.warn(`[levels] ${name}="${raw}" is not a number, using ${fallback}`);
    return fallback;
  }

  return Math.min(high, Math.max(low, value));
}

// The one pacing dial. Larger means a slower climb for everyone.
const STEP = () => num('LEVEL_XP_STEP', 100, 10, 10000);

// What winning is worth on top of the score you earned. The match score is
// 0-160, so this decides whether levelling rewards playing well or winning.
const WIN_BONUS = () => num('LEVEL_WIN_BONUS', 40, 0, 400);

export const MAX_LEVEL = 100;

// Experience needed to go from `level` to the next one.
export function xpToAdvance(level) {
  if (level >= MAX_LEVEL) return 0;
  return Math.max(1, Math.round(level * STEP()));
}

// Total experience needed to have reached `level` from scratch.
export function xpTotalFor(level) {
  const capped = Math.min(MAX_LEVEL, Math.max(1, level));
  return Math.round((STEP() * (capped - 1) * capped) / 2);
}

// The level a given pile of experience buys.
export function levelForXp(xp) {
  const total = Number.isFinite(xp) && xp > 0 ? xp : 0;
  const step = STEP();

  // Largest L with step*(L-1)*L/2 <= total.
  let level = Math.floor((1 + Math.sqrt(1 + (8 * total) / step)) / 2);

  // Nudge for floating point rather than trusting the square root at the edges.
  while (level > 1 && xpTotalFor(level) > total) level -= 1;
  while (level < MAX_LEVEL && xpTotalFor(level + 1) <= total) level += 1;

  return Math.min(MAX_LEVEL, Math.max(1, level));
}

// Everything a progress bar needs.
export function progressForXp(xp) {
  const total = Number.isFinite(xp) && xp > 0 ? Math.round(xp) : 0;
  const level = levelForXp(total);
  const floor = xpTotalFor(level);
  const needed = xpToAdvance(level);

  return {
    level,
    xp: total,
    xpIntoLevel: total - floor,
    xpForThisLevel: needed,
    xpToNextLevel: needed === 0 ? 0 : Math.max(0, floor + needed - total),
    isMaxLevel: level >= MAX_LEVEL
  };
}

// What one 1v1 match pays.
//
// `difficultyMultiplier` is what harder questions are worth. It stays at 1
// until question difficulty is measured from real answers; once it is, a
// perfect game on hard questions outpays a perfect game on easy ones, which
// is what makes "all seven at the buzzer, at the top difficulty" the best
// match anybody can play.
export function xpForMatch({ score, won = false, difficultyMultiplier = 1 }) {
  const base = Number.isFinite(score) && score > 0 ? score : 0;
  const bonus = won ? WIN_BONUS() : 0;
  const multiplier =
    Number.isFinite(difficultyMultiplier) && difficultyMultiplier > 0 ? difficultyMultiplier : 1;

  return Math.max(0, Math.round((base + bonus) * multiplier));
}

export const __testing = { STEP, WIN_BONUS };
