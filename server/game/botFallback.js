// Nobody likes staring at a waiting screen. If a 1v1 player has been queued
// for a while and no one else has shown up, a stand-in rival joins the same
// queue and plays the match like any other opponent.
//
// The stand-in connects to this server as an ordinary Socket.IO client, so it
// goes through the same queue, the same MatchManager and the same result
// persistence as a person would. Nothing else in the game needs to know.

import prisma from '../lib/prisma.js';
import { createBotPlayer, decideBotAnswer, BOT_SOCKET_TAG } from './botPlayer.js';

const WAIT_MS = Number(process.env.BOT_MATCH_DELAY_MS || 15000);
const ENABLED = String(process.env.BOT_MATCH_ENABLED || 'true') !== 'false';
const SELF_URL = process.env.BOT_SELF_URL || `http://127.0.0.1:${process.env.PORT || 3001}`;
const PAIRING_GRACE_MS = 2500;
const MATCH_MAX_MS = 5 * 60 * 1000;
const TIME_LIMIT_MS = 7000;

let clientFactory = null;

async function getClientFactory() {
  if (!clientFactory) {
    const mod = await import('socket.io-client');
    clientFactory = mod.io || mod.connect || (mod.default && mod.default.io) || mod.default;
  }
  return clientFactory;
}

// The match payload never carries the right answer, so look it up the same way
// the round was built: by topic and question text.
async function resolveCorrectIndex(topicId, question) {
  const options = (question && question.options) || [];

  try {
    const row = await prisma.question.findFirst({
      where: { topicId, text: question.text || '' }
    });

    if (!row || !row.correctOption) return -1;

    const correctText = row[`option${row.correctOption}`] || '';
    const correctImage = row[`option${row.correctOption}ImageUrl`] || null;

    let index = correctText
      ? options.findIndex((option) => (option.text || '') === correctText)
      : -1;

    if (index < 0 && correctImage) {
      index = options.findIndex((option) => option.imageUrl === correctImage);
    }

    return index;
  } catch (error) {
    console.error('[bot] could not resolve the answer:', error.message);
    return -1;
  }
}

// How well the waiting player usually does, so the stand-in can start at their
// level instead of guessing. Guests have no history, and that is fine: the
// match itself tells the stand-in soon enough.
async function recentAccuracy(userId) {
  if (!userId) return null;

  try {
    const answers = await prisma.matchAnswer.findMany({
      where: { userId },
      select: { isCorrect: true },
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
  const connect = await getClientFactory();
  const playerAccuracy = await recentAccuracy(opponentUserId);
  const bot = createBotPlayer({ avoidNickname: opponentNickname, playerAccuracy });

  const client = connect(SELF_URL, {
    auth: { [BOT_SOCKET_TAG]: true },
    transports: ['websocket'],
    reconnection: false,
    timeout: 5000
  });

  let answerTimer = null;
  let pairingTimer = null;
  let hardStop = null;
  let matched = false;
  let scoreGap = 0;
  let closed = false;
  let roundsSeen = 0;
  let opponentCorrect = 0;

  const close = () => {
    if (closed) return;
    closed = true;
    clearTimeout(answerTimer);
    clearTimeout(pairingTimer);
    clearTimeout(hardStop);
    try {
      client.close();
    } catch (_error) {
      /* already gone */
    }
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

  client.on('match:found', () => {
    matched = true;
    clearTimeout(pairingTimer);
  });

  client.on('round:start', async (payload) => {
    // Drop any answer still pending from the round before.
    clearTimeout(answerTimer);
    if (closed) return;

    const { question, questionIndex, totalQuestions } = payload || {};
    const optionCount = ((question && question.options) || []).length || 4;
    const correctIndex = await resolveCorrectIndex(topicId, question || {});

    if (closed) return;

    const { selectedIndex, delayMs } = decideBotAnswer({
      bot,
      correctIndex,
      optionCount,
      scoreGap,
      isLastRound: questionIndex === (totalQuestions || 7) - 1,
      opponentAccuracy: roundsSeen > 0 ? opponentCorrect / roundsSeen : null,
      timeLimitMs: TIME_LIMIT_MS
    });

    answerTimer = setTimeout(() => {
      client.emit('answer:submit', { selectedIndex });
    }, delayMs);
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
  if (!ENABLED) {
    console.log('[bot] stand-in rivals are switched off (BOT_MATCH_ENABLED=false)');
    return;
  }

  console.log(`[bot] stand-in rival joins after ${WAIT_MS}ms of waiting`);

  io.on('connection', (socket) => {
    // Our own stand-ins connect here too; they never need one of their own.
    if (socket.handshake && socket.handshake.auth && socket.handshake.auth[BOT_SOCKET_TAG]) {
      return;
    }

    let waitTimer = null;

    const cancel = () => {
      clearTimeout(waitTimer);
      waitTimer = null;
    };

    socket.on('queue:join', ({ topicId, topicName, nickname } = {}) => {
      cancel();

      if (!topicId) return;

      waitTimer = setTimeout(async () => {
        waitTimer = null;

        // A person turned up in the meantime, or the player left.
        if (!socket.connected) return;
        if (matchManager.getMatchForSocket(socket.id)) return;

        const playerName =
          (socket.user && socket.user.username) || String(nickname || '').trim();

        try {
          await runBotMatch({
            topicId,
            topicName: String(topicName || 'Topic'),
            opponentNickname: playerName,
            opponentUserId: (socket.user && socket.user.id) || null
          });
        } catch (error) {
          console.error('[bot] stand-in failed to start:', error.message);
        }
      }, WAIT_MS);
    });

    socket.on('queue:leave', cancel);
    socket.on('match:leave', cancel);
    socket.on('disconnect', cancel);
  });
}
