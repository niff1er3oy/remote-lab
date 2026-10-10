/** @jest-environment node */
import { NextRequest } from 'next/server';
import { GET, POST } from '@/app/api/lab/record/route';
import { cleanEvents, MAX_EVENTS } from '@/lib/lab-record';
import type { LabEvent } from '@/lib/lab-activity';
import { breakDb, LAB8, read, resetDb, seed, seedBooking } from '../helpers/server/firestore';
import { knownAccount, resetAuth } from '../helpers/server/auth';
import { ADMIN, signInAs, signOut, STUDENT } from '../helpers/server/session';
import { freezeTime, moveTimeTo, restoreTime, HOUR, MINUTE } from '../helpers/server/time';

jest.mock('@/lib/firebase-admin', () => ({
  adminDb: jest.requireActual<typeof import('../helpers/server/firestore')>('../helpers/server/firestore').db,
  adminAuth: jest.requireActual<typeof import('../helpers/server/auth')>('../helpers/server/auth').auth,
}));
jest.mock('@/lib/session', () => ({ getSessionUser: jest.fn() }));
jest.mock('next/headers', () => ({ cookies: jest.fn() }));

const NOW = Date.parse('2026-10-08T03:00:00Z');
const OTHER = { ...STUDENT, uid: 'student-2', email: 'other@example.com' };

const VISIT: LabEvent[] = [
  { at: NOW - 600_000, kind: 'start' },
  { at: NOW - 599_000, kind: 'background', ok: true, bMeasured: 0.0523 },
  { at: NOW - 598_000, kind: 'power-on', instrument: 'ขดลวดเดี่ยว 1 รอบ', ok: true },
  { at: NOW - 300_000, kind: 'reading', instrument: 'ขดลวดเดี่ยว 1 รอบ', I: 5, bTheory: 0.2417, bMeasured: 0.23 },
  { at: NOW - 200_000, kind: 'move', instrument: 'โซลีนอยด์ 100 รอบ', ok: true, zCm: -8, I: 0.5, bTheory: 0.05, bMeasured: null },
  { at: NOW - 1000, kind: 'end', detail: 'finished' },
];

const save = async (body: unknown) => {
  const res = await POST(new Request('http://localhost/api/lab/record', { method: 'POST', body: JSON.stringify(body) }));
  return { status: res.status, body: await res.json() };
};
const open = async (booking: string | null) => {
  const res = await GET(new NextRequest(`http://localhost/api/lab/record${booking === null ? '' : `?booking=${booking}`}`));
  return { status: res.status, body: await res.json() };
};
// A round of the signed-in student that started 30 minutes ago.
const runningRound = (id = 'b1', more: Record<string, unknown> = {}) =>
  seedBooking(id, { user: STUDENT.uid, status: 'in_progress', start: NOW - 30 * MINUTE, end: NOW + 90 * MINUTE, ...more });

beforeEach(() => {
  freezeTime(NOW);
  resetDb();
  resetAuth();
  seed('labs', 'LAB8', LAB8);
  knownAccount(ADMIN.uid, 'Admin One', 'admin@example.com');
  jest.spyOn(console, 'error').mockImplementation(() => {});
  signInAs(STUDENT);
});

afterEach(() => {
  restoreTime();
  jest.restoreAllMocks();
});

describe('cleanEvents — a record fit to store', () => {
  it('keeps a visit\'s events as they are', () => {
    expect(cleanEvents(VISIT)).toEqual(VISIT);
  });

  it('drops anything an event does not have', () => {
    expect(cleanEvents([{ at: 1, kind: 'start', role: 'admin', __proto__: { x: 1 }, events: [1] }])).toEqual([{ at: 1, kind: 'start' }]);
  });

  it('cuts an over-long name or detail', () => {
    const [event] = cleanEvents([{ at: 1, kind: 'question', instrument: 'ก'.repeat(200), detail: 'ข'.repeat(900) }]) as LabEvent[];
    expect(event.instrument).toHaveLength(80);
    expect(event.detail).toHaveLength(500);
  });

  it.each([
    ['not a list', { 0: VISIT[0] }],
    ['an empty list', []],
    ['an event of no known kind', [{ at: 1, kind: 'drop-table' }]],
    ['an event with no time', [{ kind: 'start' }]],
    ['a time that is not a number', [{ at: '1', kind: 'start' }]],
    ['a field of the wrong type', [{ at: 1, kind: 'reading', bTheory: '0.2' }]],
    ['a measurement that is not a number', [{ at: 1, kind: 'reading', bMeasured: 'NaN' }]],
    ['a result that is not yes or no', [{ at: 1, kind: 'move', ok: 'true' }]],
    ['one bad event among good ones', [...VISIT, null]],
    ['more events than any visit makes', Array.from({ length: MAX_EVENTS + 1 }, (_, i) => ({ at: i, kind: 'start' }))],
  ])('refuses %s', (_label, raw) => {
    expect(cleanEvents(raw)).toBeNull();
  });
});

describe('POST /api/lab/record — keeping a visit', () => {
  it('answers 401 to someone who is not signed in', async () => {
    runningRound();
    signOut();
    expect((await save({ booking_id: 'b1', events: VISIT })).status).toBe(401);
    expect(read('lab_records', 'b1')).toBeUndefined();
  });

  it('keeps the record under the booking, and marks the booking as having one', async () => {
    runningRound();
    expect(await save({ booking_id: 'b1', events: VISIT })).toEqual({ status: 200, body: { ok: true, events: VISIT.length } });
    expect(read('lab_records', 'b1')).toMatchObject({ user_id: STUDENT.uid, booking_id: 'b1', lab_id: 'LAB8', events: VISIT });
    expect(read('bookings', 'b1')).toMatchObject({ has_record: true, status: 'in_progress' });
  });

  it('stores only what an event has, whatever else was sent with it', async () => {
    runningRound();
    await save({ booking_id: 'b1', user_id: 'someone-else', events: [{ at: 1, kind: 'start', user_id: 'someone-else' }] });
    expect(read('lab_records', 'b1')).toMatchObject({ user_id: STUDENT.uid, events: [{ at: 1, kind: 'start' }] });
  });

  it.each([
    ['no booking named', { events: VISIT }],
    ['a booking named by a path', { booking_id: '../bookings/b1', events: VISIT }],
    ['no events', { booking_id: 'b1' }],
    ['events that are not events', { booking_id: 'b1', events: [{ kind: 'start' }] }],
    ['nothing at all', null],
  ])('answers 400 for %s', async (_label, body) => {
    runningRound();
    expect((await save(body)).status).toBe(400);
    expect(read('lab_records', 'b1')).toBeUndefined();
  });

  it('answers 404 for a booking that does not exist', async () => {
    expect((await save({ booking_id: 'nope', events: VISIT })).status).toBe(404);
  });

  it('does not let one student write the record of another\'s round', async () => {
    runningRound();
    signInAs(OTHER);
    expect((await save({ booking_id: 'b1', events: VISIT })).status).toBe(403);
    expect(read('lab_records', 'b1')).toBeUndefined();
    expect(read('bookings', 'b1')).not.toHaveProperty('has_record');
  });

  it.each([
    ['a round that has not started', { start: NOW + HOUR, end: NOW + 3 * HOUR, status: 'confirmed' }],
    ['a round that ended more than an hour ago', { start: NOW - 4 * HOUR, end: NOW - 2 * HOUR, status: 'completed' }],
    ['a cancelled round', { status: 'cancelled' }],
  ])('refuses %s', async (_label, more) => {
    runningRound('b1', more);
    expect((await save({ booking_id: 'b1', events: VISIT })).status).toBe(403);
    expect(read('lab_records', 'b1')).toBeUndefined();
  });

  it('still keeps the record of a round that was marked complete a moment ago', async () => {
    runningRound('b1', { status: 'completed' });
    expect((await save({ booking_id: 'b1', events: VISIT })).status).toBe(200);
  });

  it('still keeps it shortly after the round\'s time ran out', async () => {
    runningRound();
    moveTimeTo(NOW + 90 * MINUTE + 5 * MINUTE);
    expect((await save({ booking_id: 'b1', events: VISIT })).status).toBe(200);
  });

  it('replaces an earlier save with a later, longer one', async () => {
    runningRound();
    await save({ booking_id: 'b1', events: VISIT.slice(0, 3) });
    await save({ booking_id: 'b1', events: VISIT });
    expect(read('lab_records', 'b1')?.events).toHaveLength(VISIT.length);
  });

  it('does not let a shorter save, arriving late, replace a fuller one', async () => {
    runningRound();
    await save({ booking_id: 'b1', events: VISIT });
    expect(await save({ booking_id: 'b1', events: VISIT.slice(0, 2) })).toEqual({ status: 200, body: { ok: true, events: VISIT.length } });
    expect(read('lab_records', 'b1')?.events).toHaveLength(VISIT.length);
  });

  it('answers 500 without the database\'s own words when it cannot be reached', async () => {
    runningRound();
    breakDb(new Error('UNAVAILABLE: firestore'));
    const { status, body } = await save({ booking_id: 'b1', events: VISIT });
    expect(status).toBe(500);
    expect(JSON.stringify(body)).not.toContain('UNAVAILABLE');
  });
});

describe('GET /api/lab/record — opening a visit again', () => {
  beforeEach(async () => {
    runningRound();
    await save({ booking_id: 'b1', events: VISIT });
  });

  it('gives the owner the events and the name of the experiment', async () => {
    expect(await open('b1')).toEqual({
      status: 200,
      body: { ok: true, booking_id: 'b1', experiment_name: LAB8.name_th, events: VISIT },
    });
  });

  it('answers 401 to someone who is not signed in', async () => {
    signOut();
    expect((await open('b1')).status).toBe(401);
  });

  it('answers another student as if there were no record', async () => {
    signInAs(OTHER);
    const { status, body } = await open('b1');
    expect(status).toBe(404);
    expect(JSON.stringify(body)).not.toContain('ขดลวด');
  });

  it('lets an admin open any student\'s record', async () => {
    signInAs(ADMIN);
    expect((await open('b1')).body.events).toEqual(VISIT);
  });

  it('answers 404 for a round with no record', async () => {
    expect((await open('b2')).status).toBe(404);
  });

  it.each([[null], ['../x'], ['']])('answers 400 when the booking is given as %p', async (booking) => {
    expect((await open(booking)).status).toBe(400);
  });

  it('answers 500 without the database\'s own words when it cannot be reached', async () => {
    breakDb(new Error('UNAVAILABLE: firestore'));
    const { status, body } = await open('b1');
    expect(status).toBe(500);
    expect(JSON.stringify(body)).not.toContain('UNAVAILABLE');
  });
});
