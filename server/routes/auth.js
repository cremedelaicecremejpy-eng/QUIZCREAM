import express from 'express';
import prisma from '../lib/prisma.js';
import { signToken } from '../auth/jwt.js';
import { hashPassword, verifyPassword, validatePassword } from '../auth/password.js';
import { isGoogleAuthConfigured, verifyGoogleCredential } from '../auth/google.js';
import { requireAuth } from '../middleware/auth.js';

const router = express.Router();

function sanitizeEmail(email) {
  return String(email || '').trim().toLowerCase();
}

function sanitizeUsername(username) {
  return String(username || '')
    .trim()
    .replace(/\s+/g, '_')
    .slice(0, 20);
}

function publicUser(user) {
  return {
    id: user.id,
    email: user.email,
    username: user.username,
    wins: user.wins,
    losses: user.losses,
    isPro: user.isPro,
    createdAt: user.createdAt
  };
}

async function uniqueUsername(baseUsername) {
  let username = sanitizeUsername(baseUsername) || 'player';
  username = username.replace(/[^a-zA-Z0-9_]/g, '').slice(0, 20) || 'player';

  let candidate = username;
  let suffix = 1;

  while (await prisma.user.findUnique({ where: { username: candidate } })) {
    candidate = `${username.slice(0, 16)}${suffix}`;
    suffix += 1;
  }

  return candidate;
}

router.get('/config', (_req, res) => {
  res.json({
    googleClientId: process.env.GOOGLE_CLIENT_ID || null,
    googleEnabled: isGoogleAuthConfigured()
  });
});

router.post('/register', async (req, res) => {
  try {
    const email = sanitizeEmail(req.body.email);
    const username = sanitizeUsername(req.body.username);
    const password = String(req.body.password || '');

    if (!email.includes('@')) {
      return res.status(400).json({ message: 'Enter a valid email address.' });
    }

    if (username.length < 3) {
      return res.status(400).json({ message: 'Username must be at least 3 characters.' });
    }

    validatePassword(password);

    const existingEmail = await prisma.user.findUnique({ where: { email } });
    if (existingEmail) {
      return res.status(409).json({ message: 'An account with this email already exists.' });
    }

    const existingUsername = await prisma.user.findUnique({ where: { username } });
    if (existingUsername) {
      return res.status(409).json({ message: 'That username is already taken.' });
    }

    const passwordHash = await hashPassword(password);
    const user = await prisma.user.create({
      data: {
        email,
        username,
        password: passwordHash
      }
    });

    const token = signToken(user);
    res.status(201).json({ token, user: publicUser(user) });
  } catch (error) {
    res.status(400).json({ message: error.message });
  }
});

router.post('/login', async (req, res) => {
  try {
    const email = sanitizeEmail(req.body.email);
    const password = String(req.body.password || '');

    const user = await prisma.user.findUnique({ where: { email } });
    if (!user || !user.password) {
      return res.status(401).json({
        message: user?.googleId
          ? 'This account uses Google sign-in.'
          : 'Invalid email or password.'
      });
    }

    const valid = await verifyPassword(password, user.password);
    if (!valid) {
      return res.status(401).json({ message: 'Invalid email or password.' });
    }

    const token = signToken(user);
    res.json({ token, user: publicUser(user) });
  } catch (error) {
    res.status(400).json({ message: error.message });
  }
});

router.post('/google', async (req, res) => {
  try {
    const credential = String(req.body.credential || '');
    if (!credential) {
      return res.status(400).json({ message: 'Missing Google credential.' });
    }

    const payload = await verifyGoogleCredential(credential);
    const email = sanitizeEmail(payload.email);
    const googleId = payload.sub;

    if (!email) {
      return res.status(400).json({ message: 'Google account has no email.' });
    }

    let user = await prisma.user.findUnique({ where: { googleId } });

    if (!user) {
      user = await prisma.user.findUnique({ where: { email } });
    }

    if (user) {
      if (!user.googleId) {
        user = await prisma.user.update({
          where: { id: user.id },
          data: { googleId }
        });
      }
    } else {
      const username = await uniqueUsername(payload.name || email.split('@')[0]);
      user = await prisma.user.create({
        data: {
          email,
          username,
          googleId
        }
      });
    }

    const token = signToken(user);
    res.json({ token, user: publicUser(user) });
  } catch (error) {
    res.status(400).json({ message: error.message });
  }
});

router.get('/me', requireAuth, (req, res) => {
  res.json({ user: publicUser(req.user) });
});

export default router;
