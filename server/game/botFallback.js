// Nobody likes staring at a waiting screen. If a 1v1 player has been queued
// for a while and no one else has shown up, a stand-in rival joins the same
// queue and plays the match like any other opponent.
//
// The stand-in connects to this server as an ordinary Socket.IO client, so it
// goes through the same queue, the same MatchManager and the same result
// persistence as a person would. Nothing else in the game needs to know.

import prisma from '../lib/prisma.js';
import { createBotPlayer, decideBotAnswer, BOT_SOCKET_TAG } from './botPlayer.js';
import { rememberBotSocket, forgetBotSocket } from './botRegistry.js';

// Read at call time, not at import time: this module is imported before
// dotenv.config() runs, so anything read up here would miss .env entirely.
// A typo in a Railway variable should not quietly change how the game plays:
// anything that is not a sensible number falls back to the default and says so.
function num(name, fallback, low, high) {
  const raw = process.env[name];
  if (raw === undefined || raw === '') return fallback;

  const value = Number(raw);
  if (!Number.isFinite(value)) {
    console.warn(`[bot] ${name}="${raw}" is not a number, using ${fallback}`);
    return fallback;
  }

  return Math.min(high, Math.max(low, value));
}

const OFF = new Set(['false', '0', 'no', 'off']);

function settings() {
  return {
    enabled: !OFF.has(String(process.env.BOT_MATCH_ENABLED || 'true').trim().toLowerCase()),
    waitMs: num('BOT_MATCH_DELAY_MS', 15000, 2000, 120000),
    selfUrl: process.env.BOT_SELF_URL || `http://127.0.0.1:${process.env.PORT || 3001}`,
    maxAtOnce: num('BOT_MAX_CONCURRENT', 25, 0, 500),
    // Turn these from Railway when stand-ins feel too strong or too quick.
    accuracyOffset: num('BOT_ACCURACY_OFFSET', 0, -0.5, 0.5),
    speedScale: num('BOT_SPEED_SCALE', 1, 0.3, 3)
  };
}

// Long enough to cover a cold database fetching the match questions.
const PAIRING_GRACE_MS = 8000;
// If the stand-in ends up playing someone else, the player it was meant for
// gets another one shortly after.
const RETRY_CHECK_MS = 6000;
const RETRY_WAIT_MS = 5000;
const MATCH_MAX_MS = 5 * 60 * 1000;
const TIME_LIMIT_MS = 7000;
const ANSWER_SAFETY_MS = 700;
// How many of a player's own answers in a topic it takes before that topic
// outweighs their overall record. At 20 a handful of rounds barely moves it.
const TOPIC_PRIOR = 20;
const TOPIC_SAMPLE = 100;
const POPULATION_SAMPLE = 500;
const POPULATION_TTL_MS = 10 * 60 * 1000;
const NEUTRAL_ACCURACY = 0.62;
// Guests have no history, so what happens in front of us counts for more.
const GUEST_MATCH_WEIGHT = 0.75;
const MEMBER_MATCH_WEIGHT = 0.6;
// How many stand-ins one waiting player gets before we stop trying.
const MAX_ATTEMPTS = 3;

let clientFactory = null;
let activeBots = 0;

async function getClientFactory() {
  if (!clientFactory) {
    const mod = await import('socket.io-client');
    clientFactory = mod.io || mod.connect || (mod.default && mod.default.io) || mod.default;
  }
  return clientFactory;
}

// The round payload never carries the right answer, so look it up the same way
// the round was built: by topic and question text.
async function resolveCorrectIndex(topicId, question) {
  const options = (question && question.options) || [];
  const text = (question && question.text) || '';

  try {
    const row = await prisma.question.findFirst({ where: { topicId, text } });

    if (!row || !row.correctOption) {
      console.warn('[bot] no question row for:', text.slice(0, 60));
      return -1;
    }

    const correctText = row[`option${row.correctOption}`] || '';
    const correctImage = row[`option${row.correctOption}ImageUrl`] || null;

    let index = correctText
      ? options.findIndex((option) => (option.text || '') === correctText)
      : -1;

    if (index < 0 && correctImage) {
      index = options.findIndex((option) => option.imageUrl === correctImage);
    }

    if (index < 0) console.warn('[bot] answer not among the options for:', text.slice(0, 60));

    return index;
  } catch (error) {
    console.error('[bot] could not resolve the answer:', error.message);
    return -1;
  }
}

const ratio = (rows) => (rows.length ? rows.filter((row) => row.isCorrect).length / rows.length : null);

// What this player gets right in this topic, from their 1v1 answers.
async function topicAccuracy(userId, topicId) {
  const answers = await prisma.matchAnswer.findMany({
    where: { userId, match: { topicId } },
    select: { isCorrect: true },
    orderBy: { id: 'desc' },
    take: TOPIC_SAMPLE
  });

  return { value: ratio(answers), count: answers.length };
}

// Solo rounds count too, and new players have those before anything else.
async function soloAccuracy(userId, topicId) {
  const games = await prisma.soloGame.findMany({
    where: { userId, topicId },
    select: { correctCount: true, totalQuestions: true },
    orderBy: { createdAt: 'desc' },
    take: 10
  });

  const asked = games.reduce((sum, game) => sum + (game.totalQuestions || 0), 0);
  if (!asked) return { value: null, count: 0 };

  const right = games.reduce((sum, game) => sum + (game.correctCount || 0), 0);
  return { value: right / asked, count: asked };
}

// Their record everywhere, as the thing a thin topic record leans on.
async function overallAccuracy(userId) {
  const answers = await prisma.matchAnswer.findMany({
    where: { userId },
    select: { isCorrect: true },
    orderBy: { id: 'desc' },
    take: 200
  });

  return { value: ratio(answers), count: answers.length };
}

// How everyone does in this topic, so a guest's first question is not met by a
// rival pulled out of thin air. Only people are in here to begin with: answers
// are stored for signed-in players only, and a stand-in never has an account,
// so nothing it does can pull this average around.
const POPULATION_CACHE_MAX = 50;
const populationCache = new Map();
const populationInFlight = new Map();

async function topicPopulationAccuracy(topicId) {
  const cached = populationCache.get(topicId);
  if (cached && Date.now() - cached.at < POPULATION_TTL_MS) return cached.value;

  // One query per topic even when several stand-ins start at once.
  if (populationInFlight.has(topicId)) return populationInFlight.get(topicId);

  const query = (async () => {
    try {
      const answers = await prisma.matchAnswer.findMany({
        where: { match: { topicId } },
        select: { isCorrect: true },
        orderBy: { id: 'desc' },
        take: POPULATION_SAMPLE
      });

      const value = answers.length >= 50 ? ratio(answers) : null;

      // Topic ids arrive from the client, so the cache cannot grow forever.
      if (populationCache.size >= POPULATION_CACHE_MAX) {
        populationCache.delete(populationCache.keys().next().value);
      }
      populationCache.set(topicId, { at: Date.now(), value });
      return value;
    } catch (error) {
      console.error('[bot] could not read the topic average:', error.message);
      return null;
    } finally {
      populationInFlight.delete(topicId);
    }
  })();

  populationInFlight.set(topicId, query);
  return query;
}

// Where the stand-in starts. Their record in this topic leads; with only a few
// answers it leans on their overall record, and with none on the topic itself.
export async function seedAccuracy(userId, topicId) {
  if (!userId) {
    const population = await topicPopulationAccuracy(topicId);
    return population === null ? null : population;
  }

  try {
    const [topic, overall] = await Promise.all([
      topicAccuracy(userId, topicId),
      overallAccuracy(userId)
    ]);

    let here = topic;
    if (here.count < 7) {
      const solo = await soloAccuracy(userId, topicId);
      if (solo.count > here.count) here = solo;
    }

    const fallback =
      overall.count >= 7 ? overall.value : await topicPopulationAccuracy(topicId);

    if (here.value === null) return fallback;
    if (fallback === null) return here.value;

    // Weighted by how much of the player we have actually seen in this topic.
    return (here.count * here.value + TOPIC_PRIOR * fallback) / (here.count + TOPIC_PRIOR);
  } catch (error) {
    console.error('[bot] could not read player history:', error.message);
    return null;
  }
}

async function runBotMatch({ topicId, topicName, opponentNickname, opponentUserId }) {
  const { selfUrl, maxAtOnce, accuracyOffset, speedScale } = settings();

  if (activeBots >= maxAtOnce) {
    console.warn(`[bot] ${activeBots} stand-ins already playing, skipping this one`);
    return null;
  }

  activeBots += 1;

  let connect;
  let seed;
  try {
    connect = await getClientFactory();
    seed = await seedAccuracy(opponentUserId, topicId);
  } catch (error) {
    activeBots -= 1;
    throw error;
  }

  const bot = createBotPlayer({
    avoidNickname: opponentNickname,
    playerAccuracy: seed === null ? NEUTRAL_ACCURACY : seed
  });

  const client = connect(selfUrl, {
    auth: { [BOT_SOCKET_TAG]: true },
    transports: ['websocket'],
    reconnection: false,
    timeout: 5000
  });

  let answerTimer = null;
  let pairingTimer = null;
  let hardStop = null;
  let matched = false;
  let closed = false;
  let currentRound = -1;
  let scoreGap = 0;
  let roundsSeen = 0;
  let opponentCorrect = 0;

  const close = () => {
    if (closed) return;
    closed = true;
    activeBots -= 1;
    clearTimeout(answerTimer);
    clearTimeout(pairingTimer);
    clearTimeout(hardStop);
    try {
      client.close();
    } catch (_error) {
      /* already gone */
    }
  };

  // Anything that means a match is under way, not just match:found, so a slow
  // start can never make the stand-in walk out on a real player.
  const markMatched = () => {
    matched = true;
    clearTimeout(pairingTimer);
  };

  hardStop = setTimeout(close, MATCH_MAX_MS);

  client.on('connect', () => {
    client.emit('queue:join', { topicId, topicName, nickname: bot.nickname });

    // If the queue paired the waiting player with someone else first, step away
    // again rather than lurking for the next person.
    pairingTimer = setTimeout(() => {
      if (!matched) {
        client.emit('queue:leave');
        close();
      }
    }, PAIRING_GRACE_MS);
  });

  client.on('match:found', markMatched);
  client.on('match:countdown', markMatched);
  client.on('match:go', markMatched);

  client.on('round:start', async (payload) => {
    markMatched();
    clearTimeout(answerTimer);
    if (closed) return;

    const { question, questionIndex, totalQuestions, startedAt } = payload || {};
    const round = typeof questionIndex === 'number' ? questionIndex : 0;
    currentRound = round;

    const optionCount = ((question && question.options) || []).length || 4;
    const correctIndex = await resolveCorrectIndex(topicId, question || {});

    // The lookup may have outlived its round.
    if (closed || currentRound !== round) return;

    const { selectedIndex, delayMs } = decideBotAnswer({
      bot,
      correctIndex,
      optionCount,
      scoreGap,
      isLastRound: round === (totalQuestions || 7) - 1,
      opponentAccuracy: roundsSeen > 0 ? opponentCorrect / roundsSeen : null,
      opponentWeight: opponentUserId ? MEMBER_MATCH_WEIGHT : GUEST_MATCH_WEIGHT,
      accuracyOffset,
      speedScale,
      timeLimitMs: TIME_LIMIT_MS
    });

    // Measure from when the round actually started, so a slow lookup cannot
    // push the answer past the clock.
    const elapsed = Math.max(0, Date.now() - (startedAt || Date.now()));
    const wait = Math.max(300, Math.min(delayMs - elapsed, TIME_LIMIT_MS - ANSWER_SAFETY_MS - elapsed));

    answerTimer = setTimeout(() => {
      if (!closed && currentRound === round) client.emit('answer:submit', { selectedIndex });
    }, wait);
  });

  client.on('round:end', (payload) => {
    if (!payload) return;

    scoreGap = (payload.yourScore || 0) - (payload.opponentScore || 0);
    roundsSeen += 1;
    if (payload.opponentAnswer && payload.opponentAnswer.isCorrect) {
      opponentCorrect += 1;
    }
  });

  client.on('match:end', close);
  client.on('error', (payload) => {
    console.error('[bot] server refused the stand-in:', payload && payload.message);
    close();
  });
  client.on('connect_error', (error) => {
    console.error('[bot] could not connect:', error.message);
    close();
  });
  client.on('disconnect', close);

  return bot.nickname;
}

export function attachBotFallback(io, matchManager) {
  io.on('connection', (socket) => {
    // Our own stand-ins connect here too; they never need one of their own.
    if (socket.handshake && socket.handshake.auth && socket.handshake.auth[BOT_SOCKET_TAG]) {
      rememberBotSocket(socket.id);
      socket.on('disconnect', () => forgetBotSocket(socket.id));
      return;
    }

    let waitTimer = null;
    let retryTimer = null;
    let lastJoin = null;
    let attempts = 0;

    const cancel = () => {
      clearTimeout(waitTimer);
      clearTimeout(retryTimer);
      waitTimer = null;
      retryTimer = null;
    };

    const stillWaiting = () => socket.connected && !matchManager.getMatchForSocket(socket.id);

    const scheduleStandIn = (delayMs) => {
      clearTimeout(waitTimer);

      waitTimer = setTimeout(async () => {
        waitTimer = null;

        try {
          // A person turned up in the meantime, or the player left.
          if (!stillWaiting() || !lastJoin) return;

          await runBotMatch(lastJoin);
        } catch (error) {
          console.error('[bot] stand-in failed to start:', error.message);
        }

        // The stand-in can be taken by whoever is at the head of the queue, so
        // check that this player actually got a match, and send another one if
        // they did not. A few tries, then leave them be.
        attempts += 1;
        if (attempts >= MAX_ATTEMPTS) return;

        retryTimer = setTimeout(() => {
          try {
            if (stillWaiting() && lastJoin) scheduleStandIn(RETRY_WAIT_MS);
          } catch (error) {
            console.error('[bot] retry check failed:', error.message);
          }
        }, RETRY_CHECK_MS);
      }, delayMs);
    };

    socket.on('queue:join', ({ topicId, topicName, nickname } = {}) => {
      cancel();

      const { enabled, waitMs } = settings();
      if (!enabled || !topicId) return;

      attempts = 0;
      lastJoin = {
        topicId,
        topicName: String(topicName || 'Topic'),
        opponentNickname: (socket.user && socket.user.username) || String(nickname || '').trim(),
        opponentUserId: (socket.user && socket.user.id) || null
      };

      scheduleStandIn(waitMs);
    });

    socket.on('queue:leave', cancel);
    socket.on('match:leave', cancel);
    socket.on('disconnect', cancel);
  });
}
