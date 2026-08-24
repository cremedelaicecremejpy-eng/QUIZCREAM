import {
  canResendOtp,
  generateOtpCode,
  getOtpExpiry,
  hashOtp,
  isOtpExpired,
  MAX_OTP_ATTEMPTS,
  verifyOtpCode
} from './otp.js';

export function isPhoneOtpEnabled() {
  return Boolean(
    process.env.TWILIO_ACCOUNT_SID &&
      process.env.TWILIO_AUTH_TOKEN &&
      process.env.TWILIO_PHONE_NUMBER
  );
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

  return `+${digits}`;
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
  const accountSid = process.env.TWILIO_ACCOUNT_SID;
  const authToken = process.env.TWILIO_AUTH_TOKEN;
  const from = process.env.TWILIO_PHONE_NUMBER;

  if (!accountSid || !authToken || !from) {
    throw new Error('Phone OTP is not configured.');
  }

  const body = `Your QUIZCREAM code is ${code}. It expires in 10 minutes.`;
  const credentials = Buffer.from(`${accountSid}:${authToken}`).toString('base64');

  const response = await fetch(
    `https://api.twilio.com/2010-04-01/Accounts/${accountSid}/Messages.json`,
    {
      method: 'POST',
      headers: {
        Authorization: `Basic ${credentials}`,
        'Content-Type': 'application/x-www-form-urlencoded'
      },
      body: new URLSearchParams({
        To: phone,
        From: from,
        Body: body
      })
    }
  );

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`Failed to send SMS: ${errorText}`);
  }
}

export { canResendOtp, isOtpExpired, MAX_OTP_ATTEMPTS };
