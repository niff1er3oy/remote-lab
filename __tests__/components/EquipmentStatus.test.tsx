import { render, screen, within } from '@testing-library/react';
import EquipmentStatus from '@/app/admin/EquipmentStatus';
import type { AnimeMock } from '../helpers/client/anime';
import { advance, mockFetch, type Reply } from '../helpers/client/fetch';
import { installMatchMedia, type MediaControl } from '../helpers/client/matchMedia';

jest.mock('animejs', () => jest.requireActual<typeof import('../helpers/client/anime')>('../helpers/client/anime').animeMock());

const anime = jest.requireMock<AnimeMock>('animejs');

// 19:00:00 in Bangkok, the time zone the section shows its clock in.
const NOW = new Date('2026-03-10T12:00:00.000Z');
const POLL = 10_000;
const REDUCED = '(prefers-reduced-motion: reduce)';

const CHECKING = 'กำลังตรวจ';
const ONLINE = 'ออนไลน์';
const OFFLINE = 'ไม่ตอบสนอง';
const UNSET = 'ยังไม่ได้ตั้งค่า';
const CANNOT_READ = 'อ่านสถานะไม่ได้ กำลังลองใหม่';
const NO_CIRCUIT = 'ไม่มีวงจรที่เปิดอยู่';
const NOTHING_SENT = 'ยังไม่มีคำสั่งตั้งแต่เซิร์ฟเวอร์เริ่มทำงาน';
const BUSY = 'กำลังทำตามคำสั่ง';
const MAIN_CAMERA = 'กล้องหลัก';
const SOLENOID_CAMERA = 'กล้องเสริม (โซลีนอยด์)';
const COIL_CAMERA = 'กล้องเสริม (ขดลวด)';
const SENSOR = 'เซนเซอร์สนามแม่เหล็ก';
const CIRCUIT_LABELS = ['1 รอบ', '2 รอบ', '3 รอบ', 'โซลีนอยด์'];

type Reach = 'online' | 'offline' | 'unset';
type Rig = { busy: boolean; circuit: string | null; position: number | null; supply: boolean | null; relay?: string | null; last: { command: string; ok: boolean; at: number } | null };
type Status = { ok: boolean; checked_at: string; rig: Rig; cameras: Array<{ key: string; state: Reach }>; sensor: Reach };

const sent = (command: string, ok = true) => ({ command, ok, at: NOW.getTime() - 60_000 });

const rig = (overrides: Partial<Rig> = {}): Rig => ({ busy: false, circuit: null, position: null, supply: null, last: null, ...overrides });

const cameras = (cam1: Reach = 'online', cam2: Reach = 'online', cam3: Reach = 'online') =>
  [{ key: 'cam1', state: cam1 }, { key: 'cam2', state: cam2 }, { key: 'cam3', state: cam3 }];

// What the server would answer at the moment it is asked.
const status = (overrides: Partial<Status> = {}): Status => ({
  ok: true,
  checked_at: new Date().toISOString(),
  rig: rig(),
  cameras: cameras(),
  sensor: 'online',
  ...overrides,
});

type Server = { answer: () => Reply };

async function show(first: () => Reply = () => ({ body: status() })) {
  const server: Server = { answer: first };
  const net = mockFetch(() => server.answer());
  const view = render(<EquipmentStatus />);
  await advance();
  return { server, net, ...view };
}

const showRig = (overrides: Partial<Rig>) => show(() => ({ body: status({ rig: rig(overrides) }) }));

const header = () => screen.getByRole('heading', { name: 'สถานะอุปกรณ์ในแลป' }).parentElement as HTMLElement;
const drawing = () => screen.getByRole('img');
const rigTile = () => drawing().parentElement as HTMLElement;
const tile = (name: string) => screen.getByText(name).parentElement as HTMLElement;
const supply = () => within(rigTile()).getByText('แหล่งจ่ายไฟ');
const circuitLooks = () => CIRCUIT_LABELS.map(label => within(drawing()).getByText(label).getAttribute('fill'));

const animations = (prop: string) => anime.animate.mock.calls
  .map(call => (call as unknown[])[1] as Record<string, unknown>)
  .filter(params => prop in params);

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

describe('EquipmentStatus', () => {
  describe('before the first answer', () => {
    // Rendered without letting the first request go out.
    const showWaiting = () => {
      const net = mockFetch(() => ({ body: status() }));
      render(<EquipmentStatus />);
      return net;
    };

    it('says it is checking, in the header and on the rig', () => {
      showWaiting();

      expect(header()).toHaveTextContent(new RegExp(`${CHECKING}$`));
      expect(within(rigTile()).getByText(CHECKING)).toBeInTheDocument();
      expect(screen.queryByRole('alert')).not.toBeInTheDocument();
    });

    it('lists the three cameras and the sensor as being checked', () => {
      showWaiting();

      for (const name of [MAIN_CAMERA, SOLENOID_CAMERA, COIL_CAMERA, SENSOR]) {
        expect(tile(name)).toHaveTextContent(new RegExp(`${CHECKING}$`));
      }
      expect(screen.queryByText(ONLINE)).not.toBeInTheDocument();
      expect(screen.queryByText(OFFLINE)).not.toBeInTheDocument();
      expect(screen.queryByText(UNSET)).not.toBeInTheDocument();
    });

    it('claims nothing about the rig: no circuit on, supply unknown, no command, no probe', () => {
      showWaiting();

      expect(drawing()).toHaveAccessibleName(NO_CIRCUIT);
      expect(new Set(circuitLooks()).size).toBe(1);
      expect(supply()).toHaveTextContent('แหล่งจ่ายไฟ ยังไม่ทราบสถานะ');
      expect(within(rigTile()).getByText('ยังไม่มีคำสั่ง')).toBeInTheDocument();
      expect(screen.queryByText(/ cm$/)).not.toBeInTheDocument();
    });
  });

  describe('the header', () => {
    it('gives the time of the last check, in Bangkok time', async () => {
      await show(() => ({ body: status({ checked_at: '2026-03-10T12:00:05.000Z' }) }));
      expect(header()).toHaveTextContent('ตรวจล่าสุด 19:00:05');
    });
  });

  describe('the rig', () => {
    it('says no command has been sent since the server started', async () => {
      await showRig({});

      expect(within(rigTile()).getByText(NOTHING_SENT)).toBeInTheDocument();
      expect(within(rigTile()).getByText('ยังไม่มีคำสั่ง')).toBeInTheDocument();
      expect(drawing()).toHaveAccessibleName(NO_CIRCUIT);
    });

    it('says no circuit is on once a command has been sent and none is on', async () => {
      await showRig({ last: sent('off.py') });

      expect(within(rigTile()).getByText(NO_CIRCUIT)).toBeInTheDocument();
      expect(screen.queryByText(NOTHING_SENT)).not.toBeInTheDocument();
      expect(drawing()).toHaveAccessibleName(NO_CIRCUIT);
      expect(new Set(circuitLooks()).size).toBe(1);
    });

    it('says it is carrying out a command while busy, even with a circuit on', async () => {
      await showRig({ busy: true, circuit: 'coil_2.py', last: sent('coil_2.py') });

      expect(within(rigTile()).getByText(BUSY)).toBeInTheDocument();
      expect(screen.queryByText('ขดลวด 2 รอบ เปิดอยู่')).not.toBeInTheDocument();
    });

    it('shows a spinner only while busy', async () => {
      // The spinner is decorative (aria-hidden) and has no text.
      const spinner = () => rigTile().querySelector('svg[aria-hidden="true"]');

      const { server } = await showRig({ busy: true });
      expect(spinner()).toBeInTheDocument();

      server.answer = () => ({ body: status({ rig: rig({ last: sent('coil_1.py') }) }) });
      await advance(POLL);
      expect(spinner()).not.toBeInTheDocument();
      expect(screen.queryByText(BUSY)).not.toBeInTheDocument();
    });

    it.each([
      ['coil_1.py', 'ขดลวด 1 รอบ', 0],
      ['coil_2.py', 'ขดลวด 2 รอบ', 1],
      ['coil_3.py', 'ขดลวด 3 รอบ', 2],
      ['sole.py', 'โซลีนอยด์', 3],
    ])('says which circuit is on and lights it in the drawing: %s', async (script, label, index) => {
      await showRig({ circuit: script, last: sent(script) });

      expect(within(rigTile()).getByText(`${label} เปิดอยู่`)).toBeInTheDocument();
      expect(drawing()).toHaveAccessibleName(`${label} เปิดอยู่`);

      const looks = circuitLooks();
      const lit = looks.map(look => look === looks[index]);
      expect(lit).toEqual([0, 1, 2, 3].map(i => i === index));
    });

    it('treats a circuit it does not know as no circuit on', async () => {
      await showRig({ circuit: 'mystery.py', last: sent('mystery.py') });

      expect(within(rigTile()).getByText(NO_CIRCUIT)).toBeInTheDocument();
      expect(drawing()).toHaveAccessibleName(NO_CIRCUIT);
      expect(new Set(circuitLooks()).size).toBe(1);
    });

    it.each([
      [4, '+4 cm', 'โซลีนอยด์ เปิดอยู่ หัววัดอยู่ที่ 4 เซนติเมตร'],
      [-8, '-8 cm', 'โซลีนอยด์ เปิดอยู่ หัววัดอยู่ที่ -8 เซนติเมตร'],
      [0, '0 cm', 'โซลีนอยด์ เปิดอยู่ หัววัดอยู่ที่ 0 เซนติเมตร'],
    ])('marks the probe at %i cm', async (position, text, name) => {
      await showRig({ circuit: 'sole.py', position, last: sent('move') });

      expect(within(drawing()).getByText(text)).toBeInTheDocument();
      expect(drawing()).toHaveAccessibleName(name);
    });

    it('shows no probe marker when the probe position is not known', async () => {
      await showRig({ circuit: 'sole.py', last: sent('sole.py') });

      expect(screen.queryByText(/ cm$/)).not.toBeInTheDocument();
      expect(drawing()).toHaveAccessibleName('โซลีนอยด์ เปิดอยู่');
    });

    it.each([
      [true, 'แหล่งจ่ายไฟ เปิดอยู่'],
      [false, 'แหล่งจ่ายไฟ ปิดอยู่'],
      [null, 'แหล่งจ่ายไฟ ยังไม่ทราบสถานะ'],
    ])('says whether the supply is on: %p', async (state, text) => {
      await showRig({ supply: state });
      expect(supply()).toHaveTextContent(new RegExp(`^${text}$`));
    });

    it.each([
      ['solenoid', 'แหล่งจ่ายไฟ เปิดอยู่ (โซลีนอยด์)'],
      ['coil1', 'แหล่งจ่ายไฟ เปิดอยู่ (ขดลวด 1 รอบ)'],
      ['coil2', 'แหล่งจ่ายไฟ เปิดอยู่ (ขดลวด 2 รอบ)'],
      ['coil3', 'แหล่งจ่ายไฟ เปิดอยู่ (ขดลวด 3 รอบ)'],
      ['all', 'แหล่งจ่ายไฟ เปิดอยู่ (ทุกอุปกรณ์)'],
      ['psu9', 'แหล่งจ่ายไฟ เปิดอยู่'],
    ])('says which relay is on: %s', async (relay, text) => {
      await showRig({ supply: true, relay });
      expect(supply()).toHaveTextContent(text, { normalizeWhitespace: true });
      expect(supply().textContent).toBe(text);
    });

    it('names no relay once the supply is off', async () => {
      await showRig({ supply: false, relay: null });
      expect(supply().textContent).toBe('แหล่งจ่ายไฟ ปิดอยู่');
    });

    it('makes the supply being on look different from it being off', async () => {
      const { server } = await showRig({ supply: true });
      const on = (supply().lastElementChild as HTMLElement).className;

      server.answer = () => ({ body: status({ rig: rig({ supply: false }) }) });
      await advance(POLL);

      expect((supply().lastElementChild as HTMLElement).className).not.toBe(on);
    });

    it('names the last command, says it succeeded and when, in Bangkok time', async () => {
      await showRig({ last: { command: 'coil_1.py', ok: true, at: new Date('2026-03-10T11:58:30.000Z').getTime() } });

      expect(within(rigTile()).getByText(/คำสั่งล่าสุด/)).toHaveTextContent(/^คำสั่งล่าสุด coil_1\.py สำเร็จ เมื่อ 18:58:30$/);
    });

    it('says so when the last command failed, and makes it look different from a success', async () => {
      const { server } = await showRig({ last: sent('sole.py', false) });
      expect(within(rigTile()).getByText(/คำสั่งล่าสุด/)).toHaveTextContent(/^คำสั่งล่าสุด sole\.py ไม่สำเร็จ เมื่อ 18:59:00$/);
      const failed = within(rigTile()).getByText('ไม่สำเร็จ').className;

      server.answer = () => ({ body: status({ rig: rig({ last: sent('sole.py', true) }) }) });
      await advance(POLL);

      expect(within(rigTile()).getByText('สำเร็จ').className).not.toBe(failed);
    });

    it('always says the state comes from the commands sent, not from the equipment itself', async () => {
      await showRig({ circuit: 'coil_1.py', last: sent('coil_1.py') });
      expect(within(rigTile()).getByText('อ้างอิงจากคำสั่งที่เว็บส่งไป ไม่ใช่ค่าที่อ่านจากตัวอุปกรณ์')).toBeInTheDocument();
    });
  });

  describe('the cameras and the sensor', () => {
    it.each([
      ['online', ONLINE],
      ['offline', OFFLINE],
      ['unset', UNSET],
    ] as Array<[Reach, string]>)('shows each camera %s', async (state, label) => {
      // Everything else is in another state, so the label can only be this camera's.
      const other: Reach = state === 'online' ? 'offline' : 'online';
      for (const [index, name] of [MAIN_CAMERA, SOLENOID_CAMERA, COIL_CAMERA].entries()) {
        const states: Reach[] = [other, other, other];
        states[index] = state;
        const { unmount } = await show(() => ({ body: status({ cameras: cameras(...states), sensor: other }) }));

        expect(tile(name)).toHaveTextContent(new RegExp(`${label}$`));
        expect(screen.getAllByText(label)).toHaveLength(1);
        unmount();
      }
    });

    it.each([
      ['online', ONLINE],
      ['offline', OFFLINE],
      ['unset', UNSET],
    ] as Array<[Reach, string]>)('shows the sensor %s', async (state, label) => {
      const other: Reach = state === 'online' ? 'offline' : 'online';
      await show(() => ({ body: status({ cameras: cameras(other, other, other), sensor: state }) }));

      expect(tile(SENSOR)).toHaveTextContent(new RegExp(`^${SENSOR}${label}$`));
      expect(screen.getAllByText(label)).toHaveLength(1);
    });

    it('makes online, offline and not set up look different from each other', async () => {
      await show(() => ({ body: status({ cameras: cameras('online', 'offline', 'unset') }) }));

      const looks = [
        within(tile(MAIN_CAMERA)).getByText(ONLINE),
        within(tile(SOLENOID_CAMERA)).getByText(OFFLINE),
        within(tile(COIL_CAMERA)).getByText(UNSET),
      ].map(label => label.className);
      expect(new Set(looks).size).toBe(3);
    });

    it('frames a tile that is offline differently from the others', async () => {
      await show(() => ({ body: status({ cameras: cameras('online', 'offline', 'unset') }) }));

      expect(tile(SOLENOID_CAMERA).className).not.toBe(tile(MAIN_CAMERA).className);
      expect(tile(COIL_CAMERA).className).toBe(tile(MAIN_CAMERA).className);
    });

    it('shows a camera it has no name for under its key', async () => {
      await show(() => ({ body: status({ cameras: [{ key: 'cam1', state: 'online' }, { key: 'cam9', state: 'offline' }] }) }));

      expect(tile('cam9')).toHaveTextContent(new RegExp(`^cam9${OFFLINE}$`));
      expect(screen.queryByText(SOLENOID_CAMERA)).not.toBeInTheDocument();
      expect(screen.queryByText(COIL_CAMERA)).not.toBeInTheDocument();
    });
  });

  describe('checking again', () => {
    it('asks for the status as soon as it appears', async () => {
      const { net } = await show();
      expect(net.requests()).toEqual(['GET /api/admin/status']);
    });

    it('asks again every ten seconds', async () => {
      const { net } = await show();

      await advance(POLL - 1);
      expect(net.calls).toHaveLength(1);
      await advance(1);
      expect(net.calls).toHaveLength(2);
      await advance(POLL * 3);
      expect(net.requests()).toEqual(Array(5).fill('GET /api/admin/status'));
    });

    it('shows what the latest check found', async () => {
      const { server } = await show(() => ({ body: status({ rig: rig({ circuit: 'coil_1.py', supply: true, last: sent('coil_1.py') }) }) }));
      expect(header()).toHaveTextContent('ตรวจล่าสุด 19:00:00');
      expect(tile(MAIN_CAMERA)).toHaveTextContent(ONLINE);

      server.answer = () => ({ body: status({ rig: rig({ circuit: 'sole.py', position: 6, supply: false, last: sent('move') }), cameras: cameras('offline'), sensor: 'unset' }) });
      await advance(POLL);

      expect(header()).toHaveTextContent('ตรวจล่าสุด 19:00:10');
      expect(within(rigTile()).getByText('โซลีนอยด์ เปิดอยู่')).toBeInTheDocument();
      expect(screen.queryByText('ขดลวด 1 รอบ เปิดอยู่')).not.toBeInTheDocument();
      expect(within(drawing()).getByText('+6 cm')).toBeInTheDocument();
      expect(supply()).toHaveTextContent('แหล่งจ่ายไฟ ปิดอยู่');
      expect(tile(MAIN_CAMERA)).toHaveTextContent(OFFLINE);
      expect(tile(SENSOR)).toHaveTextContent(UNSET);
    });

    it('stops asking once it is off the page', async () => {
      const { net, unmount } = await show();

      unmount();
      await advance(POLL * 3);

      expect(net.calls).toHaveLength(1);
    });

    it('does not ask at all when it is taken off the page before the first check goes out', async () => {
      const net = mockFetch(() => ({ body: status() }));
      const { unmount } = render(<EquipmentStatus />);

      unmount();
      await advance(POLL);

      expect(net.calls).toHaveLength(0);
    });
  });

  describe('when the status cannot be read', () => {
    const refusals: Array<[string, () => Reply]> = [
      ['the server answers with an error', () => ({ status: 500, body: { ok: false, error: 'x' } })],
      ['the visitor is not allowed', () => ({ status: 403, body: { ok: false } })],
      ['the answer says it is not ok', () => ({ status: 200, body: { ok: false } })],
      ['the network is down', () => { throw new TypeError('Failed to fetch'); }],
    ];

    it.each(refusals)('says so and that it is trying again: %s', async (_label, answer) => {
      await show(answer);

      expect(screen.getByRole('alert')).toHaveTextContent(CANNOT_READ);
      expect(header()).not.toHaveTextContent('ตรวจล่าสุด');
    });

    it('says so when the answer is not JSON', async () => {
      globalThis.fetch = jest.fn(async () => ({
        ok: true,
        status: 200,
        json: async () => { throw new SyntaxError('Unexpected token <'); },
      }) as unknown as Response);
      render(<EquipmentStatus />);
      await advance();

      expect(screen.getByRole('alert')).toHaveTextContent(CANNOT_READ);
    });

    it('goes on showing every part as being checked when no check has worked yet', async () => {
      await show(() => ({ status: 500, body: { ok: false } }));

      expect(within(rigTile()).getByText(CHECKING)).toBeInTheDocument();
      for (const name of [MAIN_CAMERA, SOLENOID_CAMERA, COIL_CAMERA, SENSOR]) {
        expect(tile(name)).toHaveTextContent(new RegExp(`${CHECKING}$`));
      }
    });

    it('keeps trying every ten seconds and shows the status once a check works', async () => {
      const { server, net } = await show(() => ({ status: 500, body: { ok: false } }));

      await advance(POLL);
      expect(net.calls).toHaveLength(2);
      expect(screen.getByRole('alert')).toBeInTheDocument();

      server.answer = () => ({ body: status({ sensor: 'offline' }) });
      await advance(POLL);

      expect(screen.queryByRole('alert')).not.toBeInTheDocument();
      expect(header()).toHaveTextContent('ตรวจล่าสุด 19:00:20');
      expect(tile(SENSOR)).toHaveTextContent(OFFLINE);
    });

    it('replaces the time of the last check with the warning, and leaves what it last knew on the tiles', async () => {
      const { server } = await show(() => ({ body: status({ rig: rig({ circuit: 'coil_3.py', last: sent('coil_3.py') }), sensor: 'offline' }) }));

      server.answer = () => { throw new TypeError('Failed to fetch'); };
      await advance(POLL);

      expect(screen.getByRole('alert')).toHaveTextContent(CANNOT_READ);
      expect(header()).not.toHaveTextContent('ตรวจล่าสุด');
      expect(within(rigTile()).getByText('ขดลวด 3 รอบ เปิดอยู่')).toBeInTheDocument();
      expect(tile(SENSOR)).toHaveTextContent(OFFLINE);
      expect(tile(MAIN_CAMERA)).toHaveTextContent(ONLINE);
    });
  });

  describe('motion', () => {
    it('sweeps a bar across for the ten seconds until the next check, afresh after each check', async () => {
      await show();
      expect(animations('scaleX')).toHaveLength(1);
      expect(animations('scaleX')[0]).toMatchObject({ scaleX: [0, 1], duration: POLL });

      await advance(POLL);
      expect(animations('scaleX')).toHaveLength(2);
    });

    it('does not sweep before the first answer', () => {
      mockFetch(() => ({ body: status() }));
      render(<EquipmentStatus />);

      expect(anime.animate).not.toHaveBeenCalled();
    });

    it('pulses each part that is online and no other', async () => {
      await show(() => ({ body: status({ cameras: cameras('online', 'offline', 'unset'), sensor: 'online' }) }));
      expect(animations('opacity')).toHaveLength(2);
    });

    it('jumps a tile whose state changed, and not on the first answer or while it stays the same', async () => {
      const jumps = () => animations('scale').filter(params => !('opacity' in params)).length;

      const { server } = await show();
      expect(jumps()).toBe(0);

      await advance(POLL);
      expect(jumps()).toBe(0);

      server.answer = () => ({ body: status({ cameras: cameras('online', 'offline'), sensor: 'unset' }) });
      await advance(POLL);
      expect(jumps()).toBe(2);
    });

    it('runs current round the circuit that is on, and round nothing when none is', async () => {
      const { server } = await showRig({ last: sent('off.py') });
      expect(animations('strokeDashoffset')).toHaveLength(0);

      server.answer = () => ({ body: status({ rig: rig({ circuit: 'coil_3.py', last: sent('coil_3.py') }) }) });
      await advance(POLL);

      expect(animations('strokeDashoffset')).toHaveLength(1);
      const [targets] = anime.animate.mock.calls.find(call => 'strokeDashoffset' in ((call as unknown[])[1] as object)) as unknown as [NodeListOf<Element>];
      expect(targets).toHaveLength(3);
    });

    it('glides the probe marker 4 px along its track for every cm', async () => {
      const { server } = await showRig({ circuit: 'sole.py', position: 4, last: sent('move') });
      expect(animations('translateX').map(params => params.translateX)).toEqual([16]);

      server.answer = () => ({ body: status({ rig: rig({ circuit: 'sole.py', position: -8, last: sent('move') }) }) });
      await advance(POLL);
      expect(animations('translateX').map(params => params.translateX)).toEqual([16, -32]);
    });

    it('animates nothing when the visitor asked for reduced motion, and puts the probe marker straight in place', async () => {
      media.set(REDUCED, true);
      const { server } = await showRig({ circuit: 'sole.py', position: 4, last: sent('move') });
      // The marker has no role; it is the group round its label.
      const marker = () => within(drawing()).getByText(/ cm$/).parentElement as unknown as SVGGElement;
      expect(marker().style.transform).toBe('translateX(16px)');

      server.answer = () => ({ body: status({ rig: rig({ circuit: 'sole.py', position: -8, last: sent('move') }), cameras: cameras('offline') }) });
      await advance(POLL);

      expect(marker().style.transform).toBe('translateX(-32px)');
      expect(anime.animate).not.toHaveBeenCalled();
    });
  });
});

describe('EquipmentStatus — asked to read again', () => {
  beforeEach(() => {
    jest.useFakeTimers();
    jest.setSystemTime(NOW);
    installMatchMedia();
  });

  afterEach(() => {
    jest.useRealTimers();
    jest.clearAllMocks();
  });

  it('reads the status again at once when the page says a command was sent, without waiting for the next round', async () => {
    const answers = [status(), status({ rig: rig({ supply: true, relay: 'all' }) })];
    const net = mockFetch(() => ({ body: answers.shift() ?? status() }));
    const { rerender } = render(<EquipmentStatus refresh={0} />);
    await advance();
    expect(net.requests()).toEqual(['GET /api/admin/status']);

    rerender(<EquipmentStatus refresh={1} />);
    await advance();

    expect(net.requests()).toEqual(['GET /api/admin/status', 'GET /api/admin/status']);
    expect(screen.getByText('เปิดอยู่ (ทุกอุปกรณ์)')).toBeInTheDocument();
  });

  it('keeps reading every ten seconds after that, one round at a time', async () => {
    const net = mockFetch(() => ({ body: status() }));
    const { rerender } = render(<EquipmentStatus refresh={0} />);
    await advance();
    rerender(<EquipmentStatus refresh={1} />);
    await advance();
    net.clear();

    await advance(POLL);
    expect(net.requests()).toEqual(['GET /api/admin/status']);
  });
});
