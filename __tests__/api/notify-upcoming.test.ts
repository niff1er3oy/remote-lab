/** @jest-environment node */
import { POST } from '@/app/api/bookings/notify-upcoming/route';
import { all, breakDb, LAB8, read, resetDb, seed, seedBooking, ts } from '../helpers/server/firestore';
import { signInAs, signOut } from '../helpers/server/session';
import { freezeTime, moveTimeTo, restoreTime, HOUR, MINUTE } from '../helpers/server/time';

jest.mock('@/lib/firebase-admin', () => ({
  adminDb: jest.requireActual<typeof import('../helpers/server/firestore')>('../helpers/server/firestore').db,
}));
jest.mock('@/lib/session', () => ({ getSessionUser: jest.fn() }));

// 10:00 in Bangkok.
const NOW = Date.parse('2026-10-05T03:00:00Z');
const LAB_NAME = 'สนามแม่เหล็กและกฎของไบโอต-ซาวัต';

const poll = async () => {
  const res = await POST();
  return { status: res.status, body: await res.json() };
};
const titles = () => all('notifications').map((n) => n.title);

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

describe('POST /api/bookings/notify-upcoming — a round the user can enter', () => {
  it('refuses a caller who is not signed in', async () => {
    signOut();
    seedBooking('b1', { start: NOW - MINUTE, end: NOW + HOUR });
    expect(await poll()).toEqual({ status: 401, body: { ok: false } });
    expect(all('notifications')).toEqual([]);
  });

  it('notifies the user once their round is running, with a link to the lab', async () => {
    // 09:30-11:30 in Bangkok.
    seedBooking('b1', { start: '2026-10-05T02:30:00Z', end: '2026-10-05T04:30:00Z' });

    expect(await poll()).toEqual({ status: 200, body: { ok: true, notified: 1 } });
    expect(all('notifications')).toEqual([{
      id: expect.any(String),
      user_id: 'student-1',
      title: 'เข้าห้องแลปได้แล้ว — LAB8',
      message: `${LAB_NAME}  ·  09:30 – 11:30  ·  กรุณาเข้าสู่ห้องปฏิบัติการ`,
      type: 'success',
      action_url: '/lab',
      is_read: false,
      created_at: ts('2026-10-05T03:00:00Z'),
    }]);
  });

  it('does not repeat that notification on later polls', async () => {
    seedBooking('b1', { start: NOW - MINUTE, end: NOW + HOUR });
    await poll();
    expect(read('bookings', 'b1')?.notified_can_enter_at).toEqual(ts('2026-10-05T03:00:00Z'));

    moveTimeTo(NOW + 30_000);
    expect((await poll()).body).toEqual({ ok: true, notified: 0 });
    expect(all('notifications')).toHaveLength(1);
  });

  it.each(['confirmed', 'pending'])('notifies for a %s round', async (status) => {
    seedBooking('b1', { status, start: NOW - MINUTE, end: NOW + HOUR });
    expect((await poll()).body.notified).toBe(1);
  });

  it.each(['in_progress', 'completed', 'cancelled'])('stays quiet for a %s round', async (status) => {
    seedBooking('b1', { status, start: NOW - MINUTE, end: NOW + HOUR });
    expect((await poll()).body.notified).toBe(0);
    expect(all('notifications')).toEqual([]);
  });

  it('notifies from the millisecond the round starts', async () => {
    seedBooking('b1', { start: NOW, end: NOW + 2 * HOUR });
    await poll();
    expect(titles()).toEqual(['เข้าห้องแลปได้แล้ว — LAB8']);
  });

  it('stays quiet about a round that has ended', async () => {
    seedBooking('b1', { start: NOW - 2 * HOUR - 1, end: NOW - 1 });
    expect((await poll()).body.notified).toBe(0);
    expect(all('notifications')).toEqual([]);
    expect(read('bookings', 'b1')).not.toHaveProperty('notified_can_enter_at');
  });

  it('stays quiet about someone else\'s round', async () => {
    seedBooking('theirs', { user: 'someone-else', start: NOW - MINUTE, end: NOW + HOUR });
    expect((await poll()).body.notified).toBe(0);
    expect(all('notifications')).toEqual([]);
  });
});

describe('POST /api/bookings/notify-upcoming — a round about to start', () => {
  it('notifies the user when their round starts within five minutes', async () => {
    // Starts 10:03 in Bangkok, three minutes from now.
    seedBooking('b1', { start: '2026-10-05T03:03:00Z', end: '2026-10-05T05:03:00Z' });

    expect(await poll()).toEqual({ status: 200, body: { ok: true, notified: 1 } });
    expect(all('notifications')).toEqual([{
      id: expect.any(String),
      user_id: 'student-1',
      title: 'ใกล้ถึงเวลาแล้ว — LAB8',
      message: `${LAB_NAME}  ·  เริ่มเวลา 10:03  (อีก 3 นาที)`,
      type: 'info',
      action_url: '/lab',
      is_read: false,
      created_at: ts('2026-10-05T03:00:00Z'),
    }]);
  });

  it('does not repeat that notification on later polls', async () => {
    seedBooking('b1', { start: NOW + 4 * MINUTE, end: NOW + 2 * HOUR });
    await poll();
    expect(read('bookings', 'b1')?.notified_starting_soon_at).toEqual(ts('2026-10-05T03:00:00Z'));

    moveTimeTo(NOW + 30_000);
    expect((await poll()).body.notified).toBe(0);
    expect(all('notifications')).toHaveLength(1);
  });

  it('notifies at exactly five minutes before the start and not a millisecond earlier', async () => {
    seedBooking('b1', { start: NOW + 5 * MINUTE + 1, end: NOW + 2 * HOUR });
    expect((await poll()).body.notified).toBe(0);

    moveTimeTo(NOW + 1);
    expect((await poll()).body.notified).toBe(1);
    expect(all('notifications')[0].message).toContain('(อีก 5 นาที)');
  });

  it('rounds the minutes left and never says zero', async () => {
    // 2 min 40 s rounds to 3; 20 s would round to 0 and is given as 1.
    seedBooking('a', { start: NOW + 2 * MINUTE + 40_000, end: NOW + 2 * HOUR });
    seedBooking('b', { start: NOW + 20_000, end: NOW + 2 * HOUR });
    await poll();
    const messages = all('notifications').map((n) => n.message as string);
    expect(messages.filter((m) => m.includes('(อีก 3 นาที)'))).toHaveLength(1);
    expect(messages.filter((m) => m.includes('(อีก 1 นาที)'))).toHaveLength(1);
  });

  it.each(['in_progress', 'completed', 'cancelled'])('stays quiet for a %s round', async (status) => {
    seedBooking('b1', { status, start: NOW + 2 * MINUTE, end: NOW + 2 * HOUR });
    expect((await poll()).body.notified).toBe(0);
    expect(all('notifications')).toEqual([]);
  });

  it('stays quiet about someone else\'s round', async () => {
    seedBooking('theirs', { user: 'someone-else', start: NOW + 2 * MINUTE, end: NOW + 2 * HOUR });
    expect((await poll()).body.notified).toBe(0);
    expect(all('notifications')).toEqual([]);
  });
});

describe('POST /api/bookings/notify-upcoming — over the life of a booking', () => {
  it('says "starting soon" once and "you can enter" once', async () => {
    seedBooking('b1', { start: NOW + 3 * MINUTE, end: NOW + 2 * HOUR });

    expect((await poll()).body.notified).toBe(1);
    moveTimeTo(NOW + 3 * MINUTE);
    expect((await poll()).body.notified).toBe(1);
    moveTimeTo(NOW + 4 * MINUTE);
    expect((await poll()).body.notified).toBe(0);

    expect(titles()).toEqual(['ใกล้ถึงเวลาแล้ว — LAB8', 'เข้าห้องแลปได้แล้ว — LAB8']);
  });

  it('counts both kinds in one poll', async () => {
    seedBooking('running', { start: NOW - HOUR, end: NOW + MINUTE });
    seedBooking('next', { start: NOW + MINUTE, end: NOW + 2 * HOUR });
    expect((await poll()).body).toEqual({ ok: true, notified: 2 });
    expect(all('notifications')).toHaveLength(2);
  });

  it('reports nothing to do for a user without bookings', async () => {
    expect(await poll()).toEqual({ status: 200, body: { ok: true, notified: 0 } });
  });

  it('answers 500 when Firestore fails', async () => {
    breakDb();
    expect(await poll()).toEqual({ status: 500, body: { ok: false } });
  });
});
