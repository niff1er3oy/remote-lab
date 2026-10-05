/** @jest-environment node */
import { NextRequest } from 'next/server';
import { GET } from '@/app/api/dashboard/history/route';
import { breakDb, LAB8, resetDb, seed, seedBooking, ts } from '../helpers/server/firestore';
import { signInAs, signOut } from '../helpers/server/session';
import { freezeTime, restoreTime, HOUR, MINUTE } from '../helpers/server/time';

jest.mock('@/lib/firebase-admin', () => ({
  adminDb: jest.requireActual<typeof import('../helpers/server/firestore')>('../helpers/server/firestore').db,
}));
jest.mock('@/lib/session', () => ({ getSessionUser: jest.fn() }));

type Item = {
  booking_id: string;
  start_time: string;
  status: string;
  duration_seconds: number | null;
  session_id: string | null;
};
type Page = { ok: boolean; items: Item[]; has_more: boolean; cursor: string | null };

const NOW = Date.parse('2026-10-05T03:00:00Z');
const DAY = 24 * HOUR;

const ask = async (cursor?: string | null) => {
  const url = new URL('http://localhost/api/dashboard/history');
  if (cursor) url.searchParams.set('cursor', cursor);
  const res = await GET(new NextRequest(url));
  return { status: res.status, body: (await res.json()) as Page };
};
const ids = (page: Page) => page.items.map((i) => i.booking_id);

// A completed two-hour round that started `daysAgo` days before now.
const past = (id: string, daysAgo: number, more: { status?: string; user?: string } = {}) =>
  seedBooking(id, { status: 'completed', start: NOW - daysAgo * DAY, end: NOW - daysAgo * DAY + 2 * HOUR, ...more });

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

describe('GET /api/dashboard/history — what counts as history', () => {
  it('refuses a caller who is not signed in', async () => {
    signOut();
    past('b1', 1);
    expect(await ask()).toEqual({ status: 401, body: { ok: false } });
  });

  it('returns an empty first page for a user without bookings', async () => {
    expect(await ask()).toEqual({ status: 200, body: { ok: true, items: [], has_more: false, cursor: null } });
  });

  it('describes a past round', async () => {
    seedBooking('b1', { status: 'completed', start: '2026-10-04T03:00:00Z', end: '2026-10-04T05:00:00Z' });
    expect((await ask()).body.items).toEqual([{
      booking_id: 'b1',
      lab_code: 'LAB8',
      lab_name: 'สนามแม่เหล็กและกฎของไบโอต-ซาวัต',
      start_time: '2026-10-04T03:00:00.000Z',
      end_time: '2026-10-04T05:00:00.000Z',
      status: 'completed',
      duration_seconds: null,
      session_id: null,
    }]);
  });

  it('lists completed and cancelled rounds, and any round whose slot is over', async () => {
    seedBooking('completed-early', { status: 'completed', start: NOW - HOUR, end: NOW + HOUR });
    seedBooking('cancelled-future', { status: 'cancelled', start: NOW + DAY, end: NOW + DAY + 2 * HOUR });
    seedBooking('never-started', { status: 'confirmed', start: NOW - 5 * HOUR, end: NOW - 3 * HOUR });
    seedBooking('left-open', { status: 'in_progress', start: NOW - 9 * HOUR, end: NOW - 7 * HOUR });
    expect(ids((await ask()).body).sort()).toEqual(['cancelled-future', 'completed-early', 'left-open', 'never-started']);
  });

  it.each(['confirmed', 'pending', 'in_progress'])('leaves out a %s round that is running or still to come', async (status) => {
    seedBooking('running', { status, start: NOW - HOUR, end: NOW + HOUR });
    seedBooking('upcoming', { status, start: NOW + DAY, end: NOW + DAY + 2 * HOUR });
    seedBooking('ends-now', { status, start: NOW - 2 * HOUR, end: NOW });
    expect((await ask()).body.items).toEqual([]);
  });

  it('lists the newest round first', async () => {
    past('middle', 5);
    past('newest', 1);
    past('oldest', 9);
    expect(ids((await ask()).body)).toEqual(['newest', 'middle', 'oldest']);
  });

  it('lists only the signed-in user\'s rounds', async () => {
    past('mine', 1);
    past('theirs', 2, { user: 'someone-else' });
    expect(ids((await ask()).body)).toEqual(['mine']);
  });

  it('answers 500 when Firestore fails', async () => {
    breakDb();
    expect(await ask()).toEqual({ status: 500, body: { ok: false } });
  });
});

describe('GET /api/dashboard/history — time spent in the lab', () => {
  it('gives the length recorded on the session', async () => {
    past('b1', 1);
    seed('sessions', 'b1', { user_id: 'student-1', start_time: ts('2026-10-04T03:05:00Z'), duration_seconds: 1530, status: 'completed' });
    expect((await ask()).body.items[0]).toMatchObject({ duration_seconds: 1530, session_id: 'b1' });
  });

  it('keeps a recorded length of zero', async () => {
    past('b1', 1);
    seed('sessions', 'b1', { user_id: 'student-1', start_time: ts('2026-10-04T03:05:00Z'), duration_seconds: 0, status: 'completed' });
    expect((await ask()).body.items[0].duration_seconds).toBe(0);
  });

  it('counts a session that was never closed up to the end of its slot', async () => {
    // Slot 03:00-05:00 yesterday, entered at 03:20: 1 h 40 min = 6000 s.
    seedBooking('b1', { status: 'in_progress', start: '2026-10-04T03:00:00Z', end: '2026-10-04T05:00:00Z' });
    seed('sessions', 'b1', { user_id: 'student-1', start_time: ts('2026-10-04T03:20:00Z'), status: 'active' });
    expect((await ask()).body.items[0]).toMatchObject({ duration_seconds: 6000, session_id: 'b1' });
  });

  it('counts an unclosed session up to now while its slot is still running', async () => {
    // Entered 40 minutes ago: 2400 s so far.
    seedBooking('b1', { status: 'completed', start: NOW - HOUR, end: NOW + HOUR });
    seed('sessions', 'b1', { user_id: 'student-1', start_time: ts(new Date(NOW - 40 * MINUTE).toISOString()), status: 'active' });
    expect((await ask()).body.items[0].duration_seconds).toBe(2400);
  });

  it('gives no length and no session for a round nobody entered', async () => {
    past('b1', 1, { status: 'cancelled' });
    expect((await ask()).body.items[0]).toMatchObject({ duration_seconds: null, session_id: null });
  });
});

describe('GET /api/dashboard/history — pages', () => {
  it('returns ten rounds a page and says when there are no more', async () => {
    for (let i = 1; i <= 10; i++) past(`b${i}`, i);
    const { body } = await ask();
    expect(body.items).toHaveLength(10);
    expect(body.has_more).toBe(false);
  });

  it('walks through 25 rounds in three pages without repeating or skipping one', async () => {
    for (let i = 1; i <= 25; i++) past(`b${i}`, i);
    const newestFirst = Array.from({ length: 25 }, (_, i) => `b${i + 1}`);

    const first = (await ask()).body;
    expect(ids(first)).toEqual(newestFirst.slice(0, 10));
    expect(first.has_more).toBe(true);
    // The cursor is the start time of the last round on the page.
    expect(first.cursor).toBe(first.items[9].start_time);
    expect(first.cursor).toBe(new Date(NOW - 10 * DAY).toISOString());

    const second = (await ask(first.cursor)).body;
    expect(ids(second)).toEqual(newestFirst.slice(10, 20));
    expect(second.has_more).toBe(true);

    const third = (await ask(second.cursor)).body;
    expect(ids(third)).toEqual(newestFirst.slice(20));
    expect(third.has_more).toBe(false);
  });

  it('returns an empty page for a cursor older than every round', async () => {
    past('b1', 1);
    const { body } = await ask(new Date(NOW - 30 * DAY).toISOString());
    expect(body).toEqual({ ok: true, items: [], has_more: false, cursor: null });
  });

  it('finds past rounds behind more than thirty rounds still to come', async () => {
    // Newest first, the 35 future rounds fill the first raw batch of 30.
    for (let i = 1; i <= 35; i++) seedBooking(`future${i}`, { start: NOW + i * DAY, end: NOW + i * DAY + 2 * HOUR });
    past('b1', 1);
    past('b2', 2);
    expect(ids((await ask()).body)).toEqual(['b1', 'b2']);
  });

  // Every page until has_more is false, as the dashboard asks for them.
  const walk = async () => {
    const seen: string[] = [];
    let cursor: string | null = null;
    for (let pages = 0; pages < 10; pages++) {
      const { body } = await ask(cursor);
      seen.push(...ids(body));
      if (!body.has_more) break;
      cursor = body.cursor;
    }
    return seen;
  };

  // The cursor is a start time, and two bookings can share one (a slot
  // cancelled and booked again). A page that ended between the two would lose
  // the second, so both stay on the same page even when that makes eleven.
  it('keeps rounds that start at the same moment on one page', async () => {
    for (let i = 1; i <= 9; i++) past(`b${i}`, i);
    past('rebooked', 10);
    past('cancelled-first', 10, { status: 'cancelled' });
    past('oldest', 11);

    const first = (await ask()).body;
    expect(ids(first)).toEqual(['b1', 'b2', 'b3', 'b4', 'b5', 'b6', 'b7', 'b8', 'b9', 'rebooked', 'cancelled-first']);
    expect(first.has_more).toBe(true);
    expect(ids((await ask(first.cursor)).body)).toEqual(['oldest']);
  });

  it('says there are no more when the rounds that share a start time are the last ones', async () => {
    for (let i = 1; i <= 9; i++) past(`b${i}`, i);
    past('rebooked', 10);
    past('cancelled-first', 10, { status: 'cancelled' });

    const first = (await ask()).body;
    expect(first.items).toHaveLength(11);
    expect(first.has_more).toBe(false);
  });

  it('returns every round exactly once when several of them share start times', async () => {
    const expected: string[] = [];
    for (let i = 1; i <= 14; i++) {
      past(`b${i}`, i);
      past(`b${i}-cancelled`, i, { status: 'cancelled' });
      expected.push(`b${i}`, `b${i}-cancelled`);
    }
    expect((await walk()).sort()).toEqual(expected.sort());
  });

  it('does not lose a round where one raw batch of thirty ends and the next begins', async () => {
    // Newest first: 29 rounds still to come, then two past rounds that share a
    // start time. The first batch ends between those two.
    for (let i = 1; i <= 29; i++) seedBooking(`future${i}`, { start: NOW + i * DAY, end: NOW + i * DAY + 2 * HOUR });
    past('rebooked', 1);
    past('cancelled-first', 1, { status: 'cancelled' });
    expect((await walk()).sort()).toEqual(['cancelled-first', 'rebooked']);
  });
});
