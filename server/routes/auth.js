import express from 'express';
import prisma from '../lib/prisma.js';
import { signToken } from '../auth/jwt.js';
import { hashPassword, verifyPassword, validatePassword } from '../auth/password.js';
import { isGoogleAuthConfigured, verifyGoogleCredential } from '../auth/google.js';
import {
  canResendVerification,
  createVerificationToken,
  createEmailOtpPayload,
  getVerificationExpiry,
  isEmailVerificationEnabled,
  isValidEmailFormat,
  sendVerificationEmail,
  verifyEmailOtp
} from '../auth/email.js';
import {
  canResendOtp,
  createPhoneOtpPayload,
  isPhoneOtpEnabled,
  maskPhone,
  normalizePhone,
  sendPhoneOtpSms,
  syntheticEmailForPhone,
  verifyPhoneOtp
} from '../auth/phone.js';
import { publicUser } from '../auth/userFields.js';
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

function appBaseUrl() {
  return (process.env.APP_URL || 'http://localhost:3001').replace(/\/$/, '');
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

async function issueVerification(user) {
  const token = createVerificationToken();
  const verificationTokenExpiresAt = getVerificationExpiry();
  const emailOtp = createEmailOtpPayload();

  await prisma.user.update({
    where: { id: user.id },
    data: {
      verificationToken: token,
      verificationTokenExpiresAt,
      emailOtpHash: emailOtp.emailOtpHash,
      emailOtpExpiresAt: emailOtp.emailOtpExpiresAt,
      emailOtpSentAt: emailOtp.emailOtpSentAt,
      emailOtpAttempts: 0
    }
  });

  await sendVerificationEmail({
    email: user.email,
    username: user.username,
    token,
    otpCode: emailOtp.code
  });
}

function verificationRequiredResponse(res, email) {
  return res.status(403).json({
    message: 'Please verify your email before signing in.',
    requiresVerification: true,
    email
  });
}

router.get('/config', (_req, res) => {
  res.json({
    googleClientId: process.env.GOOGLE_CLIENT_ID || null,
    googleEnabled: isGoogleAuthConfigured(),
    emailVerificationEnabled: isEmailVerificationEnabled(),
    phoneOtpEnabled: isPhoneOtpEnabled()
  });
});

router.get('/verify-email', async (req, res) => {
  const token = String(req.query.token || '');

  if (!token) {
    return res.redirect(`${appBaseUrl()}/?verified=missing`);
  }

  try {
    const user = await prisma.user.findUnique({ where: { verificationToken: token } });

    if (!user) {
      return res.redirect(`${appBaseUrl()}/?verified=invalid`);
    }

    if (
      user.verificationTokenExpiresAt &&
      user.verificationTokenExpiresAt.getTime() < Date.now()
    ) {
      return res.redirect(`${appBaseUrl()}/?verified=expired`);
    }

    await prisma.user.update({
      where: { id: user.id },
      data: {
        emailVerified: true,
        verificationToken: null,
        verificationTokenExpiresAt: null,
        emailOtpHash: null,
        emailOtpExpiresAt: null,
        emailOtpSentAt: null,
        emailOtpAttempts: 0
      }
    });

    return res.redirect(`${appBaseUrl()}/?verified=success`);
  } catch (_error) {
    return res.redirect(`${appBaseUrl()}/?verified=error`);
  }
});

router.post('/verify-email-code', async (req, res) => {
  try {
    const email = sanitizeEmail(req.body.email);
    const code = String(req.body.code || '').trim();

    if (!isValidEmailFormat(email)) {
      return res.status(400).json({ message: 'Enter a valid email address.' });
    }

    if (!/^\d{6}$/.test(code)) {
      return res.status(400).json({ message: 'Enter the 6-digit code from your email.' });
    }

    const user = await prisma.user.findUnique({ where: { email } });

    if (!user || user.emailVerified) {
      return res.status(400).json({ message: 'Invalid verification request.' });
    }

    try {
      verifyEmailOtp(user, code);
    } catch (error) {
      await prisma.user.update({
        where: { id: user.id },
        data: { emailOtpAttempts: user.emailOtpAttempts + 1 }
      });
      throw error;
    }

    const updated = await prisma.user.update({
      where: { id: user.id },
      data: {
        emailVerified: true,
        verificationToken: null,
        verificationTokenExpiresAt: null,
        emailOtpHash: null,
        emailOtpExpiresAt: null,
        emailOtpSentAt: null,
        emailOtpAttempts: 0
      }
    });

    const token = signToken(updated);
    res.json({
      message: 'Email verified.',
      token,
      user: publicUser(updated)
    });
  } catch (error) {
    res.status(400).json({ message: error.message });
  }
});

router.post('/phone/send-otp', async (req, res) => {
  try {
    if (!isPhoneOtpEnabled()) {
      return res.status(400).json({ message: 'Phone sign-in is not configured yet.' });
    }

    const phone = normalizePhone(req.body.phone);
    const mode = String(req.body.mode || 'login');
    const username = sanitizeUsername(req.body.username);

    if (mode === 'signup') {
      if (username.length < 3) {
        return res.status(400).json({ message: 'Username must be at least 3 characters.' });
      }

      const existingPhone = await prisma.user.findUnique({ where: { phone } });
      if (existingPhone?.phoneVerified) {
        return res.status(409).json({ message: 'An account with this phone already exists.' });
      }

      const existingUsername = await prisma.user.findUnique({ where: { username } });
      if (existingUsername && existingUsername.phone !== phone) {
        return res.status(409).json({ message: 'That username is already taken.' });
      }

      if (existingPhone && !canResendOtp(existingPhone.phoneOtpSentAt)) {
        return res.status(429).json({ message: 'Please wait a minute before requesting another code.' });
      }

      const otp = createPhoneOtpPayload();
      const user = existingPhone
        ? await prisma.user.update({
            where: { id: existingPhone.id },
            data: {
              username,
              ...otp
            }
          })
        : await prisma.user.create({
            data: {
              email: syntheticEmailForPhone(phone),
              username,
              phone,
              phoneVerified: false,
              emailVerified: true,
              ...otp
            }
          });

      await sendPhoneOtpSms({ phone, code: otp.code });
      return res.json({
        message: `Code sent to ${maskPhone(phone)}.`,
        phone,
        mode: 'signup'
      });
    }

    const user = await prisma.user.findUnique({ where: { phone } });
    if (!user || !user.phoneVerified) {
      return res.status(404).json({ message: 'No account found for this phone number.' });
    }

    if (!canResendOtp(user.phoneOtpSentAt)) {
      return res.status(429).json({ message: 'Please wait a minute before requesting another code.' });
    }

    const otp = createPhoneOtpPayload();
    await prisma.user.update({
      where: { id: user.id },
      data: otp
    });

    await sendPhoneOtpSms({ phone, code: otp.code });
    res.json({
      message: `Code sent to ${maskPhone(phone)}.`,
      phone,
      mode: 'login'
    });
  } catch (error) {
    res.status(400).json({ message: error.message });
  }
});

router.post('/phone/verify-otp', async (req, res) => {
  try {
    if (!isPhoneOtpEnabled()) {
      return res.status(400).json({ message: 'Phone sign-in is not configured yet.' });
    }

    const phone = normalizePhone(req.body.phone);
    const code = String(req.body.code || '').trim();
    const mode = String(req.body.mode || 'login');

    if (!/^\d{6}$/.test(code)) {
      return res.status(400).json({ message: 'Enter the 6-digit code from your SMS.' });
    }

    const user = await prisma.user.findUnique({ where: { phone } });
    if (!user) {
      return res.status(404).json({ message: 'No account found for this phone number.' });
    }

    try {
      verifyPhoneOtp(user, code);
    } catch (error) {
      await prisma.user.update({
        where: { id: user.id },
        data: { phoneOtpAttempts: user.phoneOtpAttempts + 1 }
      });
      throw error;
    }

    const updated = await prisma.user.update({
      where: { id: user.id },
      data: {
        phoneVerified: true,
        phoneOtpHash: null,
        phoneOtpExpiresAt: null,
        phoneOtpSentAt: null,
        phoneOtpAttempts: 0
      }
    });

    const token = signToken(updated);
    res.json({
      message: mode === 'signup' ? 'Account created.' : 'Signed in.',
      token,
      user: publicUser(updated)
    });
  } catch (error) {
    res.status(400).json({ message: error.message });
  }
});

router.post('/register', async (req, res) => {
  try {
    const email = sanitizeEmail(req.body.email);
    const username = sanitizeUsername(req.body.username);
    const password = String(req.body.password || '');

    if (!isValidEmailFormat(email)) {
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
    const emailVerificationEnabled = isEmailVerificationEnabled();

    const user = await prisma.user.create({
      data: {
        email,
        username,
        password: passwordHash,
        emailVerified: !emailVerificationEnabled
      }
    });

    if (emailVerificationEnabled) {
      await issueVerification(user);
      return res.status(201).json({
        message: 'Account created. Check your email to verify your address.',
        requiresVerification: true,
        email: user.email
      });
    }

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

    if (isEmailVerificationEnabled() && !user.emailVerified) {
      return verificationRequiredResponse(res, user.email);
    }

    const token = signToken(user);
    res.json({ token, user: publicUser(user) });
  } catch (error) {
    res.status(400).json({ message: error.message });
  }
});

router.post('/resend-verification', async (req, res) => {
  try {
    const email = sanitizeEmail(req.body.email);

    if (!isValidEmailFormat(email)) {
      return res.status(400).json({ message: 'Enter a valid email address.' });
    }

    if (!isEmailVerificationEnabled()) {
      return res.status(400).json({ message: 'Email verification is not enabled.' });
    }

    const user = await prisma.user.findUnique({ where: { email } });

    if (!user || user.emailVerified) {
      return res.json({
        message: 'If that account exists and is unverified, a new email has been sent.'
      });
    }

    if (!canResendVerification(user)) {
      return res.status(429).json({ message: 'Please wait a minute before requesting another email.' });
    }

    await issueVerification(user);

    res.json({ message: 'Verification email sent.' });
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
      if (!user.googleId || !user.emailVerified) {
        user = await prisma.user.update({
          where: { id: user.id },
          data: {
            googleId,
            emailVerified: true,
            verificationToken: null,
            verificationTokenExpiresAt: null
          }
        });
      }
    } else {
      const username = await uniqueUsername(payload.name || email.split('@')[0]);
      user = await prisma.user.create({
        data: {
          email,
          username,
          googleId,
          emailVerified: true
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

router.delete('/account', requireAuth, async (req, res) => {
  try {
    const userId = req.user.id;

    await prisma.$transaction([
      prisma.matchAnswer.deleteMany({ where: { userId } }),
      prisma.match.updateMany({ where: { winnerId: userId }, data: { winnerId: null } }),
      prisma.match.updateMany({ where: { player1Id: userId }, data: { player1Id: null } }),
      prisma.match.updateMany({ where: { player2Id: userId }, data: { player2Id: null } }),
      prisma.user.delete({ where: { id: userId } })
    ]);

    res.json({ message: 'Account deleted.' });
  } catch (error) {
    res.status(400).json({ message: error.message });
  }
});

export default router;
