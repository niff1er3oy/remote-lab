// Reads one message from the magnetometer service (a WebSocket on the lab
// machine, see SENSOR_URL). The service sends the three components of the
// field in microtesla, about twenty times a second:
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

// The sensor's reading against the true field, fitted on the rig itself:
// true field = GAIN x reading + OFFSET, both in mT. It was fitted on the size
// of the field, so it is applied to that and not to a single component.
export const CALIBRATION = { gain: 1, offset: 0.0243 };

/** The true field in mT for a size of field the sensor read, in mT. */
export const calibrated = (magnitude: number) => CALIBRATION.gain * magnitude + CALIBRATION.offset;

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
    if (axis === 'magnitude') return calibrated(Math.hypot(m.bx, m.by, m.bz) * MICRO_TO_MILLI);
    return (m[axis] as number) * MICRO_TO_MILLI;
  }
  // The earlier form of the feed: one value, already in mT and already true.
  return finite(m.value) ? m.value : null;
}

/**
 * A reading with the room's own field taken off it. Both are calibrated sizes
 * in mT. The background is what the sensor read on entering the lab room,
 * before anything was switched on: the Earth's field and whatever else is near
 * the rig. Null when it could not be read; the reading is then left as it is.
 * The result can be a little below zero: a difference of two readings is.
 */
export const aboveBackground = (reading: number, background: number | null) => reading - (background ?? 0);

// One reading is the mean of this many messages in a row. The service sends
// about twenty a second, so a reading takes about a second.
export const SAMPLES_PER_READING = 20;

/**
 * Turns the stream of single values into readings: every `size` values make
 * one reading, their mean.
 */
export function createAverager(size = SAMPLES_PER_READING) {
  let block: number[] = [];
  let waiting: Array<(reading: number) => void> = [];
  return {
    /** Takes one value. Gives the reading it completes, or null while the block is still filling. */
    add(value: number): number | null {
      block.push(value);
      if (block.length < size) return null;
      const reading = block.reduce((sum, v) => sum + v, 0) / size;
      block = [];
      for (const tell of waiting.splice(0)) tell(reading);
      return reading;
    },
    /** Drops what has been collected toward the next reading: it was taken on other terms. */
    reset(): void {
      block = [];
    },
    /**
     * A reading made only of values that arrive from now on: what was
     * collected so far is dropped (it was taken before the probe got here).
     * Resolves to null when the sensor does not send enough within `timeoutMs`.
     */
    fresh(timeoutMs: number): Promise<number | null> {
      block = [];
      return new Promise((resolve) => {
        const tell = (reading: number) => { clearTimeout(timer); resolve(reading); };
        const timer = setTimeout(() => { waiting = waiting.filter((w) => w !== tell); resolve(null); }, timeoutMs);
        waiting.push(tell);
      });
    },
  };
}
