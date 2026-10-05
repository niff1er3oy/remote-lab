/** @jest-environment node */
import { NextRequest } from 'next/server';
import { POST } from '@/app/api/bookings/route';
import { all, breakDb, LAB8, resetDb, seed, seedBooking, ts } from '../helpers/server/firestore';
import { signInAs, signOut } from '../helpers/server/session';
import { freezeTime, restoreTime } from '../helpers/server/time';

jest.mock('@/lib/firebase-admin', () => ({
  adminDb: jest.requireActual<typeof import('../helpers/server/firestore')>('../helpers/server/firestore').db,
}));
jest.mock('@/lib/session', () => ({ getSessionUser: jest.fn() }));

const NOW = '2026-10-05T03:00:00Z';
// The round asked for in most tests: tomorrow 10:00-12:00 UTC.
const ROUND = { room_id: 'LAB8', start_time: '2026-10-06 10:00:00', end_time: '2026-10-06 12:00:00' };

const book = (body: unknown) =>
  POST(new NextRequest('http://localhost/api/bookings', { method: 'POST', body: JSON.stringify(body) }));
const existing = (start: string, end: string, more: { status?: string; user?: string; lab?: string } = {}) =>
  seedBooking('existing', { user: 'someone-else', start, end, ...more });
const newBookings = () => all('bookings').filter((b) => b.id !== 'existing');

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

describe('POST /api/bookings — what is accepted', () => {
  it('refuses a caller who is not signed in', async () => {
    signOut();
    const res = await book(ROUND);
    expect(res.status).toBe(401);
    expect(await res.json()).toEqual({ ok: false, error: expect.any(String) });
    expect(all('bookings')).toEqual([]);
  });

  it.each(['room_id', 'start_time', 'end_time'])('answers 400 when %s is missing', async (field) => {
    const res = await book({ ...ROUND, [field]: undefined });
    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({ ok: false, error: expect.any(String) });
    expect(all('bookings')).toEqual([]);
  });

  it('answers 400 for a round that has already ended', async () => {
    const res = await book({ ...ROUND, start_time: '2026-10-04 10:00:00', end_time: '2026-10-04 12:00:00' });
    expect(res.status).toBe(400);
    expect(all('bookings')).toEqual([]);
  });

  it('answers 400 for a round that ends at this very moment', async () => {
    const res = await book({ ...ROUND, start_time: '2026-10-05 01:00:00', end_time: '2026-10-05 03:00:00' });
    expect(res.status).toBe(400);
    expect(all('bookings')).toEqual([]);
  });

  it('accepts a round that has started but not ended', async () => {
    const res = await book({ ...ROUND, start_time: '2026-10-05 02:00:00', end_time: '2026-10-05 04:00:00' });
    expect(res.status).toBe(200);
    expect(all('bookings')).toHaveLength(1);
  });

  it.each([
    ['at the moment it starts', '2026-10-06 10:00:00'],
    ['before it starts', '2026-10-06 08:00:00'],
  ])('answers 400 for a round that ends %s', async (_label, end_time) => {
    const res = await book({ ...ROUND, end_time });
    expect(res.status).toBe(400);
    expect(all('bookings')).toEqual([]);
  });

  // DESIGN.md: the times are "validated explicitly in the route before the
  // transaction runs". That has to cover a value that is no time at all, which
  // would otherwise only fail when it is turned into a Timestamp.
  it.each([
    ['a start that is not a date', { start_time: 'tomorrow morning' }],
    ['an end that is not a date', { end_time: '2026-13-45 99:00:00' }],
    ['a start that is a number', { start_time: 1791280800000 }],
    ['a lab that is not a name', { room_id: 8 }],
  ])('answers 400 for %s', async (_label, change) => {
    const res = await book({ ...ROUND, ...change });
    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({ ok: false, error: expect.any(String) });
    expect(all('bookings')).toEqual([]);
  });

  it('answers 404 for a lab that does not exist', async () => {
    const res = await book({ ...ROUND, room_id: 'LAB99' });
    expect(res.status).toBe(404);
    expect(all('bookings')).toEqual([]);
  });

  it('answers 404 for a lab that is switched off', async () => {
    seed('labs', 'LAB7', { code: 'LAB7', name_th: 'ปิดปรับปรุง', is_active: false });
    const res = await book({ ...ROUND, room_id: 'LAB7' });
    expect(res.status).toBe(404);
    expect(all('bookings')).toEqual([]);
  });

  it('answers 500 when Firestore fails', async () => {
    breakDb();
    const res = await book(ROUND);
    expect(res.status).toBe(500);
    expect(await res.json()).toEqual({ ok: false, error: expect.any(String) });
  });
});

describe('POST /api/bookings — what is stored', () => {
  it('stores a confirmed booking for the signed-in user, reading the times as UTC', async () => {
    const res = await book(ROUND);
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true });

    expect(all('bookings')).toEqual([{
      id: expect.any(String),
      user_id: 'student-1',
      lab_id: 'LAB8',
      start_time: ts('2026-10-06T10:00:00Z'),
      end_time: ts('2026-10-06T12:00:00Z'),
      status: 'confirmed',
      created_at: ts(NOW),
    }]);
  });

  it('reads a time written with a T between date and time the same way', async () => {
    await book({ ...ROUND, start_time: '2026-10-06T10:00:00', end_time: '2026-10-06T12:00:00' });
    expect(all('bookings')[0]).toMatchObject({
      start_time: ts('2026-10-06T10:00:00Z'),
      end_time: ts('2026-10-06T12:00:00Z'),
    });
  });

  it('never books for a user named in the request', async () => {
    await book({ ...ROUND, user_id: 'someone-else', status: 'in_progress' });
    expect(all('bookings')[0]).toMatchObject({ user_id: 'student-1', status: 'confirmed' });
  });

  it('leaves the user a notification with the lab and the Bangkok date and time', async () => {
    await book(ROUND);
    // 10:00 UTC on 6 October 2026 is 17:00 in Bangkok, Buddhist year 2569.
    expect(all('notifications')).toEqual([{
      id: expect.any(String),
      user_id: 'student-1',
      title: 'จองสำเร็จ — LAB8',
      message: 'สนามแม่เหล็กและกฎของไบโอต-ซาวัต วันที่ 6 ต.ค. 69 เวลา 17:00',
      type: 'success',
      is_read: false,
      created_at: ts(NOW),
    }]);
  });

  it('dates the notification by the Bangkok day when it differs from the UTC day', async () => {
    await book({ ...ROUND, start_time: '2026-10-06 18:30:00', end_time: '2026-10-06 20:30:00' });
    expect(all('notifications')[0].message).toContain('วันที่ 7 ต.ค. 69 เวลา 01:30');
  });
});

describe('POST /api/bookings — rounds that overlap', () => {
  it.each([
    ['the same round', '2026-10-06T10:00:00Z', '2026-10-06T12:00:00Z'],
    ['a round that ends inside it', '2026-10-06T09:00:00Z', '2026-10-06T10:00:01Z'],
    ['a round that starts inside it', '2026-10-06T11:59:59Z', '2026-10-06T14:00:00Z'],
    ['a longer round around it', '2026-10-06T08:00:00Z', '2026-10-06T14:00:00Z'],
    ['a shorter round inside it', '2026-10-06T10:30:00Z', '2026-10-06T11:00:00Z'],
  ])('answers 409 and stores nothing when %s is already booked', async (_label, start, end) => {
    existing(start, end);
    const res = await book(ROUND);
    expect(res.status).toBe(409);
    expect(await res.json()).toEqual({ ok: false, error: expect.any(String) });
    expect(newBookings()).toEqual([]);
    expect(all('notifications')).toEqual([]);
  });

  it('accepts a round that starts the moment the one before it ends', async () => {
    existing('2026-10-06T08:00:00Z', '2026-10-06T10:00:00Z');
    expect((await book(ROUND)).status).toBe(200);
    expect(newBookings()).toHaveLength(1);
  });

  it('accepts a round that ends the moment the one after it starts', async () => {
    existing('2026-10-06T12:00:00Z', '2026-10-06T14:00:00Z');
    expect((await book(ROUND)).status).toBe(200);
    expect(newBookings()).toHaveLength(1);
  });

  it.each(['pending', 'confirmed', 'in_progress'])('treats a %s booking as holding its slot', async (status) => {
    existing('2026-10-06T10:00:00Z', '2026-10-06T12:00:00Z', { status });
    expect((await book(ROUND)).status).toBe(409);
    expect(newBookings()).toEqual([]);
  });

  it.each(['cancelled', 'completed'])('treats the slot of a %s booking as free', async (status) => {
    existing('2026-10-06T10:00:00Z', '2026-10-06T12:00:00Z', { status });
    expect((await book(ROUND)).status).toBe(200);
    expect(newBookings()).toHaveLength(1);
  });

  it('refuses a round that overlaps the user\'s own booking too', async () => {
    existing('2026-10-06T10:00:00Z', '2026-10-06T12:00:00Z', { user: 'student-1' });
    expect((await book(ROUND)).status).toBe(409);
    expect(newBookings()).toEqual([]);
  });

  it('does not let a booking of another lab hold the slot', async () => {
    seed('labs', 'LAB9', { code: 'LAB9', name_th: 'การทดลองอื่น', is_active: true });
    existing('2026-10-06T10:00:00Z', '2026-10-06T12:00:00Z', { lab: 'LAB9' });
    expect((await book(ROUND)).status).toBe(200);
    expect(newBookings()).toHaveLength(1);
  });

  it('refuses the second of two identical requests', async () => {
    expect((await book(ROUND)).status).toBe(200);
    expect((await book(ROUND)).status).toBe(409);
    expect(all('bookings')).toHaveLength(1);
  });
});
