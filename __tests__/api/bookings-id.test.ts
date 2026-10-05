/** @jest-environment node */
import { NextRequest } from 'next/server';
import { PATCH } from '@/app/api/bookings/[id]/route';
import { all, breakDb, LAB8, read, resetDb, seed, seedBooking, ts } from '../helpers/server/firestore';
import { signInAs, signOut } from '../helpers/server/session';
import { freezeTime, moveTimeTo, restoreTime, HOUR, MINUTE } from '../helpers/server/time';

jest.mock('@/lib/firebase-admin', () => ({
  adminDb: jest.requireActual<typeof import('../helpers/server/firestore')>('../helpers/server/firestore').db,
}));
jest.mock('@/lib/session', () => ({ getSessionUser: jest.fn() }));

const NOW = Date.parse('2026-10-05T03:00:00Z');

const patchRaw = (id: string, body?: string) =>
  PATCH(
    new NextRequest(`http://localhost/api/bookings/${id}`, { method: 'PATCH', body }),
    { params: Promise.resolve({ id }) },
  );
const patch = (id: string, body: unknown) => patchRaw(id, JSON.stringify(body));

// The signed-in student's round, started 30 minutes ago.
const myBooking = (status = 'confirmed') =>
  seedBooking('b1', { status, start: NOW - 30 * MINUTE, end: NOW + 90 * MINUTE });
const statusOf = (id: string) => read('bookings', id)?.status;

beforeEach(() => {
  freezeTime(NOW);
  resetDb();
  seed('labs', 'LAB8', LAB8);
  signInAs();
  jest.spyOn(console, 'error').mockImplementation(() => {});
});

afterEach(() => {
  restoreTime();
  jest.restoreAllMocks();
});

describe('PATCH /api/bookings/[id] — whose booking', () => {
  it.each(['start', 'complete', 'cancel'])('refuses %s from a caller who is not signed in', async (action) => {
    signOut();
    myBooking();
    const res = await patch('b1', { action });
    expect(res.status).toBe(401);
    expect(statusOf('b1')).toBe('confirmed');
  });

  it('answers 404 for a booking that does not exist', async () => {
    const res = await patch('nothing-here', { action: 'start' });
    expect(res.status).toBe(404);
    expect(await res.json()).toEqual({ ok: false, error: expect.any(String) });
    expect(all('sessions')).toEqual([]);
  });

  it.each(['start', 'complete', 'cancel'])('refuses %s on someone else\'s booking and leaves it untouched', async (action) => {
    seedBooking('theirs', { user: 'someone-else', start: NOW - 30 * MINUTE, end: NOW + 90 * MINUTE });
    const before = read('bookings', 'theirs');

    const res = await patch('theirs', { action });
    expect(res.status).toBe(403);
    expect(read('bookings', 'theirs')).toEqual(before);
    expect(all('sessions')).toEqual([]);
    expect(all('notifications')).toEqual([]);
  });

  it('answers 500 when Firestore fails', async () => {
    myBooking();
    breakDb();
    const res = await patch('b1', { action: 'start' });
    expect(res.status).toBe(500);
    expect(await res.json()).toEqual({ ok: false, error: expect.any(String) });
  });
});

describe('PATCH /api/bookings/[id] — start', () => {
  it.each(['confirmed', 'pending'])('moves a %s booking to in_progress', async (status) => {
    myBooking(status);
    const res = await patch('b1', { action: 'start' });
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true });
    expect(statusOf('b1')).toBe('in_progress');
  });

  it('opens a session stored under the booking\'s own id', async () => {
    myBooking();
    await patch('b1', { action: 'start' });
    expect(all('sessions')).toEqual([{
      id: 'b1',
      user_id: 'student-1',
      lab_id: 'LAB8',
      booking_id: 'b1',
      start_time: ts('2026-10-05T03:00:00Z'),
      status: 'active',
    }]);
  });

  it('keeps the first start time when the round is started again', async () => {
    myBooking();
    await patch('b1', { action: 'start' });
    moveTimeTo(NOW + 20 * MINUTE);
    const res = await patch('b1', { action: 'start' });

    expect(res.status).toBe(200);
    expect(statusOf('b1')).toBe('in_progress');
    expect(all('sessions')).toHaveLength(1);
    expect(read('sessions', 'b1')?.start_time).toEqual(ts('2026-10-05T03:00:00Z'));
  });

  it.each(['completed', 'cancelled'])('does not bring a %s booking back to life', async (status) => {
    myBooking(status);
    await patch('b1', { action: 'start' });
    expect(statusOf('b1')).toBe(status);
  });
});

describe('PATCH /api/bookings/[id] — complete', () => {
  it.each(['in_progress', 'confirmed', 'pending'])('moves a %s booking to completed', async (status) => {
    myBooking(status);
    const res = await patch('b1', { action: 'complete' });
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true });
    expect(statusOf('b1')).toBe('completed');
  });

  it('closes the session with its length in whole seconds', async () => {
    myBooking();
    await patch('b1', { action: 'start' });
    // 25 min 30.9 s later: 1530 whole seconds.
    moveTimeTo(NOW + 25 * MINUTE + 30_900);
    await patch('b1', { action: 'complete' });

    expect(read('sessions', 'b1')).toEqual({
      user_id: 'student-1',
      lab_id: 'LAB8',
      booking_id: 'b1',
      start_time: ts('2026-10-05T03:00:00Z'),
      end_time: ts('2026-10-05T03:25:30.900Z'),
      duration_seconds: 1530,
      status: 'completed',
    });
  });

  it('keeps the first length when the round is completed again', async () => {
    myBooking();
    await patch('b1', { action: 'start' });
    moveTimeTo(NOW + 10 * MINUTE);
    await patch('b1', { action: 'complete' });
    moveTimeTo(NOW + HOUR);
    const res = await patch('b1', { action: 'complete' });

    expect(res.status).toBe(200);
    expect(read('sessions', 'b1')).toMatchObject({
      end_time: ts('2026-10-05T03:10:00Z'),
      duration_seconds: 600,
      status: 'completed',
    });
  });

  it('completes a booking that was never started without making up a session', async () => {
    myBooking();
    await patch('b1', { action: 'complete' });
    expect(statusOf('b1')).toBe('completed');
    expect(all('sessions')).toEqual([]);
  });

  it('leaves a cancelled booking cancelled', async () => {
    myBooking('cancelled');
    const res = await patch('b1', { action: 'complete' });
    expect(res.status).toBe(200);
    expect(statusOf('b1')).toBe('cancelled');
  });
});

describe('PATCH /api/bookings/[id] — cancel', () => {
  it.each(['confirmed', 'pending'])('cancels a %s booking', async (status) => {
    myBooking(status);
    const res = await patch('b1', { action: 'cancel' });
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true });
    expect(statusOf('b1')).toBe('cancelled');
  });

  it('leaves the user a notification naming the lab and the Bangkok date', async () => {
    // Starts 18:30 UTC on 6 October, which is 7 October in Bangkok (Buddhist year 2569).
    seedBooking('b1', { start: '2026-10-06T18:30:00Z', end: '2026-10-06T20:30:00Z' });
    await patch('b1', { action: 'cancel' });

    expect(all('notifications')).toEqual([{
      id: expect.any(String),
      user_id: 'student-1',
      title: 'ยกเลิกการจองแล้ว — LAB8',
      message: 'สนามแม่เหล็กและกฎของไบโอต-ซาวัต วันที่ 7 ต.ค. 69 ถูกยกเลิกเรียบร้อย',
      type: 'warning',
      is_read: false,
      created_at: ts('2026-10-05T03:00:00Z'),
    }]);
  });

  it.each(['in_progress', 'completed', 'cancelled'])('answers 400 for a %s booking and changes nothing', async (status) => {
    myBooking(status);
    const res = await patch('b1', { action: 'cancel' });
    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({ ok: false, error: expect.any(String) });
    expect(statusOf('b1')).toBe(status);
    expect(all('notifications')).toEqual([]);
  });

  it('does not touch the session collection', async () => {
    myBooking();
    await patch('b1', { action: 'cancel' });
    expect(all('sessions')).toEqual([]);
  });
});

describe('PATCH /api/bookings/[id] — without an action', () => {
  it.each([
    ['an empty object', '{}'],
    ['no body at all', undefined],
    ['a body that is not JSON', 'cancel please'],
    ['an action of null', '{"action":null}'],
  ])('cancels the booking when sent %s', async (_label, body) => {
    myBooking();
    const res = await patchRaw('b1', body);
    expect(res.status).toBe(200);
    expect(statusOf('b1')).toBe('cancelled');
    expect(all('notifications')).toHaveLength(1);
  });

  it('applies the cancel rules to it: a round in progress is not cancelled', async () => {
    myBooking('in_progress');
    const res = await patchRaw('b1', '{}');
    expect(res.status).toBe(400);
    expect(statusOf('b1')).toBe('in_progress');
  });
});
