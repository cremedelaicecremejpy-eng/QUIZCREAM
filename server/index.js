import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';
import prisma from './lib/prisma.js';

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.join(__dirname, '..');

const app = express();
const PORT = process.env.PORT || 3001;

app.use(cors());
app.use(express.json());
app.use(express.static(rootDir));

app.get('/api/health', async (_req, res) => {
  try {
    await prisma.$queryRaw`SELECT 1`;
    res.json({ ok: true, message: 'Connected to Neon database' });
  } catch (error) {
    res.status(500).json({ ok: false, message: error.message });
  }
});

app.get('/api/topics', async (_req, res) => {
  const topics = await prisma.topic.findMany({
    select: {
      id: true,
      name: true,
      _count: { select: { questions: true } }
    },
    orderBy: { name: 'asc' }
  });

  res.json(topics);
});

app.get('/api/topics/:topicId/questions/random', async (req, res) => {
  const count = Math.min(Number(req.query.count) || 7, 20);
  const topicId = req.params.topicId;

  const all = await prisma.question.findMany({ where: { topicId } });

  if (all.length < count) {
    return res.status(400).json({
      message: `Topic needs at least ${count} questions. Found ${all.length}.`
    });
  }

  const shuffled = [...all];
  for (let i = shuffled.length - 1; i > 0; i -= 1) {
    const j = Math.floor(Math.random() * (i + 1));
    [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
  }

  const picked = shuffled.slice(0, count).map((q) => {
    const options = [q.optionA, q.optionB, q.optionC, q.optionD];
    const correctIndex = ['A', 'B', 'C', 'D'].indexOf(q.correctOption);

    const indexed = options.map((text, index) => ({ text, index }));
    for (let i = indexed.length - 1; i > 0; i -= 1) {
      const j = Math.floor(Math.random() * (i + 1));
      [indexed[i], indexed[j]] = [indexed[j], indexed[i]];
    }

    const shuffledOptions = indexed.map((item) => item.text);
    const shuffledCorrectIndex = indexed.findIndex((item) => item.index === correctIndex);

    return {
      id: q.id,
      text: q.text,
      options: shuffledOptions,
      correctIndex: shuffledCorrectIndex
    };
  });

  res.json(picked);
});

app.get('/', (_req, res) => {
  res.sendFile(path.join(rootDir, 'index.html'));
});

app.listen(PORT, () => {
  console.log(`Server running on http://localhost:${PORT}`);
});
