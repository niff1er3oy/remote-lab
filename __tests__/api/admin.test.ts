/** @jest-environment node */
import { NextRequest } from 'next/server';
import { GET as overview } from '@/app/api/admin/overview/route';
import { PATCH as changeBooking } from '@/app/api/admin/bookings/[id]/route';
import { POST as block } from '@/app/api/admin/blocks/route';
import { PATCH as changeLab } from '@/app/api/admin/labs/[id]/route';
import { POST as stopRig } from '@/app/api/admin/rig/stop/route';
import { POST as switchSupply } from '@/app/api/admin/rig/power/route';
import { GET as me } from '@/app/api/auth/me/route';
import { cutAllCircuits, feed, runRigScript } from '@/lib/rig';
import { adminEmails, isAdmin } from '@/lib/admin';
import { all, breakDb, LAB8, read, resetDb, seed, seedBooking, ts } from '../helpers/server/firestore';
import { knownAccount, resetAuth } from '../helpers/server/auth';
import { ADMIN, signInAs, signOut, STUDENT } from '../helpers/server/session';
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
  feed: jest.fn(),
}));

// Thursday 8 October 2026, 10:00 in Thailand.
const NOW = Date.parse('2026-10-08T03:00:00Z');
const DAY = 24 * HOUR;
const withId = (id: string) => ({ params: Promise.resolve({ id }) });
const json = (url: string, method: string, body?: unknown) =>
  new NextRequest(`http://localhost${url}`, { method, body: body === undefined ? undefined : JSON.stringify(body) });

const getOverview = async (query = '') => {
  const res = await overview(json(`/api/admin/overview${query}`, 'GET'));
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
const notesFor = (uid: string) => all('notifications').filter((n) => n.user_id === uid);

beforeEach(() => {
  freezeTime(NOW);
  resetDb();
  resetAuth();
  seed('labs', 'LAB8', LAB8);
  knownAccount('student-1', 'Student One', 'student@example.com');
  knownAccount('admin-1', 'Admin One', 'admin@example.com');
  jest.mocked(cutAllCircuits).mockReset().mockResolvedValue([]);
  jest.mocked(runRigScript).mockReset().mockResolvedValue({ stdout: '', stderr: '' });
  jest.mocked(feed).mockReset().mockResolvedValue(undefined);
  signInAs(ADMIN);
  jest.spyOn(console, 'error').mockImplementation(() => {});
  jest.spyOn(console, 'log').mockImplementation(() => {});
});

afterEach(() => {
  restoreTime();
  jest.restoreAllMocks();
});

describe('who is an admin', () => {
  it('reads the list from ADMIN_EMAILS, trimmed and in lower case', () => {
    expect(adminEmails()).toEqual(['admin@example.com', 'second.admin@example.com']);
  });

  it('accepts a listed email whatever its capitals', () => {
    expect(isAdmin({ uid: 'x', email: 'ADMIN@example.com' })).toBe(true);
    expect(isAdmin({ uid: 'x', email: 'second.admin@example.com' })).toBe(true);
  });

  it('refuses everyone else, including a user with no email and a signed-out visitor', () => {
    expect(isAdmin(STUDENT)).toBe(false);
    expect(isAdmin({ uid: 'x' })).toBe(false);
    expect(isAdmin({ uid: 'x', email: '' })).toBe(false);
    expect(isAdmin(null)).toBe(false);
  });

  it('does not treat the role claim as admin rights', () => {
    expect(isAdmin({ ...STUDENT, role: 'admin' })).toBe(false);
  });

  it('has no admins when the variable is missing or empty', () => {
    const saved = process.env.ADMIN_EMAILS;
    try {
      delete process.env.ADMIN_EMAILS;
      expect(isAdmin(ADMIN)).toBe(false);
      process.env.ADMIN_EMAILS = ' , ';
      expect(isAdmin(ADMIN)).toBe(false);
      expect(isAdmin({ uid: 'x', email: '' })).toBe(false);
    } finally {
      process.env.ADMIN_EMAILS = saved;
    }
  });

  it('tells the page through /api/auth/me', async () => {
    expect((await (await me()).json()).user.is_admin).toBe(true);
    signInAs(STUDENT);
    expect((await (await me()).json()).user.is_admin).toBe(false);
  });
});

describe('every admin route is closed to anyone who is not an admin', () => {
  const calls: Array<[string, () => Promise<{ status: number }>]> = [
    ['GET overview', () => getOverview()],
    ['PATCH bookings/[id]', () => patchBooking('b1', { action: 'cancel' })],
    ['POST blocks', () => postBlock({ lab_id: 'LAB8', start_time: '2026-10-09T03:00:00Z', end_time: '2026-10-09T05:00:00Z' })],
    ['PATCH labs/[id]', () => patchLab('LAB8', { is_active: false })],
    ['POST rig/stop', async () => ({ status: (await stopRig()).status })],
    ['POST rig/power', async () => ({ status: (await switchSupply(json('/api/admin/rig/power', 'POST', { on: true }))).status })],
  ];

  it.each(calls)('%s answers 403 to a signed-in student and changes nothing', async (_name, send) => {
    seedBooking('b1', { start: NOW + DAY, end: NOW + DAY + 2 * HOUR });
    signInAs(STUDENT);
    expect((await send()).status).toBe(403);
    expect(read('bookings', 'b1')?.status).toBe('confirmed');
    expect(read('labs', 'LAB8')?.is_active).toBe(true);
    expect(all('bookings')).toHaveLength(1);
    expect(cutAllCircuits).not.toHaveBeenCalled();
    expect(runRigScript).not.toHaveBeenCalled();
  });

  it.each(calls)('%s answers 403 to a visitor who is not signed in', async (_name, send) => {
    signOut();
    expect((await send()).status).toBe(403);
    expect(cutAllCircuits).not.toHaveBeenCalled();
    expect(runRigScript).not.toHaveBeenCalled();
  });
});

describe('GET /api/admin/overview', () => {
  it('lists the bookings that start in the days asked for, oldest first, with who made them', async () => {
    seedBooking('later', { start: NOW + 2 * DAY, end: NOW + 2 * DAY + 2 * HOUR });
    seedBooking('sooner', { start: NOW + HOUR, end: NOW + 3 * HOUR, status: 'cancelled' });
    const { status, body } = await getOverview();
    expect(status).toBe(200);
    expect(body.bookings.map((b: { booking_id: string }) => b.booking_id)).toEqual(['sooner', 'later']);
    expect(body.bookings[0]).toEqual({
      booking_id: 'sooner', lab_id: 'LAB8', status: 'cancelled',
      start_time: new Date(NOW + HOUR).toISOString(), end_time: new Date(NOW + 3 * HOUR).toISOString(),
      blocked: false, note: '',
      user: { uid: 'student-1', name: 'Student One', email: 'student@example.com' },
    });
  });

  it('starts today in Thai time and covers seven days unless told otherwise', async () => {
    // Thai midnight on the 8th is 17:00 UTC on the 7th.
    seedBooking('yesterday-night', { start: '2026-10-07T16:00:00Z', end: '2026-10-07T18:00:00Z' });
    seedBooking('today-first', { start: '2026-10-07T17:00:00Z', end: '2026-10-07T19:00:00Z' });
    seedBooking('day-7-last', { start: '2026-10-14T15:00:00Z', end: '2026-10-14T17:00:00Z' });
    seedBooking('day-8-first', { start: '2026-10-14T17:00:00Z', end: '2026-10-14T19:00:00Z' });
    const { body } = await getOverview();
    expect(body.bookings.map((b: { booking_id: string }) => b.booking_id)).toEqual(['today-first', 'day-7-last']);
    expect(body).toMatchObject({ from: '2026-10-08', days: 7 });
  });

  it('follows the from and days it is given', async () => {
    seedBooking('in', { start: '2026-10-20T03:00:00Z', end: '2026-10-20T05:00:00Z' });
    seedBooking('out', { start: '2026-10-21T17:00:00Z', end: '2026-10-21T19:00:00Z' });
    const { body } = await getOverview('?from=2026-10-20&days=2');
    expect(body.bookings.map((b: { booking_id: string }) => b.booking_id)).toEqual(['in']);
  });

  it.each(['?from=tomorrow', '?from=2026-13-45', '?days=0', '?days=32', '?days=1.5', '?days=x'])('answers 400 for %s', async (query) => {
    expect((await getOverview(query)).status).toBe(400);
  });

  it('says who is in the lab room right now', async () => {
    seedBooking('running', { start: NOW - 30 * MINUTE, end: NOW + 90 * MINUTE, status: 'in_progress' });
    seedBooking('over', { start: NOW - 5 * HOUR, end: NOW - 3 * HOUR, status: 'completed' });
    seedBooking('finished-early', { start: NOW - HOUR, end: NOW + HOUR, status: 'completed' });
    seedBooking('not-yet', { start: NOW + HOUR, end: NOW + 3 * HOUR });
    const { body } = await getOverview();
    expect(body.running.map((b: { booking_id: string }) => b.booking_id)).toEqual(['running']);
    expect(body.running[0].user.email).toBe('student@example.com');
  });

  it('lists every lab with whether it takes bookings', async () => {
    seed('labs', 'LAB9', { code: 'LAB9', name_th: 'ปิดอยู่', is_active: false });
    const { body } = await getOverview();
    expect(body.labs).toEqual([
      { lab_id: 'LAB8', code: 'LAB8', name_th: 'สนามแม่เหล็กและกฎของไบโอต-ซาวัต', is_active: true },
      { lab_id: 'LAB9', code: 'LAB9', name_th: 'ปิดอยู่', is_active: false },
    ]);
  });

  it('marks a blocked stretch and carries its note', async () => {
    seedBooking('blk', { user: 'admin-1', start: NOW + HOUR, end: NOW + 3 * HOUR, blocked: true, note: 'ซ่อมหัววัด' });
    expect((await getOverview()).body.bookings[0]).toMatchObject({ blocked: true, note: 'ซ่อมหัววัด' });
  });

  it('still lists a booking whose owner no longer has an account', async () => {
    seedBooking('orphan', { user: 'gone', start: NOW + HOUR, end: NOW + 3 * HOUR });
    expect((await getOverview()).body.bookings[0].user).toEqual({ uid: 'gone', name: '', email: '' });
  });

  it('answers 500 when Firestore fails', async () => {
    breakDb();
    expect((await getOverview()).status).toBe(500);
  });
});

describe('PATCH /api/admin/bookings/[id] — cancel', () => {
  it.each(['confirmed', 'pending'])('cancels a %s round of any user and tells them', async (status) => {
    seedBooking('b1', { status, start: NOW + DAY, end: NOW + DAY + 2 * HOUR });
    expect(await patchBooking('b1', { action: 'cancel' })).toEqual({ status: 200, body: { ok: true } });
    expect(read('bookings', 'b1')).toMatchObject({ status: 'cancelled', cancelled_by: 'admin-1' });
    expect(notesFor('student-1')).toEqual([expect.objectContaining({ type: 'warning', is_read: false, title: 'ผู้ดูแลระบบยกเลิกการจอง — LAB8' })]);
  });

  it.each(['in_progress', 'completed', 'cancelled'])('refuses to cancel a round that is %s', async (status) => {
    seedBooking('b1', { status, start: NOW - HOUR, end: NOW + HOUR });
    expect((await patchBooking('b1', { action: 'cancel' })).status).toBe(400);
    expect(read('bookings', 'b1')?.status).toBe(status);
    expect(all('notifications')).toEqual([]);
  });

  it('sends no notification when the admin lifts their own block', async () => {
    seedBooking('blk', { user: 'admin-1', start: NOW + HOUR, end: NOW + 3 * HOUR, blocked: true });
    expect((await patchBooking('blk', { action: 'cancel' })).status).toBe(200);
    expect(read('bookings', 'blk')?.status).toBe('cancelled');
    expect(all('notifications')).toEqual([]);
  });

  it('answers 404 for a booking that does not exist', async () => {
    expect((await patchBooking('nope', { action: 'cancel' })).status).toBe(404);
  });

  it.each([[{ action: 'delete' }], [{}], [null], ['cancel']])('answers 400 for the body %j and changes nothing', async (body) => {
    seedBooking('b1', { start: NOW + DAY, end: NOW + DAY + 2 * HOUR });
    expect((await patchBooking('b1', body)).status).toBe(400);
    expect(read('bookings', 'b1')?.status).toBe('confirmed');
  });
});

describe('PATCH /api/admin/bookings/[id] — end the round running now', () => {
  it('closes the round and its session, cuts the circuits and tells the student', async () => {
    seedBooking('b1', { status: 'in_progress', start: NOW - 30 * MINUTE, end: NOW + 90 * MINUTE });
    seed('sessions', 'b1', { user_id: 'student-1', start_time: ts(new Date(NOW - 20 * MINUTE).toISOString()), status: 'active' });
    expect(await patchBooking('b1', { action: 'end' })).toEqual({ status: 200, body: { ok: true, circuits_cut: true } });
    expect(read('bookings', 'b1')).toMatchObject({ status: 'completed', ended_by: 'admin-1' });
    expect(read('sessions', 'b1')).toMatchObject({ status: 'completed', duration_seconds: 1200 });
    expect(cutAllCircuits).toHaveBeenCalledTimes(1);
    expect(notesFor('student-1')).toEqual([expect.objectContaining({ title: 'ผู้ดูแลระบบสิ้นสุดรอบทดลอง — LAB8' })]);
  });

  it('ends a round nobody has entered yet, which has no session to close', async () => {
    seedBooking('b1', { start: NOW - 10 * MINUTE, end: NOW + 110 * MINUTE });
    expect((await patchBooking('b1', { action: 'end' })).status).toBe(200);
    expect(read('bookings', 'b1')?.status).toBe('completed');
    expect(read('sessions', 'b1')).toBeUndefined();
  });

  it('still ends the round when a circuit could not be cut, and says so', async () => {
    jest.mocked(cutAllCircuits).mockResolvedValue(['sole_b.py']);
    seedBooking('b1', { status: 'in_progress', start: NOW - HOUR, end: NOW + HOUR });
    expect((await patchBooking('b1', { action: 'end' })).body).toEqual({ ok: true, circuits_cut: false });
    expect(read('bookings', 'b1')?.status).toBe('completed');
  });

  it.each([
    ['has not started', { start: NOW + HOUR, end: NOW + 3 * HOUR }],
    ['is already over', { start: NOW - 3 * HOUR, end: NOW - HOUR }],
    ['was cancelled', { start: NOW - HOUR, end: NOW + HOUR, status: 'cancelled' }],
    ['was completed', { start: NOW - HOUR, end: NOW + HOUR, status: 'completed' }],
  ])('refuses a round that %s, and leaves the rig alone', async (_label, booking) => {
    seedBooking('b1', booking);
    expect((await patchBooking('b1', { action: 'end' })).status).toBe(400);
    expect(cutAllCircuits).not.toHaveBeenCalled();
    expect(all('notifications')).toEqual([]);
  });
});

describe('POST /api/admin/blocks', () => {
  const STRETCH = { lab_id: 'LAB8', start_time: '2026-10-09T02:00:00Z', end_time: '2026-10-09T09:00:00Z', note: '  ซ่อม\nหัววัด  ' };

  it('holds the time as a blocked booking in the admin\'s name', async () => {
    expect(await postBlock(STRETCH)).toEqual({ status: 200, body: { ok: true } });
    expect(all('bookings')).toEqual([expect.objectContaining({
      user_id: 'admin-1', lab_id: 'LAB8', status: 'confirmed', blocked: true, note: 'ซ่อม หัววัด',
      start_time: ts('2026-10-09T02:00:00Z'), end_time: ts('2026-10-09T09:00:00Z'),
    })]);
  });

  it('refuses a stretch that someone has already booked into, and says how many', async () => {
    seedBooking('b1', { start: '2026-10-09T08:00:00Z', end: '2026-10-09T10:00:00Z' });
    seedBooking('b2', { start: '2026-10-09T04:00:00Z', end: '2026-10-09T06:00:00Z', status: 'in_progress' });
    const { status, body } = await postBlock(STRETCH);
    expect(status).toBe(409);
    expect(body.error).toContain('2 รายการ');
    expect(all('bookings')).toHaveLength(2);
  });

  it('ignores cancelled and finished rounds, and rounds that only touch the stretch', async () => {
    seedBooking('cancelled', { start: '2026-10-09T04:00:00Z', end: '2026-10-09T06:00:00Z', status: 'cancelled' });
    seedBooking('done', { start: '2026-10-09T06:00:00Z', end: '2026-10-09T08:00:00Z', status: 'completed' });
    seedBooking('before', { start: '2026-10-09T00:00:00Z', end: '2026-10-09T02:00:00Z' });
    seedBooking('after', { start: '2026-10-09T09:00:00Z', end: '2026-10-09T11:00:00Z' });
    expect((await postBlock(STRETCH)).status).toBe(200);
  });

  it('keeps a student from booking into the stretch afterwards', async () => {
    await postBlock(STRETCH);
    const { POST: book } = await import('@/app/api/bookings/route');
    signInAs(STUDENT);
    const res = await book(json('/api/bookings', 'POST', { room_id: 'LAB8', start_time: '2026-10-09 04:00:00', end_time: '2026-10-09 06:00:00' }));
    expect(res.status).toBe(409);
  });

  it.each([
    ['no lab', { ...STRETCH, lab_id: undefined }],
    ['a start that is not a date', { ...STRETCH, start_time: 'soon' }],
    ['an end that is a number', { ...STRETCH, end_time: 1791280800000 }],
    ['an end before the start', { ...STRETCH, end_time: '2026-10-09T01:00:00Z' }],
    ['an end equal to the start', { ...STRETCH, end_time: STRETCH.start_time }],
    ['a stretch already in the past', { ...STRETCH, start_time: '2026-10-07T02:00:00Z', end_time: '2026-10-07T09:00:00Z' }],
    ['more than seven days', { ...STRETCH, end_time: '2026-10-16T02:00:01Z' }],
    ['no body', null],
  ])('answers 400 for %s', async (_label, body) => {
    expect((await postBlock(body)).status).toBe(400);
    expect(all('bookings')).toEqual([]);
  });

  it('answers 404 for a lab that does not exist', async () => {
    expect((await postBlock({ ...STRETCH, lab_id: 'LAB99' })).status).toBe(404);
  });

  it('cuts a long note to 120 characters and stores none when it is not text', async () => {
    await postBlock({ ...STRETCH, note: 'ก'.repeat(300) });
    await postBlock({ ...STRETCH, start_time: '2026-10-10T02:00:00Z', end_time: '2026-10-10T03:00:00Z', note: { a: 1 } });
    expect(all('bookings').map((b) => String(b.note).length)).toEqual([120, 0]);
  });
});

describe('PATCH /api/admin/labs/[id]', () => {
  it('closes and reopens a lab to booking', async () => {
    expect(await patchLab('LAB8', { is_active: false })).toEqual({ status: 200, body: { ok: true, is_active: false } });
    expect(read('labs', 'LAB8')?.is_active).toBe(false);
    await patchLab('LAB8', { is_active: true });
    expect(read('labs', 'LAB8')?.is_active).toBe(true);
  });

  it('leaves the lab\'s other fields and its bookings alone', async () => {
    seedBooking('b1', { start: NOW + DAY, end: NOW + DAY + 2 * HOUR });
    await patchLab('LAB8', { is_active: false });
    expect(read('labs', 'LAB8')).toMatchObject({ code: 'LAB8', name_th: LAB8.name_th });
    expect(read('bookings', 'b1')?.status).toBe('confirmed');
  });

  it.each([[{ is_active: 'false' }], [{ is_active: 0 }], [{}], [null]])('answers 400 for the body %j', async (body) => {
    expect((await patchLab('LAB8', body)).status).toBe(400);
    expect(read('labs', 'LAB8')?.is_active).toBe(true);
  });

  it('answers 404 for a lab that does not exist, without creating it', async () => {
    expect((await patchLab('LAB99', { is_active: true })).status).toBe(404);
    expect(read('labs', 'LAB99')).toBeUndefined();
  });
});

describe('POST /api/admin/rig/power', () => {
  const power = async (body: unknown) => {
    const res = await switchSupply(json('/api/admin/rig/power', 'POST', body));
    return { status: res.status, body: await res.json() };
  };

  it('with on: true switches every relay on, whether or not anyone has a round', async () => {
    expect(await power({ on: true })).toEqual({ status: 200, body: { ok: true, on: true } });
    expect(jest.mocked(feed).mock.calls).toEqual([['all']]);
    expect(runRigScript).not.toHaveBeenCalled();
  });

  it('with on: false switches every relay off, whether or not anyone has a round', async () => {
    expect(await power({ on: false })).toEqual({ status: 200, body: { ok: true, on: false } });
    expect(jest.mocked(runRigScript).mock.calls).toEqual([[['relay.py', '--status', 'off', '--name', 'all']]]);
    expect(feed).not.toHaveBeenCalled();
  });

  it.each([[{ on: 'true' }], [{ on: 1 }], [{}], [null]])('answers 400 for the body %j and runs nothing', async (body) => {
    expect((await power(body)).status).toBe(400);
    expect(runRigScript).not.toHaveBeenCalled();
  });

  it('answers 500 without the script\'s output when the supply does not respond', async () => {
    jest.mocked(feed).mockRejectedValue(new Error('Traceback: /home/admin/Documents/relay.py'));
    const { status, body } = await power({ on: true });
    expect(status).toBe(500);
    expect(JSON.stringify(body)).not.toMatch(/Traceback|home\/admin/);
  });
});

describe('POST /api/admin/rig/stop', () => {
  it('cuts both circuits whether or not anyone has a round', async () => {
    const res = await stopRig();
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true });
    expect(cutAllCircuits).toHaveBeenCalledTimes(1);
  });

  it('answers 500 and names the scripts when a circuit could not be cut', async () => {
    jest.mocked(cutAllCircuits).mockResolvedValue(['coil_b.py']);
    const res = await stopRig();
    expect(res.status).toBe(500);
    expect(await res.json()).toMatchObject({ ok: false, failed: ['coil_b.py'] });
  });
});
