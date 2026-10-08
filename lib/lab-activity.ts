// What a student did during one visit to the lab room, kept in the page while
// the visit lasts. The lab room's log tab, the summary shown on leaving and
// the CSV download are all drawn from this one list, so they cannot disagree.

export type LabEvent = {
  /** When it happened, in milliseconds since the epoch. */
  at: number;
  kind:
    | 'start'      // the student pressed start
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
  /** Null when the sensor was sending nothing, so there was no measurement. */
  bMeasured?: number | null;
  /** The rig's error, the question asked, or how the visit ended. */
  detail?: string;
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
        ? `เลื่อนหัววัดไป Z = ${signed(e.zCm ?? 0)} cm · B = ${fieldText(e.bMeasured)}`
        : `เลื่อนหัววัดไป Z = ${signed(e.zCm ?? 0)} cm ไม่สำเร็จ: ${e.detail}`;
    case 'reading':
      return `${e.instrument} · B = ${fieldText(e.bMeasured)} (ทฤษฎี ${e.bTheory?.toFixed(3)} mT)`;
    case 'question':
      return `ถามผู้ช่วย: ${e.detail}`;
    case 'end':
      return e.detail === 'time-up' ? 'หมดเวลา สิ้นสุดการทดลอง' : 'สิ้นสุดการทดลอง';
  }
}

const fieldText = (b: number | null | undefined) => (b === null || b === undefined ? 'ไม่มีสัญญาณเซนเซอร์' : `${b.toFixed(3)} mT`);

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
  startedAt: number | null;
  endedAt: number | null;
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
  return {
    startedAt,
    endedAt,
    durationSeconds: startedAt !== null && endedAt !== null ? Math.max(0, Math.round((endedAt - startedAt) / 1000)) : 0,
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
  'power-on': 'เปิดใช้อุปกรณ์',
  'power-off': 'ตัดวงจร',
  supply: 'แหล่งจ่ายไฟ',
  move: 'เลื่อนหัววัด',
  reading: 'ค่าที่อ่านได้',
  question: 'ถามผู้ช่วย',
  end: 'สิ้นสุดการทดลอง',
};

// A text cell is quoted when it holds a comma, a quote or a line break. One
// that a spreadsheet would run as a formula (the question to the assistant is
// free text) is made plain text with a leading apostrophe.
function cell(value: string): string {
  const safe = /^[=+\-@\t\r]/.test(value) ? `'${value}` : value;
  return /[",\r\n]/.test(safe) ? `"${safe.replace(/"/g, '""')}"` : safe;
}

const num = (v: number | null | undefined, digits: number) => (v === null || v === undefined ? '' : v.toFixed(digits));

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
        e.kind === 'end' ? (e.detail === 'time-up' ? 'หมดเวลา' : 'กดเสร็จสิ้น')
          : e.kind === 'supply' ? (e.detail === 'on' ? 'เปิด' : 'ปิด')
            : e.detail ?? '',
      ),
    ].join(',');
  });
  return [header.join(','), ...rows].join('\r\n') + '\r\n';
}
