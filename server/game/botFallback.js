// Nobody likes staring at a waiting screen. If a 1v1 player has been queued
// for a while and no one else has shown up, a stand-in rival joins the same
// queue and plays the match like any other opponent.
//
// The stand-in connects to this server as an ordinary Socket.IO client, so it
// goes through the same queue, the same MatchManager and the same result
// persistence as a person would. Nothing else in the game needs to know.

import prisma from '../lib/prisma.js';
import { createBotPlayer, decideBotAnswer, BOT_SOCKET_TAG } from './botPlayer.js';

// Read at call time, not at import time: this module is imported before
// dotenv.config() runs, so anything read up here would miss .env entirely.
function settings() {
  return {
    enabled: String(process.env.BOT_MATCH_ENABLED || 'true') !== 'false',
    waitMs: Number(process.env.BOT_MATCH_DELAY_MS || 15000),
    selfUrl: process.env.BOT_SELF_URL || `http://127.0.0.1:${process.env.PORT || 3001}`,
    maxAtOnce: Number(process.env.BOT_MAX_CONCURRENT || 25)
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

// How well the waiting player does, so the stand-in can start at their level
// instead of guessing. Ordered by id, which runs roughly in time order for the
// ids this app uses. Guests have no history, and that is fine: the match
// itself tells the stand-in soon enough.
async function playerAccuracy(userId) {
  if (!userId) return null;

  try {
    const answers = await prisma.matchAnswer.findMany({
      where: { userId },
      select: { isCorrect: true },
      orderBy: { id: 'desc' },
      take: 200
    });

    if (answers.length < 7) return null;

    const correct = answers.filter((answer) => answer.isCorrect).length;
    return correct / answers.length;
  } catch (error) {
    console.error('[bot] could not read player history:', error.message);
    return null;
  }
}

async function runBotMatch({ topicId, topicName, opponentNickname, opponentUserId }) {
  const { selfUrl, maxAtOnce } = settings();

  if (activeBots >= maxAtOnce) {
    console.warn(`[bot] ${activeBots} stand-ins already playing, skipping this one`);
    return null;
  }

  const connect = await getClientFactory();
  const bot = createBotPlayer({
    avoidNickname: opponentNickname,
    playerAccuracy: await playerAccuracy(opponentUserId)
  });

  const client = connect(selfUrl, {
    auth: { [BOT_SOCKET_TAG]: true },
    transports: ['websocket'],
    reconnection: false,
    timeout: 5000
  });

  activeBots += 1;

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
      return;
    }

    let waitTimer = null;
    let retryTimer = null;
    let lastJoin = null;

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

        // A person turned up in the meantime, or the player left.
        if (!stillWaiting() || !lastJoin) return;

        try {
          await runBotMatch(lastJoin);
        } catch (error) {
          console.error('[bot] stand-in failed to start:', error.message);
        }

        // The stand-in can be taken by whoever is at the head of the queue, so
        // check that this player actually got a match, and send another one if
        // they did not.
        retryTimer = setTimeout(() => {
          if (stillWaiting() && lastJoin) scheduleStandIn(RETRY_WAIT_MS);
        }, RETRY_CHECK_MS);
      }, delayMs);
    };

    socket.on('queue:join', ({ topicId, topicName, nickname } = {}) => {
      cancel();

      const { enabled, waitMs } = settings();
      if (!enabled || !topicId) return;

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
