import { fireEvent, render, screen } from '@testing-library/react';
import CurrentSettings from '@/app/admin/CurrentSettings';
import type { AnimeMock } from '../helpers/client/anime';
import { advance, mockFetch, type Reply } from '../helpers/client/fetch';
import { installMatchMedia } from '../helpers/client/matchMedia';

jest.mock('animejs', () => jest.requireActual<typeof import('../helpers/client/anime')>('../helpers/client/anime').animeMock());

const anime = jest.requireMock<AnimeMock>('animejs');
const REDUCED = '(prefers-reduced-motion: reduce)';
const CURRENTS = { 'coil_1.py': 5, 'coil_2.py': 5, 'coil_3.py': 5, 'sole.py': 0.3 };
const SAVE = 'บันทึกค่ากระแส';

const field = (label: string) => screen.getByLabelText(label) as HTMLInputElement;
const type = (label: string, value: string) => fireEvent.change(field(label), { target: { value } });
const saveButton = () => screen.getByRole('button', { name: SAVE });

function show(reply: Reply = { body: { ok: true } }, currents = CURRENTS) {
  const net = mockFetch(() => reply);
  const onChanged = jest.fn(async () => {});
  const view = render(<CurrentSettings currents={currents} onChanged={onChanged} />);
  return { net, onChanged, ...view };
}

beforeEach(() => {
  jest.useFakeTimers();
  installMatchMedia();
});

afterEach(() => {
  jest.useRealTimers();
  jest.clearAllMocks();
});

describe('CurrentSettings', () => {
  it('shows the current of every instrument, in amperes', () => {
    show();
    expect(field('ขดลวดเดี่ยว 1 รอบ').value).toBe('5');
    expect(field('ขดลวดเดี่ยว 2 รอบ').value).toBe('5');
    expect(field('ขดลวดเดี่ยว 3 รอบ').value).toBe('5');
    expect(field('โซลีนอยด์').value).toBe('0.3');
  });

  it('says that the supply itself is set by hand', () => {
    show();
    expect(screen.getByText(/ระบบไม่ได้วัดหรือปรับกระแสเอง/)).toBeInTheDocument();
  });

  it('has nothing to save until a value is changed', () => {
    const { net } = show();
    expect(saveButton()).toBeDisabled();
    type('โซลีนอยด์', '0.3');
    expect(saveButton()).toBeDisabled();
    expect(net.requests()).toEqual([]);
  });

  it('sends only the values that were changed', async () => {
    const { net, onChanged } = show();
    type('โซลีนอยด์', '0.45');
    fireEvent.click(saveButton());
    await advance();

    expect(net.calls).toEqual([{ method: 'PATCH', url: '/api/admin/rig/currents', body: { currents: { 'sole.py': 0.45 } } }]);
    expect(onChanged).toHaveBeenCalledTimes(1);
    expect(screen.getByRole('status')).toHaveTextContent('บันทึกค่ากระแสแล้ว ใช้กับผู้ที่เข้าห้องแลปครั้งถัดไป');
  });

  it('sends several changed values together', async () => {
    const { net } = show();
    type('ขดลวดเดี่ยว 1 รอบ', '4');
    type('ขดลวดเดี่ยว 3 รอบ', '4.5');
    fireEvent.click(saveButton());
    await advance();
    expect(net.calls[0].body).toEqual({ currents: { 'coil_1.py': 4, 'coil_3.py': 4.5 } });
  });

  it('shows what is stored again once it has been saved', async () => {
    const { rerender, onChanged } = show();
    type('โซลีนอยด์', '0.45');
    fireEvent.click(saveButton());
    await advance();
    rerender(<CurrentSettings currents={{ ...CURRENTS, 'sole.py': 0.45 }} onChanged={onChanged} />);
    expect(field('โซลีนอยด์').value).toBe('0.45');
    expect(saveButton()).toBeDisabled();
  });

  it.each(['0', '-1', '10.5', '0.3001', ''])('does not save %j, and says what a current may be', (value) => {
    const { net } = show();
    type('โซลีนอยด์', value);
    expect(screen.getByRole('alert')).toHaveTextContent('ค่ากระแสต้องมากกว่า 0 และไม่เกิน 10 A');
    expect(field('โซลีนอยด์')).toHaveAttribute('aria-invalid', 'true');
    expect(saveButton()).toBeDisabled();
    fireEvent.submit(field('โซลีนอยด์').closest('form') as HTMLFormElement);
    expect(net.requests()).toEqual([]);
  });

  it('keeps what was typed and gives the server\'s reason when saving is refused', async () => {
    const { onChanged } = show({ status: 400, body: { ok: false, error: 'รายการอุปกรณ์ไม่ถูกต้อง' } });
    type('โซลีนอยด์', '0.45');
    fireEvent.click(saveButton());
    await advance();
    expect(screen.getByRole('alert')).toHaveTextContent('รายการอุปกรณ์ไม่ถูกต้อง');
    expect(field('โซลีนอยด์').value).toBe('0.45');
    expect(onChanged).not.toHaveBeenCalled();
  });

  it('says so when the server cannot be reached', async () => {
    render(<CurrentSettings currents={CURRENTS} onChanged={async () => {}} />);
    globalThis.fetch = jest.fn(async () => { throw new Error('offline'); }) as unknown as typeof fetch;
    type('โซลีนอยด์', '0.45');
    fireEvent.click(saveButton());
    await advance();
    expect(screen.getByRole('alert')).toHaveTextContent('เชื่อมต่อเซิร์ฟเวอร์ไม่ได้');
  });

  it('settles the saved fields into place, and only those', async () => {
    show();
    type('โซลีนอยด์', '0.45');
    fireEvent.click(saveButton());
    await advance();
    const settle = anime.animate.mock.calls.find(call => Array.isArray((call as unknown[])[0])) as unknown as [Element[]];
    expect(settle[0]).toEqual([field('โซลีนอยด์')]);
  });

  it('keeps everything still for someone who asked for reduced motion', async () => {
    installMatchMedia({ [REDUCED]: true });
    show();
    type('โซลีนอยด์', '0.45');
    fireEvent.click(saveButton());
    await advance();
    expect(anime.animate).not.toHaveBeenCalled();
  });
});
