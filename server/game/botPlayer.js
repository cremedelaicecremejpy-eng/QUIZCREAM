// A stand-in rival for 1v1 matches that would otherwise sit waiting.
//
// The bot is deliberately ordinary: it is given a name a person could have
// typed, it thinks for a couple of seconds before answering, and it misses
// questions. It also drifts towards whoever is behind, so matches stay close
// and neither side runs away with it.

const FIRST_NAMES = [
  'Riya', 'Arjun', 'Kaito', 'Lena', 'Mateo', 'Noor', 'Amara', 'Priya', 'Diego', 'Mei',
  'Zoya', 'Omar', 'Ana', 'Ravi', 'Sofia', 'Yuki', 'Tomas', 'Ines', 'Nikhil', 'Hana',
  'Luca', 'Farah', 'Ibrahim', 'Elena', 'Sana', 'Marco', 'Aisha', 'Dev', 'Nina', 'Pablo',
  'Karim', 'Leah', 'Ayaan', 'Maya', 'Jonas', 'Tara', 'Emre', 'Rosa', 'Kabir', 'Chloe'
];

const HANDLE_WORDS = [
  'fox', 'otter', 'comet', 'raven', 'pixel', 'mango', 'turbo', 'echo', 'nova', 'drift',
  'panda', 'quartz', 'falcon', 'ember', 'koala', 'sprint', 'lotus', 'orbit', 'cobra', 'zen'
];

const clamp = (value, low, high) => Math.min(high, Math.max(low, value));
const rand = (low, high) => low + Math.random() * (high - low);
const pick = (list) => list[Math.floor(Math.random() * list.length)];
const chance = (p) => Math.random() < p;

function buildNickname() {
  const name = pick(FIRST_NAMES);
  const word = pick(HANDLE_WORDS);
  const number = Math.floor(rand(2, 99));

  const styles = [
    () => name,
    () => name,
    () => name.toLowerCase(),
    () => `${name} ${pick('KSRMPTVBN'.split(''))}`,
    () => `${name.toLowerCase()}${number}`,
    () => `${name.toLowerCase()}_${number}`,
    () => `${word}${number}`,
    () => `${word}${pick(HANDLE_WORDS)}`,
    () => `the${word}`,
    () => `${name.slice(0, 1)}${pick('KSRMPT'.split(''))}`
  ];

  return pick(styles)().slice(0, 20);
}

export const BOT_SOCKET_TAG = 'quticks-bot';

// One rival, with its own temperament. Accuracy is where it starts; the match
// nudges it from there.
export function createBotPlayer({ avoidNickname = '', playerAccuracy = null } = {}) {
  let nickname = buildNickname();

  for (let attempt = 0; attempt < 6; attempt += 1) {
    if (nickname.toLowerCase() !== String(avoidNickname).trim().toLowerCase()) break;
    nickname = buildNickname();
  }

  // Play at the player's level when we know it, otherwise pick a temperament.
  const accuracy =
    typeof playerAccuracy === 'number' && playerAccuracy > 0
      ? clamp(playerAccuracy + rand(-0.06, 0.06), 0.35, 0.85)
      : rand(0.52, 0.78);

  return {
    nickname,
    accuracy,
    // Below 1 answers sooner, above 1 dawdles.
    pace: rand(0.85, 1.18),
    isBot: true
  };
}

// What the rival does with one question: which option, and how long it waits.
export function decideBotAnswer({
  bot,
  correctIndex,
  optionCount = 4,
  scoreGap = 0,
  isLastRound = false,
  opponentAccuracy = null,
  timeLimitMs = 7000
}) {
  // Follow the player's level as the match shows what it is.
  const base =
    typeof opponentAccuracy === 'number'
      ? 0.6 * opponentAccuracy + 0.4 * bot.accuracy
      : bot.accuracy;

  // Rubber band: the further ahead the bot gets, the more it lets slip, and the
  // other way round. Skill still decides the match; this only keeps it close.
  const band = clamp(scoreGap / 110, -0.26, 0.26);
  let accuracy = base - band;

  if (isLastRound && scoreGap < 0) accuracy += 0.05;

  accuracy = clamp(accuracy, 0.28, 0.9);

  const knowsAnswer = correctIndex >= 0 && correctIndex < optionCount;
  const answersCorrectly = knowsAnswer && chance(accuracy);

  let selectedIndex;
  if (answersCorrectly) {
    selectedIndex = correctIndex;
  } else {
    const wrong = [];
    for (let i = 0; i < optionCount; i += 1) {
      if (i !== correctIndex) wrong.push(i);
    }
    selectedIndex = wrong.length ? pick(wrong) : 0;
  }

  let thinkMs = rand(2100, 5200) * bot.pace;
  if (!answersCorrectly) thinkMs += rand(150, 900);
  thinkMs += clamp(scoreGap * 9, -700, 950);
  if (isLastRound) thinkMs -= 200;
  if (chance(0.12)) thinkMs += rand(400, 1100);

  const delayMs = Math.round(clamp(thinkMs, 1700, Math.min(6300, timeLimitMs - 500)));

  return { selectedIndex, delayMs, answeredCorrectly: answersCorrectly };
}

export const __testing = { buildNickname, clamp };
