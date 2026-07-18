import { cookies } from 'next/headers';
import { adminAuth } from '@/lib/firebase-admin';

export const SESSION_COOKIE_NAME = 'session';
export const SESSION_MAX_AGE_MS = 60 * 60 * 24 * 7 * 1000; // 7 days

export interface SessionUser {
  uid: string;
  email?: string;
  name?: string;
  role?: string;
}

// Mints an httpOnly session cookie value from a client-verified Firebase ID token.
export async function createSessionCookie(idToken: string): Promise<string> {
  return adminAuth.createSessionCookie(idToken, { expiresIn: SESSION_MAX_AGE_MS });
}

// Reads + verifies the `session` cookie for the current request. Pure JWT
// verification against Firebase's cached public keys — no Firestore read.
export async function getSessionUser(): Promise<SessionUser | null> {
  try {
    const store = await cookies();
    const session = store.get(SESSION_COOKIE_NAME);
    if (!session) return null;

    const decoded = await adminAuth.verifySessionCookie(session.value, false);
    return {
      uid: decoded.uid,
      email: decoded.email,
      name: decoded.name,
      role: decoded.role,
    };
  } catch {
    return null;
  }
}
