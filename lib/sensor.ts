// Reads one message from the magnetometer service (a WebSocket on the lab
// machine, see SENSOR_URL). The service sends the three components of the
// field in microtesla, about ten times a second:
//
//   {"bx": 12.34, "by": -5.6, "bz": 1120.01}
//
// The lab room works with one number in millitesla.

/** Which part of the reading is "the field" the experiment compares with theory. */
export type SensorAxis = 'magnitude' | 'bx' | 'by' | 'bz';

// The size of the field, whichever way the sensor happens to be mounted. On
// the axis of a coil or solenoid the field points along the axis, so this is
// the axial field, off by at most the Earth's own (about 0.05 mT).
export const SENSOR_AXIS: SensorAxis = 'magnitude';

const MICRO_TO_MILLI = 1e-3;
const finite = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v);

/** The field in mT that a message carries, or null when it carries none. */
export function fieldFromSensor(message: unknown, axis: SensorAxis = SENSOR_AXIS): number | null {
  let data: unknown = message;
  if (typeof message === 'string') {
    try { data = JSON.parse(message); } catch { return null; }
  }
  if (!data || typeof data !== 'object') return null;
  const m = data as Record<string, unknown>;

  if (finite(m.bx) && finite(m.by) && finite(m.bz)) {
    const microtesla = axis === 'magnitude' ? Math.hypot(m.bx, m.by, m.bz) : m[axis] as number;
    return microtesla * MICRO_TO_MILLI;
  }
  // The earlier form of the feed: one value, already in mT.
  return finite(m.value) ? m.value : null;
}
