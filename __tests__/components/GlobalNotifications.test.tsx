import { fireEvent, render, screen, within } from '@testing-library/react';
import GlobalNotifications, { BellIcon, NotifPanel, UnreadBadge, type Notification } from '@/app/components/GlobalNotifications';
import type { AnimeMock } from '../helpers/client/anime';
import { advance, mockFetch } from '../helpers/client/fetch';

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

// A toast has no role of its own; it is the box around its title.
const toast = (id: string) => screen.getByText(`title ${id}`).parentElement?.parentElement as HTMLElement;

const bellWiggles = () => anime.animate.mock.calls.filter(call => 'rotate' in ((call as unknown[])[1] as object)).length;

beforeEach(() => {
  jest.clearAllMocks();
  jest.useFakeTimers();
  jest.setSystemTime(NOW);
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

  describe('toasts', () => {
    it('pops up an unread notification without the bell being clicked', async () => {
      await show({ signedIn: true, feed: [note('a')] });

      expect(screen.getByText('title a')).toBeInTheDocument();
      expect(screen.getByText('message a')).toBeInTheDocument();
    });

    it('does not pop up notifications that are already read', async () => {
      await show({ signedIn: true, feed: [note('a', { is_read: 1 })] });
      expect(screen.queryByText('title a')).not.toBeInTheDocument();
    });

    it('links to the lab when the notification carries a link, and has no link otherwise', async () => {
      await show({ signedIn: true, feed: [note('a', { action_url: '/lab?booking=bk-1' }), note('b')] });

      expect(within(toast('a')).getByRole('link', { name: LAB_LINK })).toHaveAttribute('href', '/lab?booking=bk-1');
      expect(within(toast('b')).queryByRole('link')).not.toBeInTheDocument();
    });

    it('goes away when its close button is clicked, leaving the others', async () => {
      await show({ signedIn: true, feed: [note('a'), note('b')] });

      // The close button holds only an icon and has no accessible name.
      fireEvent.click(within(toast('a')).getByRole('button'));

      expect(screen.queryByText('title a')).not.toBeInTheDocument();
      expect(screen.getByText('title b')).toBeInTheDocument();
    });

    it('goes away by itself after 20 seconds', async () => {
      await show({ signedIn: true, feed: [note('a')] });

      await advance(19_999);
      expect(screen.getByText('title a')).toBeInTheDocument();
      await advance(1);
      expect(screen.queryByText('title a')).not.toBeInTheDocument();
    });

    it('stays for longer than 20 seconds when it carries a link to the lab', async () => {
      await show({ signedIn: true, feed: [note('a', { action_url: '/lab' })] });

      await advance(29_000);
      expect(screen.getByText('title a')).toBeInTheDocument();
    });

    // The 30-second poll re-renders the toasts twice within these 60 seconds;
    // the countdown must not start again each time.
    it('goes away after 60 seconds when it carries a link to the lab', async () => {
      await show({ signedIn: true, feed: [note('a', { action_url: '/lab' })] });

      await advance(59_999);
      expect(screen.getByText('title a')).toBeInTheDocument();
      await advance(1);
      expect(screen.queryByText('title a')).not.toBeInTheDocument();
    });

    // Opening the panel re-renders the toasts too.
    it('still goes away 20 seconds after it appeared when the panel is opened meanwhile', async () => {
      await show({ signedIn: true, feed: [note('a')] });

      await advance(15_000);
      fireEvent.click(bell());
      fireEvent.click(bell());
      await advance(5_000);

      expect(screen.queryByText('title a')).not.toBeInTheDocument();
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
