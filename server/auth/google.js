import { OAuth2Client } from 'google-auth-library';

const clientId = process.env.GOOGLE_CLIENT_ID;

export function isGoogleAuthConfigured() {
  return Boolean(clientId);
}

export async function verifyGoogleCredential(credential) {
  if (!clientId) {
    throw new Error('GOOGLE_CLIENT_ID is not configured.');
  }

  const client = new OAuth2Client(clientId);
  const ticket = await client.verifyIdToken({
    idToken: credential,
    audience: clientId
  });

  return ticket.getPayload();
}
