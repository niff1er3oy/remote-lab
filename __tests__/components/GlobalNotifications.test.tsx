import { fireEvent, render, screen, within } from '@testing-library/react';
import GlobalNotifications, { BellIcon, NotifPanel, UnreadBadge, type Notification } from '@/app/components/GlobalNotifications';
import type { AnimeMock } from '../helpers/client/anime';
import { advance, mockFetch } from '../helpers/client/fetch';
import { installMatchMedia, type MediaControl } from '../helpers/client/matchMedia';

jest.mock('animejs', () => jest.requireActual<typeof import('../helpers/client/anime')>('../helpers/client/anime').animeMock());
jest.mock('next/navigation', () => ({ usePathname: jest.fn() }));

const anime = jest.requireMock<AnimeMock>('animejs');
const navigation = jest.requireMock<{ usePathname: jest.Mock }>('next/navigation');

const NOW = new Date('2026-03-10T12:00:00.000Z');
const POLL = 30_000;
const BELL = 'การแจ้งเตือน';
const LAB_LINK = 'เข้าห้องแลป';

const note = (id: string, overrides: Partial<Notification> = {}): Notification => ({
  notification_id: id,
  title: `title ${id}`,
  message: `message ${id}`,
  type: 'info',
  is_read: 0,
  created_at: NOW.toISOString(),
  ...overrides,
});

type Server = { signedIn: boolean; feed: Notification[]; unread?: number };

function serve(server: Server) {
  return mockFetch(call => {
    if (call.url === '/api/auth/me') return server.signedIn ? { body: { ok: true } } : { status: 401, body: { ok: false } };
    if (call.url === '/api/bookings/notify-upcoming') return { body: { ok: true } };
    if (call.url === '/api/notifications' && call.method === 'PATCH') {
      server.feed = server.feed.map(n => ({ ...n, is_read: 1 }));
      server.unread = 0;
      return { body: { ok: true } };
    }
    if (call.url === '/api/notifications') {
      return { body: { notifications: server.feed, unread: server.unread ?? server.feed.filter(n => !n.is_read).length } };
    }
    throw new Error(`unexpected request ${call.method} ${call.url}`);
  });
}

async function show(server: Server, pathname = '/dashboard') {
  navigation.usePathname.mockReturnValue(pathname);
  const net = serve(server);
  const view = render(<GlobalNotifications />);
  await advance();
  return { net, ...view };
}

const bell = () => screen.getByRole('button', { name: BELL });

// Only one toast is on screen at a time.
const toast = () => screen.getByRole('status');
const REDUCED = '(prefers-reduced-motion: reduce)';
let media: MediaControl;

const bellWiggles = () => anime.animate.mock.calls.filter(call => 'rotate' in ((call as unknown[])[1] as object)).length;

beforeEach(() => {
  jest.clearAllMocks();
  jest.useFakeTimers();
  jest.setSystemTime(NOW);
  media = installMatchMedia();
});

afterEach(() => {
  jest.useRealTimers();
});

describe('GlobalNotifications', () => {
  describe('where it appears', () => {
    it('shows nothing to a signed-out visitor', async () => {
      const { container } = await show({ signedIn: false, feed: [note('a')] });
      expect(container).toBeEmptyDOMElement();
    });

    it('shows the bell on the dashboard', async () => {
      await show({ signedIn: true, feed: [] }, '/dashboard');
      expect(bell()).toBeInTheDocument();
    });

    it('stays off the landing, login and lab pages even when signed in', async () => {
      for (const pathname of ['/', '/login', '/lab']) {
        const { container, unmount } = await show({ signedIn: true, feed: [note('a')] }, pathname);
        expect(container).toBeEmptyDOMElement();
        unmount();
      }
    });
  });

  describe('the bell', () => {
    it('carries the number of unread notifications', async () => {
      await show({ signedIn: true, feed: [note('a'), note('b'), note('c', { is_read: 1 })] });
      expect(bell()).toHaveTextContent(/^2$/);
    });

    it('carries no number when everything is read', async () => {
      await show({ signedIn: true, feed: [note('a', { is_read: 1 })] });
      expect(bell()).toHaveTextContent('');
    });

    it('caps the number at 9+', async () => {
      await show({ signedIn: true, feed: [note('a')], unread: 12 });
      expect(bell()).toHaveTextContent('9+');
    });

    it('wiggles when the unread count goes up and not while it stays the same', async () => {
      const server: Server = { signedIn: true, feed: [note('a')] };
      await show(server);
      expect(bellWiggles()).toBe(1);

      await advance(POLL);
      expect(bellWiggles()).toBe(1);

      server.feed = [note('b'), note('a')];
      await advance(POLL);
      expect(bellWiggles()).toBe(2);
    });
  });

  describe('the panel', () => {
    it('is closed until the bell is clicked', async () => {
      await show({ signedIn: true, feed: [note('a', { is_read: 1 })] });
      expect(screen.queryByText('title a')).not.toBeInTheDocument();

      fireEvent.click(bell());
      expect(screen.getByText('title a')).toBeInTheDocument();
      expect(screen.getByText('message a')).toBeInTheDocument();
    });

    it('closes when the bell is clicked again', async () => {
      await show({ signedIn: true, feed: [note('a', { is_read: 1 })] });

      fireEvent.click(bell());
      fireEvent.click(bell());

      expect(screen.queryByText('title a')).not.toBeInTheDocument();
    });

    it('closes when the page behind it is clicked', async () => {
      await show({ signedIn: true, feed: [note('a', { is_read: 1 })] });
      fireEvent.click(bell());

      // The click-away layer has no role or text; it is the panel's sibling.
      fireEvent.click(document.querySelector('.fixed.inset-0') as HTMLElement);

      expect(screen.queryByText('title a')).not.toBeInTheDocument();
    });

    it('lists every notification in the order the server sent them', async () => {
      await show({ signedIn: true, feed: [note('c', { is_read: 1 }), note('a', { is_read: 1 }), note('b', { is_read: 1 })] });
      fireEvent.click(bell());

      expect(screen.getAllByRole('listitem').map(li => within(li).getByText(/^title /).textContent)).toEqual(['title c', 'title a', 'title b']);
    });

    it('marks everything as read on the server and clears the count', async () => {
      const { net } = await show({ signedIn: true, feed: [note('a', { is_read: 1 }), note('b', { is_read: 1 })], unread: 2 });
      fireEvent.click(bell());
      net.clear();

      fireEvent.click(screen.getByRole('button', { name: 'อ่านทั้งหมด' }));
      await advance();

      expect(net.requests()).toEqual(['PATCH /api/notifications']);
      expect(bell()).toHaveTextContent('');
      expect(screen.queryByRole('button', { name: 'อ่านทั้งหมด' })).not.toBeInTheDocument();
    });
  });

  describe('the panel, continued', () => {
    it('closes on Escape', async () => {
      await show({ signedIn: true, feed: [note('a', { is_read: 1 })] });
      fireEvent.click(bell());
      expect(bell()).toHaveAttribute('aria-expanded', 'true');

      fireEvent.keyDown(window, { key: 'Escape' });

      expect(screen.queryByText('title a')).not.toBeInTheDocument();
      expect(bell()).toHaveAttribute('aria-expanded', 'false');
    });

    it('ignores other keys', async () => {
      await show({ signedIn: true, feed: [note('a', { is_read: 1 })] });
      fireEvent.click(bell());
      fireEvent.keyDown(window, { key: 'Enter' });
      expect(screen.getByText('title a')).toBeInTheDocument();
    });
  });

  describe('toasts', () => {
    it('pops up an unread notification without the bell being clicked, and announces it', async () => {
      await show({ signedIn: true, feed: [note('a')] });

      expect(toast()).toHaveTextContent('title a');
      expect(toast()).toHaveTextContent('message a');
    });

    it('does not pop up notifications that are already read', async () => {
      await show({ signedIn: true, feed: [note('a', { is_read: 1 })] });
      expect(screen.queryByRole('status')).not.toBeInTheDocument();
    });

    it('shows one at a time, newest first, and says how many are waiting', async () => {
      await show({ signedIn: true, feed: [note('a'), note('b'), note('c')] });

      expect(screen.getAllByRole('status')).toHaveLength(1);
      expect(toast()).toHaveTextContent('title a');
      expect(toast()).toHaveTextContent('และอีก 2 รายการ');
    });

    it('says nothing about waiting ones when it is the only one', async () => {
      await show({ signedIn: true, feed: [note('a')] });
      expect(toast()).not.toHaveTextContent('และอีก');
    });

    it('links to the lab when the notification carries a link, and has no link otherwise', async () => {
      const { unmount } = await show({ signedIn: true, feed: [note('a', { action_url: '/lab?booking=bk-1' })] });
      expect(within(toast()).getByRole('link', { name: LAB_LINK })).toHaveAttribute('href', '/lab?booking=bk-1');
      unmount();

      await show({ signedIn: true, feed: [note('b')] });
      expect(within(toast()).queryByRole('link')).not.toBeInTheDocument();
    });

    it('gives way to the next one when its close button is clicked', async () => {
      await show({ signedIn: true, feed: [note('a'), note('b')] });

      fireEvent.click(within(toast()).getByRole('button', { name: 'ปิดการแจ้งเตือนนี้' }));

      expect(screen.queryByText('title a')).not.toBeInTheDocument();
      expect(toast()).toHaveTextContent('title b');
      expect(toast()).not.toHaveTextContent('และอีก');
    });

    it.each([
      ['a plain one', {}],
      ['one with a link to the lab', { action_url: '/lab' }],
    ])('goes away by itself after 20 seconds: %s', async (_label, extra) => {
      await show({ signedIn: true, feed: [note('a', extra)] });

      await advance(19_999);
      expect(screen.getByText('title a')).toBeInTheDocument();
      await advance(1);
      expect(screen.queryByText('title a')).not.toBeInTheDocument();
    });

    it('gives each waiting toast its own 20 seconds', async () => {
      await show({ signedIn: true, feed: [note('a'), note('b')] });

      await advance(20_000);
      expect(toast()).toHaveTextContent('title b');
      await advance(19_999);
      expect(toast()).toHaveTextContent('title b');
      await advance(1);
      expect(screen.queryByRole('status')).not.toBeInTheDocument();
    });

    // A refresh re-renders the toast; the countdown must not start again.
    it('still goes away 20 seconds after it appeared when the feed is refreshed meanwhile', async () => {
      await show({ signedIn: true, feed: [note('a')] });

      await advance(15_000);
      window.dispatchEvent(new Event('booking-created'));
      await advance(5_000);

      expect(screen.queryByRole('status')).not.toBeInTheDocument();
    });

    it('is cleared, with any waiting behind it, when the panel is opened', async () => {
      await show({ signedIn: true, feed: [note('a'), note('b')] });

      fireEvent.click(bell());
      expect(screen.queryByRole('status')).not.toBeInTheDocument();

      fireEvent.click(bell());
      expect(screen.queryByRole('status')).not.toBeInTheDocument();
    });
  });

  describe('motion', () => {
    const moved = (prop: string) => anime.animate.mock.calls.filter(call => prop in ((call as unknown[])[1] as object)).length;

    it('slides the toast and the panel in', async () => {
      await show({ signedIn: true, feed: [note('a')] });
      expect(moved('translateX')).toBe(1);

      fireEvent.click(bell());
      expect(moved('translateY')).toBe(1);
    });

    it('animates nothing when the visitor asked for reduced motion', async () => {
      media.set(REDUCED, true);
      await show({ signedIn: true, feed: [note('a')] });
      fireEvent.click(bell());

      expect(anime.animate).not.toHaveBeenCalled();
    });

    // anime.js is not running in these tests, so anything that waited on it to
    // become visible would still be hidden here.
    it('leaves the toast, the panel and its items visible without the animation', async () => {
      await show({ signedIn: true, feed: [note('a')] });
      expect(toast().style.opacity).toBe('');

      fireEvent.click(bell());
      const item = screen.getByRole('listitem');
      expect(item.style.opacity).toBe('');
      expect((item.closest('.rounded-2xl') as HTMLElement).style.opacity).toBe('');
    });
  });
});

describe('BellIcon', () => {
  it('draws at the size it is given', () => {
    const { container } = render(<BellIcon size={15} />);
    const svg = container.querySelector('svg');
    expect(svg).toHaveAttribute('width', '15');
    expect(svg).toHaveAttribute('height', '15');
  });

  it('has a default size', () => {
    const { container } = render(<BellIcon />);
    expect(Number(container.querySelector('svg')?.getAttribute('width'))).toBeGreaterThan(0);
  });
});

describe('UnreadBadge', () => {
  it('shows the count up to nine', () => {
    const { container, rerender } = render(<UnreadBadge count={1} />);
    expect(container).toHaveTextContent(/^1$/);
    rerender(<UnreadBadge count={9} />);
    expect(container).toHaveTextContent(/^9$/);
  });

  it('shows 9+ from ten on', () => {
    const { container, rerender } = render(<UnreadBadge count={10} />);
    expect(container).toHaveTextContent('9+');
    rerender(<UnreadBadge count={250} />);
    expect(container).toHaveTextContent('9+');
  });
});

describe('NotifPanel', () => {
  const noop = () => {};

  it('says there is nothing when the list is empty', () => {
    render(<NotifPanel notifications={[]} unread={0} onMarkAllRead={noop} />);

    expect(screen.getByText('ไม่มีการแจ้งเตือน')).toBeInTheDocument();
    expect(screen.queryByRole('listitem')).not.toBeInTheDocument();
  });

  it('shows each notification\'s title, message and age', () => {
    const feed = [
      note('a', { created_at: new Date(NOW.getTime() - 5 * 60_000).toISOString() }),
      note('b', { created_at: new Date(NOW.getTime() - 3 * 3_600_000).toISOString(), is_read: 1 }),
    ];
    render(<NotifPanel notifications={feed} unread={1} onMarkAllRead={noop} />);

    const [first, second] = screen.getAllByRole('listitem');
    expect(first).toHaveTextContent('title a');
    expect(first).toHaveTextContent('message a');
    expect(first).toHaveTextContent('5 นาทีที่แล้ว');
    expect(second).toHaveTextContent('title b');
    expect(second).toHaveTextContent('3 ชั่วโมงที่แล้ว');
    expect(screen.queryByText('ไม่มีการแจ้งเตือน')).not.toBeInTheDocument();
  });

  it('makes unread notifications look different from read ones', () => {
    render(<NotifPanel notifications={[note('a'), note('b', { is_read: 1 })]} unread={1} onMarkAllRead={noop} />);

    const [unread, read] = screen.getAllByRole('listitem');
    expect(unread.className).not.toBe(read.className);
    expect(screen.getByText('title a').className).not.toBe(screen.getByText('title b').className);
  });

  it('links to the lab only from notifications that carry a link', () => {
    render(<NotifPanel notifications={[note('a', { action_url: '/lab?booking=bk-1' }), note('b')]} unread={2} onMarkAllRead={noop} />);

    const [withLink, without] = screen.getAllByRole('listitem');
    expect(within(withLink).getByRole('link', { name: LAB_LINK })).toHaveAttribute('href', '/lab?booking=bk-1');
    expect(within(without).queryByRole('link')).not.toBeInTheDocument();
  });

  it('shows the unread count and a mark-all-read button that calls back', () => {
    const onMarkAllRead = jest.fn();
    render(<NotifPanel notifications={[note('a'), note('b')]} unread={2} onMarkAllRead={onMarkAllRead} />);

    expect(screen.getByText('2')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'อ่านทั้งหมด' }));

    expect(onMarkAllRead).toHaveBeenCalledTimes(1);
  });

  it('caps the unread count at 9+', () => {
    render(<NotifPanel notifications={[note('a')]} unread={10} onMarkAllRead={noop} />);
    expect(screen.getByText('9+')).toBeInTheDocument();
  });

  it('offers no mark-all-read button and no count when nothing is unread', () => {
    render(<NotifPanel notifications={[note('a', { is_read: 1 })]} unread={0} onMarkAllRead={noop} />);

    expect(screen.queryByRole('button')).not.toBeInTheDocument();
    expect(screen.queryByText('0')).not.toBeInTheDocument();
  });

  it('still shows a notification whose type it does not know', () => {
    const odd = { ...note('a'), type: 'reminder' } as unknown as Notification;
    render(<NotifPanel notifications={[odd]} unread={1} onMarkAllRead={noop} />);

    expect(screen.getByText('title a')).toBeInTheDocument();
  });

  it('limits its height to what the caller asks for', () => {
    render(<NotifPanel notifications={[note('a')]} unread={1} onMarkAllRead={noop} maxH="220px" />);
    expect(screen.getByRole('list').parentElement).toHaveStyle({ maxHeight: '220px' });
  });
});
