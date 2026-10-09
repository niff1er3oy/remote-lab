import { describeEvent, difference, differencePercent, readingsOf, summarise, toCsv, type LabEvent } from '@/lib/lab-activity';

// 10:00:00 local time, so the clock column reads the same in any time zone.
const T0 = new Date(2026, 9, 8, 10, 0, 0).getTime();
const at = (seconds: number) => T0 + seconds * 1000;

// One visit: a coil, then the solenoid with two probe positions (one refused),
// a question, and the finish button.
const VISIT: LabEvent[] = [
  { at: at(0), kind: 'start' },
  { at: at(1), kind: 'power-on', instrument: 'ขดลวดเดี่ยว 1 รอบ', ok: true },
  { at: at(60), kind: 'reading', instrument: 'ขดลวดเดี่ยว 1 รอบ', I: 5, bTheory: 0.2417, bMeasured: 0.23 },
  { at: at(61), kind: 'power-off', instrument: 'ขดลวดเดี่ยว 1 รอบ', ok: true },
  { at: at(62), kind: 'power-on', instrument: 'โซลีนอยด์ 75 รอบ', ok: true },
  { at: at(90), kind: 'move', instrument: 'โซลีนอยด์ 75 รอบ', ok: true, zCm: 4, I: 1, bTheory: 0.5729, bMeasured: 0.55 },
  { at: at(120), kind: 'move', instrument: 'โซลีนอยด์ 75 รอบ', ok: false, zCm: 7, detail: 'อุปกรณ์กำลังทำงานอยู่' },
  { at: at(150), kind: 'question', detail: 'ทำไมค่าที่วัดได้น้อยกว่าทฤษฎี' },
  { at: at(200), kind: 'move', instrument: 'โซลีนอยด์ 75 รอบ', ok: true, zCm: -8, I: 1, bTheory: 0.2936, bMeasured: null },
  { at: at(299), kind: 'power-off', instrument: 'โซลีนอยด์ 75 รอบ', ok: true },
  { at: at(300), kind: 'end', detail: 'finished' },
];

describe('summarise — the figures at the top of the summary', () => {
  it('measures the visit from the start button to its last event', () => {
    const s = summarise(VISIT);
    expect(s.startedAt).toBe(at(0));
    expect(s.endedAt).toBe(at(300));
    expect(s.durationSeconds).toBe(300);
  });

  it('lists each instrument that was switched on, once, in the order used', () => {
    const again: LabEvent = { at: at(301), kind: 'power-on', instrument: 'ขดลวดเดี่ยว 1 รอบ', ok: true };
    expect(summarise([...VISIT, again]).instruments).toEqual(['ขดลวดเดี่ยว 1 รอบ', 'โซลีนอยด์ 75 รอบ']);
  });

  it('does not count an instrument that failed to switch on as used', () => {
    const s = summarise([{ at: at(0), kind: 'start' }, { at: at(1), kind: 'power-on', instrument: 'ขดลวดเดี่ยว 3 รอบ', ok: false, detail: 'x' }]);
    expect(s.instruments).toEqual([]);
    expect(s.failedCommands).toBe(1);
  });

  it('counts rig commands, the ones that failed, and questions', () => {
    const s = summarise(VISIT);
    expect(s.commands).toBe(7); // 2 on, 2 off, 3 moves
    expect(s.failedCommands).toBe(1);
    expect(s.questions).toBe(1);
  });

  it('is all zeroes for a visit in which nothing happened', () => {
    expect(summarise([])).toEqual({
      background: null,
      startedAt: null, endedAt: null, durationSeconds: 0, instruments: [], commands: 0, failedCommands: 0, questions: 0, readings: [],
    });
  });
});

describe('readingsOf — the values that came out of the visit', () => {
  it('takes a coil\'s reading and each probe position the solenoid reached', () => {
    expect(readingsOf(VISIT)).toEqual([
      { instrument: 'ขดลวดเดี่ยว 1 รอบ', zCm: null, I: 5, bTheory: 0.2417, bMeasured: 0.23 },
      { instrument: 'โซลีนอยด์ 75 รอบ', zCm: 4, I: 1, bTheory: 0.5729, bMeasured: 0.55 },
      { instrument: 'โซลีนอยด์ 75 รอบ', zCm: -8, I: 1, bTheory: 0.2936, bMeasured: null },
    ]);
  });

  it('leaves out a position the probe never reached', () => {
    expect(readingsOf(VISIT).some((r) => r.zCm === 7)).toBe(false);
  });

  it('keeps only the latest value when a position is measured again', () => {
    const again: LabEvent = { at: at(250), kind: 'move', instrument: 'โซลีนอยด์ 75 รอบ', ok: true, zCm: 4, I: 1, bTheory: 0.5729, bMeasured: 0.57 };
    const readings = readingsOf([...VISIT, again]);
    expect(readings.filter((r) => r.zCm === 4)).toEqual([{ instrument: 'โซลีนอยด์ 75 รอบ', zCm: 4, I: 1, bTheory: 0.5729, bMeasured: 0.57 }]);
    expect(readings).toHaveLength(3);
  });

  it('keeps a reading with no sensor signal as no measurement, not as the theory value', () => {
    const reading = readingsOf(VISIT).find((r) => r.zCm === -8)!;
    expect(reading.bMeasured).toBeNull();
    expect(difference(reading)).toBeNull();
    expect(differencePercent(reading)).toBeNull();
  });
});

describe('difference and differencePercent', () => {
  it('give measured minus theory, in mT and as a share of theory', () => {
    expect(difference({ bTheory: 0.5, bMeasured: 0.45 })).toBeCloseTo(-0.05, 10);
    expect(differencePercent({ bTheory: 0.5, bMeasured: 0.45 })).toBeCloseTo(-10, 10);
  });

  it('give no percentage against a theory value of zero', () => {
    expect(differencePercent({ bTheory: 0, bMeasured: 0.1 })).toBeNull();
  });
});

describe('describeEvent — one line per event', () => {
  it('says what was done', () => {
    expect(VISIT.map(describeEvent)).toEqual([
      'เริ่มการทดลอง',
      'เปิดใช้ ขดลวดเดี่ยว 1 รอบ',
      'ขดลวดเดี่ยว 1 รอบ · B = 0.230 mT (ทฤษฎี 0.242 mT)',
      'ตัดวงจร ขดลวดเดี่ยว 1 รอบ',
      'เปิดใช้ โซลีนอยด์ 75 รอบ',
      'เลื่อนหัววัดไป Z = +4 cm · B = 0.550 mT',
      'เลื่อนหัววัดไป Z = +7 cm ไม่สำเร็จ: อุปกรณ์กำลังทำงานอยู่',
      'ถามผู้ช่วย: ทำไมค่าที่วัดได้น้อยกว่าทฤษฎี',
      'เลื่อนหัววัดไป Z = -8 cm · B = ไม่มีสัญญาณเซนเซอร์',
      'ตัดวงจร โซลีนอยด์ 75 รอบ',
      'สิ้นสุดการทดลอง',
    ]);
  });

  it('says so when the visit ended because the time ran out', () => {
    expect(describeEvent({ at: at(0), kind: 'end', detail: 'time-up' })).toBe('หมดเวลา สิ้นสุดการทดลอง');
  });

  it('gives the rig\'s reason when a circuit could not be switched', () => {
    expect(describeEvent({ at: at(0), kind: 'power-on', instrument: 'ขดลวดเดี่ยว 3 รอบ', ok: false, detail: 'สคริปต์ผิดพลาด' }))
      .toBe('เปิดใช้ ขดลวดเดี่ยว 3 รอบ ไม่สำเร็จ: สคริปต์ผิดพลาด');
  });
});

describe('the power supply in the record', () => {
  const on: LabEvent = { at: at(5), kind: 'supply', ok: true, detail: 'on' };
  const offFailed: LabEvent = { at: at(9), kind: 'supply', ok: false, detail: 'off' };

  it('is described as switched on or off, and as failed when the rig refused', () => {
    expect(describeEvent(on)).toBe('เปิดแหล่งจ่ายไฟ');
    expect(describeEvent({ ...on, detail: 'off' })).toBe('ปิดแหล่งจ่ายไฟ');
    expect(describeEvent(offFailed)).toBe('ปิดแหล่งจ่ายไฟไม่สำเร็จ');
  });

  it('counts as a rig command', () => {
    expect(summarise([on, offFailed])).toMatchObject({ commands: 2, failedCommands: 1 });
  });

  it('is written to the CSV with its result', () => {
    const [, first, second] = toCsv([on, offFailed]).trimEnd().split('\r\n');
    expect(first).toBe('2026-10-08,10:00:05,แหล่งจ่ายไฟ,,,,,,,,สำเร็จ,เปิด');
    expect(second).toBe('2026-10-08,10:00:09,แหล่งจ่ายไฟ,,,,,,,,ไม่สำเร็จ,ปิด');
  });
});

describe('toCsv — the download', () => {
  const lines = (events: LabEvent[]) => toCsv(events).trimEnd().split('\r\n');

  it('has a header and one row per event, oldest first', () => {
    const csv = lines(VISIT);
    expect(csv).toHaveLength(VISIT.length + 1);
    expect(csv[0]).toBe('วันที่,เวลา,เหตุการณ์,อุปกรณ์,Z (cm),I (A),B ทฤษฎี (mT),B วัดจริง (mT),ΔB (mT),ΔB (%),ผล,รายละเอียด');
    expect(csv[1]).toBe('2026-10-08,10:00:00,เริ่มการทดลอง,,,,,,,,,');
  });

  it('writes a measurement with its values and the difference from theory', () => {
    expect(lines(VISIT)[6]).toBe('2026-10-08,10:01:30,เลื่อนหัววัด,โซลีนอยด์ 75 รอบ,4,1.00,0.5729,0.5500,-0.0229,-4.00,สำเร็จ,');
    expect(lines(VISIT)[3]).toBe('2026-10-08,10:01:00,ค่าที่อ่านได้,ขดลวดเดี่ยว 1 รอบ,,5.00,0.2417,0.2300,-0.0117,-4.84,,');
  });

  it('leaves the measured columns empty when the sensor sent nothing', () => {
    expect(lines(VISIT)[9]).toBe('2026-10-08,10:03:20,เลื่อนหัววัด,โซลีนอยด์ 75 รอบ,-8,1.00,0.2936,,,,สำเร็จ,');
  });

  it('marks a refused command and gives the reason', () => {
    expect(lines(VISIT)[7]).toBe('2026-10-08,10:02:00,เลื่อนหัววัด,โซลีนอยด์ 75 รอบ,7,,,,,,ไม่สำเร็จ,อุปกรณ์กำลังทำงานอยู่');
  });

  it('says how the visit ended', () => {
    expect(lines(VISIT)[11]).toBe('2026-10-08,10:05:00,สิ้นสุดการทดลอง,,,,,,,,,กดเสร็จสิ้น');
    expect(lines([{ at: at(0), kind: 'end', detail: 'time-up' }])[1]).toMatch(/,หมดเวลา$/);
  });

  it('quotes a question that holds commas, quotes or line breaks, so it stays one cell', () => {
    const csv = toCsv([{ at: at(0), kind: 'question', detail: 'B = 0.5, "จริง" ไหม\nบรรทัดสอง' }]);
    expect(csv).toContain(',"B = 0.5, ""จริง"" ไหม\nบรรทัดสอง"\r\n');
  });

  it.each(['=1+1', '+SUM(A1)', '-2+3', '@cmd'])('keeps the question %p from running as a spreadsheet formula', (question) => {
    const row = lines([{ at: at(0), kind: 'question', detail: question }])[1];
    expect(row.endsWith(`,'${question}`)).toBe(true);
  });

  it('is only the header for a visit with no events', () => {
    expect(lines([])).toHaveLength(1);
  });
});

describe('the background field in the record', () => {
  const read: LabEvent = { at: at(1), kind: 'background', ok: true, bMeasured: 0.0523 };
  const notRead: LabEvent = { at: at(1), kind: 'background', ok: false, bMeasured: null };

  it('says what was read and that it is taken off what follows', () => {
    expect(describeEvent(read)).toBe('อ่านสนามพื้นหลัง 0.052 mT ก่อนเปิดอุปกรณ์ ค่าที่วัดได้หลังจากนี้หักค่านี้ออกแล้ว');
  });

  it('says so when it could not be read, and what that means for the values', () => {
    expect(describeEvent(notRead)).toBe('อ่านสนามพื้นหลังไม่ได้ เพราะเซนเซอร์ไม่ส่งค่า ค่าที่วัดได้จึงยังรวมสนามพื้นหลัง');
  });

  it('is in the summary as the value taken off every measurement', () => {
    expect(summarise([VISIT[0], read, ...VISIT.slice(1)]).background).toBe(0.0523);
  });

  it('is absent from the summary when it was not read, or never tried', () => {
    expect(summarise([VISIT[0], notRead, ...VISIT.slice(1)]).background).toBeNull();
    expect(summarise(VISIT).background).toBeNull();
  });

  it('is not one of the readings, and not a rig command', () => {
    const withBackground = [VISIT[0], read, ...VISIT.slice(1)];
    expect(readingsOf(withBackground)).toEqual(readingsOf(VISIT));
    expect(summarise(withBackground).commands).toBe(summarise(VISIT).commands);
    expect(summarise([notRead]).failedCommands).toBe(0);
  });

  it('is written to the CSV with its value and what it is for', () => {
    const [, first] = toCsv([read]).trimEnd().split('\r\n');
    expect(first).toBe('2026-10-08,10:00:01,สนามพื้นหลัง,,,,,0.0523,,,สำเร็จ,ค่าที่วัดได้หลังจากนี้หักค่านี้ออกแล้ว');
  });

  it('is written to the CSV as not read, with no value', () => {
    const [, first] = toCsv([notRead]).trimEnd().split('\r\n');
    expect(first).toBe('2026-10-08,10:00:01,สนามพื้นหลัง,,,,,,,,ไม่สำเร็จ,เซนเซอร์ไม่ส่งค่า ค่าที่วัดได้ยังรวมสนามพื้นหลัง');
  });
});
