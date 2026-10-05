/** @jest-environment node */
import { rigAccess } from '@/lib/rig-access';
import { breakDb, resetDb, seedBooking } from './helpers/server/firestore';
import { freezeTime, restoreTime, HOUR, MINUTE } from './helpers/server/time';

jest.mock('@/lib/firebase-admin', () => ({
  adminDb: jest.requireActual<typeof import('./helpers/server/firestore')>('./helpers/server/firestore').db,
}));

const NOW = Date.parse('2026-10-05T03:00:00Z');
const GRACE = 10 * MINUTE;
const UID = 'student-1';

const LIVE = ['confirmed', 'pending', 'in_progress'];

beforeEach(() => {
  freezeTime(NOW);
  resetDb();
});

afterEach(restoreTime);

describe('rigAccess — a round that is running', () => {
  it.each(LIVE)('is active for a %s round in the middle of its slot', async (status) => {
    seedBooking('round', { status, start: NOW - HOUR, end: NOW + HOUR });
    expect(await rigAccess(UID, GRACE)).toBe('active');
  });

  it('is active from the very millisecond the round starts', async () => {
    seedBooking('round', { start: NOW, end: NOW + 2 * HOUR });
    expect(await rigAccess(UID, GRACE)).toBe('active');
  });

  it('is none one millisecond before the round starts', async () => {
    seedBooking('round', { start: NOW + 1, end: NOW + 2 * HOUR });
    expect(await rigAccess(UID, GRACE)).toBe('none');
  });

  it('is still active in the millisecond the round ends', async () => {
    seedBooking('round', { start: NOW - 2 * HOUR, end: NOW });
    expect(await rigAccess(UID, GRACE)).toBe('active');
  });

  it('is active without any grace period', async () => {
    seedBooking('round', { start: NOW - HOUR, end: NOW + HOUR });
    expect(await rigAccess(UID, 0)).toBe('active');
  });
});

describe('rigAccess — a round that has ended', () => {
  it.each(LIVE)('is just-ended one millisecond after a %s round ends', async (status) => {
    seedBooking('round', { status, start: NOW - 2 * HOUR - 1, end: NOW - 1 });
    expect(await rigAccess(UID, GRACE)).toBe('just-ended');
  });

  it('is just-ended up to exactly the grace period after the end', async () => {
    seedBooking('round', { start: NOW - GRACE - 2 * HOUR, end: NOW - GRACE });
    expect(await rigAccess(UID, GRACE)).toBe('just-ended');
  });

  it('is none one millisecond past the grace period', async () => {
    seedBooking('round', { start: NOW - GRACE - 1 - 2 * HOUR, end: NOW - GRACE - 1 });
    expect(await rigAccess(UID, GRACE)).toBe('none');
  });

  it('follows the grace period it is given', async () => {
    seedBooking('round', { start: NOW - 3 * HOUR, end: NOW - HOUR });
    expect(await rigAccess(UID, HOUR - 1)).toBe('none');
    expect(await rigAccess(UID, HOUR)).toBe('just-ended');
  });

  it('is none straight after the end when there is no grace period', async () => {
    seedBooking('round', { start: NOW - 2 * HOUR - 1, end: NOW - 1 });
    expect(await rigAccess(UID, 0)).toBe('none');
  });
});

describe('rigAccess — a round marked completed', () => {
  it('is just-ended, not active, while its slot is still running', async () => {
    seedBooking('round', { status: 'completed', start: NOW - HOUR, end: NOW + HOUR });
    expect(await rigAccess(UID, GRACE)).toBe('just-ended');
  });

  it('is just-ended while its slot is still running even without a grace period', async () => {
    seedBooking('round', { status: 'completed', start: NOW - HOUR, end: NOW + HOUR });
    expect(await rigAccess(UID, 0)).toBe('just-ended');
  });

  it('is just-ended within the grace period after its slot', async () => {
    seedBooking('round', { status: 'completed', start: NOW - GRACE - 2 * HOUR, end: NOW - GRACE });
    expect(await rigAccess(UID, GRACE)).toBe('just-ended');
  });

  it('is none once the grace period after its slot has passed', async () => {
    seedBooking('round', { status: 'completed', start: NOW - GRACE - 1 - 2 * HOUR, end: NOW - GRACE - 1 });
    expect(await rigAccess(UID, GRACE)).toBe('none');
  });
});

describe('rigAccess — rounds that do not count', () => {
  it('is none for a user without bookings', async () => {
    expect(await rigAccess(UID, GRACE)).toBe('none');
  });

  it('is none for a cancelled round, running or just ended', async () => {
    seedBooking('running', { status: 'cancelled', start: NOW - HOUR, end: NOW + HOUR });
    seedBooking('ended', { status: 'cancelled', start: NOW - 3 * HOUR, end: NOW - MINUTE });
    expect(await rigAccess(UID, GRACE)).toBe('none');
  });

  it('is none for a status it does not know', async () => {
    seedBooking('round', { status: 'archived', start: NOW - HOUR, end: NOW + HOUR });
    expect(await rigAccess(UID, GRACE)).toBe('none');
  });

  it('ignores other users\' rounds', async () => {
    seedBooking('running', { user: 'someone-else', start: NOW - HOUR, end: NOW + HOUR });
    seedBooking('ended', { user: 'someone-else', start: NOW - 3 * HOUR, end: NOW - MINUTE });
    expect(await rigAccess(UID, GRACE)).toBe('none');
    expect(await rigAccess('someone-else', GRACE)).toBe('active');
  });

  // The lookup only goes back six hours from now, by start time.
  it('counts a round that started exactly six hours ago', async () => {
    seedBooking('round', { start: NOW - 6 * HOUR, end: NOW + HOUR });
    expect(await rigAccess(UID, GRACE)).toBe('active');
  });

  it('ignores a round that started more than six hours ago', async () => {
    seedBooking('round', { start: NOW - 6 * HOUR - 1, end: NOW - MINUTE });
    expect(await rigAccess(UID, GRACE)).toBe('none');
  });
});

describe('rigAccess — several rounds at once', () => {
  it('is active when one round just ended and the next is already running, whichever comes first', async () => {
    seedBooking('a-ended', { status: 'completed', start: NOW - 2 * HOUR, end: NOW - 1 });
    seedBooking('b-running', { start: NOW, end: NOW + 2 * HOUR });
    expect(await rigAccess(UID, GRACE)).toBe('active');

    resetDb();
    seedBooking('a-running', { start: NOW, end: NOW + 2 * HOUR });
    seedBooking('b-ended', { status: 'completed', start: NOW - 2 * HOUR, end: NOW - 1 });
    expect(await rigAccess(UID, GRACE)).toBe('active');
  });

  it('is just-ended when a round ended recently and the next has not started', async () => {
    seedBooking('long-gone', { start: NOW - 5 * HOUR, end: NOW - 3 * HOUR });
    seedBooking('ended', { start: NOW - 2 * HOUR - MINUTE, end: NOW - MINUTE });
    seedBooking('next', { start: NOW + MINUTE, end: NOW + 2 * HOUR });
    expect(await rigAccess(UID, GRACE)).toBe('just-ended');
  });
});

describe('rigAccess — when Firestore fails', () => {
  it('rejects instead of guessing an answer', async () => {
    seedBooking('round', { start: NOW - HOUR, end: NOW + HOUR });
    breakDb(new Error('UNAVAILABLE'));
    await expect(rigAccess(UID, GRACE)).rejects.toThrow('UNAVAILABLE');
  });
});
