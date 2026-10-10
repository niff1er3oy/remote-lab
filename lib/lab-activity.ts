import { fixed } from '@/lib/physics';

// What a student did during one visit to the lab room, kept in the page while
// the visit lasts. The lab room's log tab, the summary shown on leaving and
// the CSV download are all drawn from this one list, so they cannot disagree.

export type LabEvent = {
  /** When it happened, in milliseconds since the epoch. */
  at: number;
  kind:
    | 'start'      // the student pressed start
    | 'background' // the room's own field was read, before anything was switched on (bMeasured)
    | 'zero'       // the student set the zero again with Set 0, the supply being off (bMeasured: the new zero; detail: why it failed)
    | 'power-on'   // an instrument's circuit was switched on
    | 'power-off'  // a circuit was cut
    | 'supply'     // the power supply was switched on or off (detail: 'on' | 'off')
    | 'move'       // the probe was sent along the solenoid's axis
    | 'reading'    // the values on screen when a coil was left
    | 'question'   // a question to the AI assistant
    | 'end';       // the visit ended
  /** The instrument's name as the page shows it. */
  instrument?: string;
  /** Whether the rig carried the command out. Absent for events that are not commands. */
  ok?: boolean;
  zCm?: number;
  I?: number;
  bTheory?: number;
  /**
   * Null when the sensor was sending nothing, so there was no measurement.
   * Every one has the zero in force taken off: the value of the latest
   * 'background' or 'zero' event before it that worked.
   */
  bMeasured?: number | null;
  /**
   * The rig's error, the question asked, how the visit ended (an EndReason),
   * or for a value that was read, the note that the calibration was set again
   * at that point and by how much.
   */
  detail?: string;
};

/**
 * How a visit ended: the finish button, the page's own countdown, or the round
 * being found over from outside (an admin ended it, or the server's clock
 * passed its end before the countdown did).
 */
export type EndReason = 'finished' | 'time-up' | 'round-closed';

const ROUND_CLOSED_TEXT = 'ผู้ดูแลระบบสิ้นสุดรอบ หรือหมดเวลา';

/**
 * How the visit ended, from its last 'end' event; null while it has none. A
 * record can hold more than one: the student came back in the same round.
 */
export function endReasonOf(events: LabEvent[]): EndReason | null {
  for (let i = events.length - 1; i >= 0; i--) {
    const e = events[i];
    if (e.kind !== 'end') continue;
    return e.detail === 'time-up' || e.detail === 'round-closed' ? e.detail : 'finished';
  }
  return null;
}

/** The summary's opening line for each way a visit ends. */
export const END_HEADLINE: Record<EndReason, string> = {
  finished: 'การทดลองสิ้นสุดแล้ว',
  'time-up': 'หมดเวลาของรอบนี้แล้ว',
  'round-closed': `รอบนี้สิ้นสุดแล้ว (${ROUND_CLOSED_TEXT})`,
};

export type LabReading = {
  instrument: string;
  zCm: number | null;
  I: number;
  bTheory: number;
  bMeasured: number | null;
};

const pad = (n: number) => String(n).padStart(2, '0');

export function clockTime(at: number): string {
  const d = new Date(at);
  return `${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;
}

const signed = (cm: number) => (cm > 0 ? `+${cm}` : String(cm));

/** One line of Thai for the log tab and the summary's timeline. */
export function describeEvent(e: LabEvent): string {
  switch (e.kind) {
    case 'start':
      return 'เริ่มการทดลอง';
    case 'background':
      return e.ok && typeof e.bMeasured === 'number'
        ? `อ่านสนามพื้นหลัง ${fixed(e.bMeasured, 3)} mT ก่อนเปิดอุปกรณ์ ค่าที่วัดได้หลังจากนี้หักค่านี้ออกแล้ว`
        : 'อ่านสนามพื้นหลังไม่ได้ เพราะเซนเซอร์ไม่ส่งค่า ค่าที่วัดได้จึงยังรวมสนามพื้นหลัง';
    case 'zero':
      return e.ok && typeof e.bMeasured === 'number'
        ? `ตั้งศูนย์ใหม่ (Set 0) ที่ ${fixed(e.bMeasured, 3)} mT ค่าที่วัดได้หลังจากนี้หักค่านี้ออกแล้ว`
        : e.detail
          ? `ตั้งศูนย์ (Set 0) ไม่สำเร็จ: ${e.detail} ค่าศูนย์เดิมยังใช้อยู่`
          : 'ตั้งศูนย์ (Set 0) ไม่สำเร็จ เพราะเซนเซอร์ไม่ส่งค่า ค่าศูนย์เดิมยังใช้อยู่';
    case 'power-on':
      return e.ok ? `เปิดใช้ ${e.instrument}` : `เปิดใช้ ${e.instrument} ไม่สำเร็จ: ${e.detail}`;
    case 'power-off':
      return e.ok ? `ตัดวงจร ${e.instrument}` : `ตัดวงจร ${e.instrument} ไม่สำเร็จ: ${e.detail}`;
    case 'supply': {
      const what = e.detail === 'on' ? 'เปิดแหล่งจ่ายไฟ' : 'ปิดแหล่งจ่ายไฟ';
      return e.ok ? what : `${what}ไม่สำเร็จ`;
    }
    case 'move':
      return e.ok
        ? `เลื่อนหัววัดไป Z = ${signed(e.zCm ?? 0)} cm · B = ${fieldText(e.bMeasured)}${e.detail ? ` (${e.detail})` : ''}`
        : `เลื่อนหัววัดไป Z = ${signed(e.zCm ?? 0)} cm ไม่สำเร็จ: ${e.detail}`;
    case 'reading':
      return `${e.instrument} · B = ${fieldText(e.bMeasured)} (ทฤษฎี ${e.bTheory?.toFixed(3)} mT)${e.detail ? ` (${e.detail})` : ''}`;
    case 'question':
      return `ถามผู้ช่วย: ${e.detail}`;
    case 'end':
      return e.detail === 'time-up' ? 'หมดเวลา สิ้นสุดการทดลอง'
        : e.detail === 'round-closed' ? `${ROUND_CLOSED_TEXT} สิ้นสุดการทดลอง`
          : 'สิ้นสุดการทดลอง';
  }
}

// The zero in force after an event. Entering the room reads it anew, and a
// reading that failed then leaves none; a Set 0 that failed leaves the old one.
const zeroAfter = (zero: number | null, e: LabEvent): number | null => {
  const read = e.ok && typeof e.bMeasured === 'number' ? e.bMeasured : null;
  if (e.kind === 'background') return read;
  return e.kind === 'zero' && read !== null ? read : zero;
};

// Time in the room, in milliseconds. A record continued after the student
// left and came back has a 'start' for each entry: the time away, between the
// last event of one entry and the start of the next, is not counted.
function timeInRoom(events: LabEvent[]): number {
  let total = 0;
  let from: number | null = null;
  let last = 0;
  for (const e of events) {
    if (from === null) from = e.at;
    else if (e.kind === 'start') { total += last - from; from = e.at; }
    last = e.at;
  }
  return from === null ? 0 : total + (last - from);
}

/** One position of the solenoid's table: `zero` is what had been taken off bMeasured (null when no zero had been read). */
export type MeasuredPosition = { zCm: number; bTheory: number; bMeasured: number | null; zero: number | null };

/**
 * The solenoid's table as the record has it: the latest value at each probe
 * position `instrument` reached, in the order first reached, with the zero
 * that was in force when it was read.
 */
export function positionsOf(events: LabEvent[], instrument: string): MeasuredPosition[] {
  const latest = new Map<number, MeasuredPosition>();
  let zero: number | null = null;
  for (const e of events) {
    zero = zeroAfter(zero, e);
    if (e.kind !== 'move' || !e.ok || e.instrument !== instrument || e.zCm === undefined || e.bTheory === undefined) continue;
    latest.set(e.zCm, { zCm: e.zCm, bTheory: e.bTheory, bMeasured: e.bMeasured ?? null, zero });
  }
  return [...latest.values()];
}

const fieldText = (b: number | null | undefined) => (b === null || b === undefined ? 'ไม่มีสัญญาณเซนเซอร์' : `${fixed(b, 3)} mT`);

/** The latest values taken for each instrument and probe position, in the order first taken. */
export function readingsOf(events: LabEvent[]): LabReading[] {
  const latest = new Map<string, LabReading>();
  for (const e of events) {
    const measured = e.kind === 'reading' || (e.kind === 'move' && e.ok);
    if (!measured || e.instrument === undefined || e.I === undefined || e.bTheory === undefined) continue;
    const zCm = e.kind === 'move' ? e.zCm ?? null : null;
    latest.set(`${e.instrument}|${zCm}`, { instrument: e.instrument, zCm, I: e.I, bTheory: e.bTheory, bMeasured: e.bMeasured ?? null });
  }
  return [...latest.values()];
}

export type LabSummary = {
  /**
   * The room's own field, mT, read on entering and taken off the measured
   * values. Null when it was not read: the values then still include it,
   * until a Set 0.
   */
  background: number | null;
  /**
   * How many times the student set the zero again with Set 0. When it is not
   * none, the values measured after each have that zero taken off instead.
   */
  rezeroed: number;
  /** The zero in force when the visit ended, mT; null when there was none. */
  zero: number | null;
  /**
   * How many times the student entered the room (pressed start). More than
   * one when they left without finishing and came back in the same round;
   * the background is read anew at each entry.
   */
  entries: number;
  startedAt: number | null;
  endedAt: number | null;
  /** Time in the room: the time away between two entries is not counted. */
  durationSeconds: number;
  instruments: string[];
  commands: number;
  failedCommands: number;
  questions: number;
  readings: LabReading[];
};

const COMMANDS: LabEvent['kind'][] = ['power-on', 'power-off', 'supply', 'move'];

export function summarise(events: LabEvent[]): LabSummary {
  const startedAt = events.find((e) => e.kind === 'start')?.at ?? events[0]?.at ?? null;
  const endedAt = events.length ? events[events.length - 1].at : null;
  const commands = events.filter((e) => COMMANDS.includes(e.kind));
  const background = events.find((e) => e.kind === 'background' && e.ok);
  return {
    background: typeof background?.bMeasured === 'number' ? background.bMeasured : null,
    rezeroed: events.filter((e) => e.kind === 'zero' && e.ok && typeof e.bMeasured === 'number').length,
    zero: events.reduce<number | null>(zeroAfter, null),
    entries: events.filter((e) => e.kind === 'start').length,
    startedAt,
    endedAt,
    durationSeconds: Math.max(0, Math.round(timeInRoom(events) / 1000)),
    instruments: [...new Set(events.filter((e) => e.kind === 'power-on' && e.ok).map((e) => e.instrument ?? ''))],
    commands: commands.length,
    failedCommands: commands.filter((e) => e.ok === false).length,
    questions: events.filter((e) => e.kind === 'question').length,
    readings: readingsOf(events),
  };
}

export const difference = (r: { bTheory: number; bMeasured: number | null }) =>
  r.bMeasured === null ? null : r.bMeasured - r.bTheory;

export const differencePercent = (r: { bTheory: number; bMeasured: number | null }) =>
  r.bMeasured === null || r.bTheory === 0 ? null : ((r.bMeasured - r.bTheory) / r.bTheory) * 100;

const KIND_LABEL: Record<LabEvent['kind'], string> = {
  start: 'เริ่มการทดลอง',
  background: 'สนามพื้นหลัง',
  zero: 'ตั้งศูนย์ (Set 0)',
  'power-on': 'เปิดใช้อุปกรณ์',
  'power-off': 'ตัดวงจร',
  supply: 'แหล่งจ่ายไฟ',
  move: 'เลื่อนหัววัด',
  reading: 'ค่าที่อ่านได้',
  question: 'ถามผู้ช่วย',
  end: 'สิ้นสุดการทดลอง',
};

/** Every kind of event there is, for checking a record that comes back from outside. */
export const EVENT_KINDS = Object.keys(KIND_LABEL) as LabEvent['kind'][];

// A text cell is quoted when it holds a comma, a quote or a line break. One
// that a spreadsheet would run as a formula (the question to the assistant is
// free text) is made plain text with a leading apostrophe.
function cell(value: string): string {
  const safe = /^[=+\-@\t\r]/.test(value) ? `'${value}` : value;
  return /[",\r\n]/.test(safe) ? `"${safe.replace(/"/g, '""')}"` : safe;
}

const num = (v: number | null | undefined, digits: number) => (v === null || v === undefined ? '' : fixed(v, digits));

/** The whole visit as CSV, one row per event, oldest first. */
export function toCsv(events: LabEvent[]): string {
  const header = ['วันที่', 'เวลา', 'เหตุการณ์', 'อุปกรณ์', 'Z (cm)', 'I (A)', 'B ทฤษฎี (mT)', 'B วัดจริง (mT)', 'ΔB (mT)', 'ΔB (%)', 'ผล', 'รายละเอียด'];
  const rows = events.map((e) => {
    const d = new Date(e.at);
    const values = e.bTheory === undefined ? null : { bTheory: e.bTheory, bMeasured: e.bMeasured ?? null };
    return [
      `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`,
      clockTime(e.at),
      KIND_LABEL[e.kind],
      cell(e.instrument ?? ''),
      e.zCm === undefined ? '' : String(e.zCm),
      num(e.I, 2),
      num(e.bTheory, 4),
      num(e.bMeasured, 4),
      values ? num(difference(values), 4) : '',
      values ? num(differencePercent(values), 2) : '',
      e.ok === undefined ? '' : e.ok ? 'สำเร็จ' : 'ไม่สำเร็จ',
      cell(
        e.kind === 'end' ? (e.detail === 'time-up' ? 'หมดเวลา' : e.detail === 'round-closed' ? ROUND_CLOSED_TEXT : 'กดเสร็จสิ้น')
          : e.kind === 'supply' ? (e.detail === 'on' ? 'เปิด' : 'ปิด')
            : e.kind === 'background' ? (e.ok ? 'ค่าที่วัดได้หลังจากนี้หักค่านี้ออกแล้ว' : 'เซนเซอร์ไม่ส่งค่า ค่าที่วัดได้ยังรวมสนามพื้นหลัง')
              : e.kind === 'zero' ? (e.ok ? 'ค่าที่วัดได้หลังจากนี้หักค่านี้ออกแล้ว' : `${e.detail ?? 'เซนเซอร์ไม่ส่งค่า'} ค่าศูนย์เดิมยังใช้อยู่`)
                : e.detail ?? '',
      ),
    ].join(',');
  });
  return [header.join(','), ...rows].join('\r\n') + '\r\n';
}

/** The values that came out of the visit as CSV: the table the summary shows, one row per reading. */
export function readingsCsv(events: LabEvent[]): string {
  const header = ['อุปกรณ์', 'Z (cm)', 'I (A)', 'B ทฤษฎี (mT)', 'B วัดจริง (mT)', 'ΔB (mT)', 'ΔB (%)'];
  const rows = readingsOf(events).map((r) => [
    cell(r.instrument),
    r.zCm === null ? '' : String(r.zCm),
    num(r.I, 2),
    num(r.bTheory, 4),
    num(r.bMeasured, 4),
    num(difference(r), 4),
    num(differencePercent(r), 2),
  ].join(','));
  return [header.join(','), ...rows].join('\r\n') + '\r\n';
}

/**
 * The file the summary hands over: the table of recorded values first, then
 * the whole visit event by event, each under its own heading with an empty
 * line between them.
 */
export function visitCsv(events: LabEvent[]): string {
  return `ค่าที่บันทึก\r\n${readingsCsv(events)}\r\nลำดับเหตุการณ์\r\n${toCsv(events)}`;
}
