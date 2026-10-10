/** @jest-environment node */
import { GET } from '@/app/api/bookings/active-session/route';
import { breakDb, LAB8, resetDb, seed, seedBooking } from '../helpers/server/firestore';
import { signInAs, signOut } from '../helpers/server/session';
import { freezeTime, restoreTime, HOUR, MINUTE } from '../helpers/server/time';

jest.mock('@/lib/firebase-admin', () => ({
  adminDb: jest.requireActual<typeof import('../helpers/server/firestore')>('../helpers/server/firestore').db,
}));
jest.mock('@/lib/session', () => ({ getSessionUser: jest.fn() }));

const NOW = Date.parse('2026-10-05T03:00:00Z');
const LAB_NAME = 'สนามแม่เหล็กและกฎของไบโอต-ซาวัต';

const ask = async () => {
  const res = await GET();
  return { status: res.status, body: await res.json() };
};

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

describe('GET /api/bookings/active-session — a round running now', () => {
  it('refuses a caller who is not signed in', async () => {
    signOut();
    seedBooking('b1', { start: NOW - HOUR, end: NOW + HOUR });
    expect(await ask()).toEqual({ status: 401, body: { ok: false } });
  });

  it('describes the running round', async () => {
    seedBooking('b1', { start: '2026-10-05T02:00:00Z', end: '2026-10-05T04:00:00Z' });
    expect(await ask()).toEqual({
      status: 200,
      body: {
        ok: true,
        active: true,
        disabled_instruments: [],
        currents: { 'coil_1.py': 5, 'coil_2.py': 5, 'coil_3.py': 5, 'sole.py': 0.3 },
        booking: {
          booking_id: 'b1',
          experiment_code: 'LAB8',
          experiment_name: LAB_NAME,
          start_time: '2026-10-05T02:00:00.000Z',
          end_time: '2026-10-05T04:00:00.000Z',
        },
      },
    });
  });

  it.each(['confirmed', 'pending', 'in_progress'])('counts a %s round as running', async (status) => {
    seedBooking('b1', { status, start: NOW - HOUR, end: NOW + HOUR });
    expect((await ask()).body.active).toBe(true);
  });

  it.each(['completed', 'cancelled'])('does not count a %s round, even inside its slot', async (status) => {
    seedBooking('b1', { status, start: NOW - HOUR, end: NOW + HOUR });
    expect((await ask()).body).toEqual({ ok: true, active: false, next_booking: null });
  });

  it('counts the round from the millisecond it starts', async () => {
    seedBooking('b1', { start: NOW, end: NOW + 2 * HOUR });
    expect((await ask()).body.active).toBe(true);
  });

  it('counts the round through the millisecond it ends, and not after', async () => {
    seedBooking('b1', { start: NOW - 2 * HOUR, end: NOW });
    expect((await ask()).body.active).toBe(true);

    resetDb();
    seed('labs', 'LAB8', LAB8);
    seedBooking('b1', { start: NOW - 2 * HOUR - 1, end: NOW - 1 });
    expect((await ask()).body).toEqual({ ok: true, active: false, next_booking: null });
  });

  it('ignores a round someone else has running', async () => {
    seedBooking('theirs', { user: 'someone-else', start: NOW - HOUR, end: NOW + HOUR });
    expect((await ask()).body).toEqual({ ok: true, active: false, next_booking: null });
  });

  it('picks the running round when an older one has ended and a later one is booked', async () => {
    seedBooking('a-ended', { start: NOW - 4 * HOUR, end: NOW - 2 * HOUR });
    seedBooking('b-running', { start: NOW - HOUR, end: NOW + HOUR });
    seedBooking('c-later', { start: NOW + 2 * HOUR, end: NOW + 4 * HOUR });

    const { body } = await ask();
    expect(body.booking.booking_id).toBe('b-running');
    expect(body).not.toHaveProperty('next_booking');
  });
});

describe('GET /api/bookings/active-session — nothing running', () => {
  it('says so when the user has no bookings', async () => {
    expect(await ask()).toEqual({ status: 200, body: { ok: true, active: false, next_booking: null } });
  });

  it('describes the next round to come', async () => {
    seedBooking('next', { start: '2026-10-05T06:00:00Z', end: '2026-10-05T08:00:00Z' });
    expect((await ask()).body).toEqual({
      ok: true,
      active: false,
      next_booking: {
        start_time: '2026-10-05T06:00:00.000Z',
        experiment_code: 'LAB8',
        experiment_name: LAB_NAME,
      },
    });
  });

  it('picks the soonest of several rounds to come', async () => {
    seedBooking('a-later', { start: NOW + 26 * HOUR, end: NOW + 28 * HOUR });
    seedBooking('b-soonest', { status: 'pending', start: NOW + MINUTE, end: NOW + 2 * HOUR });
    seedBooking('c-middle', { start: NOW + 4 * HOUR, end: NOW + 6 * HOUR });
    expect((await ask()).body.next_booking.start_time).toBe(new Date(NOW + MINUTE).toISOString());
  });

  it.each(['cancelled', 'completed'])('skips a %s round when looking for the next one', async (status) => {
    seedBooking('a-off', { status, start: NOW + HOUR, end: NOW + 3 * HOUR });
    seedBooking('b-on', { start: NOW + 4 * HOUR, end: NOW + 6 * HOUR });
    expect((await ask()).body.next_booking.start_time).toBe(new Date(NOW + 4 * HOUR).toISOString());
  });

  it('skips rounds that belong to someone else', async () => {
    seedBooking('theirs', { user: 'someone-else', start: NOW + HOUR, end: NOW + 3 * HOUR });
    expect((await ask()).body.next_booking).toBeNull();
  });

  it('does not offer a round that has already ended as the next one', async () => {
    seedBooking('ended', { start: NOW - 3 * HOUR, end: NOW - HOUR });
    expect((await ask()).body.next_booking).toBeNull();
  });
});

describe('GET /api/bookings/active-session — when Firestore fails', () => {
  it('answers 500', async () => {
    breakDb();
    expect(await ask()).toEqual({ status: 500, body: { ok: false } });
  });
});
