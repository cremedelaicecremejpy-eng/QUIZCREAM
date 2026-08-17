import jwt from 'jsonwebtoken';

const JWT_SECRET = process.env.JWT_SECRET;

export function signToken(user) {
  if (!JWT_SECRET) {
    throw new Error('JWT_SECRET is not configured.');
  }

  return jwt.sign(
    {
      sub: user.id,
      email: user.email,
      username: user.username
    },
    JWT_SECRET,
    { expiresIn: '30d' }
  );
}

export function verifyToken(token) {
  if (!JWT_SECRET) {
    throw new Error('JWT_SECRET is not configured.');
  }

  return jwt.verify(token, JWT_SECRET);
}

export function getBearerToken(req) {
  const header = req.headers.authorization || '';
  if (!header.startsWith('Bearer ')) return null;
  return header.slice(7).trim();
}
