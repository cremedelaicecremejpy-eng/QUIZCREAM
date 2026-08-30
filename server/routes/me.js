import express from 'express';
import prisma from '../lib/prisma.js';
import { requireAuth } from '../middleware/auth.js';
import { computeUserStats } from '../game/persistMatch.js';
import { userPublicSelect, publicUser } from '../auth/userFields.js';

const router = express.Router();

const ACTIVITY_WINDOW_DAYS = 120;
const USERNAME_MIN_LENGTH = 2;
const USERNAME_MAX_LENGTH = 20;

function sanitizeUsername(username) {
  return String(username || '')
    .trim()
    .replace(/\s+/g, '_')
    .replace(/[^a-zA-Z0-9_]/g, '')
    .slice(0, USERNAME_MAX_LENGTH);
}

function dayKey(date) {
  return new Date(date).toISOString().slice(0, 10);
}

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

// Wins/losses on the User row still include forfeited matches. The profile only
// counts matches that were actually played to the end, so recompute from the
// non-forfeit Match rows instead of trusting the denormalized counters.
async function computeRecord(userId) {
  const matches = await prisma.match.findMany({
    where: {
      forfeit: false,
      OR: [{ player1Id: userId }, { player2Id: userId }]
    },
    select: { winnerId: true, isDraw: true }
  });

  let wins = 0;
  let losses = 0;

  for (const match of matches) {
    if (match.isDraw || !match.winnerId) continue;
    if (match.winnerId === userId) wins += 1;
    else losses += 1;
  }

  return { wins, losses };
}

function computeStreak(dayKeys, todayKey) {
  const days = new Set(dayKeys);
  const msPerDay = 86400000;
  const today = new Date(`${todayKey}T00:00:00.000Z`).getTime();

  let currentStreak = 0;
  // The streak is still "alive" if you played today, or if you played
  // yesterday and today just hasn't happened yet.
  let cursor = days.has(todayKey) ? today : today - msPerDay;
  while (days.has(dayKey(cursor))) {
    currentStreak += 1;
    cursor -= msPerDay;
  }

  let longestStreak = 0;
  let run = 0;
  let prev = null;
  for (const key of [...days].sort()) {
    const time = new Date(`${key}T00:00:00.000Z`).getTime();
    if (prev !== null && time - prev === msPerDay) {
      run += 1;
    } else {
      run = 1;
    }
    prev = time;
    if (run > longestStreak) longestStreak = run;
  }

  return { currentStreak, longestStreak };
}

router.get('/stats', requireAuth, async (req, res) => {
  const userId = req.user.id;

  const [answers, record] = await Promise.all([
    prisma.matchAnswer.findMany({
      where: { userId, match: { forfeit: false } },
      select: {
        matchId: true,
        elapsedMs: true,
        isCorrect: true
      }
    }),
    computeRecord(userId)
  ]);

  res.json(computeUserStats(answers, record));
});

router.get('/matches', requireAuth, async (req, res) => {
  const userId = req.user.id;
  const limit = Math.min(Number(req.query.limit) || 20, 50);

  const matches = await prisma.match.findMany({
    where: {
      forfeit: false,
      OR: [{ player1Id: userId }, { player2Id: userId }]
    },
    include: {
      topic: { select: { name: true } },
      player1: { select: { username: true } },
      player2: { select: { username: true } },
      answers: {
        where: { userId },
        select: { isCorrect: true, elapsedMs: true }
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
      const correctAnswers = match.answers.filter((answer) => answer.isCorrect);
      const wrongAnswers = match.answers.filter((answer) => !answer.isCorrect);
      const avg = (values) =>
        values.length === 0 ? 0 : values.reduce((sum, value) => sum + value, 0) / values.length;

      return {
        id: match.id,
        topicName: match.topic.name,
        createdAt: match.createdAt,
        yourScore: side.yourScore,
        opponentScore: side.opponentScore,
        opponentLabel: side.opponentLabel,
        result: getMatchResult(match, userId),
        correctCount,
        totalQuestions,
        accuracyPercent:
          totalQuestions === 0 ? 0 : Math.round((correctCount / totalQuestions) * 1000) / 10,
        avgAnswerTimeMs: Math.round(avg(match.answers.map((answer) => answer.elapsedMs))),
        avgCorrectTimeMs: Math.round(avg(correctAnswers.map((answer) => answer.elapsedMs))),
        avgWrongTimeMs: Math.round(avg(wrongAnswers.map((answer) => answer.elapsedMs)))
      };
    })
  });
});

router.get('/activity', requireAuth, async (req, res) => {
  const userId = req.user.id;
  const since = new Date(Date.now() - ACTIVITY_WINDOW_DAYS * 86400000);

  const [matches, soloGames] = await Promise.all([
    prisma.match.findMany({
      where: {
        forfeit: false,
        createdAt: { gte: since },
        OR: [{ player1Id: userId }, { player2Id: userId }]
      },
      select: { createdAt: true }
    }),
    prisma.soloGame.findMany({
      where: { userId, createdAt: { gte: since } },
      select: { createdAt: true }
    })
  ]);

  const dayKeys = [
    ...new Set(
      [...matches, ...soloGames].map((entry) => dayKey(entry.createdAt))
    )
  ].sort();

  const todayKey = dayKey(Date.now());
  const { currentStreak, longestStreak } = computeStreak(dayKeys, todayKey);

  res.json({
    today: todayKey,
    days: dayKeys,
    currentStreak,
    longestStreak,
    playedToday: dayKeys.includes(todayKey),
    windowDays: ACTIVITY_WINDOW_DAYS
  });
});

router.post('/solo', requireAuth, async (req, res) => {
  const topicId = String(req.body.topicId || '');
  const score = Math.max(0, Math.round(Number(req.body.score) || 0));
  const correctCount = Math.max(0, Math.round(Number(req.body.correctCount) || 0));
  const totalQuestions = Math.max(0, Math.round(Number(req.body.totalQuestions) || 0));

  if (!topicId || totalQuestions === 0) {
    return res.status(400).json({ message: 'Invalid solo game payload.' });
  }

  const topic = await prisma.topic.findUnique({ where: { id: topicId }, select: { id: true } });
  if (!topic) {
    return res.status(404).json({ message: 'Topic not found.' });
  }

  await prisma.soloGame.create({
    data: {
      userId: req.user.id,
      topicId,
      score,
      correctCount: Math.min(correctCount, totalQuestions),
      totalQuestions
    }
  });

  res.status(201).json({ ok: true });
});

router.patch('/username', requireAuth, async (req, res) => {
  const username = sanitizeUsername(req.body.username);

  if (username.length < USERNAME_MIN_LENGTH) {
    return res
      .status(400)
      .json({ message: `Username must be at least ${USERNAME_MIN_LENGTH} characters.` });
  }

  if (username === req.user.username) {
    return res.json({ user: publicUser(req.user) });
  }

  const existing = await prisma.user.findUnique({ where: { username } });
  if (existing && existing.id !== req.user.id) {
    return res.status(409).json({ message: 'That username is already taken.' });
  }

  const updated = await prisma.user.update({
    where: { id: req.user.id },
    data: { username },
    select: userPublicSelect
  });

  res.json({ user: publicUser(updated) });
});

export default router;
