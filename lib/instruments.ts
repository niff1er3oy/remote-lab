// The instruments on the rig that a student can choose between, named by the
// script that switches each one on. An admin can close any of them (a broken
// coil, a part of the experiment not in use this term); a closed instrument is
// not offered in the lab room and the rig refuses to start it.

export const INSTRUMENTS = [
  { script: 'coil_1.py', label: 'ขดลวดเดี่ยว 1 รอบ', part: 'coil' },
  { script: 'coil_2.py', label: 'ขดลวดเดี่ยว 2 รอบ', part: 'coil' },
  { script: 'coil_3.py', label: 'ขดลวดเดี่ยว 3 รอบ', part: 'coil' },
  { script: 'sole.py', label: 'โซลีนอยด์', part: 'solenoid' },
] as const;

export const INSTRUMENT_SCRIPTS: readonly string[] = INSTRUMENTS.map(i => i.script);

/** Whatever was stored or sent, reduced to known instruments, each once, in rig order. */
export function cleanDisabled(raw: unknown): string[] {
  const listed = Array.isArray(raw) ? raw : [];
  return INSTRUMENT_SCRIPTS.filter(script => listed.includes(script));
}
