import {
  describeEvent, difference, differencePercent, END_HEADLINE, endReasonOf, EVENT_KINDS, positionsOf, readingsCsv, readingsOf, summarise, toCsv, visitCsv,
  type LabEvent,
} from '@/lib/lab-activity';

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
      background: null, rezeroed: 0, zero: null, entries: 0,
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

describe('Set 0 in the record', () => {
  const entry: LabEvent = { at: at(1), kind: 'background', ok: true, bMeasured: 0.0523 };
  const again: LabEvent = { at: at(70), kind: 'zero', ok: true, bMeasured: 0.0481 };
  const failed: LabEvent = { at: at(80), kind: 'zero', ok: false, bMeasured: null };

  it('says what the zero was set to and that it is taken off what follows', () => {
    expect(describeEvent(again)).toBe('ตั้งศูนย์ใหม่ (Set 0) ที่ 0.048 mT ค่าที่วัดได้หลังจากนี้หักค่านี้ออกแล้ว');
  });

  it('says so when it could not be set, and that the old zero still stands', () => {
    expect(describeEvent(failed)).toBe('ตั้งศูนย์ (Set 0) ไม่สำเร็จ เพราะเซนเซอร์ไม่ส่งค่า ค่าศูนย์เดิมยังใช้อยู่');
  });

  it('leaves the summary as it was for a visit with no Set 0', () => {
    expect(summarise([VISIT[0], entry, ...VISIT.slice(1)])).toMatchObject({ background: 0.0523, rezeroed: 0, zero: 0.0523 });
  });

  it('counts each Set 0 that worked, and gives the zero in force at the end', () => {
    const later: LabEvent = { at: at(250), kind: 'zero', ok: true, bMeasured: 0.0502 };
    const s = summarise([VISIT[0], entry, ...VISIT.slice(1, 4), again, failed, ...VISIT.slice(4, 9), later, ...VISIT.slice(9)]);
    expect(s).toMatchObject({ background: 0.0523, rezeroed: 2, zero: 0.0502 });
  });

  it('gives a zero even when the one on entering could not be read', () => {
    const notRead: LabEvent = { at: at(1), kind: 'background', ok: false, bMeasured: null };
    expect(summarise([VISIT[0], notRead, again])).toMatchObject({ background: null, rezeroed: 1, zero: 0.0481 });
  });

  it('does not count a Set 0 that failed, and keeps the zero that was in force', () => {
    expect(summarise([VISIT[0], entry, failed])).toMatchObject({ rezeroed: 0, zero: 0.0523 });
  });

  it('is not one of the readings, and not a rig command', () => {
    const withZero = [...VISIT.slice(0, 4), again, failed, ...VISIT.slice(4)];
    expect(readingsOf(withZero)).toEqual(readingsOf(VISIT));
    expect(summarise(withZero)).toMatchObject({ commands: summarise(VISIT).commands, failedCommands: summarise(VISIT).failedCommands });
  });

  it('is written to the CSV with the new zero, or as not set', () => {
    const [, first, second] = toCsv([again, failed]).trimEnd().split('\r\n');
    expect(first).toBe('2026-10-08,10:01:10,ตั้งศูนย์ (Set 0),,,,,0.0481,,,สำเร็จ,ค่าที่วัดได้หลังจากนี้หักค่านี้ออกแล้ว');
    expect(second).toBe('2026-10-08,10:01:20,ตั้งศูนย์ (Set 0),,,,,,,,ไม่สำเร็จ,เซนเซอร์ไม่ส่งค่า ค่าศูนย์เดิมยังใช้อยู่');
  });
});

describe('readingsCsv and visitCsv — the table of recorded values in the download', () => {
  it('writes one row per reading, as the summary\'s table shows them', () => {
    expect(readingsCsv(VISIT).trimEnd().split('\r\n')).toEqual([
      'อุปกรณ์,Z (cm),I (A),B ทฤษฎี (mT),B วัดจริง (mT),ΔB (mT),ΔB (%)',
      'ขดลวดเดี่ยว 1 รอบ,,5.00,0.2417,0.2300,-0.0117,-4.84',
      'โซลีนอยด์ 75 รอบ,4,1.00,0.5729,0.5500,-0.0229,-4.00',
      'โซลีนอยด์ 75 รอบ,-8,1.00,0.2936,,,',
    ]);
  });

  it('keeps only the latest value of a position measured twice', () => {
    const again: LabEvent = { at: at(250), kind: 'move', instrument: 'โซลีนอยด์ 75 รอบ', ok: true, zCm: 4, I: 1, bTheory: 0.5729, bMeasured: 0.57 };
    const rows = readingsCsv([...VISIT, again]).trimEnd().split('\r\n');
    expect(rows.filter(r => r.startsWith('โซลีนอยด์ 75 รอบ,4,'))).toEqual(['โซลีนอยด์ 75 รอบ,4,1.00,0.5729,0.5700,-0.0029,-0.51']);
  });

  it('is only the header when nothing was recorded', () => {
    expect(readingsCsv([{ at: at(0), kind: 'start' }])).toBe('อุปกรณ์,Z (cm),I (A),B ทฤษฎี (mT),B วัดจริง (mT),ΔB (mT),ΔB (%)\r\n');
  });

  it('puts the readings first and the timeline after, each under its heading', () => {
    expect(visitCsv(VISIT)).toBe(`ค่าที่บันทึก\r\n${readingsCsv(VISIT)}\r\nลำดับเหตุการณ์\r\n${toCsv(VISIT)}`);
  });

  it('knows every kind of event', () => {
    expect([...EVENT_KINDS].sort()).toEqual(['background', 'end', 'move', 'power-off', 'power-on', 'question', 'reading', 'start', 'supply', 'zero']);
  });
});

describe('how a visit ended', () => {
  const closed: LabEvent = { at: at(300), kind: 'end', detail: 'round-closed' };

  it('is read from the end event', () => {
    expect(endReasonOf(VISIT)).toBe('finished');
    expect(endReasonOf([{ at: at(0), kind: 'end', detail: 'time-up' }])).toBe('time-up');
    expect(endReasonOf([closed])).toBe('round-closed');
  });

  it('is none for a record saved before the visit ended', () => {
    expect(endReasonOf(VISIT.slice(0, -1))).toBeNull();
    expect(endReasonOf([])).toBeNull();
  });

  it('is the last ending when the student came back after one', () => {
    expect(endReasonOf([{ at: at(0), kind: 'end', detail: 'time-up' }, { at: at(5), kind: 'start' }, closed])).toBe('round-closed');
  });

  it('counts an ending with no reason, or one it does not know, as the finish button', () => {
    expect(endReasonOf([{ at: at(0), kind: 'end' }])).toBe('finished');
    expect(endReasonOf([{ at: at(0), kind: 'end', detail: 'something-else' }])).toBe('finished');
  });

  it('says a round ended from outside was ended by an admin or by the clock', () => {
    expect(describeEvent(closed)).toBe('ผู้ดูแลระบบสิ้นสุดรอบ หรือหมดเวลา สิ้นสุดการทดลอง');
    expect(toCsv([closed]).trimEnd().split('\r\n')[1]).toBe('2026-10-08,10:05:00,สิ้นสุดการทดลอง,,,,,,,,,ผู้ดูแลระบบสิ้นสุดรอบ หรือหมดเวลา');
  });

  it('has a headline for every way of ending', () => {
    expect(END_HEADLINE).toEqual({
      finished: 'การทดลองสิ้นสุดแล้ว',
      'time-up': 'หมดเวลาของรอบนี้แล้ว',
      'round-closed': 'รอบนี้สิ้นสุดแล้ว (ผู้ดูแลระบบสิ้นสุดรอบ หรือหมดเวลา)',
    });
  });
});

describe('a visit left and continued in the same round', () => {
  const SOLENOID = 'โซลีนอยด์ 100 รอบ';
  // Ten minutes in the room, twenty away, five more in the room.
  const CONTINUED: LabEvent[] = [
    { at: at(0), kind: 'start' },
    { at: at(1), kind: 'background', ok: true, bMeasured: 0.0523 },
    { at: at(30), kind: 'power-on', instrument: SOLENOID, ok: true },
    { at: at(31), kind: 'move', instrument: SOLENOID, ok: true, zCm: 0, I: 0.3, bTheory: 0.4174, bMeasured: 0.41 },
    { at: at(600), kind: 'move', instrument: SOLENOID, ok: true, zCm: 3, I: 0.3, bTheory: 0.35, bMeasured: 0.34 },
    { at: at(1800), kind: 'start' },
    { at: at(1801), kind: 'background', ok: true, bMeasured: 0.0611 },
    { at: at(1830), kind: 'power-on', instrument: SOLENOID, ok: true },
    { at: at(1831), kind: 'move', instrument: SOLENOID, ok: true, zCm: 0, I: 0.3, bTheory: 0.4174, bMeasured: 0.4 },
    { at: at(2100), kind: 'end', detail: 'finished' },
  ];

  it('counts each entry, and the time in the room without the time away', () => {
    const s = summarise(CONTINUED);
    expect(s.entries).toBe(2);
    expect(s.startedAt).toBe(at(0));
    expect(s.endedAt).toBe(at(2100));
    expect(s.durationSeconds).toBe(600 + 300);
  });

  it('counts one entry for a visit that was never left', () => {
    expect(summarise(VISIT).entries).toBe(1);
  });

  it('holds the earlier part\'s values and the later part\'s, the later one where a position was measured in both', () => {
    expect(readingsOf(CONTINUED)).toEqual([
      { instrument: SOLENOID, zCm: 0, I: 0.3, bTheory: 0.4174, bMeasured: 0.4 },
      { instrument: SOLENOID, zCm: 3, I: 0.3, bTheory: 0.35, bMeasured: 0.34 },
    ]);
  });

  it('gives the background of the first entry, and the zero in force at the end', () => {
    expect(summarise(CONTINUED)).toMatchObject({ background: 0.0523, rezeroed: 0, zero: 0.0611 });
  });

  it('has no zero in force when the background could not be read on coming back', () => {
    const silent = CONTINUED.map((e, i): LabEvent => (i === 6 ? { at: e.at, kind: 'background', ok: false, bMeasured: null } : e));
    expect(summarise(silent)).toMatchObject({ background: 0.0523, zero: null });
  });

  describe('positionsOf — the solenoid\'s table, from the record', () => {
    it('gives each position reached its latest value, with the zero in force when it was read', () => {
      expect(positionsOf(CONTINUED, SOLENOID)).toEqual([
        { zCm: 0, bTheory: 0.4174, bMeasured: 0.4, zero: 0.0611 },
        { zCm: 3, bTheory: 0.35, bMeasured: 0.34, zero: 0.0523 },
      ]);
    });

    it('follows a Set 0, and keeps the old zero when one failed', () => {
      const events: LabEvent[] = [
        ...CONTINUED.slice(0, 4),
        { at: at(100), kind: 'zero', ok: true, bMeasured: 0.048 },
        { at: at(110), kind: 'zero', ok: false, bMeasured: null },
        CONTINUED[4],
      ];
      expect(positionsOf(events, SOLENOID).map(p => p.zero)).toEqual([0.0523, 0.048]);
    });

    it('gives no zero for a position read when the background could not be', () => {
      const events: LabEvent[] = [{ at: at(1), kind: 'background', ok: false, bMeasured: null }, CONTINUED[3]];
      expect(positionsOf(events, SOLENOID)).toEqual([{ zCm: 0, bTheory: 0.4174, bMeasured: 0.41, zero: null }]);
    });

    it('keeps a position with no sensor value as no measurement', () => {
      expect(positionsOf(VISIT, 'โซลีนอยด์ 75 รอบ')).toEqual([
        { zCm: 4, bTheory: 0.5729, bMeasured: 0.55, zero: null },
        { zCm: -8, bTheory: 0.2936, bMeasured: null, zero: null },
      ]);
    });

    it('leaves out a position the probe never reached, a coil\'s reading and another instrument', () => {
      expect(positionsOf(VISIT, 'โซลีนอยด์ 75 รอบ').some(p => p.zCm === 7)).toBe(false);
      expect(positionsOf(VISIT, 'ขดลวดเดี่ยว 1 รอบ')).toEqual([]);
      expect(positionsOf([], SOLENOID)).toEqual([]);
    });
  });
});

describe('a Set 0 that failed for a reason other than the sensor', () => {
  const failed: LabEvent = { at: 0, kind: 'zero', ok: false, bMeasured: null, detail: 'เลื่อนหัววัดออกจากโซลีนอยด์ไม่สำเร็จ: อุปกรณ์กำลังทำงานอยู่' };

  it('says why in the timeline', () => {
    expect(describeEvent(failed)).toBe('ตั้งศูนย์ (Set 0) ไม่สำเร็จ: เลื่อนหัววัดออกจากโซลีนอยด์ไม่สำเร็จ: อุปกรณ์กำลังทำงานอยู่ ค่าศูนย์เดิมยังใช้อยู่');
  });

  it('says why in the CSV', () => {
    expect(toCsv([failed])).toContain('เลื่อนหัววัดออกจากโซลีนอยด์ไม่สำเร็จ: อุปกรณ์กำลังทำงานอยู่ ค่าศูนย์เดิมยังใช้อยู่');
  });

  it('still blames the sensor when no reason is given', () => {
    expect(describeEvent({ at: 0, kind: 'zero', ok: false, bMeasured: null })).toBe('ตั้งศูนย์ (Set 0) ไม่สำเร็จ เพราะเซนเซอร์ไม่ส่งค่า ค่าศูนย์เดิมยังใช้อยู่');
  });
});
