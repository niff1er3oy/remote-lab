/** @jest-environment node */
import { NextRequest } from 'next/server';
import { POST as signIn } from '@/app/api/auth/session/route';
import { GET as me } from '@/app/api/auth/me/route';
import { POST as logout } from '@/app/api/auth/logout/route';
import {
  customClaimsOf,
  failMinting,
  GOOGLE_STUDENT,
  knownIdToken,
  knownSessionCookie,
  mintedCookies,
  resetAuth,
  setRequestCookies,
} from '../helpers/server/auth';

jest.mock('next/headers', () => ({ cookies: jest.fn() }));
jest.mock('@/lib/firebase-admin', () => ({
  adminAuth: jest.requireActual<typeof import('../helpers/server/auth')>('../helpers/server/auth').auth,
}));

const postRaw = (body: string) =>
  signIn(new NextRequest('http://localhost/api/auth/session', { method: 'POST', body }));
const post = (body: unknown) => postRaw(JSON.stringify(body));

beforeEach(() => {
  resetAuth();
  jest.spyOn(console, 'error').mockImplementation(() => {});
});

afterEach(() => jest.restoreAllMocks());

describe('POST /api/auth/session', () => {
  it('sets the session cookie for a Google user who already has a role', async () => {
    knownIdToken('id-token-1', GOOGLE_STUDENT);
    const res = await post({ idToken: 'id-token-1' });

    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true });
    expect(res.cookies.get('session')).toMatchObject({
      name: 'session',
      value: 'cookie-for-id-token-1',
      httpOnly: true,
      sameSite: 'lax',
      path: '/',
      // seven days in seconds
      maxAge: 604_800,
    });
    expect(res.headers.get('set-cookie')).toMatch(/^session=cookie-for-id-token-1;.*HttpOnly/i);
  });

  it('mints the cookie for seven days, matching the cookie\'s own lifetime', async () => {
    knownIdToken('id-token-1', GOOGLE_STUDENT);
    await post({ idToken: 'id-token-1' });
    expect(mintedCookies()).toEqual([{ idToken: 'id-token-1', expiresIn: 604_800_000 }]);
  });

  it('keeps a role the user already has', async () => {
    knownIdToken('id-token-1', { ...GOOGLE_STUDENT, role: 'admin' });
    const res = await post({ idToken: 'id-token-1' });
    expect(res.cookies.get('session')?.value).toBe('cookie-for-id-token-1');
    expect(customClaimsOf('student-1')).toBeUndefined();
  });

  it('makes a first-time user a student and asks for a token refresh instead of setting a cookie', async () => {
    knownIdToken('first-token', { uid: 'new-user', email: 'new@example.com', firebase: { sign_in_provider: 'google.com' } });
    const res = await post({ idToken: 'first-token' });

    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true, needsRefresh: true });
    expect(customClaimsOf('new-user')).toEqual({ role: 'student' });
    expect(res.headers.get('set-cookie')).toBeNull();
    expect(mintedCookies()).toEqual([]);
  });

  it.each(['password', 'anonymous', 'github.com', 'custom'])(
    'answers 403 and sets no cookie for a token from the %s provider',
    async (provider) => {
      knownIdToken('other-token', { ...GOOGLE_STUDENT, firebase: { sign_in_provider: provider } });
      const res = await post({ idToken: 'other-token' });

      expect(res.status).toBe(403);
      expect(await res.json()).toEqual({ ok: false, error: expect.any(String) });
      expect(res.headers.get('set-cookie')).toBeNull();
      expect(mintedCookies()).toEqual([]);
    },
  );

  it('gives no role to a first-time user who did not come through Google', async () => {
    knownIdToken('other-token', { uid: 'new-user', firebase: { sign_in_provider: 'password' } });
    const res = await post({ idToken: 'other-token' });
    expect(res.status).toBe(403);
    expect(customClaimsOf('new-user')).toBeUndefined();
  });

  it.each([
    ['is missing', {}],
    ['is empty', { idToken: '' }],
    ['is null', { idToken: null }],
  ])('answers 400 when the ID token %s', async (_label, body) => {
    const res = await post(body);
    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({ ok: false, error: expect.any(String) });
    expect(res.headers.get('set-cookie')).toBeNull();
  });

  it('answers 401 and sets no cookie for a token Firebase does not accept', async () => {
    const res = await post({ idToken: 'forged' });
    expect(res.status).toBe(401);
    expect(await res.json()).toEqual({ ok: false, error: expect.any(String) });
    expect(res.headers.get('set-cookie')).toBeNull();
  });

  it('answers 401 and sets no cookie when the cookie cannot be minted', async () => {
    knownIdToken('id-token-1', GOOGLE_STUDENT);
    failMinting();
    const res = await post({ idToken: 'id-token-1' });
    expect(res.status).toBe(401);
    expect(res.headers.get('set-cookie')).toBeNull();
  });

  it('answers 401 for a body that is not JSON', async () => {
    const res = await postRaw('idToken=id-token-1');
    expect(res.status).toBe(401);
    expect(res.headers.get('set-cookie')).toBeNull();
  });

  it('does not repeat Firebase\'s error text to the caller', async () => {
    const text = await (await post({ idToken: 'forged' })).text();
    expect(text).not.toMatch(/auth\/|fake ID token/);
  });
});

describe('GET /api/auth/me', () => {
  it('answers 401 without a session cookie', async () => {
    const res = await me();
    expect(res.status).toBe(401);
    expect(await res.json()).toEqual({ ok: false });
  });

  it('answers 401 for a session cookie that is not valid', async () => {
    setRequestCookies({ session: 'forged' });
    const res = await me();
    expect(res.status).toBe(401);
    expect(await res.json()).toEqual({ ok: false });
  });

  it('returns the name, email and role of the signed-in user, and not the uid', async () => {
    knownSessionCookie('good-cookie', GOOGLE_STUDENT);
    setRequestCookies({ session: 'good-cookie' });
    const res = await me();
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({
      ok: true,
      user: { name: 'Student One', email: 'student@example.com', role: 'student' },
    });
  });

  it('recognises the user from the cookie that signing in just set', async () => {
    knownIdToken('id-token-1', GOOGLE_STUDENT);
    const signedIn = await post({ idToken: 'id-token-1' });
    setRequestCookies({ session: signedIn.cookies.get('session')!.value });

    expect((await (await me()).json()).user.email).toBe('student@example.com');
  });
});

describe('POST /api/auth/logout', () => {
  it('tells the browser to drop the session cookie', async () => {
    const res = await logout();
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true });
    expect(res.cookies.get('session')?.value).toBe('');
    expect(res.headers.get('set-cookie')).toMatch(/^session=;.*(Expires=Thu, 01 Jan 1970|Max-Age=0)/i);
  });

  it('works for a caller who was not signed in', async () => {
    setRequestCookies({});
    expect((await logout()).status).toBe(200);
  });
});
