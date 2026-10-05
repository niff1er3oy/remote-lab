import { fireEvent, render, screen } from '@testing-library/react';
import BookingCalendar, { type SlotStatus } from '@/app/components/BookingCalendar';
import { REDUCED_MOTION } from '@/lib/motion';
import type { AnimeMock } from '../helpers/client/anime';
import { advance, mockFetch, type Call, type Reply } from '../helpers/client/fetch';
import { installMatchMedia } from '../helpers/client/matchMedia';

jest.mock('animejs', () => jest.requireActual<typeof import('../helpers/client/anime')>('../helpers/client/anime').animeMock());

const anime = jest.requireMock<AnimeMock>('animejs');

// Tuesday 10 March 2026, 09:30 on the visitor's own clock. Slots are two hours
// long, so today's 00:00 to 06:00 slots are over and the 08:00 one is running.
const NOW = new Date(2026, 2, 10, 9, 30);
const DATES = ['10/3/26', '11/3/26', '12/3/26', '13/3/26', '14/3/26', '15/3/26', '16/3/26'];
const LAB8 = { room_id: 'room-8', code: 'LAB8', name_th: 'สนามแม่เหล็ก', name_en: 'Magnetic field' };
const LAB5 = { room_id: 'room-5', code: 'LAB5', name_th: 'ลูกตุ้ม', name_en: 'Pendulum' };

const TITLE = {
  free: 'คลิกเพื่อเลือก',
  mine: 'จองแล้ว (ของคุณ)',
  taken: 'จองแล้ว (คนอื่น)',
  held: 'กำลังเลือก — กดยืนยัน',
  past: 'เวลาผ่านไปแล้ว',
};

// The server as the calendar sees it. Slots are keyed "row-column": the row
// is the time of day (0 = 00:00, 7 = 14:00, 11 = 22:00), the column the day
// (0 = today). Anything not listed is free.
type World = {
  loggedIn: boolean;
  slots: Record<string, Record<string, SlotStatus>>;
  mine: Record<string, Record<string, string>>;
  availability?: () => Reply;
  book?: (call: Call) => Reply | Promise<Reply>;
  cancel?: (call: Call) => Reply | Promise<Reply>;
};

const world = (overrides: Partial<World> = {}): World => ({
  loggedIn: true,
  slots: { 'room-8': {}, 'room-5': {} },
  mine: {},
  ...overrides,
});

function give(w: World, room: string, key: string, bookingId: string) {
  w.slots[room] = { ...w.slots[room], [key]: 'mine' };
  w.mine[room] = { ...w.mine[room], [key]: bookingId };
}

function serve(w: World) {
  return mockFetch(call => {
    if (call.url === '/api/bookings/availability') {
      if (w.availability) return w.availability();
      const slots_by_room = Object.fromEntries(Object.entries(w.slots).map(([room, taken]) => [
        room,
        Array.from({ length: 12 }, (_, ti) => Array.from({ length: 7 }, (_, di) => taken[`${ti}-${di}`] ?? 'free')),
      ]));
      return { body: { ok: true, rooms: [LAB8, LAB5], slots_by_room, mine_booking_ids: w.mine, dates: DATES, logged_in: w.loggedIn } };
    }
    if (call.url === '/api/bookings' && call.method === 'POST') return w.book ? w.book(call) : { body: { ok: true } };
    if (call.url.startsWith('/api/bookings/') && call.method === 'PATCH') return w.cancel ? w.cancel(call) : { body: { ok: true } };
    throw new Error(`unexpected request ${call.method} ${call.url}`);
  });
}

async function show(w: World, props: React.ComponentProps<typeof BookingCalendar> = {}) {
  const net = serve(w);
  const view = render(<BookingCalendar {...props} />);
  await advance();
  return { net, ...view };
}

// The slots have no role or name, so they can only be found by position.
const slot = (ti: number, di: number) => document.querySelector(`[data-slot="${ti}-${di}"]`) as HTMLElement;
const pick = (ti: number, di: number) => fireEvent.click(slot(ti, di));
const button = (name: string | RegExp) => screen.getByRole('button', { name });
const queryButton = (name: string | RegExp) => screen.queryByRole('button', { name });

// The app sends the slot's start and end as UTC, "YYYY-MM-DD HH:00:00".
const utc = (local: Date) => local.toISOString().slice(0, 19).replace('T', ' ');

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>(r => { resolve = r; });
  return { promise, resolve };
}

beforeEach(() => {
  jest.clearAllMocks();
  jest.useFakeTimers();
  jest.setSystemTime(NOW);
  installMatchMedia();
});

afterEach(() => {
  jest.useRealTimers();
});

describe('BookingCalendar', () => {
  describe('what the week looks like', () => {
    it('shows the seven days the server sent, with today marked', async () => {
      await show(world());

      for (const date of DATES) expect(screen.getByText(date)).toBeInTheDocument();
      expect(screen.getAllByText('วันนี้')).toHaveLength(1);
      expect(screen.getByText('วันนี้').parentElement).toHaveTextContent('10/3/26');
    });

    it('has a row for every two-hour slot of the day', async () => {
      await show(world());

      for (const time of ['00:00', '02:00', '12:00', '22:00']) expect(screen.getByText(time)).toBeInTheDocument();
      expect(document.querySelectorAll('[data-slot]')).toHaveLength(12 * 7);
    });

    it('tells a signed-in user which slots are free, their own, or someone else\'s', async () => {
      const w = world({ slots: { 'room-8': { '8-0': 'taken' }, 'room-5': {} } });
      give(w, 'room-8', '7-0', 'bk-1');
      await show(w);

      expect(slot(6, 0)).toHaveAttribute('title', TITLE.free);
      expect(slot(7, 0)).toHaveAttribute('title', TITLE.mine);
      expect(slot(8, 0)).toHaveAttribute('title', TITLE.taken);
    });

    it('gives free, own, taken and past slots four different looks', async () => {
      const w = world({ slots: { 'room-8': { '8-1': 'taken' }, 'room-5': {} } });
      give(w, 'room-8', '7-1', 'bk-1');
      await show(w);

      const looks = [slot(6, 1), slot(7, 1), slot(8, 1), slot(0, 0)].map(el => el.className);
      expect(new Set(looks).size).toBe(4);
    });

    it('starts from this week on the visitor\'s own calendar until the server answers', () => {
      jest.setSystemTime(new Date(2026, 1, 27, 9, 30));
      mockFetch(() => new Promise<Reply>(() => {}));
      render(<BookingCalendar />);

      for (const date of ['27/2/26', '28/2/26', '1/3/26', '2/3/26', '3/3/26', '4/3/26', '5/3/26']) {
        expect(screen.getByText(date)).toBeInTheDocument();
      }
    });

    it('offers a button for each room and shows the first room\'s bookings', async () => {
      const w = world({ slots: { 'room-8': { '8-0': 'taken' }, 'room-5': { '9-0': 'taken' } } });
      await show(w);

      expect(button(/LAB8/)).toBeInTheDocument();
      expect(button(/LAB5/)).toBeInTheDocument();
      expect(slot(8, 0)).toHaveAttribute('title', TITLE.taken);
      expect(slot(9, 0)).toHaveAttribute('title', TITLE.free);
    });

    it('shows another room\'s bookings when that room is chosen', async () => {
      const w = world({ slots: { 'room-8': { '8-0': 'taken' }, 'room-5': { '9-0': 'taken' } } });
      await show(w);

      fireEvent.click(button(/LAB5/));

      expect(slot(8, 0)).toHaveAttribute('title', TITLE.free);
      expect(slot(9, 0)).toHaveAttribute('title', TITLE.taken);
    });

    it('carries its marketing heading on the landing page and a short one inside the dashboard', async () => {
      const landing = await show(world());
      expect(screen.getByRole('heading', { name: 'จองเวลาทดลองแบบ Real-time' })).toBeInTheDocument();
      landing.unmount();

      await show(world(), { embedded: true });
      expect(screen.getByRole('heading', { name: 'จองช่วงเวลา' })).toBeInTheDocument();
      expect(screen.queryByRole('heading', { name: 'จองเวลาทดลองแบบ Real-time' })).not.toBeInTheDocument();
    });
  });

  describe('slots in the past', () => {
    it('marks today\'s finished slots as past and leaves the running one bookable', async () => {
      await show(world());

      for (const ti of [0, 1, 2, 3]) expect(slot(ti, 0)).toHaveAttribute('title', TITLE.past);
      expect(slot(4, 0)).toHaveAttribute('title', TITLE.free);
      expect(slot(5, 0)).toHaveAttribute('title', TITLE.free);
    });

    it('does not mark the same early hours of tomorrow as past', async () => {
      await show(world());
      expect(slot(0, 1)).toHaveAttribute('title', TITLE.free);
    });

    it('counts a slot as past from the moment it ends', async () => {
      jest.setSystemTime(new Date(2026, 2, 10, 10, 0, 0));
      await show(world());

      expect(slot(4, 0)).toHaveAttribute('title', TITLE.past);
      expect(slot(5, 0)).toHaveAttribute('title', TITLE.free);
    });

    it('still counts a slot as open one second before it ends', async () => {
      jest.setSystemTime(new Date(2026, 2, 10, 9, 59, 59));
      await show(world());
      expect(slot(4, 0)).toHaveAttribute('title', TITLE.free);
    });

    it('does not let a past slot be picked', async () => {
      const { net } = await show(world());
      net.clear();

      pick(2, 0);

      expect(queryButton('ยืนยันการจอง')).not.toBeInTheDocument();
      expect(slot(2, 0)).toHaveAttribute('title', TITLE.past);
      expect(net.calls).toEqual([]);
    });

    it('does not offer to cancel a booking of your own that is already over', async () => {
      const w = world();
      give(w, 'room-8', '2-0', 'bk-old');
      await show(w);

      pick(2, 0);

      expect(slot(2, 0)).toHaveAttribute('title', TITLE.mine);
      expect(queryButton('ยืนยันยกเลิก')).not.toBeInTheDocument();
    });
  });

  describe('picking a free slot', () => {
    it('asks for confirmation, naming the room, the day and the two hours', async () => {
      const { net } = await show(world());
      net.clear();

      pick(7, 0);

      expect(screen.getByText('ห้อง LAB8 — สนามแม่เหล็ก')).toBeInTheDocument();
      expect(screen.getByText('10/3/26 · 14:00 – 16:00')).toBeInTheDocument();
      expect(button('ยืนยันการจอง')).toBeEnabled();
      expect(slot(7, 0)).toHaveAttribute('title', TITLE.held);
      expect(net.calls).toEqual([]);
    });

    it('shows the last slot of the day as ending at midnight', async () => {
      await show(world());
      pick(11, 2);
      expect(screen.getByText('12/3/26 · 22:00 – 00:00')).toBeInTheDocument();
    });

    it('lets go of the slot when it is clicked again', async () => {
      await show(world());

      pick(7, 0);
      pick(7, 0);

      expect(queryButton('ยืนยันการจอง')).not.toBeInTheDocument();
      expect(slot(7, 0)).toHaveAttribute('title', TITLE.free);
    });

    it('lets go of the slot when the choice is cancelled, sending nothing', async () => {
      const { net } = await show(world());
      net.clear();

      pick(7, 0);
      fireEvent.click(button('ยกเลิก'));

      expect(queryButton('ยืนยันการจอง')).not.toBeInTheDocument();
      expect(slot(7, 0)).toHaveAttribute('title', TITLE.free);
      expect(net.calls).toEqual([]);
    });

    it('holds only one slot at a time', async () => {
      await show(world());

      pick(7, 0);
      pick(9, 3);

      expect(slot(7, 0)).toHaveAttribute('title', TITLE.free);
      expect(slot(9, 3)).toHaveAttribute('title', TITLE.held);
      expect(screen.getByText('13/3/26 · 18:00 – 20:00')).toBeInTheDocument();
      expect(screen.getAllByRole('button', { name: 'ยืนยันการจอง' })).toHaveLength(1);
    });

    it('does nothing when the slot belongs to someone else', async () => {
      await show(world({ slots: { 'room-8': { '8-0': 'taken' }, 'room-5': {} } }));

      pick(8, 0);

      expect(queryButton('ยืนยันการจอง')).not.toBeInTheDocument();
      expect(queryButton('ยืนยันยกเลิก')).not.toBeInTheDocument();
      expect(slot(8, 0)).toHaveAttribute('title', TITLE.taken);
    });

    it('drops the choice when another room is chosen', async () => {
      await show(world());

      pick(7, 0);
      fireEvent.click(button(/LAB5/));

      expect(queryButton('ยืนยันการจอง')).not.toBeInTheDocument();
      expect(slot(7, 0)).toHaveAttribute('title', TITLE.free);
    });
  });

  describe('confirming a booking', () => {
    it('sends the room and the slot\'s start and end in UTC, and nothing else', async () => {
      const { net } = await show(world());
      net.clear();

      pick(7, 0);
      fireEvent.click(button('ยืนยันการจอง'));
      await advance();

      expect(net.calls[0]).toEqual({
        method: 'POST',
        url: '/api/bookings',
        body: {
          room_id: 'room-8',
          start_time: utc(new Date(2026, 2, 10, 14)),
          end_time: utc(new Date(2026, 2, 10, 16)),
        },
      });
      expect(net.requests().filter(r => r === 'POST /api/bookings')).toHaveLength(1);
    });

    it('sends the following midnight as the end of the last slot of a day', async () => {
      const { net } = await show(world());
      net.clear();

      pick(11, 6);
      fireEvent.click(button('ยืนยันการจอง'));
      await advance();

      expect(net.calls[0].body).toEqual({
        room_id: 'room-8',
        start_time: utc(new Date(2026, 2, 16, 22)),
        end_time: utc(new Date(2026, 2, 17, 0)),
      });
    });

    it('books in the room that is selected', async () => {
      const { net } = await show(world());
      fireEvent.click(button(/LAB5/));
      net.clear();

      pick(7, 1);
      expect(screen.getByText('ห้อง LAB5 — ลูกตุ้ม')).toBeInTheDocument();
      fireEvent.click(button('ยืนยันการจอง'));
      await advance();

      expect(net.calls[0].body).toMatchObject({ room_id: 'room-5', start_time: utc(new Date(2026, 2, 11, 14)) });
    });

    it('shows the slot as yours and says the booking succeeded', async () => {
      const w = world();
      w.book = () => { give(w, 'room-8', '7-0', 'bk-new'); return { body: { ok: true } }; };
      await show(w);

      pick(7, 0);
      fireEvent.click(button('ยืนยันการจอง'));
      await advance();

      expect(screen.getByRole('status')).toHaveTextContent('จองสำเร็จ!');
      expect(slot(7, 0)).toHaveAttribute('title', TITLE.mine);
      expect(queryButton('ยืนยันการจอง')).not.toBeInTheDocument();
    });

    it('tells the page and the notification feed, and reloads the calendar', async () => {
      const onBookingCreated = jest.fn();
      const heard = jest.fn();
      window.addEventListener('booking-created', heard);
      const { net } = await show(world(), { onBookingCreated });
      net.clear();

      pick(7, 0);
      fireEvent.click(button('ยืนยันการจอง'));
      await advance();
      window.removeEventListener('booking-created', heard);

      expect(onBookingCreated).toHaveBeenCalledTimes(1);
      expect(heard).toHaveBeenCalledTimes(1);
      expect(net.requests()).toEqual(['POST /api/bookings', 'GET /api/bookings/availability']);
    });

    it('takes the success message away after three seconds', async () => {
      await show(world());

      pick(7, 0);
      fireEvent.click(button('ยืนยันการจอง'));
      await advance();

      await advance(2999);
      expect(screen.getByRole('status')).toHaveTextContent('จองสำเร็จ!');
      await advance(1);
      expect(screen.queryByRole('status')).not.toBeInTheDocument();
    });

    it('cannot be sent twice while the first request is still on its way', async () => {
      const reply = deferred<Reply>();
      const { net } = await show(world({ book: () => reply.promise }));
      net.clear();

      pick(7, 0);
      fireEvent.click(button('ยืนยันการจอง'));
      await advance();
      expect(button('ยืนยันการจอง')).toBeDisabled();
      fireEvent.click(button('ยืนยันการจอง'));

      reply.resolve({ body: { ok: true } });
      await advance();

      expect(net.requests().filter(r => r === 'POST /api/bookings')).toHaveLength(1);
    });
  });

  describe('when the server turns a booking down', () => {
    it('shows the server\'s reason and keeps the slot selected so it can be retried', async () => {
      const onBookingCreated = jest.fn();
      const heard = jest.fn();
      window.addEventListener('booking-created', heard);
      const w = world({ book: () => ({ status: 409, body: { ok: false, error: 'ช่วงเวลานี้ถูกจองแล้ว' } }) });
      await show(w, { onBookingCreated });

      pick(7, 0);
      fireEvent.click(button('ยืนยันการจอง'));
      await advance();
      window.removeEventListener('booking-created', heard);

      expect(screen.getByRole('status')).toHaveTextContent('ช่วงเวลานี้ถูกจองแล้ว');
      expect(button('ยืนยันการจอง')).toBeEnabled();
      expect(slot(7, 0)).toHaveAttribute('title', TITLE.held);
      expect(onBookingCreated).not.toHaveBeenCalled();
      expect(heard).not.toHaveBeenCalled();
    });

    it('shows a general error when the server gives no reason', async () => {
      await show(world({ book: () => ({ status: 500, body: { ok: false } }) }));

      pick(7, 0);
      fireEvent.click(button('ยืนยันการจอง'));
      await advance();

      expect(screen.getByRole('status')).toHaveTextContent('เกิดข้อผิดพลาด');
    });

    it('says it could not connect when the request never arrives', async () => {
      await show(world({ book: () => { throw new Error('offline'); } }));

      pick(7, 0);
      fireEvent.click(button('ยืนยันการจอง'));
      await advance();

      expect(screen.getByRole('status')).toHaveTextContent('ไม่สามารถเชื่อมต่อได้');
      expect(button('ยืนยันการจอง')).toBeEnabled();
      expect(slot(7, 0)).toHaveAttribute('title', TITLE.held);
    });

    it('keeps the error on screen; it does not time out like a success message', async () => {
      await show(world({ book: () => ({ status: 409, body: { ok: false, error: 'ช่วงเวลานี้ถูกจองแล้ว' } }) }));

      pick(7, 0);
      fireEvent.click(button('ยืนยันการจอง'));
      await advance();
      await advance(60_000);

      expect(screen.getByRole('status')).toHaveTextContent('ช่วงเวลานี้ถูกจองแล้ว');
    });

    it('clears the error as soon as another slot is picked', async () => {
      await show(world({ book: () => ({ status: 409, body: { ok: false, error: 'ช่วงเวลานี้ถูกจองแล้ว' } }) }));

      pick(7, 0);
      fireEvent.click(button('ยืนยันการจอง'));
      await advance();
      pick(9, 0);

      expect(screen.queryByRole('status')).not.toBeInTheDocument();
    });

    // The three-second timer started by a success must not also remove
    // whatever message replaced the success in the meantime.
    it('keeps an error that follows a success on screen past the success message\'s three seconds', async () => {
      const w = world();
      await show(w);

      pick(7, 0);
      fireEvent.click(button('ยืนยันการจอง'));
      await advance();
      expect(screen.getByRole('status')).toHaveTextContent('จองสำเร็จ!');

      await advance(2000);
      w.book = () => ({ status: 409, body: { ok: false, error: 'ช่วงเวลานี้ถูกจองแล้ว' } });
      pick(9, 0);
      fireEvent.click(button('ยืนยันการจอง'));
      await advance();
      expect(screen.getByRole('status')).toHaveTextContent('ช่วงเวลานี้ถูกจองแล้ว');

      await advance(1500);
      expect(screen.getByRole('status')).toHaveTextContent('ช่วงเวลานี้ถูกจองแล้ว');
    });
  });

  describe('cancelling your own slot', () => {
    const withBooking = () => {
      const w = world();
      give(w, 'room-8', '7-0', 'bk-1');
      return w;
    };

    it('asks before cancelling, naming the room and the time', async () => {
      const { net } = await show(withBooking());
      net.clear();

      pick(7, 0);

      expect(screen.getByText('ยกเลิกการจอง — ห้อง LAB8')).toBeInTheDocument();
      expect(screen.getByText('10/3/26 · 14:00 – 16:00')).toBeInTheDocument();
      expect(button('ยืนยันยกเลิก')).toBeEnabled();
      expect(net.calls).toEqual([]);
    });

    it('keeps the booking when the question is closed', async () => {
      const { net } = await show(withBooking());
      net.clear();

      pick(7, 0);
      fireEvent.click(button('ปิด'));

      expect(queryButton('ยืนยันยกเลิก')).not.toBeInTheDocument();
      expect(slot(7, 0)).toHaveAttribute('title', TITLE.mine);
      expect(net.calls).toEqual([]);
    });

    it('closes the question when the slot is clicked again', async () => {
      await show(withBooking());

      pick(7, 0);
      pick(7, 0);

      expect(queryButton('ยืนยันยกเลิก')).not.toBeInTheDocument();
    });

    it('asks the server to cancel that booking, by its id', async () => {
      const { net } = await show(withBooking());
      net.clear();

      pick(7, 0);
      fireEvent.click(button('ยืนยันยกเลิก'));
      await advance();

      expect(net.calls[0]).toEqual({ method: 'PATCH', url: '/api/bookings/bk-1', body: undefined });
    });

    it('frees the slot, says so, tells the page and reloads the calendar', async () => {
      const onBookingCancelled = jest.fn();
      const w = withBooking();
      w.cancel = () => { w.slots['room-8'] = {}; w.mine = {}; return { body: { ok: true } }; };
      const { net } = await show(w, { onBookingCancelled });
      net.clear();

      pick(7, 0);
      fireEvent.click(button('ยืนยันยกเลิก'));
      await advance();

      expect(slot(7, 0)).toHaveAttribute('title', TITLE.free);
      expect(screen.getByRole('status')).toHaveTextContent('ยกเลิกการจองเรียบร้อยแล้ว');
      expect(queryButton('ยืนยันยกเลิก')).not.toBeInTheDocument();
      expect(onBookingCancelled).toHaveBeenCalledTimes(1);
      expect(net.requests()).toEqual(['PATCH /api/bookings/bk-1', 'GET /api/bookings/availability']);

      await advance(3000);
      expect(screen.queryByRole('status')).not.toBeInTheDocument();
    });

    it('cannot be sent twice while the first request is still on its way', async () => {
      const reply = deferred<Reply>();
      const w = withBooking();
      w.cancel = () => reply.promise;
      const { net } = await show(w);
      net.clear();

      pick(7, 0);
      fireEvent.click(button('ยืนยันยกเลิก'));
      await advance();
      expect(button('ยืนยันยกเลิก')).toBeDisabled();
      fireEvent.click(button('ยืนยันยกเลิก'));

      reply.resolve({ body: { ok: true } });
      await advance();

      expect(net.requests().filter(r => r.startsWith('PATCH'))).toHaveLength(1);
    });

    it('keeps the booking and shows the server\'s reason when the server refuses', async () => {
      const onBookingCancelled = jest.fn();
      const w = withBooking();
      w.cancel = () => ({ status: 403, body: { ok: false, error: 'ยกเลิกไม่ได้' } });
      await show(w, { onBookingCancelled });

      pick(7, 0);
      fireEvent.click(button('ยืนยันยกเลิก'));
      await advance();

      expect(screen.getByRole('status')).toHaveTextContent('ยกเลิกไม่ได้');
      expect(slot(7, 0)).toHaveAttribute('title', TITLE.mine);
      expect(button('ยืนยันยกเลิก')).toBeEnabled();
      expect(onBookingCancelled).not.toHaveBeenCalled();
    });

    it('keeps the booking and says it could not connect when the request never arrives', async () => {
      const w = withBooking();
      w.cancel = () => { throw new Error('offline'); };
      await show(w);

      pick(7, 0);
      fireEvent.click(button('ยืนยันยกเลิก'));
      await advance();

      expect(screen.getByRole('status')).toHaveTextContent('ไม่สามารถเชื่อมต่อได้');
      expect(slot(7, 0)).toHaveAttribute('title', TITLE.mine);
    });

    it('swaps the booking question for the cancelling one when you move from a free slot to your own', async () => {
      await show(withBooking());

      pick(9, 0);
      pick(7, 0);

      expect(queryButton('ยืนยันการจอง')).not.toBeInTheDocument();
      expect(button('ยืนยันยกเลิก')).toBeInTheDocument();
      expect(slot(9, 0)).toHaveAttribute('title', TITLE.free);
    });

    it('lets a slot that was just booked be cancelled straight away', async () => {
      const w = world();
      w.book = () => { give(w, 'room-8', '7-0', 'bk-new'); return { body: { ok: true } }; };
      const { net } = await show(w);

      pick(7, 0);
      fireEvent.click(button('ยืนยันการจอง'));
      await advance();
      net.clear();
      pick(7, 0);
      fireEvent.click(button('ยืนยันยกเลิก'));
      await advance();

      expect(net.requests()[0]).toBe('PATCH /api/bookings/bk-new');
    });
  });

  describe('for a signed-out visitor', () => {
    const signedOut = () => world({ loggedIn: false, slots: { 'room-8': { '8-0': 'taken' }, 'room-5': {} } });

    it('shows which slots are taken but does not invite a click on the free ones', async () => {
      await show(signedOut());

      expect(slot(8, 0)).toHaveAttribute('title', TITLE.taken);
      expect(slot(7, 0)).toHaveAttribute('title', '');
    });

    it('links to the login page instead of taking a booking', async () => {
      const { net } = await show(signedOut());
      net.clear();

      pick(7, 0);

      expect(screen.getByRole('link', { name: /เข้าสู่ระบบเพื่อจอง/ })).toHaveAttribute('href', '/login');
      expect(queryButton('ยืนยันการจอง')).not.toBeInTheDocument();
      expect(slot(7, 0)).toHaveAttribute('title', '');
      expect(net.calls).toEqual([]);
    });

    it('does not show the login link to someone who is signed in', async () => {
      await show(world());
      expect(screen.queryByRole('link', { name: /เข้าสู่ระบบเพื่อจอง/ })).not.toBeInTheDocument();
    });
  });

  describe('loading', () => {
    it('asks the server for availability once when it appears', async () => {
      const { net } = await show(world());
      expect(net.requests()).toEqual(['GET /api/bookings/availability']);
    });

    it('reloads when the page changes its refresh key, staying on the chosen room', async () => {
      const w = world({ slots: { 'room-8': {}, 'room-5': { '9-0': 'taken' } } });
      const { net, rerender } = await show(w, { refreshKey: 0 });
      fireEvent.click(button(/LAB5/));
      net.clear();

      w.slots['room-5'] = { '9-0': 'taken', '10-0': 'taken' };
      rerender(<BookingCalendar refreshKey={1} />);
      await advance();

      expect(net.requests()).toEqual(['GET /api/bookings/availability']);
      expect(slot(9, 0)).toHaveAttribute('title', TITLE.taken);
      expect(slot(10, 0)).toHaveAttribute('title', TITLE.taken);
    });

    it('still shows a week, with no rooms to choose, when the server reports a failure', async () => {
      await show(world({ availability: () => ({ status: 500, body: { ok: false, error: 'failed' } }) }));

      expect(document.querySelectorAll('[data-slot]')).toHaveLength(12 * 7);
      expect(screen.getByText('10/3/26')).toBeInTheDocument();
      expect(queryButton(/LAB8/)).not.toBeInTheDocument();
    });
  });

  describe('motion', () => {
    const rippled = () => anime.animate.mock.calls.some(call => 'scale' in ((call as unknown[])[1] as object));

    it('ripples the slots in when embedded in the dashboard', async () => {
      await show(world(), { embedded: true, scrollAnimate: false });
      expect(rippled()).toBe(true);
    });

    it('skips the ripple when motion is reduced', async () => {
      installMatchMedia({ [REDUCED_MOTION]: true });
      await show(world(), { embedded: true, scrollAnimate: false });
      expect(rippled()).toBe(false);
    });

    it('starts no scroll animation when the page turns it off', async () => {
      await show(world(), { scrollAnimate: false });

      expect(anime.onScroll).not.toHaveBeenCalled();
      expect(anime.animate).not.toHaveBeenCalled();
    });
  });
});
