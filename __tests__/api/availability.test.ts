/** @jest-environment node */
import { GET } from '@/app/api/bookings/availability/route';
import { breakDb, LAB8, resetDb, seed, seedBooking } from '../helpers/server/firestore';
import { signInAs, signOut } from '../helpers/server/session';
import { freezeTime, restoreTime } from '../helpers/server/time';

jest.mock('@/lib/firebase-admin', () => ({
  adminDb: jest.requireActual<typeof import('../helpers/server/firestore')>('../helpers/server/firestore').db,
}));
jest.mock('@/lib/session', () => ({ getSessionUser: jest.fn() }));

type Grid = string[][];

// 10:00 on Monday 5 October 2026 in Bangkok (UTC+7). The grid has one row per
// two-hour slot of the Bangkok day (row 0 is 00:00, row 5 is 10:00, row 11 is
// 22:00) and one column per day, column 0 being today.
const NOW = '2026-10-05T03:00:00Z';

const ask = async () => {
  const res = await GET();
  return { status: res.status, body: await res.json() };
};
const grid = async (lab = 'LAB8'): Promise<Grid> => (await ask()).body.slots_by_room[lab];
// The cells that are not free, as "row-column:status".
const marked = (g: Grid) =>
  g.flatMap((row, ti) => row.flatMap((status, day) => (status === 'free' ? [] : [`${ti}-${day}:${status}`])));
const theirs = (id: string, start: string, end: string, status = 'confirmed') =>
  seedBooking(id, { user: 'someone-else', status, start, end });

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

describe('GET /api/bookings/availability — the grid', () => {
  it('returns every active lab with a grid of 12 slots by 7 days, all free when nothing is booked', async () => {
    const { status, body } = await ask();
    expect(status).toBe(200);
    expect(body.ok).toBe(true);
    expect(body.rooms).toEqual([{ room_id: 'LAB8', ...LAB8 }]);
    expect(body.slots_by_room).toEqual({ LAB8: Array.from({ length: 12 }, () => Array(7).fill('free')) });
    expect(body.mine_booking_ids).toEqual({});
  });

  it('labels the seven days starting today, as day/month/two-digit year', async () => {
    expect((await ask()).body.dates).toEqual(['5/10/26', '6/10/26', '7/10/26', '8/10/26', '9/10/26', '10/10/26', '11/10/26']);
  });

  it('takes "today" from the Bangkok calendar, not the UTC one', async () => {
    // 18:30 UTC on 5 October is already 01:30 on 6 October in Bangkok.
    freezeTime('2026-10-05T18:30:00Z');
    theirs('b1', '2026-10-05T17:00:00Z', '2026-10-05T19:00:00Z');

    const { body } = await ask();
    expect(body.dates[0]).toBe('6/10/26');
    expect(marked(body.slots_by_room.LAB8)).toEqual(['0-0:taken']);
  });

  it('carries the dates over the end of the year', async () => {
    freezeTime('2026-12-29T03:00:00Z');
    expect((await ask()).body.dates).toEqual(['29/12/26', '30/12/26', '31/12/26', '1/1/27', '2/1/27', '3/1/27', '4/1/27']);
  });

  it('lists active labs in order of their code and leaves inactive ones out', async () => {
    seed('labs', 'LAB9', { code: 'LAB9', name_th: 'การทดลองที่ 9', is_active: true });
    seed('labs', 'LAB2', { code: 'LAB2', name_th: 'การทดลองที่ 2', is_active: true });
    seed('labs', 'LAB5', { code: 'LAB5', name_th: 'ปิดปรับปรุง', is_active: false });

    const { body } = await ask();
    expect(body.rooms.map((r: { room_id: string }) => r.room_id)).toEqual(['LAB2', 'LAB8', 'LAB9']);
    expect(Object.keys(body.slots_by_room).sort()).toEqual(['LAB2', 'LAB8', 'LAB9']);
  });
});

describe('GET /api/bookings/availability — booked slots', () => {
  it('marks exactly the slot of someone else\'s round as taken', async () => {
    // 10:00-12:00 today in Bangkok.
    theirs('b1', '2026-10-05T03:00:00Z', '2026-10-05T05:00:00Z');
    expect(marked(await grid())).toEqual(['5-0:taken']);
  });

  it('marks the user\'s own round as mine and says which booking it is', async () => {
    seedBooking('b1', { start: '2026-10-05T03:00:00Z', end: '2026-10-05T05:00:00Z' });
    const { body } = await ask();
    expect(marked(body.slots_by_room.LAB8)).toEqual(['5-0:mine']);
    expect(body.mine_booking_ids).toEqual({ LAB8: { '5-0': 'b1' } });
    expect(body.logged_in).toBe(true);
  });

  it('puts a round on the right day and row', async () => {
    // 00:00-02:00 on 7 October in Bangkok is 17:00-19:00 UTC the day before.
    theirs('first-slot', '2026-10-06T17:00:00Z', '2026-10-06T19:00:00Z');
    // 22:00-24:00 on 11 October in Bangkok, the last cell of the grid.
    theirs('last-slot', '2026-10-11T15:00:00Z', '2026-10-11T17:00:00Z');
    expect(marked(await grid())).toEqual(['0-2:taken', '11-6:taken']);
  });

  it('marks every slot a longer round covers', async () => {
    // 10:00-14:00 today in Bangkok.
    theirs('b1', '2026-10-05T03:00:00Z', '2026-10-05T07:00:00Z');
    expect(marked(await grid())).toEqual(['5-0:taken', '6-0:taken']);
  });

  it('marks both slots a round straddles', async () => {
    // 11:00-13:00 today in Bangkok: half of the 10:00 slot, half of the 12:00 one.
    theirs('b1', '2026-10-05T04:00:00Z', '2026-10-05T06:00:00Z');
    expect(marked(await grid())).toEqual(['5-0:taken', '6-0:taken']);
  });

  it.each(['pending', 'confirmed', 'in_progress'])('shows a %s round as taken', async (status) => {
    theirs('b1', '2026-10-05T03:00:00Z', '2026-10-05T05:00:00Z', status);
    expect(marked(await grid())).toEqual(['5-0:taken']);
  });

  it.each(['cancelled', 'completed'])('shows the slot of a %s round as free', async (status) => {
    theirs('b1', '2026-10-05T03:00:00Z', '2026-10-05T05:00:00Z', status);
    expect(marked(await grid())).toEqual([]);
  });

  it('shows a round from yesterday only where it runs into today', async () => {
    // Yesterday 20:00-22:00 in Bangkok, then 22:00-24:00 ending exactly at
    // midnight, then one from 23:00 to 01:00 that crosses into today.
    theirs('yesterday', '2026-10-04T13:00:00Z', '2026-10-04T15:00:00Z');
    theirs('to-midnight', '2026-10-04T15:00:00Z', '2026-10-04T17:00:00Z');
    expect(marked(await grid())).toEqual([]);

    theirs('past-midnight', '2026-10-04T16:00:00Z', '2026-10-04T18:00:00Z');
    expect(marked(await grid())).toEqual(['0-0:taken']);
  });

  it('leaves out a round that starts after the seventh day', async () => {
    // 00:00 on 12 October in Bangkok, the first moment past the grid.
    theirs('b1', '2026-10-11T17:00:00Z', '2026-10-11T19:00:00Z');
    expect(marked(await grid())).toEqual([]);
  });

  it('keeps each lab\'s bookings in that lab\'s own grid', async () => {
    seed('labs', 'LAB9', { code: 'LAB9', name_th: 'การทดลองที่ 9', is_active: true });
    seedBooking('b1', { lab: 'LAB9', start: '2026-10-05T03:00:00Z', end: '2026-10-05T05:00:00Z' });

    const { body } = await ask();
    expect(marked(body.slots_by_room.LAB8)).toEqual([]);
    expect(marked(body.slots_by_room.LAB9)).toEqual(['5-0:mine']);
    expect(body.mine_booking_ids).toEqual({ LAB9: { '5-0': 'b1' } });
  });
});

describe('GET /api/bookings/availability — callers', () => {
  it('answers a caller who is not signed in, showing every booked slot as taken', async () => {
    signOut();
    seedBooking('b1', { start: '2026-10-05T03:00:00Z', end: '2026-10-05T05:00:00Z' });

    const { status, body } = await ask();
    expect(status).toBe(200);
    expect(body.logged_in).toBe(false);
    expect(marked(body.slots_by_room.LAB8)).toEqual(['5-0:taken']);
    expect(body.mine_booking_ids).toEqual({});
  });

  it('never says who booked a slot or which booking holds it', async () => {
    seedBooking('their-booking-id', { user: 'someone-else', start: '2026-10-05T03:00:00Z', end: '2026-10-05T05:00:00Z' });
    const text = await (await GET()).text();
    expect(text).not.toContain('someone-else');
    expect(text).not.toContain('their-booking-id');
  });

  it('answers 500 when Firestore fails', async () => {
    breakDb();
    const { status, body } = await ask();
    expect(status).toBe(500);
    expect(body.ok).toBe(false);
  });
});
