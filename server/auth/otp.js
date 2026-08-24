import crypto from 'crypto';

export const OTP_TTL_MS = 10 * 60 * 1000;
export const OTP_RESEND_MS = 60 * 1000;
export const MAX_OTP_ATTEMPTS = 5;

function otpPepper() {
  return process.env.JWT_SECRET || 'quizcream-dev-otp-pepper';
}

export function generateOtpCode() {
  return String(Math.floor(100000 + Math.random() * 900000));
}

export function hashOtp(code) {
  return crypto.createHash('sha256').update(`${String(code)}:${otpPepper()}`).digest('hex');
}

export function verifyOtpCode(code, hash) {
  if (!hash) return false;
  return hashOtp(code) === hash;
}

export function getOtpExpiry() {
  return new Date(Date.now() + OTP_TTL_MS);
}

export function canResendOtp(sentAt) {
  if (!sentAt) return true;
  return Date.now() - sentAt.getTime() >= OTP_RESEND_MS;
}

export function isOtpExpired(expiresAt) {
  return !expiresAt || expiresAt.getTime() < Date.now();
}
