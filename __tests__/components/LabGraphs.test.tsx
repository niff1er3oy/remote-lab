import { fireEvent, render, screen, within } from '@testing-library/react';
import LabSummary from '@/app/lab/LabSummary';
import LabGraphs from '@/app/lab/LabGraphs';
import type { LabEvent, LabReading } from '@/lib/lab-activity';
import { calcBCoil, calcBSolenoid, COIL_R, SOLENOID } from '@/lib/physics';
import type { AnimeMock } from '../helpers/client/anime';
import { installMatchMedia } from '../helpers/client/matchMedia';

jest.mock('animejs', () => jest.requireActual<typeof import('../helpers/client/anime')>('../helpers/client/anime').animeMock());

const anime = jest.requireMock<AnimeMock>('animejs');
const REDUCED = '(prefers-reduced-motion: reduce)';

const coil = (n: number, bMeasured: number | null, I = 5): LabReading =>
  ({ instrument: `ขดลวดเดี่ยว ${n} รอบ`, zCm: null, I, bTheory: calcBCoil(n, I, COIL_R), bMeasured });
const probe = (zCm: number, bMeasured: number | null, I = 0.3): LabReading =>
  ({ instrument: 'โซลีนอยด์ 100 รอบ', zCm, I, bTheory: calcBSolenoid(SOLENOID.N, I, SOLENOID.L, SOLENOID.R, zCm / 100), bMeasured });

const BOTH = [coil(1, 0.23), coil(2, 0.47), coil(3, 0.7), probe(-4, 0.21), probe(0, 0.4), probe(4, 0.22)];

const show = (readings: LabReading[] = BOTH, onClose = jest.fn()) => {
  render(<LabGraphs readings={readings} onClose={onClose} />);
  return onClose;
};
const tab = (name: RegExp) => screen.getByRole('tab', { name });
const points = () => screen.getAllByRole('img').filter((el) => el.hasAttribute('data-point'));

beforeEach(() => {
  jest.clearAllMocks();
  installMatchMedia();
});

describe('LabGraphs', () => {
  it('is a dialog that opens on part 1, with its tab in focus', () => {
    show();
    expect(screen.getByRole('dialog', { name: 'กราฟผลการทดลอง' })).toBeInTheDocument();
    expect(tab(/ตอนที่ 1/)).toHaveAttribute('aria-selected', 'true');
    expect(tab(/ตอนที่ 1/)).toHaveFocus();
    expect(screen.getByRole('img', { name: /จำนวนรอบของขดลวดเดี่ยว/ })).toBeInTheDocument();
  });

  it('draws one point per coil measured, and gives μ0 and the % error from the fitted line', () => {
    show();
    expect(points()).toHaveLength(3);
    // slope = (0.23 + 0.94 + 2.1) / 14 = 0.23357; μ0 = slope × 10⁻³ × 2R / I = 1.2146 × 10⁻⁶.
    expect(screen.getByText('B = 0.2336 n')).toBeInTheDocument();
    expect(screen.getByText('1.2146')).toBeInTheDocument();
    expect(screen.getByText('1.2566')).toBeInTheDocument();
    expect(screen.getByText('-3.34 %')).toBeInTheDocument();
    expect(screen.getByText(/R = 13 mm และ I = 5 A/)).toBeInTheDocument();
  });

  it('switches to part 2 with the tab, or with the arrow keys', () => {
    show();
    fireEvent.click(tab(/ตอนที่ 2/));
    expect(screen.getByRole('img', { name: /ระยะตามแนวแกน Z ของโซลีนอยด์/ })).toBeInTheDocument();
    expect(points()).toHaveLength(3);
    expect(screen.getByText('3 จาก 21')).toBeInTheDocument();
    expect(screen.getByText('0.400 mT')).toBeInTheDocument();
    // The measured values are joined by a line, from the first position to the last.
    expect(document.querySelector('[data-measured-line]')?.getAttribute('d')).toMatch(/^M\S+ \S+( C\S+ \S+ \S+ \S+ \S+ \S+){2}$/);

    fireEvent.keyDown(tab(/ตอนที่ 2/), { key: 'ArrowLeft' });
    expect(tab(/ตอนที่ 1/)).toHaveAttribute('aria-selected', 'true');
    expect(tab(/ตอนที่ 1/)).toHaveFocus();
  });

  it('shows a point\'s values when it is pointed at or focused', () => {
    show();
    const [first] = points();
    fireEvent.mouseEnter(first);
    expect(screen.getByText('วัดจริง 0.230 mT')).toBeInTheDocument();
    fireEvent.blur(first);
    fireEvent.focus(points()[2]);
    expect(screen.getByText('วัดจริง 0.700 mT')).toBeInTheDocument();
  });

  it('says what is missing when a part has no values, and offers nothing to save', () => {
    show([probe(0, 0.4)]);
    expect(screen.getByText(/ยังไม่มีค่าของตอนนี้ เลือกขดลวดเดี่ยว/)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /บันทึกกราฟเป็น PNG/ })).toBeDisabled();
    fireEvent.click(tab(/ตอนที่ 2/));
    expect(screen.getByRole('button', { name: /บันทึกกราฟเป็น PNG/ })).toBeEnabled();
  });

  it('leaves out, and names, readings that had no sensor value', () => {
    show([coil(1, 0.23), coil(2, null), probe(0, 0.4), probe(5, null)]);
    expect(points()).toHaveLength(1);
    expect(screen.getByText(/ขดลวด 2 รอบ ไม่มีค่า/)).toBeInTheDocument();
    expect(screen.getByText(/วัดแล้ว 1 จาก 3 ขดลวด/)).toBeInTheDocument();
    fireEvent.click(tab(/ตอนที่ 2/));
    expect(screen.getByText(/ตำแหน่ง \+5 cm ไม่มีค่า/)).toBeInTheDocument();
  });

  it.each([
    ['the close button', () => fireEvent.click(screen.getByRole('button', { name: 'ปิดกราฟ' }))],
    ['Escape', () => fireEvent.keyDown(screen.getByRole('dialog'), { key: 'Escape' })],
    ['a click outside it', () => fireEvent.mouseDown(screen.getByRole('dialog').parentElement as HTMLElement)],
  ])('closes with %s', (_how, close) => {
    const onClose = show();
    close();
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('does not close for a click inside it', () => {
    const onClose = show();
    fireEvent.mouseDown(screen.getByRole('dialog'));
    expect(onClose).not.toHaveBeenCalled();
  });

  it('brings the points in when a graph is shown, and keeps still for reduced motion', () => {
    show();
    expect(anime.animate).toHaveBeenCalled();
    jest.clearAllMocks();
    installMatchMedia({ [REDUCED]: true });
    fireEvent.click(tab(/ตอนที่ 2/));
    expect(anime.animate).not.toHaveBeenCalled();
  });
});

describe('the summary\'s graph button', () => {
  const T0 = new Date(2026, 9, 8, 10, 0, 0).getTime();
  const EVENTS: LabEvent[] = [
    { at: T0, kind: 'start' },
    { at: T0 + 60_000, kind: 'reading', instrument: 'ขดลวดเดี่ยว 1 รอบ', I: 5, bTheory: 0.2417, bMeasured: 0.23 },
    { at: T0 + 90_000, kind: 'end', detail: 'finished' },
  ];

  it('opens the graphs, and closing them hands focus back to it', () => {
    render(<LabSummary events={EVENTS} experimentName="LAB 8" onLeave={() => {}} />);
    const button = screen.getByRole('button', { name: 'กราฟ' });
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();

    fireEvent.click(button);
    const dialog = screen.getByRole('dialog', { name: 'กราฟผลการทดลอง' });
    expect(within(dialog).getAllByRole('img').filter((el) => el.hasAttribute('data-point'))).toHaveLength(1);

    fireEvent.click(within(dialog).getByRole('button', { name: 'ปิดกราฟ' }));
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(button).toHaveFocus();
  });
});
