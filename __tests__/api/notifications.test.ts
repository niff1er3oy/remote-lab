/** @jest-environment node */
import { GET, PATCH } from '@/app/api/notifications/route';
import { read, resetDb, seed, ts } from '../helpers/server/firestore';
import { signInAs, signOut } from '../helpers/server/session';

jest.mock('@/lib/firebase-admin', () => ({
  adminDb: jest.requireActual<typeof import('../helpers/server/firestore')>('../helpers/server/firestore').db,
}));
jest.mock('@/lib/session', () => ({ getSessionUser: jest.fn() }));

type Listed = { notification_id: string; is_read: boolean };

const BASE = Date.parse('2026-10-05T03:00:00Z');

// A notification created `minutesAgo` minutes before 03:00 UTC on 5 October.
const notification = (id: string, minutesAgo: number, more: Record<string, unknown> = {}) =>
  seed('notifications', id, {
    user_id: 'student-1',
    title: `เรื่องที่ ${id}`,
    message: 'ข้อความ',
    type: 'info',
    is_read: false,
    created_at: ts(new Date(BASE - minutesAgo * 60_000).toISOString()),
    ...more,
  });
const list = async () => {
  const res = await GET();
  return { status: res.status, body: await res.json() };
};
const listedIds = async () => (await list()).body.notifications.map((n: Listed) => n.notification_id);

beforeEach(() => {
  resetDb();
  signInAs();
});

describe('GET /api/notifications', () => {
  it('refuses a caller who is not signed in', async () => {
    signOut();
    notification('n1', 1);
    expect(await list()).toEqual({ status: 401, body: { ok: false } });
  });

  it('returns an empty feed for a user without notifications', async () => {
    expect(await list()).toEqual({ status: 200, body: { ok: true, notifications: [], unread: 0 } });
  });

  it('describes a notification', async () => {
    notification('n1', 0, { title: 'จองสำเร็จ — LAB8', message: 'วันที่ 6 ต.ค. 69', type: 'success', action_url: '/lab' });
    expect((await list()).body.notifications).toEqual([{
      notification_id: 'n1',
      title: 'จองสำเร็จ — LAB8',
      message: 'วันที่ 6 ต.ค. 69',
      type: 'success',
      action_url: '/lab',
      is_read: false,
      created_at: '2026-10-05T03:00:00.000Z',
    }]);
  });

  it('gives a notification without a link an action_url of null', async () => {
    notification('n1', 0);
    expect((await list()).body.notifications[0].action_url).toBeNull();
  });

  it('lists the newest first', async () => {
    notification('middle', 30);
    notification('newest', 1);
    notification('oldest', 600);
    expect(await listedIds()).toEqual(['newest', 'middle', 'oldest']);
  });

  it('returns only the 20 newest', async () => {
    for (let i = 1; i <= 23; i++) notification(`n${i}`, i);
    expect(await listedIds()).toEqual(Array.from({ length: 20 }, (_, i) => `n${i + 1}`));
  });

  it('counts the unread ones', async () => {
    notification('a', 1);
    notification('b', 2, { is_read: true });
    notification('c', 3);
    expect((await list()).body.unread).toBe(2);
  });

  it('shows only the signed-in user\'s notifications', async () => {
    notification('mine', 1);
    notification('theirs', 2, { user_id: 'someone-else' });
    const { body } = await list();
    expect(body.notifications.map((n: Listed) => n.notification_id)).toEqual(['mine']);
    expect(body.unread).toBe(1);
  });

  it('does not mark anything as read by listing it', async () => {
    notification('n1', 1);
    await list();
    expect(read('notifications', 'n1')?.is_read).toBe(false);
    expect((await list()).body.unread).toBe(1);
  });
});

describe('PATCH /api/notifications', () => {
  it('refuses a caller who is not signed in and changes nothing', async () => {
    signOut();
    notification('n1', 1);
    const res = await PATCH();
    expect(res.status).toBe(401);
    expect(read('notifications', 'n1')?.is_read).toBe(false);
  });

  it('marks all of the user\'s notifications as read', async () => {
    notification('a', 1);
    notification('b', 2, { is_read: true });
    notification('c', 3);

    const res = await PATCH();
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true });
    expect((await list()).body.unread).toBe(0);
    expect((await list()).body.notifications.every((n: Listed) => n.is_read)).toBe(true);
  });

  it('marks the ones beyond the 20 that are listed as read too', async () => {
    for (let i = 1; i <= 23; i++) notification(`n${i}`, i);
    await PATCH();
    expect(read('notifications', 'n23')?.is_read).toBe(true);
  });

  it('leaves other users\' notifications unread', async () => {
    notification('mine', 1);
    notification('theirs', 2, { user_id: 'someone-else' });
    await PATCH();
    expect(read('notifications', 'mine')?.is_read).toBe(true);
    expect(read('notifications', 'theirs')?.is_read).toBe(false);
  });

  it('changes nothing but the read flag', async () => {
    notification('n1', 1, { action_url: '/lab' });
    const before = read('notifications', 'n1');
    await PATCH();
    expect(read('notifications', 'n1')).toEqual({ ...before, is_read: true });
  });

  it('succeeds when there is nothing to mark', async () => {
    expect((await PATCH()).status).toBe(200);
  });
});
