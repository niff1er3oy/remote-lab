/** @jest-environment node */
import { NextRequest } from 'next/server';
import { GET as overview } from '@/app/api/admin/overview/route';
import { PATCH as changeBooking } from '@/app/api/admin/bookings/[id]/route';
import { POST as block } from '@/app/api/admin/blocks/route';
import { PATCH as changeLab } from '@/app/api/admin/labs/[id]/route';
import { POST as book } from '@/app/api/bookings/route';
import { GET as activeSession } from '@/app/api/bookings/active-session/route';
import { POST as command } from '@/app/api/hardware/route';
import { cutAllCircuits, runRigScript } from '@/lib/rig';
import { all, breakDb, db, LAB8, read, resetDb, seed, seedBooking, ts } from '../helpers/server/firestore';
import { auth, knownAccount, resetAuth } from '../helpers/server/auth';
import { ADMIN, signInAs, STUDENT } from '../helpers/server/session';
import { freezeTime, restoreTime, HOUR, MINUTE } from '../helpers/server/time';

jest.mock('@/lib/firebase-admin', () => ({
  adminDb: jest.requireActual<typeof import('../helpers/server/firestore')>('../helpers/server/firestore').db,
  adminAuth: jest.requireActual<typeof import('../helpers/server/auth')>('../helpers/server/auth').auth,
}));
jest.mock('@/lib/session', () => ({ getSessionUser: jest.fn() }));
jest.mock('next/headers', () => ({ cookies: jest.fn() }));
jest.mock('@/lib/rig', () => ({
  ...jest.requireActual<typeof import('@/lib/rig')>('@/lib/rig'),
  cutAllCircuits: jest.fn(),
  runRigScript: jest.fn(),
}));

// Thursday 8 October 2026, 10:00 in Thailand.
const NOW = Date.parse('2026-10-08T03:00:00Z');
const DAY = 24 * HOUR;
const STRETCH = { lab_id: 'LAB8', start_time: '2026-10-09T02:00:00Z', end_time: '2026-10-09T09:00:00Z' };
const withId = (id: string) => ({ params: Promise.resolve({ id }) });
const json = (url: string, method: string, body?: unknown) =>
  new NextRequest(`http://localhost${url}`, { method, body: body === undefined ? undefined : JSON.stringify(body) });

const getOverview = async () => {
  const res = await overview(json('/api/admin/overview', 'GET'));
  return { status: res.status, body: await res.json() };
};
const patchBooking = async (id: string, body: unknown) => {
  const res = await changeBooking(json(`/api/admin/bookings/${id}`, 'PATCH', body), withId(id));
  return { status: res.status, body: await res.json() };
};
const postBlock = async (body: unknown) => {
  const res = await block(json('/api/admin/blocks', 'POST', body));
  return { status: res.status, body: await res.json() };
};
const patchLab = async (id: string, body: unknown) => {
  const res = await changeLab(json(`/api/admin/labs/${id}`, 'PATCH', body), withId(id));
  return { status: res.status, body: await res.json() };
};

// Firestore answers for everything except this one collection.
function breakCollection(name: string): void {
  const real = db.collection;
  jest.spyOn(db, 'collection').mockImplementation((asked) => {
    if (asked === name) throw new Error(`UNAVAILABLE: fake outage of ${name}`);
    return real(asked);
  });
}

// The lab and the overlap check can be read, but the write does not go through.
function failTransactions(): void {
  jest.spyOn(db, 'runTransaction').mockRejectedValue(new Error('ABORTED: fake transaction failure'));
}

beforeEach(() => {
  freezeTime(NOW);
  resetDb();
  resetAuth();
  seed('labs', 'LAB8', LAB8);
  knownAccount('student-1', 'Student One', 'student@example.com');
  knownAccount('admin-1', 'Admin One', 'admin@example.com');
  jest.mocked(cutAllCircuits).mockReset().mockResolvedValue([]);
  jest.mocked(runRigScript).mockReset().mockResolvedValue({ stdout: 'Path finished.\n', stderr: '' });
  signInAs(ADMIN);
  jest.spyOn(console, 'error').mockImplementation(() => {});
  jest.spyOn(console, 'log').mockImplementation(() => {});
});

afterEach(() => {
  restoreTime();
  jest.restoreAllMocks();
});

describe('PATCH /api/admin/bookings/[id] — the cases around the usual ones', () => {
  it.each(['cancel', 'end'])('answers 500 to %s when Firestore fails, and leaves the rig alone', async (action) => {
    seedBooking('b1', { start: NOW - HOUR, end: NOW + HOUR });
    breakDb();
    const { status, body } = await patchBooking('b1', { action });
    expect(status).toBe(500);
    expect(body.ok).toBe(false);
    expect(JSON.stringify(body)).not.toContain('UNAVAILABLE');
    expect(read('bookings', 'b1')?.status).toBe('confirmed');
    expect(cutAllCircuits).not.toHaveBeenCalled();
  });

  it('names the lab by its id in the notification when the lab itself is gone', async () => {
    seedBooking('later', { lab: 'LAB7', start: NOW + DAY, end: NOW + DAY + 2 * HOUR });
    seedBooking('now', { lab: 'LAB7', start: NOW - HOUR, end: NOW + HOUR });
    expect((await patchBooking('later', { action: 'cancel' })).status).toBe(200);
    expect((await patchBooking('now', { action: 'end' })).status).toBe(200);
    expect(all('notifications').map((n) => n.title)).toEqual([
      'ผู้ดูแลระบบยกเลิกการจอง — LAB7',
      'ผู้ดูแลระบบสิ้นสุดรอบทดลอง — LAB7',
    ]);
  });

  it('ends the admin\'s own block that is running now without notifying anyone, and still cuts the circuits', async () => {
    seedBooking('blk', { user: 'admin-1', start: NOW - HOUR, end: NOW + HOUR, blocked: true });
    expect(await patchBooking('blk', { action: 'end' })).toEqual({ status: 200, body: { ok: true, circuits_cut: true } });
    expect(read('bookings', 'blk')?.status).toBe('completed');
    expect(cutAllCircuits).toHaveBeenCalledTimes(1);
    expect(all('notifications')).toEqual([]);
  });

  it('leaves alone a session the student has already closed', async () => {
    seedBooking('b1', { status: 'in_progress', start: NOW - HOUR, end: NOW + HOUR });
    const closed = { user_id: 'student-1', start_time: ts(new Date(NOW - 50 * MINUTE).toISOString()), status: 'completed', duration_seconds: 600 };
    seed('sessions', 'b1', closed);
    expect((await patchBooking('b1', { action: 'end' })).status).toBe(200);
    expect(read('sessions', 'b1')).toEqual(closed);
  });
});

describe('POST /api/admin/blocks — when Firestore fails', () => {
  it('answers 500 when the lab cannot be read', async () => {
    breakDb();
    const { status, body } = await postBlock(STRETCH);
    expect(status).toBe(500);
    expect(body.ok).toBe(false);
    expect(JSON.stringify(body)).not.toContain('UNAVAILABLE');
    expect(all('bookings')).toEqual([]);
  });

  it('answers 500, not 409, when the block cannot be written, and holds nothing', async () => {
    failTransactions();
    expect((await postBlock(STRETCH)).status).toBe(500);
    expect(all('bookings')).toEqual([]);
  });
});

describe('PATCH /api/admin/labs/[id] — when Firestore fails', () => {
  it('answers 500 and leaves the lab as it was', async () => {
    breakDb();
    const { status, body } = await patchLab('LAB8', { is_active: false });
    expect(status).toBe(500);
    expect(body.ok).toBe(false);
    expect(read('labs', 'LAB8')?.is_active).toBe(true);
  });
});

describe('GET /api/admin/overview — the people and labs it lists', () => {
  it('names everyone when more than 100 people have bookings, asking Firebase Auth for at most 100 at a time', async () => {
    const asked = jest.spyOn(auth, 'getUsers');
    for (let i = 0; i < 205; i++) {
      seedBooking(`b${String(i).padStart(3, '0')}`, { user: `u${i}`, start: NOW + i * MINUTE, end: NOW + i * MINUTE + 2 * HOUR });
      knownAccount(`u${i}`, `User ${i}`, `u${i}@example.com`);
    }
    const { status, body } = await getOverview();
    expect(status).toBe(200);
    expect(body.bookings).toHaveLength(205);
    expect(body.bookings.map((b: { user: { email: string } }) => b.user.email))
      .toEqual(Array.from({ length: 205 }, (_, i) => `u${i}@example.com`));
    expect(body.bookings[204].user).toEqual({ uid: 'u204', name: 'User 204', email: 'u204@example.com' });
    // Firebase Auth refuses a lookup of more than 100 accounts.
    expect(Math.max(...asked.mock.calls.map(([ids]) => ids.length))).toBeLessThanOrEqual(100);
  });

  it('asks about a person once, however many rounds they have', async () => {
    const asked = jest.spyOn(auth, 'getUsers');
    seedBooking('running', { start: NOW - HOUR, end: NOW + HOUR, status: 'in_progress' });
    seedBooking('tomorrow', { start: NOW + DAY, end: NOW + DAY + 2 * HOUR });
    seedBooking('block', { user: 'admin-1', start: NOW + 2 * DAY, end: NOW + 2 * DAY + 2 * HOUR, blocked: true });
    await getOverview();
    expect(asked.mock.calls.flatMap(([ids]) => ids.map((id) => id.uid)).sort()).toEqual(['admin-1', 'student-1']);
  });

  it('lists a booking of an account that has no name or email', async () => {
    knownAccount('bare');
    seedBooking('b1', { user: 'bare', start: NOW + HOUR, end: NOW + 3 * HOUR });
    expect((await getOverview()).body.bookings[0].user).toEqual({ uid: 'bare', name: '', email: '' });
  });

  it('lists a lab that has no code or name under its id, as closed', async () => {
    seed('labs', 'LAB9', {});
    expect((await getOverview()).body.labs).toContainEqual({ lab_id: 'LAB9', code: 'LAB9', name_th: '', is_active: false });
  });

  it('answers 500 rather than "nothing closed" when the rig setting cannot be read', async () => {
    breakCollection('settings');
    const { status, body } = await getOverview();
    expect(status).toBe(500);
    expect(body).not.toHaveProperty('disabled_instruments');
  });
});

describe('POST /api/bookings — when the booking cannot be written', () => {
  it('answers 500, not 409, books nothing and announces nothing', async () => {
    signInAs(STUDENT);
    failTransactions();
    const res = await book(json('/api/bookings', 'POST', { room_id: 'LAB8', start_time: '2026-10-09 04:00:00', end_time: '2026-10-09 06:00:00' }));
    expect(res.status).toBe(500);
    expect((await res.json()).ok).toBe(false);
    expect(all('bookings')).toEqual([]);
    expect(all('notifications')).toEqual([]);
  });
});

describe('when the rig setting cannot be read while a round is running', () => {
  beforeEach(() => {
    signInAs(STUDENT);
    seedBooking('running', { start: NOW - HOUR, end: NOW + HOUR });
    breakCollection('settings');
  });

  const send = (body: unknown) =>
    command(new Request('http://localhost/api/hardware', { method: 'POST', body: JSON.stringify(body) }));

  it('the lab room is answered 500 instead of being told that nothing is closed', async () => {
    const res = await activeSession();
    expect(res.status).toBe(500);
    expect(await res.json()).toEqual({ ok: false });
  });

  it.each([[{ script: 'coil_1.py' }], [{ script: 'sole.py', position: 2 }]])('the rig answers 500 to %j and starts nothing', async (body) => {
    const res = await send(body);
    expect(res.status).toBe(500);
    expect(JSON.stringify(await res.json())).not.toContain('UNAVAILABLE');
    expect(runRigScript).not.toHaveBeenCalled();
  });

  it.each(['coil_b.py', 'sole_b.py'])('the rig still runs %s, which is never held back by the setting', async (script) => {
    expect((await send({ script })).status).toBe(200);
    expect(runRigScript).toHaveBeenCalledWith([script]);
  });
});

describe('/api/cam/[...path] — settings that are missing when the server starts', () => {
  type CamRoute = typeof import('@/app/api/cam/[...path]/route');
  const fetchMock = jest.fn<Promise<Response>, [string, RequestInit]>();

  // The route reads its settings once, when it is first loaded.
  async function routeWithout(...names: string[]): Promise<CamRoute> {
    const saved = names.map((name) => [name, process.env[name]] as const);
    let route: CamRoute | undefined;
    try {
      for (const name of names) delete process.env[name];
      await jest.isolateModulesAsync(async () => {
        route = await import('@/app/api/cam/[...path]/route');
      });
    } finally {
      for (const [name, value] of saved) {
        if (value !== undefined) process.env[name] = value;
      }
    }
    return route!;
  }
  const to = (...path: string[]) => ({ params: Promise.resolve({ path }) });

  beforeEach(() => {
    fetchMock.mockReset().mockImplementation(async () => new Response('ok', { status: 200 }));
    globalThis.fetch = fetchMock as unknown as typeof fetch;
  });

  it.each(['cam1', 'cam2', 'cam3'])('answers 404 for %s when it has no address, and contacts nothing', async (camKey) => {
    const { GET, POST } = await routeWithout(camKey);
    expect((await GET(new NextRequest(`http://localhost/api/cam/${camKey}`), to(camKey))).status).toBe(404);
    const offer = new NextRequest(`http://localhost/api/cam/${camKey}/whep`, { method: 'POST', body: 'v=0' });
    expect((await POST(offer, to(camKey, 'whep'))).status).toBe(404);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('still serves the cameras that do have an address', async () => {
    const { GET } = await routeWithout('cam2');
    expect((await GET(new NextRequest('http://localhost/api/cam/cam1'), to('cam1'))).status).toBe(200);
    expect(fetchMock.mock.calls[0][0]).toBe('http://camera.invalid/camera1');
  });

  it('signs in to the camera as "admin" with no password when neither is set', async () => {
    const { GET } = await routeWithout('CAM_USER', 'CAM_PASSWORD');
    await GET(new NextRequest('http://localhost/api/cam/cam1'), to('cam1'));
    expect(fetchMock.mock.calls[0][1].headers).toEqual({ Authorization: `Basic ${Buffer.from('admin:').toString('base64')}` });
  });
});
