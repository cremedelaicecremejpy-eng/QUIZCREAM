import express from 'express';
import prisma from '../lib/prisma.js';
import { computeUserStats } from '../game/persistMatch.js';

const router = express.Router();

router.get('/:username/stats', async (req, res) => {
  const username = String(req.params.username || '').trim();

  if (username.length < 3) {
    return res.status(400).json({ message: 'Enter a valid username.' });
  }

  const user = await prisma.user.findUnique({
    where: { username },
    select: { id: true, username: true, wins: true, losses: true }
  });

  if (!user) {
    return res.status(404).json({ message: 'User not found.' });
  }

  const answers = await prisma.matchAnswer.findMany({
    where: { userId: user.id },
    select: {
      matchId: true,
      elapsedMs: true,
      isCorrect: true
    }
  });

  res.json({
    username: user.username,
    ...computeUserStats(answers, user)
  });
});

export default router;
