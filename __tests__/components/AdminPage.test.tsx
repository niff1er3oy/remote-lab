import { fireEvent, render, screen, within } from '@testing-library/react';
import AdminPage from '@/app/admin/page';
import { INSTRUMENTS } from '@/lib/instruments';
import type { AnimeMock } from '../helpers/client/anime';
import { advance, mockFetch, type Call, type Reply } from '../helpers/client/fetch';
import { installMatchMedia, type MediaControl } from '../helpers/client/matchMedia';

jest.mock('animejs', () => jest.requireActual<typeof import('../helpers/client/anime')>('../helpers/client/anime').animeMock());
// The page's effect depends on the router, so every render must get the same one.
jest.mock('next/navigation', () => {
  const router = { replace: jest.fn() };
  return { useRouter: () => router };
});
jest.mock('../../app/admin/EquipmentStatus', () => ({ __esModule: true, default: () => <p>equipment status stand-in</p> }));
jest.mock('../../app/components/DashboardNav', () => ({
  __esModule: true,
  default: ({ user }: { user: { name: string } }) => <nav>signed in as {user.name}</nav>,
}));

const anime = jest.requireMock<AnimeMock>('animejs');
const router = jest.requireMock<{ useRouter: () => { replace: jest.Mock } }>('next/navigation').useRouter();

type Me = { name: string; email: string; role: string; is_admin?: boolean };
type Lab = { lab_id: string; code: string; name_th: string; is_active: boolean };
type Booking = {
  booking_id: string; lab_id: string; status: string;
  start_time: string; end_time: string;
  blocked: boolean; note: string;
  user: { uid: string; name: string; email: string };
};
type Server = { user: Me | null; labs: Lab[]; running: Booking[]; bookings: Booking[]; disabled?: string[] };
type Override = (call: Call) => Reply | Promise<Reply> | undefined;

// 10:00 on 10 March in Bangkok.
const NOW = new Date('2026-03-10T03:00:00.000Z');
const REFRESH = 30_000;
const OVERVIEW = 'GET /api/admin/overview?from=2026-03-10&days=7';
const OFFLINE = 'เชื่อมต่อเซิร์ฟเวอร์ไม่ได้';
const REDUCED = '(prefers-reduced-motion: reduce)';

const ADMIN: Me = { name: 'Ada Admin', email: 'ada@example.com', role: 'admin', is_admin: true };
const STUDENT: Me = { name: 'Sam Student', email: 'sam@example.com', role: 'student' };

const lab = (n: number, overrides: Partial<Lab> = {}): Lab => ({
  lab_id: `lab-${n}`, code: `PHY10${n}`, name_th: `การทดลองที่ ${n}`, is_active: true, ...overrides,
});

// 16:00 to 17:00 in Bangkok.
const booking = (id: string, overrides: Partial<Booking> = {}): Booking => ({
  booking_id: `bk-${id}`, lab_id: 'lab-1', status: 'confirmed',
  start_time: '2026-03-10T09:00:00.000Z', end_time: '2026-03-10T10:00:00.000Z',
  blocked: false, note: '',
  user: { uid: `uid-${id}`, name: `Student ${id}`, email: `${id}@example.com` },
  ...overrides,
});

const admin = (overrides: Partial<Server> = {}): Server => ({
  user: ADMIN, labs: [lab(1)], running: [], bookings: [], ...overrides,
});

// A server that does what it is asked, so a reload after an action shows the
// result. `override` answers a request itself (or throws, for a dead network)
// and returns undefined to let the request through.
function serve(server: Server, override?: Override) {
  return mockFetch(call => {
    const special = override?.(call);
    if (special) return special;
    const { method, url } = call;
    if (url === '/api/auth/me') return server.user ? { body: { user: server.user } } : { status: 401, body: { ok: false } };
    if (method === 'GET' && url.startsWith('/api/admin/overview?')) {
      return {
        body: {
          ok: true, labs: server.labs, running: server.running, bookings: server.bookings,
          ...(server.disabled ? { disabled_instruments: server.disabled } : {}),
        },
      };
    }
    const bookingId = url.match(/^\/api\/admin\/bookings\/(.+)$/)?.[1];
    if (method === 'PATCH' && bookingId) {
      const status = (call.body as { action: string }).action === 'end' ? 'completed' : 'cancelled';
      server.running = server.running.filter(b => b.booking_id !== bookingId);
      server.bookings = server.bookings.map(b => (b.booking_id === bookingId ? { ...b, status } : b));
      return { body: { ok: true, circuits_cut: true } };
    }
    const labId = url.match(/^\/api\/admin\/labs\/(.+)$/)?.[1];
    if (method === 'PATCH' && labId) {
      const { is_active } = call.body as { is_active: boolean };
      server.labs = server.labs.map(l => (l.lab_id === labId ? { ...l, is_active } : l));
      return { body: { ok: true } };
    }
    if (method === 'PATCH' && url === '/api/admin/rig/instruments') {
      server.disabled = (call.body as { disabled: string[] }).disabled;
      return { body: { ok: true } };
    }
    if (method === 'POST' && (url === '/api/admin/rig/power' || url === '/api/admin/rig/stop')) return { body: { ok: true } };
    if (method === 'POST' && url === '/api/admin/blocks') {
      const { lab_id, start_time, end_time, note } = call.body as { lab_id: string; start_time: string; end_time: string; note: string };
      server.bookings = [...server.bookings, booking('block', { lab_id, start_time, end_time, note, blocked: true })];
      return { body: { ok: true } };
    }
    throw new Error(`unexpected request ${method} ${url}`);
  });
}

// The first pass answers the sign-in check, the second the overview it leads to.
async function show(server: Server, override?: Override) {
  const net = serve(server, override);
  const view = render(<AdminPage />);
  await advance();
  await advance();
  return { net, ...view };
}

// Shows the page, then forgets the requests it took to get there.
async function arrive(server: Server, override?: Override) {
  const page = await show(server, override);
  page.net.clear();
  return page;
}

const isAction = (call: Call) => call.method !== 'GET';
const refuse = (status: number, body: unknown = {}): Override => call => (isAction(call) ? { status, body } : undefined);
const offline: Override = call => {
  if (isAction(call)) throw new TypeError('Failed to fetch');
  return undefined;
};

// A reply the test hands over when it chooses, to look at the page meanwhile.
function held() {
  let release: (reply: Reply) => void = () => {};
  const reply = new Promise<Reply>(resolve => { release = resolve; });
  const override: Override = call => (isAction(call) ? reply : undefined);
  return { override, release: (r: Reply = { body: { ok: true } }) => release(r) };
}

// The panels are plain sections with no accessible name of their own; each is
// found as the parent of its heading.
const panel = (heading: string) => within(screen.getByRole('heading', { name: heading }).parentElement as HTMLElement);
const roomPanel = () => panel('ห้องแลปตอนนี้');
const rigPanel = () => panel('อุปกรณ์');
const labsPanel = () => panel('การเปิดให้ใช้งาน');
const blockPanel = () => panel('ปิดช่วงเวลาไม่ให้จอง');

const table = () => within(screen.getByRole('table'));
const rows = () => table().getAllByRole('row').slice(1);
const row = (who: string) => within(table().getByRole('row', { name: new RegExp(who) }));
const click = (name: string, scope = screen as Pick<typeof screen, 'getByRole'>) => fireEvent.click(scope.getByRole('button', { name }));
const choose = (label: string, value: string) => fireEvent.change(screen.getByLabelText(label), { target: { value } });

const labSwitch = (code: string) => labsPanel().getByRole('switch', { name: `เปิดรับจอง ${code}` });
const instrumentSwitch = (label: string) => labsPanel().getByRole('switch', { name: `เปิดใช้งาน ${label}` });
const [COIL_1, COIL_2, COIL_3, SOLENOID] = INSTRUMENTS;
const COILS = [COIL_1.script, COIL_2.script, COIL_3.script];

let media: MediaControl;

beforeEach(() => {
  jest.clearAllMocks();
  jest.useFakeTimers();
  jest.setSystemTime(NOW);
  media = installMatchMedia();
});

afterEach(() => {
  jest.useRealTimers();
});

describe('AdminPage', () => {
  describe('who gets in', () => {
    it('sends a signed-out visitor to the login page and asks for no admin data', async () => {
      const { net } = await show(admin({ user: null }));

      expect(router.replace).toHaveBeenCalledWith('/login');
      expect(net.requests()).toEqual(['GET /api/auth/me']);
      expect(screen.queryByRole('heading')).not.toBeInTheDocument();
    });

    it('sends the visitor to the login page when the sign-in check cannot reach the server', async () => {
      const { net } = await show(admin(), () => { throw new TypeError('Failed to fetch'); });

      expect(router.replace).toHaveBeenCalledWith('/login');
      expect(net.requests()).toEqual(['GET /api/auth/me']);
    });

    it('tells a signed-in user who is not an admin that the page is not for them, and offers the way back', async () => {
      await show(admin({ user: STUDENT }));

      expect(screen.getByRole('heading', { name: 'หน้านี้สำหรับผู้ดูแลระบบ' })).toBeInTheDocument();
      expect(screen.getByText('บัญชี sam@example.com ไม่มีสิทธิ์เข้าหน้านี้')).toBeInTheDocument();
      expect(screen.getByRole('link', { name: 'กลับแดชบอร์ด' })).toHaveAttribute('href', '/dashboard');
      expect(router.replace).not.toHaveBeenCalled();
    });

    it('shows a non-admin none of the controls and never asks for admin data, however long they stay', async () => {
      const { net } = await show(admin({ user: STUDENT, running: [booking('a')], bookings: [booking('a')] }));
      await advance(REFRESH * 2);

      expect(net.requests()).toEqual(['GET /api/auth/me']);
      expect(screen.queryByRole('switch')).not.toBeInTheDocument();
      expect(screen.queryByRole('button')).not.toBeInTheDocument();
      expect(screen.queryByText('Student a')).not.toBeInTheDocument();
    });

    it('shows an admin the page with every panel', async () => {
      const { net } = await show(admin());

      expect(router.replace).not.toHaveBeenCalled();
      expect(net.requests()).toEqual(['GET /api/auth/me', OVERVIEW]);
      expect(screen.getByRole('heading', { level: 1, name: 'ผู้ดูแลระบบ' })).toBeInTheDocument();
      expect(screen.getByText('signed in as Ada Admin')).toBeInTheDocument();
      expect(screen.getByText('equipment status stand-in')).toBeInTheDocument();
      for (const heading of ['ห้องแลปตอนนี้', 'อุปกรณ์', 'การเปิดให้ใช้งาน', 'ปิดช่วงเวลาไม่ให้จอง']) {
        expect(screen.getByRole('heading', { name: heading })).toBeInTheDocument();
      }
      expect(screen.getByRole('heading', { name: /^การจองทั้งหมด/ })).toBeInTheDocument();
    });

    it('shows that it is loading, and nothing else, until the first data arrives', async () => {
      let release: (reply: Reply) => void = () => {};
      const overview = new Promise<Reply>(resolve => { release = resolve; });
      const server = admin();
      await show(server, call => (call.url.startsWith('/api/admin/overview') ? overview : undefined));

      expect(screen.getByLabelText('กำลังโหลด')).toBeInTheDocument();
      expect(screen.queryByRole('heading')).not.toBeInTheDocument();

      release({ body: { ok: true, labs: server.labs, running: [], bookings: [] } });
      await advance();

      expect(screen.queryByLabelText('กำลังโหลด')).not.toBeInTheDocument();
      expect(screen.getByRole('heading', { level: 1, name: 'ผู้ดูแลระบบ' })).toBeInTheDocument();
    });

    it.each<[string, Override, string]>([
      ['the reason the server gave', call => (call.url.startsWith('/api/admin/overview') ? { status: 403, body: { error: 'ไม่มีสิทธิ์' } } : undefined), 'ไม่มีสิทธิ์'],
      ['a general message when the server gave no reason', call => (call.url.startsWith('/api/admin/overview') ? { status: 500 } : undefined), 'โหลดข้อมูลไม่สำเร็จ'],
      ['a general message when the server answered 200 but said it failed', call => (call.url.startsWith('/api/admin/overview') ? { body: { ok: false } } : undefined), 'โหลดข้อมูลไม่สำเร็จ'],
      ['that the server cannot be reached when the network is down', call => { if (call.url.startsWith('/api/admin/overview')) throw new TypeError('Failed to fetch'); return undefined; }, OFFLINE],
    ])('shows %s when the first load fails, with no controls', async (_label, override, text) => {
      await show(admin(), override);

      expect(screen.getByRole('alert')).toHaveTextContent(text);
      expect(screen.queryByRole('switch')).not.toBeInTheDocument();
      expect(screen.queryByRole('heading')).not.toBeInTheDocument();
    });

    it('loads the page when the admin tries again after a failed first load', async () => {
      let down = true;
      const { net } = await show(admin(), call => (down && call.url.startsWith('/api/admin/overview') ? { status: 500 } : undefined));
      net.clear();
      down = false;

      click('ลองใหม่');
      await advance();

      expect(net.requests()).toEqual([OVERVIEW]);
      expect(screen.queryByRole('alert')).not.toBeInTheDocument();
      expect(screen.getByRole('heading', { level: 1, name: 'ผู้ดูแลระบบ' })).toBeInTheDocument();
    });
  });

  describe('keeping itself fresh', () => {
    it('asks for seven days starting from today in Bangkok, not today in UTC', async () => {
      jest.setSystemTime(new Date('2026-03-10T18:30:00.000Z'));
      const { net } = await show(admin());

      expect(net.requests()).toEqual(['GET /api/auth/me', 'GET /api/admin/overview?from=2026-03-11&days=7']);
      expect(screen.getByLabelText('ตั้งแต่')).toHaveValue('2026-03-11');
      expect(screen.getByLabelText('ช่วง')).toHaveValue('7');
    });

    it('asks again every 30 seconds and shows what changed', async () => {
      const server = admin();
      const { net } = await arrive(server);

      await advance(REFRESH - 1);
      expect(net.requests()).toEqual([]);

      server.running = [booking('a')];
      await advance(1);
      expect(net.requests()).toEqual([OVERVIEW]);
      expect(roomPanel().getByText('Student a')).toBeInTheDocument();

      await advance(REFRESH);
      expect(net.requests()).toEqual([OVERVIEW, OVERVIEW]);
    });

    it('keeps what it had on screen and says so when a refresh fails, then clears the message when one works', async () => {
      let down = false;
      await arrive(admin({ running: [booking('a')] }), call => (down && call.url.startsWith('/api/admin/overview') ? { status: 500, body: { error: 'ฐานข้อมูลไม่ตอบ' } } : undefined));

      down = true;
      await advance(REFRESH);
      expect(screen.getByRole('alert')).toHaveTextContent('ฐานข้อมูลไม่ตอบ');
      expect(roomPanel().getByText('Student a')).toBeInTheDocument();

      down = false;
      await advance(REFRESH);
      expect(screen.queryByRole('alert')).not.toBeInTheDocument();
    });

    it('stops asking once the page is left', async () => {
      const { net, unmount } = await arrive(admin());

      unmount();
      await advance(REFRESH * 3);

      expect(net.requests()).toEqual([]);
    });
  });

  describe('asking before a destructive action', () => {
    const server = () => admin({
      running: [booking('a', { status: 'in_progress' })],
      bookings: [booking('b'), booking('c', { blocked: true, note: 'ซ่อม' })],
    });

    it.each<[string, () => void, string, string]>([
      ['ending a round', () => click('สิ้นสุดรอบนี้', roomPanel()), 'ผู้ใช้จะถูกนำออกจากห้องแลป', 'สิ้นสุดและตัดวงจร'],
      ['the emergency stop', () => click('ตัดวงจรทั้งหมด', rigPanel()), 'การทดลองที่กำลังทำอยู่จะหยุด', 'ตัดวงจรเดี๋ยวนี้'],
      ['cancelling a booking', () => click('ยกเลิก', row('Student b')), 'ผู้จองจะได้รับแจ้งเตือน', 'ยกเลิกการจอง'],
      ['reopening a closed stretch', () => click('เปิดคืน', row('ซ่อม')), 'เปิดช่วงนี้ให้จองได้อีกครั้ง', 'เปิดคืน'],
    ])('%s: the first click only asks, and sends nothing', async (_label, press, question, confirmLabel) => {
      const { net } = await arrive(server());

      press();
      await advance();

      expect(screen.getByText(question)).toBeInTheDocument();
      expect(screen.getByRole('button', { name: confirmLabel })).toBeInTheDocument();
      expect(screen.getByRole('button', { name: 'ไม่ใช่' })).toBeInTheDocument();
      expect(net.requests()).toEqual([]);
    });

    it.each<[string, () => void, string]>([
      ['ending a round', () => click('สิ้นสุดรอบนี้', roomPanel()), 'สิ้นสุดรอบนี้'],
      ['the emergency stop', () => click('ตัดวงจรทั้งหมด', rigPanel()), 'ตัดวงจรทั้งหมด'],
      ['cancelling a booking', () => click('ยกเลิก', row('Student b')), 'ยกเลิก'],
    ])('%s: answering no sends nothing and puts the button back', async (_label, press, label) => {
      const { net } = await arrive(server());

      press();
      click('ไม่ใช่');
      await advance();

      expect(net.requests()).toEqual([]);
      expect(screen.queryByRole('button', { name: 'ไม่ใช่' })).not.toBeInTheDocument();
      expect(screen.getByRole('button', { name: label })).toBeInTheDocument();
    });

    it('says it is working and cannot be pressed again or backed out of while the request is on its way', async () => {
      const reply = held();
      const { net } = await arrive(server(), reply.override);
      click('ตัดวงจรทั้งหมด', rigPanel());

      click('ตัดวงจรเดี๋ยวนี้');
      await advance();

      const working = screen.getByRole('button', { name: 'กำลังดำเนินการ' });
      expect(working).toBeDisabled();
      expect(screen.getByRole('button', { name: 'ไม่ใช่' })).toBeDisabled();

      fireEvent.click(working);
      await advance();
      expect(net.requests()).toEqual(['POST /api/admin/rig/stop']);

      reply.release();
      await advance();
      expect(screen.getByRole('button', { name: 'ตัดวงจรทั้งหมด' })).toBeEnabled();
      expect(screen.queryByRole('button', { name: 'ไม่ใช่' })).not.toBeInTheDocument();
    });

    it('goes back to the plain button after a refused request, so the admin has to confirm again', async () => {
      const { net } = await arrive(server(), refuse(500));
      click('ตัดวงจรทั้งหมด', rigPanel());
      click('ตัดวงจรเดี๋ยวนี้');
      await advance();

      expect(net.requests()).toEqual(['POST /api/admin/rig/stop']);
      expect(screen.queryByRole('button', { name: 'ตัดวงจรเดี๋ยวนี้' })).not.toBeInTheDocument();
      expect(rigPanel().getByRole('button', { name: 'ตัดวงจรทั้งหมด' })).toBeInTheDocument();
    });

    it('keeps a question open across a refresh', async () => {
      const { net } = await arrive(server());
      click('ยกเลิก', row('Student b'));

      await advance(REFRESH);

      expect(net.requests()).toEqual([OVERVIEW]);
      expect(row('Student b').getByRole('button', { name: 'ยกเลิกการจอง' })).toBeInTheDocument();
    });
  });

  describe('who is in the lab', () => {
    const endRound = async (who = roomPanel()) => {
      click('สิ้นสุดรอบนี้', who);
      click('สิ้นสุดและตัดวงจร');
      await advance();
    };

    it('says so when nobody is', async () => {
      await show(admin());

      expect(roomPanel().getByText('ไม่มีรอบที่กำลังดำเนินอยู่')).toBeInTheDocument();
      expect(roomPanel().queryByRole('button')).not.toBeInTheDocument();
    });

    it('shows who is in, their email and the round in Bangkok time', async () => {
      await show(admin({ running: [booking('a', { status: 'in_progress' })] }));

      expect(roomPanel().getByText('Student a')).toBeInTheDocument();
      expect(roomPanel().getByText('a@example.com')).toBeInTheDocument();
      expect(roomPanel().getByText('16:00 ถึง 17:00 น.')).toBeInTheDocument();
      expect(roomPanel().queryByText('ไม่มีรอบที่กำลังดำเนินอยู่')).not.toBeInTheDocument();
    });

    it('falls back to the email, then the account id, when the user has no name', async () => {
      await show(admin({
        running: [
          booking('a', { user: { uid: 'uid-a', name: '', email: 'a@example.com' } }),
          booking('b', { user: { uid: 'uid-b', name: '', email: '' } }),
        ],
      }));

      expect(roomPanel().getAllByText('a@example.com')).toHaveLength(2);
      expect(roomPanel().getByText('uid-b')).toBeInTheDocument();
    });

    it('shows a closed stretch that is running now by its reason, with no user', async () => {
      await show(admin({ running: [booking('a', { blocked: true, note: 'ซ่อมหัววัด' })] }));

      expect(roomPanel().getByText('ปิดช่วงเวลา: ซ่อมหัววัด')).toBeInTheDocument();
      expect(roomPanel().queryByText('a@example.com')).not.toBeInTheDocument();
      expect(roomPanel().queryByText('Student a')).not.toBeInTheDocument();
    });

    it('shows a closed stretch with no reason as just closed', async () => {
      await show(admin({ running: [booking('a', { blocked: true })] }));
      expect(roomPanel().getByText('ปิดช่วงเวลา')).toBeInTheDocument();
    });

    it('ends the round on the server, says so and reloads', async () => {
      const { net } = await arrive(admin({ running: [booking('a', { status: 'in_progress' })] }));

      await endRound();

      expect(net.calls).toEqual([
        { method: 'PATCH', url: '/api/admin/bookings/bk-a', body: { action: 'end' } },
        { method: 'GET', url: '/api/admin/overview?from=2026-03-10&days=7', body: undefined },
      ]);
      expect(roomPanel().getByRole('status')).toHaveTextContent('สิ้นสุดรอบและตัดวงจรแล้ว');
      expect(roomPanel().getByText('ไม่มีรอบที่กำลังดำเนินอยู่')).toBeInTheDocument();
      expect(roomPanel().queryByText('Student a')).not.toBeInTheDocument();
    });

    it('ends the round whose button was pressed when there are two', async () => {
      const { net } = await arrive(admin({ running: [booking('a'), booking('b')] }));

      const second = within(roomPanel().getByText('Student b').parentElement as HTMLElement);
      await endRound(second);

      expect(net.calls[0]).toEqual({ method: 'PATCH', url: '/api/admin/bookings/bk-b', body: { action: 'end' } });
      expect(roomPanel().getByText('Student a')).toBeInTheDocument();
      expect(roomPanel().queryByText('Student b')).not.toBeInTheDocument();
    });

    it('warns that the equipment needs checking when the round ended but the circuits were not cut', async () => {
      await arrive(
        admin({ running: [booking('a')] }),
        call => (isAction(call) ? { body: { ok: true, circuits_cut: false } } : undefined),
      );

      await endRound();

      expect(roomPanel().getByText('สิ้นสุดรอบแล้ว แต่ตัดวงจรไม่สำเร็จ ตรวจสอบอุปกรณ์')).toBeInTheDocument();
      expect(roomPanel().queryByText('สิ้นสุดรอบและตัดวงจรแล้ว')).not.toBeInTheDocument();
    });

    it.each<[string, Override, string]>([
      ['the server\'s reason when it refuses', refuse(409, { error: 'รอบนี้จบไปแล้ว' }), 'รอบนี้จบไปแล้ว'],
      ['a general message when it refuses without a reason', refuse(500), 'สิ้นสุดรอบไม่สำเร็จ'],
      ['a general message when it answers 200 but says it failed', call => (isAction(call) ? { body: { ok: false } } : undefined), 'สิ้นสุดรอบไม่สำเร็จ'],
      ['that the server cannot be reached when the network is down', offline, OFFLINE],
    ])('shows %s, and the user stays listed', async (_label, override, text) => {
      await arrive(admin({ running: [booking('a')] }), override);

      await endRound();

      expect(roomPanel().getByRole('alert')).toHaveTextContent(text);
      expect(roomPanel().queryByRole('status')).not.toBeInTheDocument();
      expect(roomPanel().getByText('Student a')).toBeInTheDocument();
    });
  });

  describe('the rig', () => {
    it.each<[string, boolean, string]>([
      ['เปิด', true, 'เปิดแหล่งจ่ายไฟแล้ว'],
      ['ปิด', false, 'ปิดแหล่งจ่ายไฟแล้ว'],
    ])('switches the supply with "%s" at once, without asking, and says it did', async (name, on, text) => {
      const { net } = await arrive(admin());

      click(name, rigPanel());
      await advance();

      expect(net.calls).toEqual([{ method: 'POST', url: '/api/admin/rig/power', body: { on } }]);
      expect(rigPanel().getByRole('status')).toHaveTextContent(text);
    });

    it('locks both supply buttons while a command is on its way', async () => {
      const reply = held();
      const { net } = await arrive(admin(), reply.override);

      click('เปิด', rigPanel());
      await advance();
      expect(rigPanel().getByRole('button', { name: 'เปิด' })).toBeDisabled();
      expect(rigPanel().getByRole('button', { name: 'ปิด' })).toBeDisabled();

      click('ปิด', rigPanel());
      await advance();
      expect(net.requests()).toEqual(['POST /api/admin/rig/power']);

      reply.release();
      await advance();
      expect(rigPanel().getByRole('button', { name: 'เปิด' })).toBeEnabled();
      expect(rigPanel().getByRole('button', { name: 'ปิด' })).toBeEnabled();
    });

    it.each<[string, Override, string]>([
      ['the server\'s reason when it refuses', refuse(502, { error: 'อุปกรณ์ไม่ตอบสนอง' }), 'อุปกรณ์ไม่ตอบสนอง'],
      ['a general message when it refuses without a reason', refuse(500), 'สั่งแหล่งจ่ายไฟไม่สำเร็จ'],
      ['that the server cannot be reached when the network is down', offline, OFFLINE],
    ])('shows %s for a supply command', async (_label, override, text) => {
      await arrive(admin(), override);

      click('ปิด', rigPanel());
      await advance();

      expect(rigPanel().getByRole('alert')).toHaveTextContent(text);
      expect(rigPanel().queryByRole('status')).not.toBeInTheDocument();
    });

    it('explains what the emergency stop does', async () => {
      await show(admin());
      expect(rigPanel().getByText('ตัดวงจรขดลวดและโซลีนอยด์ และปิดแหล่งจ่ายไฟทันที ไม่ว่าใครกำลังใช้อยู่')).toBeInTheDocument();
    });

    it('sends the emergency stop, with no body, once confirmed', async () => {
      const { net } = await arrive(admin());

      click('ตัดวงจรทั้งหมด', rigPanel());
      click('ตัดวงจรเดี๋ยวนี้');
      await advance();

      expect(net.calls).toEqual([{ method: 'POST', url: '/api/admin/rig/stop', body: undefined }]);
      expect(jest.mocked(fetch).mock.calls[jest.mocked(fetch).mock.calls.length - 1][1]?.body).toBeUndefined();
      expect(rigPanel().getByRole('status')).toHaveTextContent('ตัดวงจรและปิดแหล่งจ่ายไฟแล้ว');
    });

    it.each<[string, Override, string]>([
      ['the server\'s reason when it refuses', refuse(502, { error: 'อุปกรณ์ไม่ตอบสนอง' }), 'อุปกรณ์ไม่ตอบสนอง'],
      ['a general message when it refuses without a reason', refuse(500), 'ตัดวงจรไม่สำเร็จ'],
      ['that the server cannot be reached when the network is down', offline, OFFLINE],
    ])('shows %s for the emergency stop, and does not claim the circuits were cut', async (_label, override, text) => {
      await arrive(admin(), override);

      click('ตัดวงจรทั้งหมด', rigPanel());
      click('ตัดวงจรเดี๋ยวนี้');
      await advance();

      expect(rigPanel().getByRole('alert')).toHaveTextContent(text);
      expect(screen.queryByText('ตัดวงจรและปิดแหล่งจ่ายไฟแล้ว')).not.toBeInTheDocument();
    });
  });

  describe('opening and closing a lab to booking', () => {
    it('says so when there are no labs', async () => {
      await show(admin({ labs: [] }));
      expect(labsPanel().getByText('ยังไม่มีการทดลองในระบบ')).toBeInTheDocument();
    });

    it('lists each lab by code and name with a switch showing whether it takes bookings', async () => {
      await show(admin({ labs: [lab(1), lab(2, { is_active: false })] }));

      expect(labsPanel().getByText('PHY101')).toBeInTheDocument();
      expect(labsPanel().getByText('การทดลองที่ 1')).toBeInTheDocument();
      expect(labSwitch('PHY101')).toBeChecked();
      expect(labSwitch('PHY102')).not.toBeChecked();
    });

    it('closes an open lab at once, says existing bookings stay, and reloads', async () => {
      const { net } = await arrive(admin({ labs: [lab(1), lab(2)] }));

      fireEvent.click(labSwitch('PHY102'));
      await advance();

      expect(net.calls).toEqual([
        { method: 'PATCH', url: '/api/admin/labs/lab-2', body: { is_active: false } },
        { method: 'GET', url: '/api/admin/overview?from=2026-03-10&days=7', body: undefined },
      ]);
      expect(labsPanel().getByRole('status')).toHaveTextContent('ปิดรับจอง PHY102 แล้ว รอบที่จองไว้ยังอยู่');
      expect(labSwitch('PHY102')).not.toBeChecked();
      expect(labSwitch('PHY101')).toBeChecked();
    });

    it('opens a closed lab', async () => {
      const { net } = await arrive(admin({ labs: [lab(1, { is_active: false })] }));

      fireEvent.click(labSwitch('PHY101'));
      await advance();

      expect(net.calls[0]).toEqual({ method: 'PATCH', url: '/api/admin/labs/lab-1', body: { is_active: true } });
      expect(labsPanel().getByRole('status')).toHaveTextContent('เปิดรับจอง PHY101 แล้ว');
      expect(labSwitch('PHY101')).toBeChecked();
    });

    it('locks the switch while the change is on its way', async () => {
      const reply = held();
      const { net } = await arrive(admin(), reply.override);

      fireEvent.click(labSwitch('PHY101'));
      await advance();
      expect(labSwitch('PHY101')).toBeDisabled();

      fireEvent.click(labSwitch('PHY101'));
      await advance();
      expect(net.requests()).toEqual(['PATCH /api/admin/labs/lab-1']);

      reply.release();
      await advance();
      expect(labSwitch('PHY101')).toBeEnabled();
    });

    it.each<[string, Override, string]>([
      ['the server\'s reason when it refuses', refuse(404, { error: 'ไม่พบการทดลอง' }), 'ไม่พบการทดลอง'],
      ['a general message when it refuses without a reason', refuse(500), 'เปลี่ยนสถานะไม่สำเร็จ'],
      ['that the server cannot be reached when the network is down', offline, OFFLINE],
    ])('shows %s, and the switch stays where it was', async (_label, override, text) => {
      await arrive(admin(), override);

      fireEvent.click(labSwitch('PHY101'));
      await advance();

      expect(labsPanel().getByRole('alert')).toHaveTextContent(text);
      expect(labsPanel().queryByRole('status')).not.toBeInTheDocument();
      expect(labSwitch('PHY101')).toBeChecked();
    });
  });

  describe('opening and closing instruments', () => {
    const sentDisabled = (call: Call) => [...(call.body as { disabled: string[] }).disabled].sort();

    it('lists every instrument on the rig, open unless the server says it is closed', async () => {
      await show(admin({ disabled: [COIL_2.script] }));

      expect(INSTRUMENTS).toHaveLength(4);
      for (const inst of INSTRUMENTS) {
        expect(labsPanel().getByText(inst.label)).toBeInTheDocument();
      }
      expect(instrumentSwitch(COIL_1.label)).toBeChecked();
      expect(instrumentSwitch(COIL_2.label)).not.toBeChecked();
      expect(instrumentSwitch(COIL_3.label)).toBeChecked();
      expect(instrumentSwitch(SOLENOID.label)).toBeChecked();
    });

    it('treats every instrument as open when the server sends no list', async () => {
      await show(admin());
      for (const inst of INSTRUMENTS) {
        expect(instrumentSwitch(inst.label)).toBeChecked();
      }
    });

    it('closes one instrument, keeping the ones already closed, and reloads', async () => {
      const { net } = await arrive(admin({ disabled: [SOLENOID.script] }));

      fireEvent.click(instrumentSwitch(COIL_2.label));
      await advance();

      expect(net.requests()).toEqual(['PATCH /api/admin/rig/instruments', OVERVIEW]);
      expect(Object.keys(net.calls[0].body as object)).toEqual(['disabled']);
      expect(sentDisabled(net.calls[0])).toEqual([COIL_2.script, SOLENOID.script].sort());
      expect(labsPanel().getByRole('status')).toHaveTextContent(`ปิดใช้งาน ${COIL_2.label} แล้ว`);
      expect(instrumentSwitch(COIL_2.label)).not.toBeChecked();
      expect(instrumentSwitch(SOLENOID.label)).not.toBeChecked();
      expect(instrumentSwitch(COIL_1.label)).toBeChecked();
    });

    it('opens a closed instrument, leaving the other closed ones closed', async () => {
      const { net } = await arrive(admin({ disabled: [COIL_1.script, SOLENOID.script] }));

      fireEvent.click(instrumentSwitch(SOLENOID.label));
      await advance();

      expect(net.calls[0]).toEqual({ method: 'PATCH', url: '/api/admin/rig/instruments', body: { disabled: [COIL_1.script] } });
      expect(labsPanel().getByRole('status')).toHaveTextContent(`เปิดใช้งาน ${SOLENOID.label} แล้ว`);
      expect(instrumentSwitch(SOLENOID.label)).toBeChecked();
      expect(instrumentSwitch(COIL_1.label)).not.toBeChecked();
    });

    it('closes all single coils at once and leaves the solenoid open', async () => {
      const { net } = await arrive(admin());

      click('ปิดขดลวดเดี่ยวทั้งหมด', labsPanel());
      await advance();

      expect(net.requests()).toEqual(['PATCH /api/admin/rig/instruments', OVERVIEW]);
      expect(sentDisabled(net.calls[0])).toEqual([...COILS].sort());
      expect(labsPanel().getByRole('status')).toHaveTextContent('ปิดการทดลองขดลวดเดี่ยวทั้งหมดแล้ว');
      expect(instrumentSwitch(SOLENOID.label)).toBeChecked();
      expect(instrumentSwitch(COIL_1.label)).not.toBeChecked();
      expect(labsPanel().getByRole('button', { name: 'เปิดขดลวดเดี่ยวทั้งหมด' })).toBeInTheDocument();
    });

    it('closes the remaining coils without listing any twice, and keeps a closed solenoid closed', async () => {
      const { net } = await arrive(admin({ disabled: [COIL_2.script, SOLENOID.script] }));

      click('ปิดขดลวดเดี่ยวทั้งหมด', labsPanel());
      await advance();

      expect(sentDisabled(net.calls[0])).toEqual([...COILS, SOLENOID.script].sort());
    });

    it('offers to open the coils only when all of them are closed, and opening them leaves the solenoid as it was', async () => {
      const { net } = await arrive(admin({ disabled: [...COILS, SOLENOID.script] }));
      expect(labsPanel().queryByRole('button', { name: 'ปิดขดลวดเดี่ยวทั้งหมด' })).not.toBeInTheDocument();

      click('เปิดขดลวดเดี่ยวทั้งหมด', labsPanel());
      await advance();

      expect(net.calls[0]).toEqual({ method: 'PATCH', url: '/api/admin/rig/instruments', body: { disabled: [SOLENOID.script] } });
      expect(labsPanel().getByRole('status')).toHaveTextContent('เปิดการทดลองขดลวดเดี่ยวทั้งหมดแล้ว');
      expect(instrumentSwitch(COIL_1.label)).toBeChecked();
      expect(instrumentSwitch(SOLENOID.label)).not.toBeChecked();
    });

    it('locks every instrument control while a change is on its way', async () => {
      const reply = held();
      const { net } = await arrive(admin(), reply.override);

      fireEvent.click(instrumentSwitch(COIL_1.label));
      await advance();
      for (const inst of INSTRUMENTS) {
        expect(instrumentSwitch(inst.label)).toBeDisabled();
      }
      expect(labsPanel().getByRole('button', { name: 'ปิดขดลวดเดี่ยวทั้งหมด' })).toBeDisabled();

      fireEvent.click(instrumentSwitch(COIL_2.label));
      click('ปิดขดลวดเดี่ยวทั้งหมด', labsPanel());
      await advance();
      expect(net.requests()).toEqual(['PATCH /api/admin/rig/instruments']);

      reply.release();
      await advance();
      expect(instrumentSwitch(COIL_1.label)).toBeEnabled();
    });

    it.each<[string, Override, string]>([
      ['the server\'s reason when it refuses', refuse(400, { error: 'ไม่รู้จักอุปกรณ์นี้' }), 'ไม่รู้จักอุปกรณ์นี้'],
      ['a general message when it refuses without a reason', refuse(500), 'เปลี่ยนสถานะไม่สำเร็จ'],
      ['that the server cannot be reached when the network is down', offline, OFFLINE],
    ])('shows %s, and the instrument stays open', async (_label, override, text) => {
      await arrive(admin(), override);

      fireEvent.click(instrumentSwitch(COIL_1.label));
      await advance();

      expect(labsPanel().getByRole('alert')).toHaveTextContent(text);
      expect(labsPanel().queryByRole('status')).not.toBeInTheDocument();
      expect(instrumentSwitch(COIL_1.label)).toBeChecked();
    });

    it('shows the failure and leaves the coils open when closing them all is refused', async () => {
      await arrive(admin(), refuse(500));

      click('ปิดขดลวดเดี่ยวทั้งหมด', labsPanel());
      await advance();

      expect(labsPanel().getByRole('alert')).toHaveTextContent('เปลี่ยนสถานะไม่สำเร็จ');
      expect(labsPanel().getByRole('button', { name: 'ปิดขดลวดเดี่ยวทั้งหมด' })).toBeInTheDocument();
      expect(instrumentSwitch(COIL_1.label)).toBeChecked();
    });
  });

  describe('closing a stretch of time', () => {
    const fill = (start: string, end: string, note = '') => {
      fireEvent.change(blockPanel().getByLabelText('เริ่ม'), { target: { value: start } });
      fireEvent.change(blockPanel().getByLabelText('สิ้นสุด'), { target: { value: end } });
      if (note) fireEvent.change(blockPanel().getByLabelText('เหตุผล (ไม่บังคับ)'), { target: { value: note } });
    };
    const submit = async () => {
      click('ปิดช่วงเวลา', blockPanel());
      await advance();
    };
    // The form's times carry no zone and mean the admin's own clock.
    const START = new Date(2026, 2, 12, 9, 0).toISOString();
    const END = new Date(2026, 2, 12, 11, 30).toISOString();

    it('sends the lab, both times as instants of the admin\'s own clock, and the reason', async () => {
      const { net } = await arrive(admin());

      fill('2026-03-12T09:00', '2026-03-12T11:30', 'ซ่อมหัววัด');
      await submit();

      expect(net.calls).toEqual([
        { method: 'POST', url: '/api/admin/blocks', body: { lab_id: 'lab-1', start_time: START, end_time: END, note: 'ซ่อมหัววัด' } },
        { method: 'GET', url: '/api/admin/overview?from=2026-03-10&days=7', body: undefined },
      ]);
    });

    it('says the stretch is closed, empties the form and shows the stretch in the table', async () => {
      await arrive(admin());

      fill('2026-03-12T09:00', '2026-03-12T11:30', 'ซ่อมหัววัด');
      await submit();

      expect(blockPanel().getByRole('status')).toHaveTextContent('ปิดช่วงเวลาแล้ว ยกเลิกได้จากตารางด้านล่าง');
      expect(blockPanel().getByLabelText('เริ่ม')).toHaveValue('');
      expect(blockPanel().getByLabelText('สิ้นสุด')).toHaveValue('');
      expect(blockPanel().getByLabelText('เหตุผล (ไม่บังคับ)')).toHaveValue('');
      expect(row('ซ่อมหัววัด').getByText('ปิดอยู่')).toBeInTheDocument();
    });

    it('sends an empty reason when none is given', async () => {
      const { net } = await arrive(admin());

      fill('2026-03-12T09:00', '2026-03-12T11:30');
      await submit();

      expect(net.calls[0].body).toEqual({ lab_id: 'lab-1', start_time: START, end_time: END, note: '' });
    });

    it.each<[string, string, string]>([
      ['neither time', '', ''],
      ['only the start', '2026-03-12T09:00', ''],
      ['only the end', '', '2026-03-12T11:30'],
    ])('asks for both times and sends nothing when %s is filled in', async (_label, start, end) => {
      const { net } = await arrive(admin());

      fill(start, end);
      await submit();

      expect(blockPanel().getByRole('alert')).toHaveTextContent('เลือกเวลาเริ่มและเวลาสิ้นสุด');
      expect(net.requests()).toEqual([]);
    });

    it('offers no choice of lab when there is only one', async () => {
      await show(admin());
      expect(blockPanel().queryByLabelText('การทดลอง')).not.toBeInTheDocument();
    });

    it('closes the first lab unless another is chosen, and the chosen one when it is', async () => {
      const { net } = await arrive(admin({ labs: [lab(1), lab(2)] }));
      expect(blockPanel().getByLabelText('การทดลอง')).toHaveValue('lab-1');
      expect(within(blockPanel().getByLabelText('การทดลอง')).getAllByRole('option').map(o => o.textContent)).toEqual(['PHY101', 'PHY102']);

      fireEvent.change(blockPanel().getByLabelText('การทดลอง'), { target: { value: 'lab-2' } });
      fill('2026-03-12T09:00', '2026-03-12T11:30');
      await submit();

      expect(net.calls[0].body).toEqual({ lab_id: 'lab-2', start_time: START, end_time: END, note: '' });
    });

    it('cannot be submitted when there is no lab to close', async () => {
      await show(admin({ labs: [] }));
      expect(blockPanel().getByRole('button', { name: 'ปิดช่วงเวลา' })).toBeDisabled();
    });

    it('says it is closing and cannot be submitted twice while the request is on its way', async () => {
      const reply = held();
      const { net } = await arrive(admin(), reply.override);

      fill('2026-03-12T09:00', '2026-03-12T11:30');
      await submit();

      const closing = blockPanel().getByRole('button', { name: 'กำลังปิด' });
      expect(closing).toBeDisabled();
      fireEvent.click(closing);
      await advance();
      expect(net.requests()).toEqual(['POST /api/admin/blocks']);

      reply.release();
      await advance();
      expect(blockPanel().getByRole('button', { name: 'ปิดช่วงเวลา' })).toBeEnabled();
    });

    it.each<[string, Override, string]>([
      ['the server\'s reason when it refuses', refuse(409, { error: 'มีการจองในช่วงนี้แล้ว' }), 'มีการจองในช่วงนี้แล้ว'],
      ['a general message when it refuses without a reason', refuse(500), 'ปิดช่วงเวลาไม่สำเร็จ'],
      ['that the server cannot be reached when the network is down', offline, OFFLINE],
    ])('shows %s, keeps what was typed and does not reload', async (_label, override, text) => {
      const { net } = await arrive(admin(), override);

      fill('2026-03-12T09:00', '2026-03-12T11:30', 'ซ่อมหัววัด');
      await submit();

      expect(blockPanel().getByRole('alert')).toHaveTextContent(text);
      expect(blockPanel().queryByRole('status')).not.toBeInTheDocument();
      expect(net.requests()).toEqual(['POST /api/admin/blocks']);
      expect(blockPanel().getByLabelText('เริ่ม')).toHaveValue('2026-03-12T09:00');
      expect(blockPanel().getByLabelText('สิ้นสุด')).toHaveValue('2026-03-12T11:30');
      expect(blockPanel().getByLabelText('เหตุผล (ไม่บังคับ)')).toHaveValue('ซ่อมหัววัด');
    });
  });

  describe('the booking table', () => {
    const everyStatus = () => [
      booking('pending', { status: 'pending' }),
      booking('confirmed', { status: 'confirmed' }),
      booking('running', { status: 'in_progress' }),
      booking('done', { status: 'completed' }),
      booking('gone', { status: 'cancelled' }),
    ];
    const names = () => rows().map(r => within(r).getByText(/^Student /).textContent);

    it('says so when there is nothing in the range', async () => {
      await show(admin());

      expect(screen.getByText('ไม่มีการจองในช่วงที่เลือก')).toBeInTheDocument();
      expect(screen.queryByRole('table')).not.toBeInTheDocument();
    });

    it('shows each booking\'s day and time in Bangkok, who booked it and its status', async () => {
      // 23:30 UTC on the 10th is 06:30 on the 11th in Bangkok.
      await show(admin({ bookings: [booking('a', { start_time: '2026-03-10T23:30:00.000Z', end_time: '2026-03-11T00:30:00.000Z' })] }));

      expect(table().getAllByRole('columnheader').map(th => th.textContent)).toEqual(['วัน', 'เวลา', 'ผู้จอง', 'สถานะ', 'จัดการ']);
      const cells = row('Student a').getAllByRole('cell');
      expect(cells[0]).toHaveTextContent('11 มี.ค.');
      expect(cells[1]).toHaveTextContent('06:30 ถึง 07:30');
      expect(cells[2]).toHaveTextContent('Student a');
      expect(cells[2]).toHaveTextContent('a@example.com');
      expect(cells[3]).toHaveTextContent('จองแล้ว');
    });

    it('shows the account id when the booker has no name', async () => {
      await show(admin({ bookings: [booking('a', { user: { uid: 'uid-a', name: '', email: '' } })] }));
      expect(rows()[0]).toHaveTextContent('uid-a');
    });

    it.each([
      ['pending', 'รอยืนยัน'],
      ['confirmed', 'จองแล้ว'],
      ['in_progress', 'กำลังทดลอง'],
      ['completed', 'เสร็จสิ้น'],
      ['cancelled', 'ยกเลิก'],
      ['no_show', 'no_show'],
    ])('labels a %s booking "%s"', async (status, label) => {
      await show(admin({ bookings: [booking('a', { status })] }));
      choose('สถานะ', 'all');

      expect(row('Student a').getAllByRole('cell')[3]).toHaveTextContent(new RegExp(`^${label}$`));
    });

    it('shows a closed stretch by its reason, marked closed, with no user', async () => {
      await show(admin({ bookings: [booking('a', { blocked: true, note: 'ซ่อมหัววัด' })] }));

      const cells = within(rows()[0]).getAllByRole('cell');
      expect(cells[2]).toHaveTextContent('ปิดช่วงเวลา: ซ่อมหัววัด');
      expect(cells[2]).not.toHaveTextContent('Student a');
      expect(cells[3]).toHaveTextContent(/^ปิดอยู่$/);
    });

    it('shows a closed stretch that was reopened as cancelled, not as closed', async () => {
      await show(admin({ bookings: [booking('a', { blocked: true, status: 'cancelled' })] }));
      choose('สถานะ', 'all');

      expect(within(rows()[0]).getAllByRole('cell')[3]).toHaveTextContent(/^ยกเลิก$/);
    });

    describe('filters', () => {
      it('starts with only the bookings still in use: pending, confirmed and running', async () => {
        await show(admin({ bookings: everyStatus() }));

        expect(screen.getByLabelText('สถานะ')).toHaveValue('active');
        expect(names()).toEqual(['Student pending', 'Student confirmed', 'Student running']);
      });

      it.each<[string, string[]]>([
        ['all', ['Student pending', 'Student confirmed', 'Student running', 'Student done', 'Student gone']],
        ['completed', ['Student done']],
        ['cancelled', ['Student gone']],
      ])('shows the right bookings for the status filter "%s", in the server\'s order, without asking the server', async (value, expected) => {
        const { net } = await arrive(admin({ bookings: everyStatus() }));

        choose('สถานะ', value);
        await advance();

        expect(names()).toEqual(expected);
        expect(net.requests()).toEqual([]);
      });

      it('says there is nothing when the status filter leaves no bookings', async () => {
        await show(admin({ bookings: [booking('a')] }));

        choose('สถานะ', 'completed');

        expect(screen.getByText('ไม่มีการจองในช่วงที่เลือก')).toBeInTheDocument();
        expect(screen.queryByRole('table')).not.toBeInTheDocument();
      });

      it('offers 1, 7, 14 and 30 days', async () => {
        await show(admin());
        expect(within(screen.getByLabelText('ช่วง')).getAllByRole('option').map(o => o.textContent)).toEqual(['1 วัน', '7 วัน', '14 วัน', '30 วัน']);
      });

      it('asks the server at once for the new number of days', async () => {
        const server = admin();
        const { net } = await arrive(server);
        server.bookings = [booking('later')];

        choose('ช่วง', '14');
        await advance();

        expect(net.requests()).toEqual(['GET /api/admin/overview?from=2026-03-10&days=14']);
        expect(names()).toEqual(['Student later']);
      });

      it('asks the server at once for the new start date', async () => {
        const { net } = await arrive(admin());

        choose('ตั้งแต่', '2026-04-01');
        await advance();

        expect(net.requests()).toEqual(['GET /api/admin/overview?from=2026-04-01&days=7']);
      });

      it('keeps refreshing the chosen range, every 30 seconds counted from the change', async () => {
        const { net } = await arrive(admin());
        await advance(20_000);

        choose('ช่วง', '30');
        await advance();
        net.clear();

        await advance(REFRESH - 1);
        expect(net.requests()).toEqual([]);
        await advance(1);
        expect(net.requests()).toEqual(['GET /api/admin/overview?from=2026-03-10&days=30']);
      });

      it('keeps the start date it had when the date field is cleared', async () => {
        const { net } = await arrive(admin());

        choose('ตั้งแต่', '');
        await advance();

        expect(screen.getByLabelText('ตั้งแต่')).toHaveValue('2026-03-10');
        expect(net.requests()).toEqual([]);
      });

      // With anime.js standing still the count would wait on an animation that
      // never plays; without motion the page writes the number straight away.
      it('shows how many bookings are listed beside the heading, following the status filter', async () => {
        media.set(REDUCED, true);
        await show(admin({ bookings: everyStatus() }));
        const heading = screen.getByRole('heading', { name: /^การจองทั้งหมด/ });

        expect(heading).toHaveTextContent(/^การจองทั้งหมด 3$/);
        choose('สถานะ', 'all');
        expect(heading).toHaveTextContent(/^การจองทั้งหมด 5$/);
        choose('สถานะ', 'cancelled');
        expect(heading).toHaveTextContent(/^การจองทั้งหมด 1$/);
      });

      it('counts zero when nothing is listed', async () => {
        media.set(REDUCED, true);
        await show(admin());
        expect(screen.getByRole('heading', { name: /^การจองทั้งหมด/ })).toHaveTextContent(/^การจองทั้งหมด 0$/);
      });
    });

    describe('cancelling', () => {
      const cancel = async (who: string) => {
        click('ยกเลิก', row(who));
        click('ยกเลิกการจอง', row(who));
        await advance();
      };

      it('can be done for pending and confirmed bookings only', async () => {
        await show(admin({ bookings: everyStatus() }));
        choose('สถานะ', 'all');

        expect(row('Student pending').getByRole('button', { name: 'ยกเลิก' })).toBeInTheDocument();
        expect(row('Student confirmed').getByRole('button', { name: 'ยกเลิก' })).toBeInTheDocument();
        for (const who of ['Student running', 'Student done', 'Student gone']) {
          expect(row(who).queryByRole('button')).not.toBeInTheDocument();
        }
      });

      it('cancels the booking on the server, says so and reloads', async () => {
        const { net } = await arrive(admin({ bookings: [booking('a'), booking('b')] }));

        await cancel('Student b');

        expect(net.calls).toEqual([
          { method: 'PATCH', url: '/api/admin/bookings/bk-b', body: { action: 'cancel' } },
          { method: 'GET', url: '/api/admin/overview?from=2026-03-10&days=7', body: undefined },
        ]);
        expect(screen.getByRole('status')).toHaveTextContent('ยกเลิกการจองแล้ว');
        expect(names()).toEqual(['Student a']);
      });

      it('shows the booking as cancelled, with nothing left to press, when all statuses are listed', async () => {
        await arrive(admin({ bookings: [booking('a')] }));
        choose('สถานะ', 'all');

        await cancel('Student a');

        expect(screen.getByRole('status')).toHaveTextContent('ยกเลิกการจองแล้ว');
        expect(row('Student a').getAllByRole('cell')[3]).toHaveTextContent(/^ยกเลิก$/);
        expect(row('Student a').queryByRole('button')).not.toBeInTheDocument();
      });

      // The table is replaced by the "nothing here" line; the message must outlive it.
      it('says the booking was cancelled even when it was the last one listed', async () => {
        await arrive(admin({ bookings: [booking('a')] }));

        await cancel('Student a');

        expect(screen.getByText('ไม่มีการจองในช่วงที่เลือก')).toBeInTheDocument();
        expect(screen.getByText('ยกเลิกการจองแล้ว')).toBeInTheDocument();
      });

      it('reopens a closed stretch with the same request, and says it is open again', async () => {
        const { net } = await arrive(admin({ bookings: [booking('a'), booking('b', { blocked: true, note: 'ซ่อม' })] }));

        click('เปิดคืน', row('ซ่อม'));
        expect(row('ซ่อม').getByText('เปิดช่วงนี้ให้จองได้อีกครั้ง')).toBeInTheDocument();
        click('เปิดคืน', row('ซ่อม'));
        await advance();

        expect(net.calls[0]).toEqual({ method: 'PATCH', url: '/api/admin/bookings/bk-b', body: { action: 'cancel' } });
        expect(screen.getByRole('status')).toHaveTextContent('เปิดช่วงเวลาคืนแล้ว');
        expect(names()).toEqual(['Student a']);
      });

      it.each<[string, Override, string]>([
        ['the server\'s reason when it refuses', refuse(409, { error: 'การจองนี้เริ่มไปแล้ว' }), 'การจองนี้เริ่มไปแล้ว'],
        ['a general message when it refuses without a reason', refuse(500), 'ยกเลิกไม่สำเร็จ'],
        ['a general message when it answers 200 but says it failed', call => (isAction(call) ? { body: { ok: false } } : undefined), 'ยกเลิกไม่สำเร็จ'],
        ['that the server cannot be reached when the network is down', offline, OFFLINE],
      ])('shows %s, and the booking stays listed and can be tried again', async (_label, override, text) => {
        await arrive(admin({ bookings: [booking('a')] }), override);

        await cancel('Student a');

        expect(screen.getByRole('alert')).toHaveTextContent(text);
        expect(screen.queryByRole('status')).not.toBeInTheDocument();
        expect(row('Student a').getAllByRole('cell')[3]).toHaveTextContent('จองแล้ว');
        expect(row('Student a').getByRole('button', { name: 'ยกเลิก' })).toBeInTheDocument();
      });
    });
  });

  describe('motion', () => {
    type AnimateCall = [unknown, Record<string, unknown>];
    const animations = () => anime.animate.mock.calls as unknown as AnimateCall[];
    const rowEntrances = () => animations().filter(([target]) => target instanceof NodeList && target[0] instanceof HTMLTableRowElement).length;

    // The comment in the page: rows come in when the table is first shown or
    // the filter changes, not on every refresh.
    it('brings the rows in when the table appears and when a filter changes, not on a refresh', async () => {
      await show(admin({ bookings: [booking('a'), booking('b', { status: 'completed' })] }));
      expect(rowEntrances()).toBe(1);

      await advance(REFRESH);
      expect(rowEntrances()).toBe(1);

      choose('สถานะ', 'all');
      expect(rowEntrances()).toBe(2);
    });

    it('counts the number of bookings up to its new value when the list changes', async () => {
      await show(admin({ bookings: [booking('a'), booking('b', { status: 'completed' })] }));
      const tallies = () => animations().filter(([target]) => typeof target === 'object' && target !== null && 'v' in target).map(([, to]) => to.v);
      expect(tallies()).toEqual([1]);

      choose('สถานะ', 'all');
      expect(tallies()).toEqual([1, 2]);
    });

    it('animates nothing when the admin asked for reduced motion', async () => {
      media.set(REDUCED, true);
      await show(admin({ bookings: [booking('a')], running: [booking('b')] }));

      fireEvent.click(labSwitch('PHY101'));
      await advance();
      fireEvent.click(instrumentSwitch(COIL_1.label));
      await advance();
      click('สิ้นสุดรอบนี้', roomPanel());
      choose('สถานะ', 'all');

      expect(anime.animate).not.toHaveBeenCalled();
    });

    // anime.js is not running here, so anything that waited on it to become
    // visible would still be hidden.
    it('leaves the heading readable and the panels visible without the animation', async () => {
      await show(admin({ bookings: [booking('a')] }));

      expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent('ผู้ดูแลระบบ');
      expect((screen.getByRole('heading', { name: 'อุปกรณ์' }).parentElement as HTMLElement).style.opacity).toBe('');
      expect(rows()[0].style.opacity).toBe('');
    });
  });
});
