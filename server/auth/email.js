import crypto from 'crypto';

const VERIFICATION_TTL_MS = 24 * 60 * 60 * 1000;
const RESEND_MIN_INTERVAL_MS = 60 * 1000;

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
  if (!user.verificationTokenExpiresAt) return true;

  const tokenCreatedAt =
    user.verificationTokenExpiresAt.getTime() - VERIFICATION_TTL_MS;
  return Date.now() - tokenCreatedAt >= RESEND_MIN_INTERVAL_MS;
}

export function isValidEmailFormat(email) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

export async function sendVerificationEmail({ email, username, token }) {
  const apiKey = process.env.RESEND_API_KEY;
  const from = process.env.EMAIL_FROM || 'QUIZCREAM <onboarding@resend.dev>';
  const appUrl = (process.env.APP_URL || 'http://localhost:3001').replace(/\/$/, '');

  if (!apiKey) {
    throw new Error('Email verification is not configured.');
  }

  const verifyUrl = `${appUrl}/api/auth/verify-email?token=${encodeURIComponent(token)}`;

  const response = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      from,
      to: [email],
      subject: 'Verify your QUIZCREAM account',
      html: `
        <div style="font-family: Arial, sans-serif; max-width: 520px; margin: 0 auto; color: #111827;">
          <h1 style="color: #667eea; margin-bottom: 0.5rem;">Quiz Cream</h1>
          <p>Hi ${username},</p>
          <p>Thanks for signing up. Click the button below to verify your email and start playing.</p>
          <p style="margin: 2rem 0;">
            <a href="${verifyUrl}" style="background: #667eea; color: #ffffff; padding: 12px 20px; border-radius: 10px; text-decoration: none; font-weight: 600;">
              Verify email
            </a>
          </p>
          <p style="color: #6b7280; font-size: 14px;">This link expires in 24 hours.</p>
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
