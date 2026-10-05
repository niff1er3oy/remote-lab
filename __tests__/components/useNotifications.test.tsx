import { act, renderHook } from '@testing-library/react';
import { formatRelative, useNotifications, type Notification } from '@/app/components/useNotifications';
import { advance, mockFetch, type Call, type Reply } from '../helpers/client/fetch';

const NOW = new Date('2026-03-10T12:00:00.000Z');
const POLL = 30_000;

const note = (id: string, is_read = 0): Notification => ({
  notification_id: id,
  title: `title ${id}`,
  message: `message ${id}`,
  type: 'info',
  is_read,
  created_at: NOW.toISOString(),
});

// A small stand-in for the three endpoints the hook talks to. Tests change
// `server` between polls the way the real feed changes over time.
type Server = {
  signedIn: boolean;
  feed: Notification[];
  unread?: number;
  override?: (call: Call) => Reply | undefined;
};

function serve(server: Server) {
  return mockFetch(call => {
    const overridden = server.override?.(call);
    if (overridden) return overridden;
    if (call.url === '/api/auth/me') return server.signedIn ? { body: { ok: true } } : { status: 401, body: { ok: false } };
    if (call.url === '/api/bookings/notify-upcoming') return { body: { ok: true } };
    if (call.url === '/api/notifications' && call.method === 'GET') {
      return { body: { notifications: server.feed, unread: server.unread ?? server.feed.filter(n => !n.is_read).length } };
    }
    if (call.url === '/api/notifications' && call.method === 'PATCH') return { body: { ok: true } };
    throw new Error(`unexpected request ${call.method} ${call.url}`);
  });
}

const ids = (list: Notification[]) => list.map(n => n.notification_id);

beforeEach(() => {
  jest.useFakeTimers();
  jest.setSystemTime(NOW);
});

afterEach(() => {
  jest.useRealTimers();
});

describe('formatRelative', () => {
  const ago = (ms: number) => formatRelative(new Date(NOW.getTime() - ms).toISOString());
  const SECOND = 1000, MINUTE = 60 * SECOND, HOUR = 60 * MINUTE, DAY = 24 * HOUR;

  it('says "just now" for anything under a minute old', () => {
    expect(ago(0)).toBe('เพิ่งเมื่อกี้');
    expect(ago(MINUTE - 1)).toBe('เพิ่งเมื่อกี้');
  });

  it('says "just now" for a time slightly in the future, as when clocks disagree', () => {
    expect(ago(-5 * SECOND)).toBe('เพิ่งเมื่อกี้');
  });

  it('counts whole minutes from one minute up to an hour', () => {
    expect(ago(MINUTE)).toBe('1 นาทีที่แล้ว');
    expect(ago(2 * MINUTE - 1)).toBe('1 นาทีที่แล้ว');
    expect(ago(HOUR - 1)).toBe('59 นาทีที่แล้ว');
  });

  it('counts whole hours from one hour up to a day', () => {
    expect(ago(HOUR)).toBe('1 ชั่วโมงที่แล้ว');
    expect(ago(2 * HOUR - 1)).toBe('1 ชั่วโมงที่แล้ว');
    expect(ago(DAY - 1)).toBe('23 ชั่วโมงที่แล้ว');
  });

  it('counts whole days from one day on', () => {
    expect(ago(DAY)).toBe('1 วันที่แล้ว');
    expect(ago(2 * DAY - 1)).toBe('1 วันที่แล้ว');
    expect(ago(45 * DAY)).toBe('45 วันที่แล้ว');
  });
});

describe('useNotifications', () => {
  describe('for a signed-out visitor', () => {
    it('asks who is signed in and then stays quiet', async () => {
      const net = serve({ signedIn: false, feed: [note('a')] });
      const { result } = renderHook(() => useNotifications());
      await advance();

      expect(net.requests()).toEqual(['GET /api/auth/me']);
      expect(result.current.loggedIn).toBe(false);
      expect(result.current.notifications).toEqual([]);
      expect(result.current.toasts).toEqual([]);
      expect(result.current.unread).toBe(0);
    });

    it('never polls and ignores a booking being made', async () => {
      const net = serve({ signedIn: false, feed: [note('a')] });
      renderHook(() => useNotifications());
      await advance();
      net.clear();

      await advance(5 * POLL);
      act(() => { window.dispatchEvent(new Event('booking-created')); });
      await advance();

      expect(net.requests()).toEqual([]);
    });

    it('treats a failed sign-in check as signed out', async () => {
      const net = serve({ signedIn: true, feed: [note('a')], override: call => {
        if (call.url === '/api/auth/me') throw new Error('offline');
        return undefined;
      } });
      const { result } = renderHook(() => useNotifications());
      await advance();
      await advance(POLL);

      expect(result.current.loggedIn).toBe(false);
      expect(net.requests()).toEqual(['GET /api/auth/me']);
    });
  });

  describe('for a signed-in user', () => {
    it('checks for upcoming bookings and then loads the feed', async () => {
      const net = serve({ signedIn: true, feed: [note('a'), note('b', 1)], unread: 1 });
      const { result } = renderHook(() => useNotifications());
      await advance();

      expect(net.requests()).toEqual([
        'GET /api/auth/me',
        'POST /api/bookings/notify-upcoming',
        'GET /api/notifications',
      ]);
      expect(result.current.loggedIn).toBe(true);
      expect(ids(result.current.notifications)).toEqual(['a', 'b']);
      expect(result.current.unread).toBe(1);
    });

    it('shows a toast for each unread notification and none for those already read', async () => {
      serve({ signedIn: true, feed: [note('a'), note('b', 1), note('c')] });
      const { result } = renderHook(() => useNotifications());
      await advance();

      expect(ids(result.current.toasts)).toEqual(['a', 'c']);
    });

    it('shows at most three toasts from one load, the newest first', async () => {
      serve({ signedIn: true, feed: ['a', 'b', 'c', 'd', 'e'].map(id => note(id)) });
      const { result } = renderHook(() => useNotifications());
      await advance();

      expect(ids(result.current.toasts)).toEqual(['a', 'b', 'c']);
      expect(ids(result.current.notifications)).toEqual(['a', 'b', 'c', 'd', 'e']);
    });

    it('polls again every 30 seconds and not before', async () => {
      const net = serve({ signedIn: true, feed: [] });
      renderHook(() => useNotifications());
      await advance();
      net.clear();

      await advance(POLL - 1);
      expect(net.requests()).toEqual([]);

      await advance(1);
      expect(net.requests()).toEqual(['POST /api/bookings/notify-upcoming', 'GET /api/notifications']);

      await advance(POLL);
      expect(net.requests()).toHaveLength(4);
    });

    it('picks up a notification that arrives between polls and puts its toast on top', async () => {
      const server: Server = { signedIn: true, feed: [note('a')] };
      serve(server);
      const { result } = renderHook(() => useNotifications());
      await advance();

      server.feed = [note('b'), note('a')];
      await advance(POLL);

      expect(ids(result.current.notifications)).toEqual(['b', 'a']);
      expect(result.current.unread).toBe(2);
      expect(ids(result.current.toasts)).toEqual(['b', 'a']);
    });

    it('does not toast the same notification again on later polls', async () => {
      serve({ signedIn: true, feed: [note('a')] });
      const { result } = renderHook(() => useNotifications());
      await advance();
      await advance(POLL);
      await advance(POLL);

      expect(ids(result.current.toasts)).toEqual(['a']);
    });

    it('keeps a dismissed toast dismissed while the notification stays unread', async () => {
      serve({ signedIn: true, feed: [note('a'), note('b')] });
      const { result } = renderHook(() => useNotifications());
      await advance();

      act(() => { result.current.dismissToast('a'); });
      expect(ids(result.current.toasts)).toEqual(['b']);

      await advance(POLL);
      expect(ids(result.current.toasts)).toEqual(['b']);
      expect(ids(result.current.notifications)).toEqual(['a', 'b']);
    });

    it('never stacks more than five toasts', async () => {
      const server: Server = { signedIn: true, feed: ['a', 'b', 'c'].map(id => note(id)) };
      serve(server);
      const { result } = renderHook(() => useNotifications());
      await advance();

      server.feed = ['d', 'e', 'f'].map(id => note(id));
      await advance(POLL);

      expect(ids(result.current.toasts)).toEqual(['d', 'e', 'f', 'a', 'b']);
    });

    it('refreshes at once when a booking is made, without waiting for the next poll', async () => {
      const server: Server = { signedIn: true, feed: [] };
      const net = serve(server);
      const { result } = renderHook(() => useNotifications());
      await advance();
      net.clear();

      server.feed = [note('booked')];
      act(() => { window.dispatchEvent(new Event('booking-created')); });
      await advance();

      expect(net.requests()).toEqual(['POST /api/bookings/notify-upcoming', 'GET /api/notifications']);
      expect(ids(result.current.toasts)).toEqual(['booked']);
    });

    it('stops polling and listening once unmounted', async () => {
      const net = serve({ signedIn: true, feed: [] });
      const { unmount } = renderHook(() => useNotifications());
      await advance();
      net.clear();

      unmount();
      window.dispatchEvent(new Event('booking-created'));
      await advance(3 * POLL);

      expect(net.requests()).toEqual([]);
    });

    it('marks everything as read on the server and on screen', async () => {
      const net = serve({ signedIn: true, feed: [note('a'), note('b'), note('c', 1)] });
      const { result } = renderHook(() => useNotifications());
      await advance();
      net.clear();

      await act(async () => { await result.current.markAllRead(); });

      expect(net.requests()).toEqual(['PATCH /api/notifications']);
      expect(result.current.unread).toBe(0);
      expect(result.current.notifications.map(n => n.is_read)).toEqual([1, 1, 1]);
      expect(ids(result.current.notifications)).toEqual(['a', 'b', 'c']);
    });

    it('leaves the notifications unread when marking as read cannot reach the server', async () => {
      const server: Server = { signedIn: true, feed: [note('a'), note('b')] };
      serve(server);
      const { result } = renderHook(() => useNotifications());
      await advance();

      server.override = call => {
        if (call.method === 'PATCH') throw new Error('offline');
        return undefined;
      };
      let failure: unknown;
      await act(async () => { failure = await result.current.markAllRead().catch((err: unknown) => err); });

      expect(failure).toEqual(new Error('offline'));
      expect(result.current.unread).toBe(2);
      expect(result.current.notifications.map(n => n.is_read)).toEqual([0, 0]);
    });

    // A refused PATCH (401 after the session expires, 500) saved nothing.
    it('leaves the notifications unread when the server refuses to mark them as read', async () => {
      const server: Server = { signedIn: true, feed: [note('a'), note('b')] };
      serve(server);
      const { result } = renderHook(() => useNotifications());
      await advance();

      server.override = call => (call.method === 'PATCH' ? { status: 500, body: { error: 'failed' } } : undefined);
      await act(async () => { await result.current.markAllRead().catch(() => {}); });

      expect(result.current.unread).toBe(2);
      expect(result.current.notifications.map(n => n.is_read)).toEqual([0, 0]);
    });
  });

  describe('when a request fails', () => {
    it('keeps what it was showing when the feed answers with an error', async () => {
      const server: Server = { signedIn: true, feed: [note('a')] };
      serve(server);
      const { result } = renderHook(() => useNotifications());
      await advance();

      server.override = call => (call.url === '/api/notifications' ? { status: 500, body: { error: 'failed' } } : undefined);
      await advance(POLL);

      expect(ids(result.current.notifications)).toEqual(['a']);
      expect(result.current.unread).toBe(1);
      expect(ids(result.current.toasts)).toEqual(['a']);
    });

    it('keeps what it was showing when the network drops, and recovers on a later poll', async () => {
      const server: Server = { signedIn: true, feed: [note('a')] };
      serve(server);
      const { result } = renderHook(() => useNotifications());
      await advance();

      server.override = call => {
        if (call.url !== '/api/auth/me') throw new Error('offline');
        return undefined;
      };
      await advance(POLL);
      expect(ids(result.current.notifications)).toEqual(['a']);
      expect(result.current.loggedIn).toBe(true);

      server.override = undefined;
      server.feed = [note('b'), note('a')];
      await advance(POLL);
      expect(ids(result.current.notifications)).toEqual(['b', 'a']);
    });

    it('still loads the feed when the upcoming-booking check answers with an error', async () => {
      const server: Server = { signedIn: true, feed: [note('a')], override: call =>
        (call.url === '/api/bookings/notify-upcoming' ? { status: 500, body: { error: 'failed' } } : undefined) };
      serve(server);
      const { result } = renderHook(() => useNotifications());
      await advance();

      expect(ids(result.current.notifications)).toEqual(['a']);
    });

    it('shows an empty feed when the server sends no list', async () => {
      const server: Server = { signedIn: true, feed: [], override: call =>
        (call.url === '/api/notifications' ? { body: {} } : undefined) };
      serve(server);
      const { result } = renderHook(() => useNotifications());
      await advance();

      expect(result.current.notifications).toEqual([]);
      expect(result.current.unread).toBe(0);
    });
  });
});
