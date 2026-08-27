function localIndianNumber(phone) {
  const digits = phone.replace(/\D/g, '');

  if (digits.length === 10) {
    return digits;
  }

  if (digits.startsWith('91') && digits.length === 12) {
    return digits.slice(2);
  }

  throw new Error('Enter a valid 10-digit Indian mobile number.');
}

export function isFast2SmsConfigured() {
  return Boolean(process.env.FAST2SMS_API_KEY);
}

export async function sendFast2SmsOtp({ phone, code }) {
  const apiKey = process.env.FAST2SMS_API_KEY;

  if (!apiKey) {
    throw new Error('Phone OTP is not configured.');
  }

  const numbers = localIndianNumber(phone);

  const response = await fetch('https://www.fast2sms.com/dev/bulkV2', {
    method: 'POST',
    headers: {
      authorization: apiKey,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      route: 'otp',
      variables_values: code,
      numbers
    })
  });

  let data = null;
  try {
    data = await response.json();
  } catch (_error) {
    data = null;
  }

  if (!response.ok || data?.return === false) {
    const message = Array.isArray(data?.message)
      ? data.message.join(', ')
      : data?.message || (await response.text()) || 'Unknown error';
    throw new Error(`Failed to send SMS: ${message}`);
  }
}
