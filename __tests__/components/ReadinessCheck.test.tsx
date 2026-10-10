import { fireEvent, render, screen, within } from '@testing-library/react';
import ReadinessCheck from '@/app/admin/ReadinessCheck';
import type { AnimeMock } from '../helpers/client/anime';
import { advance, mockFetch, type Reply } from '../helpers/client/fetch';
import { installMatchMedia } from '../helpers/client/matchMedia';

jest.mock('animejs', () => jest.requireActual<typeof import('../helpers/client/anime')>('../helpers/client/anime').animeMock());

const anime = jest.requireMock<AnimeMock>('animejs');
const REDUCED = '(prefers-reduced-motion: reduce)';
const BUTTON = 'ตรวจความพร้อมของเครื่องแลป';

const pass = (id: string, group: string, label: string, detail = 'มีไฟล์ และไลบรารีที่ใช้ครบ') => ({ id, group, label, ok: true, detail });
const READY = {
  ok: true, ready: true, checkedAt: '2026-10-10T03:00:05.000Z',
  checks: [
    pass('rig-folder', 'สคริปต์ควบคุมอุปกรณ์', 'โฟลเดอร์สคริปต์', '/home/admin/Documents'),
    pass('rig-coil_1.py', 'สคริปต์ควบคุมอุปกรณ์', 'coil_1.py (เปิดขดลวด 1 รอบ)'),
    pass('sensor-data', 'เซนเซอร์สนามแม่เหล็ก', 'ค่าจากเซนเซอร์', 'ได้ค่า 0.074 mT'),
    { id: 'camera-cam3', group: 'กล้อง', label: 'กล้องเสริม (ขดลวด)', ok: null, detail: 'ยังไม่ได้ตั้งค่าที่อยู่ (cam3)' },
  ],
};
const NOT_READY = {
  ...READY, ready: false,
  checks: [
    READY.checks[0],
    { id: 'rig-coil_1.py', group: 'สคริปต์ควบคุมอุปกรณ์', label: 'coil_1.py (เปิดขดลวด 1 รอบ)', ok: false, detail: 'ไม่พบไฟล์นี้ในโฟลเดอร์สคริปต์' },
    { id: 'rig-sole.py', group: 'สคริปต์ควบคุมอุปกรณ์', label: 'sole.py (เปิดโซลีนอยด์และเลื่อนหัววัด)', ok: false, detail: 'ขาดไลบรารีใน venv: xarm' },
    READY.checks[2],
  ],
};

async function pressWith(reply: Reply | (() => Promise<Reply>)) {
  const net = mockFetch(() => (typeof reply === 'function' ? reply() : reply));
  const view = render(<ReadinessCheck />);
  fireEvent.click(screen.getByRole('button', { name: BUTTON }));
  await advance();
  return { net, ...view };
}

const row = (id: string) => document.querySelector(`[data-check="${id}"]`) as HTMLElement;

beforeEach(() => {
  jest.useFakeTimers();
  installMatchMedia();
});

afterEach(() => {
  jest.useRealTimers();
  jest.clearAllMocks();
});

describe('ReadinessCheck', () => {
  it('checks nothing until the button is pressed', () => {
    const net = mockFetch(() => ({ body: READY }));
    render(<ReadinessCheck />);
    expect(net.requests()).toEqual([]);
    expect(screen.queryByRole('status')).not.toBeInTheDocument();
    expect(screen.getByText(/โดยไม่สั่งให้อุปกรณ์ทำงาน/)).toBeInTheDocument();
  });

  it('asks the server to check when the button is pressed', async () => {
    const { net } = await pressWith({ body: READY });
    expect(net.requests()).toEqual(['POST /api/admin/readiness']);
  });

  it('says the machine is ready and when that was checked', async () => {
    await pressWith({ body: READY });
    expect(screen.getByRole('status')).toHaveTextContent('พร้อมใช้งาน ไม่พบสิ่งผิดปกติ');
    expect(screen.getByRole('status')).toHaveTextContent('ตรวจเมื่อ 10:00:05');
  });

  it('lists each thing checked under its group, with what was found', async () => {
    await pressWith({ body: READY });
    expect(screen.getAllByRole('heading', { level: 3 }).map(h => h.textContent)).toEqual(['สคริปต์ควบคุมอุปกรณ์', 'เซนเซอร์สนามแม่เหล็ก', 'กล้อง']);
    expect(row('rig-coil_1.py')).toHaveTextContent('พร้อม');
    expect(row('rig-coil_1.py')).toHaveTextContent('coil_1.py (เปิดขดลวด 1 รอบ)');
    expect(row('sensor-data')).toHaveTextContent('ได้ค่า 0.074 mT');
  });

  it('marks what could not be checked as not checked, neither ready nor not', async () => {
    await pressWith({ body: READY });
    expect(within(row('camera-cam3')).getByText('ไม่ได้ตรวจ')).toBeInTheDocument();
    expect(row('camera-cam3')).not.toHaveTextContent('ไม่พร้อม');
  });

  it('says how many things need fixing, and which, when the machine is not ready', async () => {
    await pressWith({ body: NOT_READY });
    expect(screen.getByRole('status')).toHaveTextContent('ยังไม่พร้อม พบ 2 รายการที่ต้องแก้');
    expect(row('rig-coil_1.py')).toHaveTextContent('ไม่พร้อม');
    expect(row('rig-coil_1.py')).toHaveTextContent('ไม่พบไฟล์นี้ในโฟลเดอร์สคริปต์');
    expect(row('rig-sole.py')).toHaveTextContent('ขาดไลบรารีใน venv: xarm');
    expect(row('rig-folder')).toHaveTextContent('พร้อม');
  });

  it('cannot be pressed again while a check is running', async () => {
    let finish!: (reply: Reply) => void;
    await pressWith(() => new Promise<Reply>((resolve) => { finish = resolve; }));
    const button = screen.getByRole('button', { name: 'กำลังตรวจ' });
    expect(button).toBeDisabled();
    finish({ body: READY });
    await advance();
    expect(screen.getByRole('button', { name: BUTTON })).toBeEnabled();
  });

  it('replaces the last result with the new one when checked again', async () => {
    const replies = [{ body: NOT_READY }, { body: READY }];
    mockFetch(() => replies.shift() as Reply);
    render(<ReadinessCheck />);
    fireEvent.click(screen.getByRole('button', { name: BUTTON }));
    await advance();
    fireEvent.click(screen.getByRole('button', { name: BUTTON }));
    await advance();
    expect(screen.getByRole('status')).toHaveTextContent('พร้อมใช้งาน');
    expect(row('rig-sole.py')).not.toBeInTheDocument();
  });

  it('says so when the check itself fails, with the server\'s reason', async () => {
    await pressWith({ status: 500, body: { ok: false, error: 'ตรวจความพร้อมไม่สำเร็จ ลองใหม่อีกครั้ง' } });
    expect(screen.getByRole('alert')).toHaveTextContent('ตรวจความพร้อมไม่สำเร็จ ลองใหม่อีกครั้ง');
    expect(screen.queryByRole('status')).not.toBeInTheDocument();
  });

  it('says so when the server cannot be reached', async () => {
    globalThis.fetch = jest.fn(async () => { throw new Error('offline'); }) as unknown as typeof fetch;
    render(<ReadinessCheck />);
    fireEvent.click(screen.getByRole('button', { name: BUTTON }));
    await advance();
    expect(screen.getByRole('alert')).toHaveTextContent('เชื่อมต่อเซิร์ฟเวอร์ไม่ได้');
  });

  it('brings the lines of a result in one after another', async () => {
    await pressWith({ body: READY });
    const rows = anime.animate.mock.calls.find(call => 'translateX' in ((call as unknown[])[1] as object)) as unknown as [NodeListOf<Element>];
    expect(rows[0]).toHaveLength(READY.checks.length);
  });

  it('keeps everything still for someone who asked for reduced motion', async () => {
    installMatchMedia({ [REDUCED]: true });
    await pressWith({ body: READY });
    expect(anime.animate).not.toHaveBeenCalled();
  });
});
