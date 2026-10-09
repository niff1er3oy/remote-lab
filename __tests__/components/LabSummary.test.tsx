import { fireEvent, render, screen, within } from '@testing-library/react';
import LabSummary from '@/app/lab/LabSummary';
import type { LabEvent } from '@/lib/lab-activity';
import type { AnimeMock } from '../helpers/client/anime';
import { installMatchMedia, type MediaControl } from '../helpers/client/matchMedia';

jest.mock('animejs', () => jest.requireActual<typeof import('../helpers/client/anime')>('../helpers/client/anime').animeMock());

const anime = jest.requireMock<AnimeMock>('animejs');

// 10:00:00 local time, so clock times and the file name read the same in any time zone.
const T0 = new Date(2026, 9, 8, 10, 0, 0).getTime();
const at = (seconds: number) => T0 + seconds * 1000;

const COIL = 'ขดลวดเดี่ยว 1 รอบ';
const SOLENOID = 'โซลีนอยด์ 75 รอบ';
const EXPERIMENT = 'สนามแม่เหล็กของขดลวดและโซลีนอยด์';
const REDUCED = '(prefers-reduced-motion: reduce)';
const DOWNLOAD = 'ดาวน์โหลด CSV';
const LEAVE = 'กลับหน้าหลัก';
const NO_SENSOR_NOTE = /เซนเซอร์ไม่ส่งค่า/;
const NO_VALUE = '—';

// The visit used in lab-activity.test.ts: a coil, then the solenoid with two
// probe positions reached (one without a sensor value) and one refused, a
// question, and the finish button.
const VISIT: LabEvent[] = [
  { at: at(0), kind: 'start' },
  { at: at(1), kind: 'power-on', instrument: COIL, ok: true },
  { at: at(60), kind: 'reading', instrument: COIL, I: 5, bTheory: 0.2417, bMeasured: 0.23 },
  { at: at(61), kind: 'power-off', instrument: COIL, ok: true },
  { at: at(62), kind: 'power-on', instrument: SOLENOID, ok: true },
  { at: at(90), kind: 'move', instrument: SOLENOID, ok: true, zCm: 4, I: 1, bTheory: 0.5729, bMeasured: 0.55 },
  { at: at(120), kind: 'move', instrument: SOLENOID, ok: false, zCm: 7, detail: 'อุปกรณ์กำลังทำงานอยู่' },
  { at: at(150), kind: 'question', detail: 'ทำไมค่าที่วัดได้น้อยกว่าทฤษฎี' },
  { at: at(200), kind: 'move', instrument: SOLENOID, ok: true, zCm: -8, I: 1, bTheory: 0.2936, bMeasured: null },
  { at: at(299), kind: 'power-off', instrument: SOLENOID, ok: true },
  { at: at(300), kind: 'end', detail: 'finished' },
];

const reading = (bTheory: number, bMeasured: number | null, instrument = COIL): LabEvent =>
  ({ at: at(10), kind: 'reading', instrument, I: 2, bTheory, bMeasured });

const show = (events: LabEvent[], onLeave: () => void = () => {}) =>
  render(<LabSummary events={events} experimentName={EXPERIMENT} onLeave={onLeave} />);

const figure = (label: string) => screen.getByText(label).parentElement as HTMLElement;
const bodyRows = () => screen.getAllByRole('row').slice(1);
const cellsOf = (row: HTMLElement) => within(row).getAllByRole('cell');
const cellTexts = (row: HTMLElement) => cellsOf(row).map(cell => cell.textContent);

let media: MediaControl;

beforeEach(() => {
  jest.clearAllMocks();
  media = installMatchMedia();
});

describe('LabSummary', () => {
  describe('the heading', () => {
    it('says the experiment has ended when the student finished it', () => {
      show(VISIT);

      expect(screen.getByRole('heading', { level: 1, name: 'สรุปการทดลอง' })).toBeInTheDocument();
      expect(screen.getByText('การทดลองสิ้นสุดแล้ว')).toBeInTheDocument();
      expect(screen.queryByText('หมดเวลาของรอบนี้แล้ว')).not.toBeInTheDocument();
    });

    it('says the time ran out when the visit ended that way', () => {
      show([...VISIT.slice(0, -1), { at: at(300), kind: 'end', detail: 'time-up' }]);

      expect(screen.getByText('หมดเวลาของรอบนี้แล้ว')).toBeInTheDocument();
      expect(screen.queryByText('การทดลองสิ้นสุดแล้ว')).not.toBeInTheDocument();
    });

    it('names the experiment', () => {
      show(VISIT);
      expect(screen.getByText(EXPERIMENT)).toBeInTheDocument();
    });

    it('gives the date of the visit and the times it started and ended', () => {
      show(VISIT);

      const when = screen.getByText(/10:00:00 ถึง 10:05:00/);
      expect(when).toHaveTextContent('8 ตุลาคม 2569');
    });

    it('gives no date or times for a visit in which nothing happened', () => {
      show([]);
      expect(screen.queryByText(/\d ถึง \d/)).not.toBeInTheDocument();
    });
  });

  describe('the five figures', () => {
    it('show the time spent, instruments used, rig commands, values recorded and questions asked', () => {
      show(VISIT);

      expect(figure('เวลาที่ใช้')).toHaveTextContent('5 นาที 0 วินาที');
      expect(figure('อุปกรณ์ที่ใช้')).toHaveTextContent('2 ชุด');
      expect(figure('คำสั่งอุปกรณ์')).toHaveTextContent('7 ครั้ง');
      expect(figure('ค่าที่บันทึก')).toHaveTextContent('3 ค่า');
      expect(figure('คำถามถึงผู้ช่วย')).toHaveTextContent('1 ข้อ');
      expect(screen.getAllByRole('term')).toHaveLength(5);
    });

    it('say how many rig commands failed', () => {
      show(VISIT);
      expect(figure('คำสั่งอุปกรณ์')).toHaveTextContent('ไม่สำเร็จ 1 ครั้ง');
    });

    it('say nothing about failed commands when every command worked', () => {
      show(VISIT.filter(e => e.ok !== false));

      expect(figure('คำสั่งอุปกรณ์')).toHaveTextContent(/^คำสั่งอุปกรณ์6 ครั้ง$/);
      expect(screen.queryByText(/^ไม่สำเร็จ/)).not.toBeInTheDocument();
    });

    it.each([
      [42, '42 วินาที'],
      [65, '1 นาที 5 วินาที'],
      [3900, '1 ชม. 5 นาที'],
    ])('write a visit of %i seconds as %s', (seconds, text) => {
      show([{ at: at(0), kind: 'start' }, { at: at(seconds), kind: 'end', detail: 'finished' }]);
      expect(figure('เวลาที่ใช้')).toHaveTextContent(new RegExp(`^เวลาที่ใช้${text}$`));
    });

    it('are all zero for a visit in which nothing happened', () => {
      show([]);

      expect(figure('เวลาที่ใช้')).toHaveTextContent('0 วินาที');
      expect(figure('อุปกรณ์ที่ใช้')).toHaveTextContent('0 ชุด');
      expect(figure('คำสั่งอุปกรณ์')).toHaveTextContent('0 ครั้ง');
      expect(figure('ค่าที่บันทึก')).toHaveTextContent('0 ค่า');
      expect(figure('คำถามถึงผู้ช่วย')).toHaveTextContent('0 ข้อ');
    });
  });

  describe('the table of readings', () => {
    it('has a column for the instrument, the position, the current, both fields and both differences', () => {
      show(VISIT);

      expect(screen.getAllByRole('columnheader').map(th => th.textContent))
        .toEqual(['อุปกรณ์', 'Z (cm)', 'I (A)', 'B ทฤษฎี (mT)', 'B วัดจริง (mT)', 'ΔB (mT)', 'ΔB (%)']);
    });

    it('has one row per reading, in the order they were taken', () => {
      show(VISIT);

      expect(bodyRows().map(cellTexts)).toEqual([
        [COIL, NO_VALUE, '5.00', '0.242', '0.230', '-0.012', '-4.8'],
        [SOLENOID, '+4', '1.00', '0.573', '0.550', '-0.023', '-4.0'],
        [SOLENOID, '-8', '1.00', '0.294', NO_VALUE, NO_VALUE, NO_VALUE],
      ]);
    });

    it('leaves the measured value and both differences blank for a reading with no sensor value, and explains the blank', () => {
      show([reading(0.5, null)]);

      expect(cellTexts(bodyRows()[0]).slice(3)).toEqual(['0.500', NO_VALUE, NO_VALUE, NO_VALUE]);
      expect(screen.getByText(NO_SENSOR_NOTE)).toBeInTheDocument();
    });

    it('does not explain the blank when every reading has a sensor value', () => {
      show([reading(0.5, 0.49)]);
      expect(screen.queryByText(NO_SENSOR_NOTE)).not.toBeInTheDocument();
    });

    it.each([
      ['below', 0.45, '-0.050', '-10.0'],
      ['above', 0.55, '+0.050', '+10.0'],
    ])('makes a difference of more than 5 percent %s theory stand out', (_side, measured, mT, percent) => {
      show([reading(0.5, measured, COIL), reading(0.5, 0.49, SOLENOID)]);

      const [far, near] = bodyRows().map(cellsOf);
      expect([far[5].textContent, far[6].textContent]).toEqual([mT, percent]);
      expect([near[5].textContent, near[6].textContent]).toEqual(['-0.010', '-2.0']);
      expect(far[5].className).not.toBe(near[5].className);
      expect(far[6].className).not.toBe(near[6].className);
      // Only the two difference columns are marked.
      expect(far.slice(0, 5).map(c => c.className)).toEqual(near.slice(0, 5).map(c => c.className));
    });

    it('signs a measured value above theory with a plus', () => {
      show([reading(0.5, 0.51)]);
      expect(cellTexts(bodyRows()[0]).slice(5)).toEqual(['+0.010', '+2.0']);
    });

    it('gives the difference in mT but no percentage against a theory value of zero', () => {
      show([reading(0, 0.02)]);
      expect(cellTexts(bodyRows()[0]).slice(3)).toEqual(['0.000', '0.020', '+0.020', NO_VALUE]);
    });

    it('writes the probe at the centre as 0 with no sign', () => {
      show([{ at: at(5), kind: 'move', instrument: SOLENOID, ok: true, zCm: 0, I: 1, bTheory: 0.6, bMeasured: 0.59 }]);
      expect(cellTexts(bodyRows()[0])[1]).toBe('0');
    });

    it('is replaced by a line saying nothing was recorded when there are no readings', () => {
      show([{ at: at(0), kind: 'start' }, { at: at(30), kind: 'end', detail: 'finished' }]);

      expect(screen.getByText('รอบนี้ยังไม่มีค่าที่บันทึกไว้')).toBeInTheDocument();
      expect(screen.queryByRole('table')).not.toBeInTheDocument();
      expect(screen.queryByText(NO_SENSOR_NOTE)).not.toBeInTheDocument();
    });
  });

  describe('the timeline', () => {
    it('lists every event with its time, oldest first', () => {
      show(VISIT);

      expect(screen.getAllByRole('listitem').map(li => li.textContent)).toEqual([
        '10:00:00เริ่มการทดลอง',
        `10:00:01เปิดใช้ ${COIL}`,
        `10:01:00${COIL} · B = 0.230 mT (ทฤษฎี 0.242 mT)`,
        `10:01:01ตัดวงจร ${COIL}`,
        `10:01:02เปิดใช้ ${SOLENOID}`,
        '10:01:30เลื่อนหัววัดไป Z = +4 cm · B = 0.550 mT',
        '10:02:00เลื่อนหัววัดไป Z = +7 cm ไม่สำเร็จ: อุปกรณ์กำลังทำงานอยู่',
        '10:02:30ถามผู้ช่วย: ทำไมค่าที่วัดได้น้อยกว่าทฤษฎี',
        '10:03:20เลื่อนหัววัดไป Z = -8 cm · B = ไม่มีสัญญาณเซนเซอร์',
        `10:04:59ตัดวงจร ${SOLENOID}`,
        '10:05:00สิ้นสุดการทดลอง',
      ]);
    });

    it('says how many events there are', () => {
      show(VISIT);
      expect(screen.getByRole('heading', { name: /ลำดับเหตุการณ์/ })).toHaveTextContent(/^ลำดับเหตุการณ์ 11$/);
    });

    it('makes a failed event look different from one that worked and from one that is not a command', () => {
      show(VISIT);

      const failed = screen.getByText('เลื่อนหัววัดไป Z = +7 cm ไม่สำเร็จ: อุปกรณ์กำลังทำงานอยู่');
      const worked = screen.getByText('เลื่อนหัววัดไป Z = +4 cm · B = 0.550 mT');
      const notACommand = screen.getByText('เริ่มการทดลอง');
      expect(failed.className).not.toBe(worked.className);
      expect(notACommand.className).toBe(worked.className);
    });

    it('marks every failed event and no other', () => {
      const events: LabEvent[] = [
        { at: at(0), kind: 'start' },
        { at: at(1), kind: 'supply', ok: false, detail: 'on' },
        { at: at(2), kind: 'power-on', instrument: COIL, ok: false, detail: 'สคริปต์ผิดพลาด' },
        { at: at(3), kind: 'supply', ok: true, detail: 'on' },
        { at: at(4), kind: 'end', detail: 'time-up' },
      ];
      show(events);

      const lines = screen.getAllByRole('listitem').map(li => li.lastElementChild as HTMLElement);
      const plain = lines[0].className;
      expect(lines.map(line => line.className !== plain)).toEqual([false, true, true, false, false]);
      expect(lines[4]).toHaveTextContent('หมดเวลา สิ้นสุดการทดลอง');
    });

    it('is empty for a visit in which nothing happened', () => {
      show([]);

      expect(screen.queryByRole('listitem')).not.toBeInTheDocument();
      expect(screen.getByRole('heading', { name: /ลำดับเหตุการณ์/ })).toHaveTextContent(/^ลำดับเหตุการณ์ 0$/);
    });
  });

  describe('the CSV download', () => {
    const BLOB_URL = 'blob:lab-summary-test';
    const urlApi = URL as unknown as { createObjectURL?: unknown; revokeObjectURL?: unknown };
    const createObjectURL = jest.fn<string, [Blob]>(() => BLOB_URL);
    const revokeObjectURL = jest.fn<void, [string]>();
    let clicked: Array<{ href: string; download: string; revokedBefore: number }>;

    // jsdom has neither URL.createObjectURL nor a download to follow, so the
    // blob and the link the component clicks are caught here instead.
    beforeEach(() => {
      clicked = [];
      urlApi.createObjectURL = createObjectURL;
      urlApi.revokeObjectURL = revokeObjectURL;
      jest.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(function (this: HTMLAnchorElement) {
        clicked.push({ href: this.getAttribute('href') ?? '', download: this.download, revokedBefore: revokeObjectURL.mock.calls.length });
      });
    });

    afterEach(() => {
      jest.restoreAllMocks();
      jest.useRealTimers();
      delete urlApi.createObjectURL;
      delete urlApi.revokeObjectURL;
    });

    const download = () => fireEvent.click(screen.getByRole('button', { name: DOWNLOAD }));

    // jsdom's Blob cannot be read directly; FileReader gives the bytes as stored.
    const bytesOf = (blob: Blob) => new Promise<Buffer>((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(Buffer.from(reader.result as ArrayBuffer));
      reader.onerror = () => reject(reader.error);
      reader.readAsArrayBuffer(blob);
    });

    const handedOver = async () => {
      expect(createObjectURL).toHaveBeenCalledTimes(1);
      const blob = createObjectURL.mock.calls[0][0];
      return { blob, bytes: await bytesOf(blob) };
    };

    it('hands the browser nothing until the button is clicked', () => {
      show(VISIT);

      expect(createObjectURL).not.toHaveBeenCalled();
      expect(clicked).toEqual([]);
    });

    it('starts with a byte-order mark so a spreadsheet reads the Thai text as UTF-8', async () => {
      show(VISIT);
      download();

      const { blob, bytes } = await handedOver();
      expect([...bytes.subarray(0, 3)]).toEqual([0xef, 0xbb, 0xbf]);
      expect([...bytes.subarray(3, 6)]).not.toEqual([0xef, 0xbb, 0xbf]);
      expect(blob.type).toBe('text/csv;charset=utf-8');
    });

    it('holds a header and one row for every event of the visit', async () => {
      show(VISIT);
      download();

      const { bytes } = await handedOver();
      const text = bytes.subarray(3).toString('utf8');
      expect(text.endsWith('\r\n')).toBe(true);
      const lines = text.trimEnd().split('\r\n');
      expect(lines).toHaveLength(VISIT.length + 1);
      expect(lines[0]).toBe('วันที่,เวลา,เหตุการณ์,อุปกรณ์,Z (cm),I (A),B ทฤษฎี (mT),B วัดจริง (mT),ΔB (mT),ΔB (%),ผล,รายละเอียด');
      expect(lines[1]).toBe('2026-10-08,10:00:00,เริ่มการทดลอง,,,,,,,,,');
      expect(lines[6]).toBe(`2026-10-08,10:01:30,เลื่อนหัววัด,${SOLENOID},4,1.00,0.5729,0.5500,-0.0229,-4.00,สำเร็จ,`);
      expect(lines[7]).toBe(`2026-10-08,10:02:00,เลื่อนหัววัด,${SOLENOID},7,,,,,,ไม่สำเร็จ,อุปกรณ์กำลังทำงานอยู่`);
      expect(lines[11]).toBe('2026-10-08,10:05:00,สิ้นสุดการทดลอง,,,,,,,,,กดเสร็จสิ้น');
    });

    it('names the file after the date and time the visit started', () => {
      show(VISIT);
      download();

      expect(clicked).toHaveLength(1);
      expect(clicked[0].download).toBe('lab8_2026-10-08_1000.csv');
    });

    it('pads single-digit months, days, hours and minutes in the file name', () => {
      const early = new Date(2026, 0, 5, 9, 7, 0).getTime();
      show([{ at: early, kind: 'start' }, { at: early + 1000, kind: 'end', detail: 'finished' }]);
      download();

      expect(clicked[0].download).toBe('lab8_2026-01-05_0907.csv');
    });

    it('points the download at the file it made and releases it afterwards', () => {
      show(VISIT);
      download();

      expect(clicked[0].href).toBe(BLOB_URL);
      expect(clicked[0].revokedBefore).toBe(0);
      expect(revokeObjectURL.mock.calls).toEqual([[BLOB_URL]]);
    });

    it('makes a fresh file each time the button is clicked', () => {
      show(VISIT);
      download();
      download();

      expect(createObjectURL).toHaveBeenCalledTimes(2);
      expect(clicked.map(c => c.download)).toEqual(['lab8_2026-10-08_1000.csv', 'lab8_2026-10-08_1000.csv']);
    });

    it('gives a visit with no events a header-only file named after the present moment', async () => {
      jest.useFakeTimers();
      jest.setSystemTime(new Date(2026, 2, 4, 14, 30, 0));
      show([]);
      download();
      // FileReader needs real timers to deliver the bytes.
      jest.useRealTimers();

      expect(clicked[0].download).toBe('lab8_2026-03-04_1430.csv');
      const { bytes } = await handedOver();
      expect([...bytes.subarray(0, 3)]).toEqual([0xef, 0xbb, 0xbf]);
      expect(bytes.subarray(3).toString('utf8').trimEnd().split('\r\n')).toHaveLength(1);
    });

    it('does not leave the page', () => {
      const onLeave = jest.fn();
      show(VISIT, onLeave);
      download();

      expect(onLeave).not.toHaveBeenCalled();
    });
  });

  describe('the leave button', () => {
    it('calls back once when clicked', () => {
      const onLeave = jest.fn();
      show(VISIT, onLeave);
      expect(onLeave).not.toHaveBeenCalled();

      fireEvent.click(screen.getByRole('button', { name: LEAVE }));

      expect(onLeave).toHaveBeenCalledTimes(1);
    });

    it('comes with a warning that the record is not kept', () => {
      show(VISIT);
      expect(screen.getByText(/บันทึกนี้ไม่ถูกเก็บไว้ในระบบ/)).toBeInTheDocument();
    });
  });

  describe('motion', () => {
    it('brings the sections and the rows in when the summary appears', () => {
      show(VISIT);
      expect(anime.animate).toHaveBeenCalledTimes(2);
    });

    it('animates nothing when the visitor asked for reduced motion', () => {
      media.set(REDUCED, true);
      show(VISIT);

      expect(anime.animate).not.toHaveBeenCalled();
    });

    it('stops its animations when the summary goes away', () => {
      const { unmount } = show(VISIT);
      const started = anime.animate.mock.results.map(result => result.value as { pause: jest.Mock });

      unmount();

      expect(started.map(animation => animation.pause.mock.calls.length)).toEqual([1, 1]);
    });

    // anime.js is not running in these tests, so anything that waited on it to
    // become visible would still be hidden here.
    it('leaves the heading, the rows and the buttons visible without the animation', () => {
      show(VISIT);

      const pieces = [
        screen.getByRole('heading', { level: 1 }).parentElement as HTMLElement,
        bodyRows()[0],
        screen.getAllByRole('listitem')[0],
        screen.getByRole('button', { name: DOWNLOAD }).parentElement as HTMLElement,
      ];
      expect(pieces.map(piece => piece.style.opacity)).toEqual(['', '', '', '']);
    });
  });
});
