import express from 'express';
import prisma from '../lib/prisma.js';
import { requireAuth } from '../middleware/auth.js';
import { computeUserStats } from '../game/persistMatch.js';

const router = express.Router();

function getUserMatchSide(match, userId) {
  if (match.player1Id === userId) {
    return {
      yourScore: match.player1Score,
      opponentScore: match.player2Score,
      opponentLabel: match.player2?.username || match.guestName2 || 'Guest'
    };
  }

  return {
    yourScore: match.player2Score,
    opponentScore: match.player1Score,
    opponentLabel: match.player1?.username || match.guestName1 || 'Guest'
  };
}

function getMatchResult(match, userId) {
  if (match.isDraw) return 'draw';
  if (match.winnerId === userId) return 'win';
  if (match.winnerId) return 'loss';
  return 'draw';
}

router.get('/stats', requireAuth, async (req, res) => {
  const userId = req.user.id;

  const [user, answers] = await Promise.all([
    prisma.user.findUnique({
      where: { id: userId },
      select: { wins: true, losses: true }
    }),
    prisma.matchAnswer.findMany({
      where: { userId },
      select: {
        matchId: true,
        elapsedMs: true,
        isCorrect: true
      }
    })
  ]);

  if (!user) {
    return res.status(404).json({ message: 'User not found.' });
  }

  res.json(computeUserStats(answers, user));
});

router.get('/matches', requireAuth, async (req, res) => {
  const userId = req.user.id;
  const limit = Math.min(Number(req.query.limit) || 20, 50);

  const matches = await prisma.match.findMany({
    where: {
      OR: [{ player1Id: userId }, { player2Id: userId }]
    },
    include: {
      topic: { select: { name: true } },
      player1: { select: { username: true } },
      player2: { select: { username: true } },
      answers: {
        where: { userId },
        select: { isCorrect: true }
      }
    },
    orderBy: { createdAt: 'desc' },
    take: limit
  });

  res.json({
    matches: matches.map((match) => {
      const side = getUserMatchSide(match, userId);
      const correctCount = match.answers.filter((answer) => answer.isCorrect).length;
      const totalQuestions = match.answers.length;

      return {
        id: match.id,
        topicName: match.topic.name,
        createdAt: match.createdAt,
        yourScore: side.yourScore,
        opponentScore: side.opponentScore,
        opponentLabel: side.opponentLabel,
        result: getMatchResult(match, userId),
        forfeit: match.forfeit,
        correctCount,
        totalQuestions,
        accuracyPercent:
          totalQuestions === 0 ? 0 : Math.round((correctCount / totalQuestions) * 1000) / 10
      };
    })
  });
});

export default router;
