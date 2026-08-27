import crypto from 'crypto';
import { generateOtpCode, getOtpExpiry, hashOtp, verifyOtpCode, canResendOtp as canResendOtpBase, isOtpExpired, MAX_OTP_ATTEMPTS } from './otp.js';

const VERIFICATION_TTL_MS = 24 * 60 * 60 * 1000;
const RESEND_MIN_INTERVAL_MS = 60 * 1000;

export { MAX_OTP_ATTEMPTS };

export function isEmailVerificationEnabled() {
  return Boolean(process.env.RESEND_API_KEY);
}

export function createVerificationToken() {
  return crypto.randomBytes(32).toString('hex');
}

export function getVerificationExpiry() {
  return new Date(Date.now() + VERIFICATION_TTL_MS);
}

export function canResendVerification(user) {
  if (user.emailOtpSentAt && !canResendOtpBase(user.emailOtpSentAt)) {
    return false;
  }

  if (!user.verificationTokenExpiresAt) return true;

  const tokenCreatedAt =
    user.verificationTokenExpiresAt.getTime() - VERIFICATION_TTL_MS;
  return Date.now() - tokenCreatedAt >= RESEND_MIN_INTERVAL_MS;
}

export function createEmailOtpPayload() {
  const code = generateOtpCode();

  return {
    code,
    emailOtpHash: hashOtp(code),
    emailOtpExpiresAt: getOtpExpiry(),
    emailOtpSentAt: new Date(),
    emailOtpAttempts: 0
  };
}

export function verifyEmailOtp(user, code) {
  if (!user.emailOtpHash || isOtpExpired(user.emailOtpExpiresAt)) {
    throw new Error('That code expired. Request a new one.');
  }

  if (user.emailOtpAttempts >= MAX_OTP_ATTEMPTS) {
    throw new Error('Too many incorrect attempts. Request a new code.');
  }

  if (!verifyOtpCode(code, user.emailOtpHash)) {
    throw new Error('Invalid code.');
  }

  return true;
}

export function isValidEmailFormat(email) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

function appName() {
  return process.env.APP_NAME || 'Quticks';
}

export async function sendVerificationEmail({ email, username, token, otpCode }) {
  const apiKey = process.env.RESEND_API_KEY;
  const brand = appName();
  const from = process.env.EMAIL_FROM || `${brand} <onboarding@resend.dev>`;
  const appUrl = (process.env.APP_URL || 'http://localhost:3001').replace(/\/$/, '');

  if (!apiKey) {
    throw new Error('Email verification is not configured.');
  }

  const verifyUrl = `${appUrl}/api/auth/verify-email?token=${encodeURIComponent(token)}`;
  const otpBlock = otpCode
    ? `<p style="font-size: 28px; font-weight: 700; letter-spacing: 0.3em; color: #667eea; margin: 1.5rem 0;">${otpCode}</p>
       <p style="color: #6b7280; font-size: 14px;">Or enter this 6-digit code on the verify screen. It expires in 10 minutes.</p>`
    : '';

  const response = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      from,
      to: [email],
      subject: `Verify your ${brand} account`,
      html: `
        <div style="font-family: Arial, sans-serif; max-width: 520px; margin: 0 auto; color: #111827;">
          <h1 style="color: #667eea; margin-bottom: 0.5rem;">${brand}</h1>
          <p>Hi ${username},</p>
          <p>Thanks for signing up on ${brand}. Verify your email using the code below or the button.</p>
          ${otpBlock}
          <p style="margin: 2rem 0;">
            <a href="${verifyUrl}" style="background: #667eea; color: #ffffff; padding: 12px 20px; border-radius: 10px; text-decoration: none; font-weight: 600;">
              Verify email
            </a>
          </p>
          <p style="color: #6b7280; font-size: 14px;">The link expires in 24 hours.</p>
          <p style="color: #6b7280; font-size: 14px;">If the button does not work, copy this link into your browser:</p>
          <p style="color: #6b7280; font-size: 14px; word-break: break-all;">${verifyUrl}</p>
        </div>
      `
    })
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`Failed to send verification email: ${errorText}`);
  }
}
