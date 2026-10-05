/** @jest-environment node */
import { NextRequest } from 'next/server';
import { GET, POST } from '@/app/api/cam/[...path]/route';

const fetchMock = jest.fn<Promise<Response>, [string, RequestInit]>();

// "test-user:test-password" (the credentials from jest.env.ts) in base64.
const CAMERA_AUTH = 'Basic dGVzdC11c2VyOnRlc3QtcGFzc3dvcmQ=';
const OFFER = 'v=0\r\no=- 1 1 IN IP4 127.0.0.1\r\ns=offer\r\n';
const ANSWER = 'v=0\r\no=- 2 2 IN IP4 127.0.0.1\r\ns=answer\r\n';

const to = (...path: string[]) => ({ params: Promise.resolve({ path }) });
const whepOffer = (path: string[], init: { headers?: Record<string, string>; body?: BodyInit } = {}) =>
  POST(
    new NextRequest(`http://localhost/api/cam/${path.join('/')}`, {
      method: 'POST',
      body: init.body ?? OFFER,
      headers: init.headers ?? { 'Content-Type': 'application/sdp' },
    }),
    to(...path),
  );
const get = (path: string[], search = '') =>
  GET(new NextRequest(`http://localhost/api/cam/${path.join('/')}${search}`), to(...path));
const target = () => fetchMock.mock.calls[0][0];

beforeEach(() => {
  fetchMock.mockReset();
  fetchMock.mockImplementation(async () => new Response(ANSWER, {
    status: 201,
    headers: { 'Content-Type': 'application/sdp', Location: '/camera1/whep/session-42' },
  }));
  globalThis.fetch = fetchMock as unknown as typeof fetch;
  jest.spyOn(console, 'error').mockImplementation(() => {});
});

afterEach(() => jest.restoreAllMocks());

describe('POST /api/cam/[...path] — WHEP signalling', () => {
  it.each([
    ['cam1', 'http://camera.invalid/camera1/whep'],
    ['cam2', 'http://camera.invalid/camera2/whep'],
    ['cam3', 'http://camera.invalid/camera3/whep'],
  ])('forwards an offer for %s to that camera\'s own URL', async (camKey, url) => {
    await whepOffer([camKey, 'whep']);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(target()).toBe(url);
  });

  it('sends the offer on as a POST with the camera\'s credentials', async () => {
    await whepOffer(['cam1', 'whep']);
    const init = fetchMock.mock.calls[0][1];
    expect(init.method).toBe('POST');
    expect(init.body).toBe(OFFER);
    expect(init.headers).toEqual({ 'Content-Type': 'application/sdp', Authorization: CAMERA_AUTH });
  });

  it('keeps the content type the browser sent', async () => {
    await whepOffer(['cam1', 'whep'], { headers: { 'Content-Type': 'application/trickle-ice-sdpfrag' } });
    expect(fetchMock.mock.calls[0][1].headers).toMatchObject({ 'Content-Type': 'application/trickle-ice-sdpfrag' });
  });

  it('calls the offer application/sdp when the browser sent no content type', async () => {
    // A byte body, unlike a string one, gets no content type of its own.
    await whepOffer(['cam1', 'whep'], { headers: {}, body: new TextEncoder().encode(OFFER) });
    expect(fetchMock.mock.calls[0][1].headers).toMatchObject({ 'Content-Type': 'application/sdp' });
  });

  it('does not pass the caller\'s own cookie or authorization on to the camera', async () => {
    await whepOffer(['cam1', 'whep'], {
      headers: { 'Content-Type': 'application/sdp', Cookie: 'session=secret-cookie', Authorization: 'Bearer caller-token' },
    });
    expect(JSON.stringify(fetchMock.mock.calls[0][1].headers)).not.toMatch(/secret-cookie|caller-token/);
  });

  it('returns the camera\'s answer with its status and headers', async () => {
    const res = await whepOffer(['cam1', 'whep']);
    expect(res.status).toBe(201);
    expect(await res.text()).toBe(ANSWER);
    expect(res.headers.get('Content-Type')).toBe('application/sdp');
    expect(res.headers.get('Location')).toBe('/camera1/whep/session-42');
  });

  it('returns the camera\'s refusal as it is', async () => {
    fetchMock.mockResolvedValue(new Response('stream not found', { status: 404 }));
    const res = await whepOffer(['cam1', 'whep']);
    expect(res.status).toBe(404);
    expect(await res.text()).toBe('stream not found');
  });

  it.each([['cam4'], ['camera1'], ['CAM1'], ['']])('answers 404 for the unknown camera %p and contacts nothing', async (camKey) => {
    const res = await whepOffer([camKey, 'whep']);
    expect(res.status).toBe(404);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('answers 500 without the details when the camera cannot be reached', async () => {
    fetchMock.mockRejectedValue(new Error('connect ECONNREFUSED 34.87.165.238:8889'));
    const res = await whepOffer(['cam1', 'whep']);
    expect(res.status).toBe(500);
    expect(await res.text()).not.toMatch(/ECONNREFUSED|34\.87|camera\.invalid|test-password/);
  });

  it('never returns the camera\'s credentials', async () => {
    const res = await whepOffer(['cam1', 'whep']);
    const headers = JSON.stringify([...res.headers.entries()]);
    expect(headers + (await res.text())).not.toMatch(/dGVzdC11c2Vy|test-password/);
  });
});

describe('GET /api/cam/[...path] — passthrough', () => {
  beforeEach(() => {
    fetchMock.mockImplementation(async () => new Response('{"ready":true}', {
      status: 200,
      headers: { 'Content-Type': 'application/json', 'Content-Encoding': 'gzip', 'Transfer-Encoding': 'chunked' },
    }));
  });

  it('fetches the same path and query string from the camera, with its credentials', async () => {
    await get(['cam2', 'whep', 'session-42'], '?probe=1&x=y');
    expect(target()).toBe('http://camera.invalid/camera2/whep/session-42?probe=1&x=y');
    expect(fetchMock.mock.calls[0][1].headers).toEqual({ Authorization: CAMERA_AUTH });
    expect(fetchMock.mock.calls[0][1].method ?? 'GET').toBe('GET');
  });

  it('fetches the camera\'s base URL when the path is only the camera key', async () => {
    await get(['cam1']);
    expect(target()).toBe('http://camera.invalid/camera1');
  });

  it('returns what the camera sent', async () => {
    const res = await get(['cam1', 'status']);
    expect(res.status).toBe(200);
    expect(await res.text()).toBe('{"ready":true}');
    expect(res.headers.get('Content-Type')).toBe('application/json');
  });

  it('drops the encoding headers, since the body it returns is already decoded', async () => {
    const res = await get(['cam1', 'status']);
    expect(res.headers.get('Content-Encoding')).toBeNull();
    expect(res.headers.get('Transfer-Encoding')).toBeNull();
  });

  it('answers with the camera\'s status and its own message when the camera refuses', async () => {
    fetchMock.mockResolvedValue(new Response('authentication failed for user test-user', { status: 401 }));
    const res = await get(['cam1', 'status']);
    expect(res.status).toBe(401);
    expect(await res.text()).not.toContain('test-user');
  });

  it.each([['cam4'], ['camera1'], ['']])('answers 404 for the unknown camera %p and contacts nothing', async (camKey) => {
    const res = await get([camKey, 'status']);
    expect(res.status).toBe(404);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('answers 500 without the details when the camera cannot be reached', async () => {
    fetchMock.mockRejectedValue(new Error('connect ECONNREFUSED 34.87.165.238:8889'));
    const res = await get(['cam1', 'status']);
    expect(res.status).toBe(500);
    expect(await res.text()).not.toMatch(/ECONNREFUSED|34\.87|camera\.invalid/);
  });
});

describe('/api/cam/[...path] — keys and paths that are not a camera', () => {
  // Names every object has ("constructor", "toString") are not cameras either.
  it.each([['constructor'], ['toString'], ['__proto__']])(
    'answers 404 for the camera key %p and contacts nothing',
    async (camKey) => {
      const res = await get([camKey, 'status']);
      expect(res.status).toBe(404);
      expect(fetchMock).not.toHaveBeenCalled();
    },
  );

  // DESIGN.md: the proxy "forwards to the right MediaMTX URL". Next.js hands
  // the handler decoded segments, so "..%2Fcamera2" arrives as "../camera2";
  // nothing in the path may lead out of the camera's own URL, where the
  // request would still carry the camera's credentials.
  it.each([
    ['another camera', ['cam1', '..', 'camera2', 'whep']],
    ['the root of the camera host', ['cam1', '..', '..', 'v3', 'config', 'global', 'get']],
    ['another camera through an encoded slash', ['cam1', '../camera2', 'whep']],
    ['the root through a backslash', ['cam1', '..\\..', 'v3']],
    ['its own URL the long way round', ['cam1', '.', 'whep']],
  ])('refuses a path that tries to reach %s, and contacts nothing', async (_label, path) => {
    for (const res of [await whepOffer(path), await get(path)]) expect(res.status).toBe(404);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('keeps characters that would change the URL inside the segment they came in', async () => {
    // As decoded from /api/cam/cam1/whep%3Fx%3D1%23top/%252e%252e/session%2042.
    await GET(new NextRequest('http://localhost/api/cam/cam1'), to('cam1', 'whep?x=1#top', '%2e%2e', 'session 42'));
    expect(target()).toBe('http://camera.invalid/camera1/whep%3Fx%3D1%23top/%252e%252e/session%2042');
    expect(new URL(target()).pathname.startsWith('/camera1/')).toBe(true);
  });
});
