import { authErrorMessage, establishGoogleSession } from '@/lib/auth-client';
import { mockFetch, type Reply } from './helpers/client/fetch';

jest.mock('@/lib/firebase-client', () => ({ auth: { name: 'test-auth' } }));

jest.mock('firebase/auth', () => ({
  signInWithPopup: jest.fn(),
  GoogleAuthProvider: class GoogleAuthProvider {},
}));

const firebaseAuth = jest.requireMock<{
  signInWithPopup: jest.Mock;
  GoogleAuthProvider: new () => object;
}>('firebase/auth');
const firebaseClient = jest.requireMock<{ auth: object }>('@/lib/firebase-client');

const GENERIC = 'ไม่สามารถเชื่อมต่อได้ กรุณาลองใหม่';

// Firebase hands out a new token only when asked to force a refresh.
function signedInUser() {
  const getIdToken = jest.fn(async (forceRefresh?: boolean) => (forceRefresh ? 'refreshed-token' : 'first-token'));
  firebaseAuth.signInWithPopup.mockResolvedValue({ user: { getIdToken } });
  return getIdToken;
}

function sessionEndpoint(...replies: Reply[]) {
  return mockFetch(() => {
    const reply = replies.shift();
    if (!reply) throw new Error('the session endpoint was called more often than expected');
    return reply;
  });
}

beforeEach(() => {
  jest.clearAllMocks();
});

describe('establishGoogleSession', () => {
  it('signs in with a Google popup on the app\'s Firebase auth', async () => {
    signedInUser();
    sessionEndpoint({ body: { ok: true } });

    await establishGoogleSession();

    expect(firebaseAuth.signInWithPopup).toHaveBeenCalledTimes(1);
    const [auth, provider] = firebaseAuth.signInWithPopup.mock.calls[0];
    expect(auth).toBe(firebaseClient.auth);
    expect(provider).toBeInstanceOf(firebaseAuth.GoogleAuthProvider);
  });

  it('sends the user\'s ID token to the session endpoint once', async () => {
    const getIdToken = signedInUser();
    const net = sessionEndpoint({ body: { ok: true } });

    await expect(establishGoogleSession()).resolves.toBeUndefined();

    expect(net.calls).toEqual([{ method: 'POST', url: '/api/auth/session', body: { idToken: 'first-token' } }]);
    expect(getIdToken).toHaveBeenCalledTimes(1);
    expect(getIdToken.mock.calls[0][0]).toBeFalsy();
  });

  it('sends the token as JSON', async () => {
    signedInUser();
    sessionEndpoint({ body: { ok: true } });

    await establishGoogleSession();

    const init = (globalThis.fetch as jest.Mock).mock.calls[0][1] as RequestInit;
    expect(new Headers(init.headers).get('content-type')).toBe('application/json');
  });

  it('on a first sign-in, forces a token refresh and sends the new token', async () => {
    const getIdToken = signedInUser();
    const net = sessionEndpoint({ body: { ok: true, needsRefresh: true } }, { body: { ok: true } });

    await establishGoogleSession();

    expect(net.calls).toEqual([
      { method: 'POST', url: '/api/auth/session', body: { idToken: 'first-token' } },
      { method: 'POST', url: '/api/auth/session', body: { idToken: 'refreshed-token' } },
    ]);
    expect(getIdToken).toHaveBeenLastCalledWith(true);
  });

  it('refreshes only once even if the server asks again', async () => {
    signedInUser();
    const net = sessionEndpoint({ body: { ok: true, needsRefresh: true } }, { body: { ok: true, needsRefresh: true } });

    await establishGoogleSession();

    expect(net.calls).toHaveLength(2);
  });

  it('fails when the server rejects the token', async () => {
    signedInUser();
    const net = sessionEndpoint({ status: 401, body: { error: 'invalid token' } });

    await expect(establishGoogleSession()).rejects.toThrow();
    expect(net.calls).toHaveLength(1);
  });

  it('fails when the server rejects the refreshed token', async () => {
    signedInUser();
    sessionEndpoint({ body: { ok: true, needsRefresh: true } }, { status: 500, body: { error: 'failed' } });

    await expect(establishGoogleSession()).rejects.toThrow();
  });

  it('fails with Firebase\'s own error and contacts no server when the popup is closed', async () => {
    const closed = Object.assign(new Error('popup closed'), { code: 'auth/popup-closed-by-user' });
    firebaseAuth.signInWithPopup.mockRejectedValue(closed);
    const net = sessionEndpoint();

    await expect(establishGoogleSession()).rejects.toBe(closed);
    expect(net.calls).toEqual([]);
  });
});

describe('authErrorMessage', () => {
  it('explains each Firebase error it knows in Thai', () => {
    expect(authErrorMessage({ code: 'auth/too-many-requests' })).toBe('พยายามเข้าสู่ระบบบ่อยเกินไป กรุณาลองใหม่ภายหลัง');
    expect(authErrorMessage({ code: 'auth/popup-blocked' })).toBe('เบราว์เซอร์บล็อกป๊อปอัป กรุณาอนุญาตแล้วลองใหม่');
    expect(authErrorMessage({ code: 'auth/popup-closed-by-user' })).toBe('ปิดหน้าต่างเข้าสู่ระบบก่อนดำเนินการเสร็จสิ้น');
  });

  it('gives a closed popup and a superseded popup the same message', () => {
    expect(authErrorMessage({ code: 'auth/cancelled-popup-request' })).toBe(authErrorMessage({ code: 'auth/popup-closed-by-user' }));
  });

  it('reads the code from a real Error object', () => {
    const err = Object.assign(new Error('Firebase: Error (auth/popup-blocked).'), { code: 'auth/popup-blocked' });
    expect(authErrorMessage(err)).toBe('เบราว์เซอร์บล็อกป๊อปอัป กรุณาอนุญาตแล้วลองใหม่');
  });

  it('falls back to a generic message for an unknown code', () => {
    expect(authErrorMessage({ code: 'auth/network-request-failed' })).toBe(GENERIC);
  });

  it('falls back to the generic message for anything that is not a Firebase error', () => {
    for (const value of [new Error('session'), 'auth/popup-blocked', null, undefined, 42, {}]) {
      expect(authErrorMessage(value)).toBe(GENERIC);
    }
  });

  // A code that names something every object has ("toString") is not a known
  // error either. Firebase codes all start with "auth/", so this takes an
  // error from somewhere else.
  it('does not mistake an inherited object property for an error code', () => {
    expect(authErrorMessage({ code: 'toString' })).toBe(GENERIC);
    expect(authErrorMessage({ code: 'constructor' })).toBe(GENERIC);
  });
});
