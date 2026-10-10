import { SOLENOID } from '@/lib/physics';

// The instruments on the rig that a student can choose between, named by the
// script that switches each one on. An admin can close any of them (a broken
// coil, a part of the experiment not in use this term); a closed instrument is
// not offered in the lab room and the rig refuses to start it.

// `relay` is the name relay.py knows the instrument's supply by. `current`
// is what its circuit is set to, in amperes, until an admin says otherwise.
export const INSTRUMENTS = [
  { script: 'coil_1.py', label: 'ขดลวดเดี่ยว 1 รอบ', part: 'coil', relay: 'coil1', current: 5 },
  { script: 'coil_2.py', label: 'ขดลวดเดี่ยว 2 รอบ', part: 'coil', relay: 'coil2', current: 5 },
  { script: 'coil_3.py', label: 'ขดลวดเดี่ยว 3 รอบ', part: 'coil', relay: 'coil3', current: 5 },
  { script: 'sole.py', label: 'โซลีนอยด์', part: 'solenoid', relay: 'solenoid', current: SOLENOID.I },
] as const;

export const INSTRUMENT_SCRIPTS: readonly string[] = INSTRUMENTS.map(i => i.script);

/** Whatever was stored or sent, reduced to known instruments, each once, in rig order. */
export function cleanDisabled(raw: unknown): string[] {
  const listed = Array.isArray(raw) ? raw : [];
  return INSTRUMENT_SCRIPTS.filter(script => listed.includes(script));
}

/** The relay that feeds the instrument started by `script`; undefined for anything else. */
export const relayOf = (script: unknown): string | undefined => INSTRUMENTS.find(i => i.script === script)?.relay;

// The current each circuit carries. The rig does not measure it: it is set on
// the supply by hand, and the number here is what the theory is worked out
// with. An admin keeps the two the same from the admin page.
export type Currents = Record<string, number>;
export const CURRENT_MAX = 10; // A
export const DEFAULT_CURRENTS: Currents = Object.fromEntries(INSTRUMENTS.map(i => [i.script, i.current]));

/** A current an instrument can be set to: above zero, at most CURRENT_MAX, to the milliampere. */
export const isCurrent = (value: unknown): value is number =>
  typeof value === 'number' && Number.isFinite(value) && value > 0 && value <= CURRENT_MAX && Math.abs(value * 1000 - Math.round(value * 1000)) < 1e-6;

/** Whatever was stored or sent, as a current for every instrument: the default where none usable was given. */
export function cleanCurrents(raw: unknown): Currents {
  const given = raw && typeof raw === 'object' ? raw as Record<string, unknown> : {};
  return Object.fromEntries(INSTRUMENTS.map(i => [i.script, isCurrent(given[i.script]) ? given[i.script] as number : i.current]));
}
