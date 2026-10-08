import { cookies } from 'next/headers';

// An in-memory stand-in for adminAuth, plus the request's cookie jar for test
// files that replace next/headers with
//   jest.mock('next/headers', () => ({ cookies: jest.fn() }));

export type Claims = {
  uid: string;
  email?: string;
  name?: string;
  role?: string;
  firebase: { sign_in_provider: string };
  [claim: string]: unknown;
};

const idTokens = new Map<string, Claims>();
const sessionCookies = new Map<string, Claims>();
const customClaims = new Map<string, Record<string, unknown>>();
const accounts = new Map<string, { uid: string; displayName?: string; email?: string }>();
const minted: Array<{ idToken: string; expiresIn: number }> = [];
const revocationChecks: unknown[] = [];
let mintingFails = false;

export const auth = {
  async verifyIdToken(idToken: string): Promise<Claims> {
    const claims = idTokens.get(idToken);
    if (!claims) throw new Error('auth/argument-error: fake ID token is not valid');
    return claims;
  },

  async verifySessionCookie(cookie: string, checkRevoked?: boolean): Promise<Claims> {
    revocationChecks.push(checkRevoked);
    const claims = sessionCookies.get(cookie);
    if (!claims) throw new Error('auth/session-cookie-expired: fake session cookie is not valid');
    return claims;
  },

  // Like Firebase, the cookie carries the claims of the ID token that minted it.
  async createSessionCookie(idToken: string, options: { expiresIn: number }): Promise<string> {
    const claims = idTokens.get(idToken);
    if (!claims || mintingFails) throw new Error('auth/invalid-id-token: fake ID token cannot mint a cookie');
    const cookie = `cookie-for-${idToken}`;
    sessionCookies.set(cookie, claims);
    minted.push({ idToken, expiresIn: options.expiresIn });
    return cookie;
  },

  // Like Firebase, unknown uids are simply left out of `users`.
  async getUsers(identifiers: Array<{ uid: string }>) {
    const users = identifiers.flatMap(({ uid }) => (accounts.has(uid) ? [accounts.get(uid)!] : []));
    return { users, notFound: identifiers.filter(({ uid }) => !accounts.has(uid)) };
  },

  async setCustomUserClaims(uid: string, claims: Record<string, unknown>): Promise<void> {
    customClaims.set(uid, claims);
  },
};

export function resetAuth(): void {
  idTokens.clear();
  sessionCookies.clear();
  customClaims.clear();
  accounts.clear();
  minted.length = 0;
  revocationChecks.length = 0;
  mintingFails = false;
  setRequestCookies({});
}

export const knownIdToken = (idToken: string, claims: Claims) => void idTokens.set(idToken, claims);
export const knownSessionCookie = (cookie: string, claims: Claims) => void sessionCookies.set(cookie, claims);
export const knownAccount = (uid: string, displayName?: string, email?: string) => void accounts.set(uid, { uid, displayName, email });
export const failMinting = () => void (mintingFails = true);
export const customClaimsOf = (uid: string) => customClaims.get(uid);
export const mintedCookies = () => [...minted];
export const revocationChecksAsked = () => [...revocationChecks];

// The cookies the current request arrives with.
export function setRequestCookies(jar: Record<string, string>): void {
  const store = {
    get: (name: string) => (name in jar ? { name, value: jar[name] } : undefined),
  };
  jest.mocked(cookies).mockResolvedValue(store as unknown as Awaited<ReturnType<typeof cookies>>);
}

export const GOOGLE_STUDENT: Claims = {
  uid: 'student-1',
  email: 'student@example.com',
  name: 'Student One',
  role: 'student',
  firebase: { sign_in_provider: 'google.com' },
};
