import http from 'http';
import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';
import { Server } from 'socket.io';
import prisma from './lib/prisma.js';
import { pickQuestionsForMatch } from './game/questions.js';
import { joinQueue, leaveQueue } from './matchmaking/queue.js';
import { MatchManager } from './game/matchManager.js';
import authRouter from './routes/auth.js';
import meRouter from './routes/me.js';
import usersRouter from './routes/users.js';
import { getUserFromToken } from './middleware/auth.js';

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const publicDir = path.join(__dirname, 'public');

const app = express();
const server = http.createServer(app);
const io = new Server(server, {
  cors: { origin: '*' }
});

const matchManager = new MatchManager(io);
const PORT = process.env.PORT || 3001;

app.use(cors());
app.use(express.json());
app.use(express.static(publicDir));

app.use('/api/auth', authRouter);
app.use('/api/me', meRouter);
app.use('/api/users', usersRouter);

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

  try {
    const picked = await pickQuestionsForMatch(req.params.topicId, count);
    res.json(picked);
  } catch (error) {
    res.status(400).json({ message: error.message });
  }
});

app.get('/', (_req, res) => {
  res.sendFile(path.join(publicDir, 'index.html'));
});

io.use(async (socket, next) => {
  try {
    const token = socket.handshake.auth?.token;
    socket.user = token ? await getUserFromToken(token) : null;
  } catch (_error) {
    socket.user = null;
  }
  next();
});

io.on('connection', (socket) => {
  socket.on('queue:join', async ({ topicId, topicName, nickname }) => {
    try {
      if (matchManager.getMatchForSocket(socket.id)) {
        socket.emit('error', { message: 'You are already in a match.' });
        return;
      }

      const cleanNickname = socket.user?.username
        || String(nickname || 'Player').trim().slice(0, 20)
        || 'Player';
      const cleanTopicName = String(topicName || 'Topic');

      const paired = joinQueue(topicId, {
        socketId: socket.id,
        nickname: cleanNickname,
        userId: socket.user?.id || null
      });

      if (!paired) {
        socket.emit('queue:waiting', { topicName: cleanTopicName });
        return;
      }

      await matchManager.startMatch(paired[0], paired[1], {
        id: topicId,
        name: cleanTopicName
      });
    } catch (error) {
      leaveQueue(socket.id);
      socket.emit('error', { message: error.message });
    }
  });

  socket.on('queue:leave', () => {
    leaveQueue(socket.id);
  });

  socket.on('answer:submit', ({ selectedIndex }) => {
    if (typeof selectedIndex !== 'number') return;
    matchManager.submitAnswer(socket.id, selectedIndex);
  });

  socket.on('match:leave', () => {
    leaveQueue(socket.id);
    matchManager.handleDisconnect(socket.id);
  });

  socket.on('disconnect', () => {
    leaveQueue(socket.id);
    matchManager.handleDisconnect(socket.id);
  });
});

server.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});
