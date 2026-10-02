import prisma from '../lib/prisma.js';
import { isBotSocket } from './botRegistry.js';
import { levelForXp, xpForMatch, progressForXp } from './levels.js';

function getPlayerEntries(match) {
  return Object.values(match.players);
}

export async function persistMatchResult(match, { winnerSocketId, isDraw, forfeit = false }) {
  const entries = getPlayerEntries(match);
  const [playerOne, playerTwo] = entries;

  if (!playerOne.userId && !playerTwo.userId) {
    return null;
  }

  let winnerId = null;
  if (!isDraw && winnerSocketId && winnerSocketId !== 'draw') {
    winnerId = match.players[winnerSocketId]?.userId || null;
  }

  return prisma.$transaction(async (tx) => {
    const dbMatch = await tx.match.create({
      data: {
        topicId: match.topicId,
        player1Id: playerOne.userId,
        player2Id: playerTwo.userId,
        guestName1: playerOne.userId ? null : playerOne.nickname,
        guestName2: playerTwo.userId ? null : playerTwo.nickname,
        player1Score: playerOne.score,
        player2Score: playerTwo.score,
        winnerId,
        isDraw,
        forfeit,
        // A match played against a stand-in rival, so these results can be left
        // out of anything that is meant to measure real players.
        vsBot: entries.some((entry) => isBotSocket(entry.socketId))
      }
    });

    const answerRows = [];

    match.roundHistory.forEach((round, questionIndex) => {
      for (const [socketId, result] of Object.entries(round.results)) {
        const player = match.players[socketId];
        if (!player?.userId) continue;

        answerRows.push({
          matchId: dbMatch.id,
          userId: player.userId,
          // Which question this was, so difficulty can later be measured from
          // how often people actually get it right.
          questionId: match.questions?.[questionIndex]?.id ?? null,
          questionIndex,
          elapsedMs: result.elapsedMs,
          isCorrect: result.isCorrect,
          points: result.points,
          selectedIndex: result.selectedIndex
        });
      }
    });

    if (answerRows.length > 0) {
      await tx.matchAnswer.createMany({ data: answerRows });
    }

    if (!isDraw && winnerSocketId && winnerSocketId !== 'draw') {
      const winner = match.players[winnerSocketId];
      const loser = entries.find((entry) => entry.socketId !== winnerSocketId);

      if (winner?.userId) {
        await tx.user.update({
          where: { id: winner.userId },
          data: { wins: { increment: 1 } }
        });
      }

      if (loser?.userId) {
        await tx.user.update({
          where: { id: loser.userId },
          data: { losses: { increment: 1 } }
        });
      }
    }

    // Experience, for signed-in players only. Guests have nothing to save it
    // to, and solo practice never reaches this function at all.
    const progress = {};

    for (const entry of entries) {
      if (!entry.userId) continue;

      // A forfeit pays for the questions actually answered, but no win bonus:
      // nobody should be able to farm wins by having a rival walk out.
      const won = !isDraw && !forfeit && entry.socketId === winnerSocketId;
      const gained = xpForMatch({ score: entry.score, won });

      const where = { userId_topicId: { userId: entry.userId, topicId: match.topicId } };
      const existing = await tx.topicProgress.findUnique({ where, select: { xp: true } });
      const before = existing?.xp ?? 0;
      const after = before + gained;

      await tx.topicProgress.upsert({
        where,
        create: {
          userId: entry.userId,
          topicId: match.topicId,
          xp: after,
          level: levelForXp(after),
          matches: 1
        },
        update: { xp: after, level: levelForXp(after), matches: { increment: 1 } }
      });

      const user = await tx.user.update({
        where: { id: entry.userId },
        data: { totalXp: { increment: gained } },
        select: { totalXp: true }
      });

      progress[entry.socketId] = {
        gained,
        topic: progressForXp(after),
        overall: progressForXp(user.totalXp),
        leveledUp: levelForXp(after) > levelForXp(before)
      };
    }

    return { matchId: dbMatch.id, progress };
  });
}

export function computeUserStats(answers, user) {
  const totalAnswers = answers.length;
  const totalCorrect = answers.filter((answer) => answer.isCorrect).length;
  const correctAnswers = answers.filter((answer) => answer.isCorrect);
  const wrongAnswers = answers.filter((answer) => !answer.isCorrect);

  const avg = (values) =>
    values.length === 0 ? 0 : values.reduce((sum, value) => sum + value, 0) / values.length;

  const matchIds = new Set(answers.map((answer) => answer.matchId));
  const totalMatches = matchIds.size;

  const correctByMatch = new Map();
  for (const answer of answers) {
    correctByMatch.set(answer.matchId, (correctByMatch.get(answer.matchId) || 0) + (answer.isCorrect ? 1 : 0));
  }

  const avgCorrectPerMatch =
    totalMatches === 0
      ? 0
      : [...correctByMatch.values()].reduce((sum, count) => sum + count, 0) / totalMatches;

  const decidedMatches = user.wins + user.losses;

  return {
    wins: user.wins,
    losses: user.losses,
    winPercent: decidedMatches === 0 ? 0 : round((user.wins / decidedMatches) * 100, 1),
    totalMatches,
    totalQuestions: totalAnswers,
    totalCorrect,
    avgCorrectPerMatch: round(avgCorrectPerMatch, 2),
    avgAnswerTimeMs: round(avg(answers.map((answer) => answer.elapsedMs)), 0),
    avgCorrectTimeMs: round(avg(correctAnswers.map((answer) => answer.elapsedMs)), 0),
    avgWrongTimeMs: round(avg(wrongAnswers.map((answer) => answer.elapsedMs)), 0),
    accuracyPercent: totalAnswers === 0 ? 0 : round((totalCorrect / totalAnswers) * 100, 1)
  };
}

function round(value, digits) {
  const factor = 10 ** digits;
  return Math.round(value * factor) / factor;
}

export function formatMs(ms) {
  if (!ms) return '—';
  return `${(ms / 1000).toFixed(2)}s`;
}
