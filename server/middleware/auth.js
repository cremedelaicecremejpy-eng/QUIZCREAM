import prisma from '../lib/prisma.js';
import { getBearerToken, verifyToken } from '../auth/jwt.js';
import { userPublicSelect } from '../auth/userFields.js';

export async function optionalAuth(req, _res, next) {
  req.user = null;

  try {
    const token = getBearerToken(req);
    if (!token) return next();

    const payload = verifyToken(token);
    const user = await prisma.user.findUnique({
      where: { id: payload.sub },
      select: userPublicSelect
    });

    if (user) req.user = user;
  } catch (_error) {
    req.user = null;
  }

  return next();
}

export async function requireAuth(req, res, next) {
  await optionalAuth(req, res, () => {});

  if (!req.user) {
    return res.status(401).json({ message: 'Login required.' });
  }

  return next();
}

export async function getUserFromToken(token) {
  if (!token) return null;

  try {
    const payload = verifyToken(token);
    return prisma.user.findUnique({
      where: { id: payload.sub },
      select: userPublicSelect
    });
  } catch (_error) {
    return null;
  }
}
