import {
  canResendOtp,
  generateOtpCode,
  getOtpExpiry,
  hashOtp,
  isOtpExpired,
  MAX_OTP_ATTEMPTS,
  verifyOtpCode
} from './otp.js';
import { isFast2SmsConfigured, sendFast2SmsOtp } from './sms/fast2sms.js';
import { isTwilioConfigured, sendTwilioOtp } from './sms/twilio.js';

function smsProvider() {
  return String(process.env.SMS_PROVIDER || 'twilio').trim().toLowerCase();
}

function isIndianPhone(phone) {
  const digits = phone.replace(/\D/g, '');
  return digits.startsWith('91') && digits.length === 12;
}

function pickSmsSender(phone) {
  const provider = smsProvider();

  if (provider === 'fast2sms') {
    return 'fast2sms';
  }

  if (provider === 'twilio') {
    return 'twilio';
  }

  if (isIndianPhone(phone) && isFast2SmsConfigured()) {
    return 'fast2sms';
  }

  return 'twilio';
}

export function isPhoneOtpEnabled() {
  const provider = smsProvider();

  if (provider === 'fast2sms') {
    return isFast2SmsConfigured();
  }

  if (provider === 'twilio') {
    return isTwilioConfigured();
  }

  return isTwilioConfigured() || isFast2SmsConfigured();
}

export function normalizePhone(raw) {
  let digits = String(raw || '').replace(/\D/g, '');

  if (!digits) {
    throw new Error('Enter your phone number.');
  }

  if (digits.startsWith('0')) {
    digits = digits.slice(1);
  }

  const defaultCountry = String(process.env.DEFAULT_COUNTRY_CODE || '91').replace(/\D/g, '');

  if (digits.length === 10 && defaultCountry) {
    digits = `${defaultCountry}${digits}`;
  }

  if (digits.length < 10 || digits.length > 15) {
    throw new Error('Enter a valid phone number with country code.');
  }

  const phone = `+${digits}`;

  if (smsProvider() === 'fast2sms' && !isIndianPhone(phone)) {
    throw new Error('Only Indian mobile numbers (+91) are supported with Fast2SMS.');
  }

  return phone;
}

export function syntheticEmailForPhone(phone) {
  return `phone+${phone.replace(/\D/g, '')}@users.quticks.com`;
}

export function maskPhone(phone) {
  if (!phone) return '';
  const digits = phone.replace(/\D/g, '');
  if (digits.length <= 4) return phone;
  return `${phone.slice(0, Math.max(0, phone.length - 4)).replace(/\d/g, '•')}${digits.slice(-4)}`;
}

export function createPhoneOtpPayload() {
  const code = generateOtpCode();

  return {
    code,
    phoneOtpHash: hashOtp(code),
    phoneOtpExpiresAt: getOtpExpiry(),
    phoneOtpSentAt: new Date(),
    phoneOtpAttempts: 0
  };
}

export function verifyPhoneOtp(user, code) {
  if (!user.phoneOtpHash || isOtpExpired(user.phoneOtpExpiresAt)) {
    throw new Error('That code expired. Request a new one.');
  }

  if (user.phoneOtpAttempts >= MAX_OTP_ATTEMPTS) {
    throw new Error('Too many incorrect attempts. Request a new code.');
  }

  if (!verifyOtpCode(code, user.phoneOtpHash)) {
    throw new Error('Invalid code.');
  }

  return true;
}

export async function sendPhoneOtpSms({ phone, code }) {
  const sender = pickSmsSender(phone);

  if (sender === 'fast2sms') {
    return sendFast2SmsOtp({ phone, code });
  }

  if (!isTwilioConfigured()) {
    throw new Error('Global SMS is not configured yet.');
  }

  return sendTwilioOtp({ phone, code });
}

export { canResendOtp, isOtpExpired, MAX_OTP_ATTEMPTS };
