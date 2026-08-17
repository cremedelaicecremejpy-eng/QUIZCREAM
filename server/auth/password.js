import bcrypt from 'bcryptjs';

const MIN_PASSWORD_LENGTH = 8;

export function validatePassword(password) {
  if (!password || password.length < MIN_PASSWORD_LENGTH) {
    throw new Error(`Password must be at least ${MIN_PASSWORD_LENGTH} characters.`);
  }
}

export async function hashPassword(password) {
  validatePassword(password);
  return bcrypt.hash(password, 12);
}

export async function verifyPassword(password, hash) {
  if (!hash) return false;
  return bcrypt.compare(password, hash);
}
