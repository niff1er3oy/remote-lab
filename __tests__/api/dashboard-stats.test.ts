/** @jest-environment node */
import { GET } from '@/app/api/dashboard/stats/route';
import { breakDb, LAB8, resetDb, seed, seedBooking } from '../helpers/server/firestore';
import { signInAs, signOut } from '../helpers/server/session';
import { freezeTime, restoreTime, HOUR } from '../helpers/server/time';

jest.mock('@/lib/firebase-admin', () => ({
  adminDb: jest.requireActual<typeof import('../helpers/server/firestore')>('../helpers/server/firestore').db,
}));
jest.mock('@/lib/session', () => ({ getSessionUser: jest.fn() }));

const NOW = Date.parse('2026-10-05T03:00:00Z');

const ask = async () => {
  const res = await GET();
  return { status: res.status, body: await res.json() };
};
const upcomingIds = async () =>
  (await ask()).body.upcoming_bookings.map((b: { booking_id: string }) => b.booking_id);
// A two-hour round starting `hours` from now.
const round = (id: string, hours: number, more: { status?: string; user?: string } = {}) =>
  seedBooking(id, { start: NOW + hours * HOUR, end: NOW + (hours + 2) * HOUR, ...more });

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

describe('GET /api/dashboard/stats', () => {
  it('refuses a caller who is not signed in', async () => {
    signOut();
    expect(await ask()).toEqual({ status: 401, body: { ok: false } });
  });

  it('returns zeros and an empty list for a new user', async () => {
    expect(await ask()).toEqual({
      status: 200,
      body: { ok: true, upcoming_bookings: [], session_count: 0, available_equipment: 1 },
    });
  });

  it('describes an upcoming round with the lab\'s code and name', async () => {
    seedBooking('b1', { start: '2026-10-06T03:00:00Z', end: '2026-10-06T05:00:00Z' });
    expect((await ask()).body.upcoming_bookings).toEqual([{
      booking_id: 'b1',
      equipment_name: 'LAB8 — สนามแม่เหล็กและกฎของไบโอต-ซาวัต',
      start_time: '2026-10-06T03:00:00.000Z',
      end_time: '2026-10-06T05:00:00.000Z',
      status: 'confirmed',
    }]);
  });

  it('lists the five soonest rounds, soonest first', async () => {
    for (const hours of [30, 6, 54, 2, 12, 78, 24]) round(`in-${hours}h`, hours);
    expect(await upcomingIds()).toEqual(['in-2h', 'in-6h', 'in-12h', 'in-24h', 'in-30h']);
  });

  it('leaves out cancelled rounds', async () => {
    round('cancelled', 2, { status: 'cancelled' });
    round('pending', 4, { status: 'pending' });
    expect(await upcomingIds()).toEqual(['pending']);
  });

  it('leaves out rounds that have already started, but keeps one starting this very moment', async () => {
    seedBooking('started', { start: NOW - 1, end: NOW + 2 * HOUR });
    seedBooking('starting', { start: NOW, end: NOW + 2 * HOUR });
    expect(await upcomingIds()).toEqual(['starting']);
  });

  it('leaves out other users\' rounds', async () => {
    round('theirs', 2, { user: 'someone-else' });
    expect(await upcomingIds()).toEqual([]);
  });

  it('counts the user\'s own lab sessions', async () => {
    seed('sessions', 's1', { user_id: 'student-1', status: 'completed' });
    seed('sessions', 's2', { user_id: 'student-1', status: 'active' });
    seed('sessions', 's3', { user_id: 'someone-else', status: 'completed' });
    expect((await ask()).body.session_count).toBe(2);
  });

  it('counts the labs that are switched on', async () => {
    seed('labs', 'LAB9', { code: 'LAB9', name_th: 'การทดลองที่ 9', is_active: true });
    seed('labs', 'LAB5', { code: 'LAB5', name_th: 'ปิดปรับปรุง', is_active: false });
    expect((await ask()).body.available_equipment).toBe(2);
  });

  it('answers 500 when Firestore fails', async () => {
    breakDb();
    expect(await ask()).toEqual({ status: 500, body: { ok: false } });
  });
});
