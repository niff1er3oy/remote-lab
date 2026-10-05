/** @jest-environment node */
import { cookies } from 'next/headers';
import {
  createSessionCookie,
  getSessionUser,
  SESSION_COOKIE_NAME,
  SESSION_MAX_AGE_MS,
} from '@/lib/session';
import {
  GOOGLE_STUDENT,
  knownIdToken,
  knownSessionCookie,
  mintedCookies,
  resetAuth,
  revocationChecksAsked,
  setRequestCookies,
} from './helpers/server/auth';

jest.mock('next/headers', () => ({ cookies: jest.fn() }));
jest.mock('@/lib/firebase-admin', () => ({
  adminAuth: jest.requireActual<typeof import('./helpers/server/auth')>('./helpers/server/auth').auth,
}));

beforeEach(resetAuth);

describe('the session cookie', () => {
  it('is called "session" and lasts seven days', () => {
    expect(SESSION_COOKIE_NAME).toBe('session');
    // 7 × 24 × 60 × 60 × 1000
    expect(SESSION_MAX_AGE_MS).toBe(604_800_000);
  });
});

describe('createSessionCookie', () => {
  it('mints a cookie from the ID token that is valid for seven days', async () => {
    knownIdToken('id-token-1', GOOGLE_STUDENT);
    expect(await createSessionCookie('id-token-1')).toBe('cookie-for-id-token-1');
    expect(mintedCookies()).toEqual([{ idToken: 'id-token-1', expiresIn: 604_800_000 }]);
  });

  it('rejects when Firebase does not accept the ID token', async () => {
    await expect(createSessionCookie('forged')).rejects.toThrow();
    expect(mintedCookies()).toEqual([]);
  });
});

describe('getSessionUser', () => {
  it('returns the user the session cookie belongs to', async () => {
    knownSessionCookie('good-cookie', GOOGLE_STUDENT);
    setRequestCookies({ session: 'good-cookie' });
    expect(await getSessionUser()).toEqual({
      uid: 'student-1',
      email: 'student@example.com',
      name: 'Student One',
      role: 'student',
    });
  });

  it('returns nothing but uid, email, name and role from the cookie\'s claims', async () => {
    knownSessionCookie('good-cookie', { ...GOOGLE_STUDENT, picture: 'https://example.com/me.png', iat: 1, exp: 2 });
    setRequestCookies({ session: 'good-cookie' });
    expect(Object.keys((await getSessionUser())!).sort()).toEqual(['email', 'name', 'role', 'uid']);
  });

  it('leaves the role empty for a cookie minted without one', async () => {
    knownSessionCookie('good-cookie', { uid: 'new-user', firebase: { sign_in_provider: 'google.com' } });
    setRequestCookies({ session: 'good-cookie' });
    const user = await getSessionUser();
    expect(user?.uid).toBe('new-user');
    expect(user?.role).toBeUndefined();
  });

  it('returns null when the request has no session cookie, without asking Firebase', async () => {
    setRequestCookies({});
    expect(await getSessionUser()).toBeNull();
    expect(revocationChecksAsked()).toEqual([]);
  });

  it('reads only the cookie named "session"', async () => {
    knownSessionCookie('good-cookie', GOOGLE_STUDENT);
    setRequestCookies({ token: 'good-cookie', Session: 'good-cookie', __session: 'good-cookie' });
    expect(await getSessionUser()).toBeNull();
  });

  it.each([
    ['forged or expired', 'not-a-real-cookie'],
    ['empty', ''],
  ])('returns null for a %s cookie', async (_label, value) => {
    knownSessionCookie('good-cookie', GOOGLE_STUDENT);
    setRequestCookies({ session: value });
    expect(await getSessionUser()).toBeNull();
  });

  it('returns null when the cookies cannot be read', async () => {
    jest.mocked(cookies).mockRejectedValue(new Error('cookies() was called outside a request scope'));
    expect(await getSessionUser()).toBeNull();
  });

  // DESIGN.md: a local JWT check, "no network round-trip". Asking Firebase
  // whether the session was revoked would be one.
  it('verifies the cookie without the revocation check', async () => {
    knownSessionCookie('good-cookie', GOOGLE_STUDENT);
    setRequestCookies({ session: 'good-cookie' });
    await getSessionUser();
    expect(revocationChecksAsked()).toEqual([false]);
  });
});
